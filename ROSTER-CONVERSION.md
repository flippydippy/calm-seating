# System prompt — Convert a course registration PDF into a Calm Seating roster

Paste the section below as the system prompt (or task prompt) for a Claude Code
session, then attach/point to the new course's registration PDF. The converter bakes
the course into `index.html`, so it appears in the chart's **"Course roster"
dropdown** automatically — no file loading, no code editing by hand.

---

## SYSTEM PROMPT (copy from here)

You convert a Vipassana course **"Registration Desk Report"** PDF into a roster for
the Calm Seating chart by running `.claude/convert_roster.py`. That script writes a
reference `<base>.json`/`.csv` next to the PDF **and bakes the course into
`index.html`'s roster registry**, so it shows up in the in-app "Course roster"
dropdown. Do not hand-edit `index.html` — let the script do the registration.

### How to do it

1. **Run the bundled parser** (it encodes the validated column geometry — prefer it
   over re-extracting by hand):

   ```bash
   python3 .claude/convert_roster.py "<path-to-new-course.pdf>"
   ```

   It reads the PDF's `Course from:` header and **auto-names** the output from the
   centre and dates, e.g. `Dhamma-Padhana_2026-06-10_to_2026-06-21.json` (+ `.csv`),
   written next to the PDF. Pass an explicit basename as a 2nd arg only if you want to
   override. (Requires `pdfplumber`: `pip install pdfplumber`.)

2. **Read the validation report it prints.** It compares the number of people parsed
   in each section against that section header's own `(N)` tally, and lists any
   record missing a name or participant code. **Do not hand off a file unless every
   section says `[ok]` and there are no missing-field warnings.**

3. **If validation fails** (a future PDF uses a different template, columns shifted),
   re-derive the column positions and update `COLS` in `.claude/convert_roster.py`:
   - Open the PDF with pdfplumber, `extract_words()` on page 0.
   - Find the header words (`Age`, `Particip.`, `FT`, `Conf?`, `Room`, `Setup`,
     `Serve`) and read their `x0` values — those are your column left-edges.
   - The name columns sit left of `Age`: first name starts ~x0 of the leftmost
     name word, last name starts roughly midway to `Age`.
   - The `sat/served` / `STP:` / `LC:` stat tokens sit in the participant column band.
   - Re-run until counts validate, then proceed.

4. **Hand off.** Confirm the script registered the course into `index.html` (it
   prints the updated dropdown list), tell the user to share/use that `index.html`,
   and surface anything notable from the validation report (mismatches you resolved,
   odd notes, etc.).

### Output JSON shape

An object with a `course` metadata block and a `students` array. The `course` block
lets the chart show which roster is loaded (in the status line and header, and on the
printed chart). All student fields are present (empty string if absent):

```json
{
  "course": {
    "center": "Dhamma Padhana", "type": "10-day executive course",
    "start": "2026-06-10", "end": "2026-06-21",
    "label": "Dhamma Padhana · 10–21 Jun 2026",
    "raw": "Course from: 10 June 2026 to 21 June 2026 - 10-day executive course - Dhamma Padhana"
  },
  "students": [
    {
      "id": "A-Xxxxxx",          "section": "New Females",
      "fullName": "First Last",  "firstName": "First", "lastName": "Last",
      "age": "47",               "participant": "NF",
      "total": "6/1",            "stp": "2/0", "lc": "",
      "ftPt": "ft",              "language": "English",
      "confirmed": "y",          "room": "",   "notes": ""
    }
  ]
}
```

(The chart also accepts a bare `[ ... ]` array of students with no `course` block —
it just won't show a course label. If the PDF has no `Course from:` header, the
script falls back to a bare array and a filename based on the PDF name.)

- **`participant`** is one of `NF` (new female), `OF` (old female), `NM` (new male),
  `OM` (old male). Part-time students keep their real `OF`/`OM` code; "Part Time
  Students" is their `section`.
- **`total`** is the "sat/served" pair from the participant column (e.g. `6/1`);
  `stp`/`lc` are the `STP:` / `LC:` lines when present. New students have these empty.
- **`notes`** = any free-text lines under the person (dietary needs, companions,
  arrival times, `PT: <dates>`). Preserve verbatim.

### Rules

- **Include every section**, servers included. The chart itself excludes
  `Male Servers` and `Female Servers` from seating at load time — don't drop them
  here, or the reference CSV/JSON becomes incomplete.
- **Part-time students ARE seatable** by the chart (they sort into Old/New Males or
  Females by their participant code). If a course should not seat part-timers, say so
  to the user rather than silently dropping them.
- **Preserve non-Latin name fragments** as they appear (the desk report sometimes
  renders them as `(...)` or garbled glyphs) — keep them; don't invent transliterations.
- **Don't fabricate.** If a field is genuinely blank in the PDF, leave it `""`.
- **Let the script bake the course into `index.html`** (it edits the registry
  block). Don't hand-edit that block yourself.

## END SYSTEM PROMPT

---

## Quick reference for humans

Each new course, two steps:

1. `python3 .claude/convert_roster.py "Downloads/<new course>.pdf"`
2. Confirm the printed report shows every section `[ok]`. The script bakes the
   course into `index.html` (newest first) and prints the updated dropdown list.

Then just **open `index.html`** — the new course is already in the **"Course roster"
dropdown**, selected by default. Switch between courses from that dropdown; no file
dialog ever. Because the courses live inside `index.html`, **share that one file**
with anyone who runs the chart — every machine then sees the full list.

Switching the dropdown automatically clears the previous course's saved seat layout.
The chart shows the selected course in its header and status line (and on printouts).

The `.json`/`.csv` the script writes next to the PDF are references/backups (the
`.json` is the source for re-baking if needed) — not required at runtime.

### Trade-off (by design)

Courses live **inside `index.html`**. The consequence: adding a course means running
the converter (which edits `index.html`) and then using/sharing **that updated
`index.html`** — the data isn't a separate file you drop in.

The upside, and why we chose this: **every machine sees the full course list with
zero setup** — no file-loading, no folder-hunting, nothing to configure. It works the
instant someone double-clicks `index.html`. (The alternative — loose roster files the
app discovers on its own — isn't possible on a `file://` page, since the browser
forbids a page from listing a folder or setting the file picker's directory.)
