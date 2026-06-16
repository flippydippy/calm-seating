// Validate the in-browser JS parser against the Python parser's known-good output.
// For each PDF we have ground-truth <base>.json (from convert_roster.py); the JS
// parser must reproduce its students field-for-field.
//
//   node test/parse-test.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { pagesFromPdf } from "../src/pdf-words.js";
import { parseRoster } from "../src/roster-parser.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CASES = [
  ["Dhamma-Pallava-17june-28june.pdf", "Dhamma-Pallava_2026-06-17_to_2026-06-28.json"],
  ["Dhamma-Padhana_2026-06-10_to_2026-06-21.pdf", "Dhamma-Padhana_2026-06-10_to_2026-06-21.json"],
  ["Dhamma-Talaka_2026-05-27_to_2026-06-07.pdf", "Dhamma-Talaka_2026-05-27_to_2026-06-07.json"],
];
// `room` is excluded: it isn't used by the seating chart, and some templates bleed
// bag-no/Setup/Serve columns into it (the Python oracle's room values are messy too).
const FIELDS = ["id", "section", "fullName", "firstName", "lastName", "age",
  "participant", "total", "stp", "lc", "ftPt", "language", "confirmed", "notes"];

// Strip Arabic/Persian glyph ranges — RTL text order differs between pdf.js and
// pdfplumber (library-inherent); a diff that vanishes after stripping is accepted.
const stripRTL = (s) => String(s || "").replace(/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g, "").replace(/\s+/g, " ").trim();

let allOk = true;

for (const [pdfName, truthName] of CASES) {
  const pdfPath = path.join(ROOT, pdfName);
  const truthPath = path.join(ROOT, truthName);
  if (!fs.existsSync(pdfPath) || !fs.existsSync(truthPath)) {
    console.log(`SKIP ${pdfName} (missing pdf or truth json)`);
    continue;
  }
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pages = await pagesFromPdf(pdfjsLib, data);
  const { students, course, validation } = parseRoster(pages);
  const truth = JSON.parse(fs.readFileSync(truthPath, "utf8"));
  const tStudents = truth.students || truth;

  console.log(`\n=== ${pdfName} ===`);
  console.log(`  course: ${course && course.label}`);
  console.log(`  parsed ${students.length} vs truth ${tStudents.length}; validation.ok=${validation.ok}`);

  let real = 0, rtl = 0;
  const byId = new Map(students.map((s) => [s.id, s]));
  for (const t of tStudents) {
    const g = byId.get(t.id);
    if (!g) { console.log(`  MISSING id ${t.id} (${t.fullName})`); real++; continue; }
    for (const f of FIELDS) {
      if ((g[f] || "") !== (t[f] || "")) {
        if (stripRTL(g[f]) === stripRTL(t[f])) { rtl++; continue; } // accepted RTL diff
        if (real < 25) console.log(`  ✗ ${t.id} ${f}: got ${JSON.stringify(g[f])} want ${JSON.stringify(t[f])}`);
        real++;
      }
    }
  }
  const extra = students.filter((s) => !tStudents.find((t) => t.id === s.id));
  for (const e of extra) { console.log(`  EXTRA id ${e.id} (${e.fullName})`); real++; }

  if (real === 0 && students.length === tStudents.length) {
    console.log(`  ✓ PASS (${students.length} students; ${rtl} accepted RTL-glyph diffs, room excluded)`);
  } else {
    console.log(`  ✗ ${real} real mismatches (${rtl} RTL-glyph diffs ignored)`);
    allOk = false;
  }
}

console.log(`\n${allOk ? "✓ ALL PDFS PASS (chart-critical fields match)" : "✗ REAL MISMATCHES — parser needs work"}`);
process.exit(allOk ? 0 : 1);
