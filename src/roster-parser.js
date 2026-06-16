// Calm Seating — in-browser roster parser.
//
// Pure logic: takes an abstract page model and returns { course, students,
// validation }. No pdf.js / DOM dependency here, so it runs identically in the
// browser and in Node tests. A separate adapter (pdf-words.js) turns a PDF into
// the `pages` model this expects.
//
// pages: [{ width, height, words: [{ str, x0, top }] }]
//   x0  = left edge of the word, in PDF points
//   top = distance from top of page to top of the word, in PDF points
//
// This is a faithful port of .claude/convert_roster.py (header-driven column
// detection + value-based field classification), so it adapts across report
// templates / page sizes.

const ID_RE = /^A-[A-Za-z0-9]{4,}$/;
const STAT_RE = /^\d+\/[\d?]+$/;
const PART_RE = /^(NF|OF|NM|OM|PT)$/;
const NUM_RE = /^\d{1,3}$/;
const COUNT_RE = /\((?:incl\. pt\)\s*\()?\s*(\d+)\s*\)/;
const COURSE_RE = /Course from:\s*(.+?)\s+to\s+(.+?)\s+-\s+(.+)$/;
const BOILER = /Course from:|Registration Desk Report|Used at registration time|T\/AT:|Tick off all students|Particip\.|Conf\?|Room\s*\/?bed|Val\s*bag|Car\s*reg|^Age\b|Enter room\/bed/;

const SECTION_PATTERNS = [
  ["New Females", /New Females Confirmed/],
  ["Old Females", /Old Females Confirmed/],
  ["New Males", /New Males Confirmed/],
  ["Old Males", /Old Males Confirmed/],
  ["Female Servers", /Female Servers Confirmed/],
  ["Male Servers", /Male Servers Confirmed/],
  ["Part Time Students", /Part Time Students Confirmed/],
];
const SERVER_SECTIONS = new Set(["Male Servers", "Female Servers"]);

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MON_ABBR = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul",
  "Aug", "Sep", "Oct", "Nov", "Dec"];

const FALLBACK_ANCHORS = {
  name_left: 20, last_x: 123, age_x: 260, part_x: 302, ft_x: 366,
  conf_x: 432, room_x: 482, setup_x: 690, serve_x: 731, right: 792,
};

function lineText(words) {
  return words.map((w) => w.str).join(" ").trim();
}

// Group words into visual lines; running anchor tolerates baseline drift.
function clusterLines(words, tol = 4) {
  const ws = [...words].sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const lines = [];
  let cur = [], curTop = null;
  for (const w of ws) {
    if (curTop === null || Math.abs(w.top - curTop) <= tol) {
      cur.push(w); curTop = w.top;
    } else {
      cur.sort((a, b) => a.x0 - b.x0);
      lines.push({ top: Math.min(...cur.map((x) => x.top)), words: cur });
      cur = [w]; curTop = w.top;
    }
  }
  if (cur.length) {
    cur.sort((a, b) => a.x0 - b.x0);
    lines.push({ top: Math.min(...cur.map((x) => x.top)), words: cur });
  }
  return lines;
}

function parseDate(s) {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s.trim());
  if (!m || !(m[2].toLowerCase() in MONTHS)) return null;
  const d = +m[1], mon = MONTHS[m[2].toLowerCase()], y = +m[3];
  const iso = `${y}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { iso, d, mon, y };
}

function humanRange(s, e) {
  if (!s || !e) return "";
  if (s.y === e.y && s.mon === e.mon) return `${s.d}–${e.d} ${MON_ABBR[s.mon]} ${s.y}`;
  if (s.y === e.y) return `${s.d} ${MON_ABBR[s.mon]} – ${e.d} ${MON_ABBR[e.mon]} ${s.y}`;
  return `${s.d} ${MON_ABBR[s.mon]} ${s.y} – ${e.d} ${MON_ABBR[e.mon]} ${e.y}`;
}

function parseCourseHeader(line) {
  const m = COURSE_RE.exec(line);
  if (!m) return null;
  const startRaw = m[1].trim(), endRaw = m[2].trim(), rest = m[3].trim();
  let ctype = rest, center = "";
  const i = rest.lastIndexOf(" - ");
  if (i >= 0) { ctype = rest.slice(0, i).trim(); center = rest.slice(i + 3).trim(); }
  const s = parseDate(startRaw), e = parseDate(endRaw);
  const rng = humanRange(s, e);
  const label = [center, rng].filter(Boolean).join(" · ") || rest;
  return {
    center, type: ctype,
    start: s ? s.iso : startRaw, end: e ? e.iso : endRaw,
    label, raw: line.trim(),
  };
}

function detectColumns(allLines, pageWidth) {
  let hdr = null;
  for (const ln of allLines) {
    const texts = ln.words.map((w) => w.str);
    if (texts.includes("Age") && texts.includes("Particip.")) { hdr = ln.words; break; }
  }
  if (!hdr) return null;
  const hx = (label) => { const w = hdr.find((w) => w.str === label); return w ? w.x0 : null; };
  const age_x = hx("Age"), part_x = hx("Particip."), ft_x = hx("FT");
  const room_x = hx("Room") ?? hx("Room/bed");
  let conf_x = hx("Conf?") ?? hx("Conf");
  const setup_x = hx("Setup"), serve_x = hx("Serve");
  if ([age_x, part_x, ft_x, room_x].some((v) => v == null)) return null;
  if (conf_x == null) conf_x = (ft_x + room_x) / 2;

  // Surname column = most common token start (right of the first-name column) on
  // rows carrying an age number. First names sit at the left margin.
  const xs = new Map();
  let nameLeft = Infinity;
  for (const ln of allLines) {
    if (!ln.words.some((w) => w.x0 >= age_x - 4 && w.x0 < part_x && NUM_RE.test(w.str))) continue;
    for (const w of ln.words) {
      if (w.x0 < age_x - 4) {
        nameLeft = Math.min(nameLeft, w.x0);
        const k = Math.round(w.x0 / 3) * 3;
        xs.set(k, (xs.get(k) || 0) + 1);
      }
    }
  }
  let last_x = null, best = -1;
  for (const [k, c] of xs) if (k >= nameLeft + 22 && c > best) { best = c; last_x = k; }
  if (last_x == null) last_x = (nameLeft + age_x) / 2;
  if (!isFinite(nameLeft)) nameLeft = 20;

  return {
    name_left: nameLeft - 4, last_x: last_x - 2, age_x: age_x - 4,
    part_x: part_x - 4, ft_x: ft_x - 2, conf_x: conf_x - 3,
    room_x: room_x - 4, setup_x, serve_x, right: pageWidth,
  };
}

function parseRecord(rec, A) {
  const fn = [], ln = [];
  let age = "", part = "", stat = "", stp = "", lc = "", ft = "", lang = "",
    conf = "", room = "", setup = "", serve = "";
  const notes = [];
  let nameTop = null;
  const tol = 4;

  for (const line of rec.lines) {
    if (line.words.some((w) => w.x0 >= A.age_x && w.x0 < A.part_x && NUM_RE.test(w.str))) {
      nameTop = line.top;
      for (const w of line.words) {
        const x = w.x0, t = w.str;
        if (x < A.last_x) fn.push(t);
        else if (x < A.age_x) ln.push(t);
        else if (x < A.part_x) { if (NUM_RE.test(t)) age = t; }
        else if (x < A.ft_x) {
          // Stats are handled in the second pass (which respects STP:/LC: prefixes
          // and reads the total from the line above the name); only the participant
          // code is picked up here.
          if (PART_RE.test(t)) part = t;
        } else if (x < A.conf_x) {
          if (/^(ft|pt)$/i.test(t)) ft = t;
          else if (t !== "y" && t !== "n" && /[A-Za-z]/.test(t)) lang = (lang + " " + t).trim();
        } else if ((t === "y" || t === "n") && x < A.room_x) conf = t;
      }
      break;
    }
  }

  const setupX = A.setup_x, serveX = A.serve_x;
  const roomHi = setupX ? setupX : A.right;
  for (const line of rec.lines) {
    const row = line.words;
    for (let i = 0; i < row.length; i++) {
      const x = row[i].x0, t = row[i].str;
      if (PART_RE.test(t) && x >= A.part_x - tol && x < A.ft_x && !part) part = t;
      if (STAT_RE.test(t) && x >= A.part_x - 8 && x < A.ft_x) {
        const prev = i > 0 ? row[i - 1].str : "";
        if (prev === "STP:") stp = t;
        else if (prev === "LC:") lc = t;
        else if (!stat) stat = t;
      }
      if (t === "STP:" && i + 1 < row.length && STAT_RE.test(row[i + 1].str)) stp = row[i + 1].str;
      if (t === "LC:" && i + 1 < row.length && STAT_RE.test(row[i + 1].str)) lc = row[i + 1].str;
      if (x >= A.room_x - tol && x < roomHi && t !== "y" && t !== "n") room = (room + " " + t).trim();
      if (setupX && Math.abs(x - setupX) < 14 && t === "Y") setup = "Y";
      if (serveX && Math.abs(x - serveX) < 14 && t === "Y") serve = "Y";
    }
    if (line.top !== nameTop) {
      const nw = row.filter((w) => w.x0 < A.conf_x
        && !["STP:", "LC:", "y", "n"].includes(w.str)
        && !STAT_RE.test(w.str) && !PART_RE.test(w.str)).map((w) => w.str);
      const nt = nw.join(" ").trim();
      if (nt && nt !== "|") notes.push(nt);
    }
  }

  const note = notes.join(" ").replace(/\s*\|\s*/g, " | ").replace(/^[\s|]+|[\s|]+$/g, "");
  const fullName = (fn.join(" ") + " " + ln.join(" ")).trim();
  return {
    id: rec.id, section: rec.section, fullName,
    firstName: fn.join(" ").trim(), lastName: ln.join(" ").trim(),
    age, participant: part, total: stat, stp, lc, ftPt: ft,
    language: lang, confirmed: conf, room, notes: note,
  };
}

export function parseRoster(pages) {
  const allLines = [];
  let pageWidth = FALLBACK_ANCHORS.right;
  pages.forEach((p, pi) => {
    if (pi === 0) pageWidth = p.width;
    for (const ln of clusterLines(p.words)) allLines.push(ln);
  });

  const anchors = detectColumns(allLines, pageWidth) || FALLBACK_ANCHORS;

  const records = [];
  let section = null, cur = null, course = null;
  const declared = {};
  const flush = () => { if (cur) records.push(cur); cur = null; };

  for (const line of allLines) {
    const txt = lineText(line.words);
    if (!txt) continue;
    if (course === null && txt.includes("Course from:")) { course = parseCourseHeader(txt); continue; }
    const secEntry = SECTION_PATTERNS.find(([, re]) => re.test(txt));
    if (secEntry) {
      flush(); section = secEntry[0];
      const m = COUNT_RE.exec(txt);
      if (m) declared[section] = +m[1];
      continue;
    }
    if (BOILER.test(txt)) continue;
    if (line.words.length === 1 && ID_RE.test(line.words[0].str)) {
      flush(); cur = { section, id: line.words[0].str, lines: [] };
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  flush();

  const students = records.map((r) => parseRecord(r, anchors));

  // Validation: parsed counts vs each section header's own "(N)" tally.
  const actual = {};
  for (const s of students) actual[s.section] = (actual[s.section] || 0) + 1;
  const sections = Object.keys(declared).map((sec) => ({
    section: sec, declared: declared[sec], parsed: actual[sec] || 0,
    ok: (actual[sec] || 0) === declared[sec],
  }));
  const missing = students.filter((s) => !s.fullName || !s.participant)
    .map((s) => ({ id: s.id, fullName: s.fullName, participant: s.participant }));
  const seatable = students.filter((s) => !SERVER_SECTIONS.has(s.section)).length;
  const ok = sections.every((s) => s.ok) && missing.length === 0;

  return { course, students, validation: { sections, missing, seatable, ok } };
}
