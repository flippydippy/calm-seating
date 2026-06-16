// Adapter: turn a PDF into the abstract `pages` model that roster-parser expects.
// Works with any pdf.js build (Node legacy or the browser vendored .mjs) passed in
// as `pdfjsLib`.
//
// pdf.js text extraction needs care:
//  - With combining ON, whole rows merge and per-column x is lost.
//  - With combining OFF, ligature runs split ("Confirmed" -> "Con"+"fi"+"rmed").
// So we extract fine runs (combining OFF) and re-assemble words ourselves: merge
// runs separated by a near-zero gap (ligatures / kerning), but keep runs separated
// by a real space-sized gap (column boundaries) as distinct words. Each word's x0
// is its first run's left edge — accurate, matching pdfplumber's word boxes.

function normalize(s) {
  // Fold only Latin f-ligatures to ASCII (so "Conﬁrmed" matches "Confirmed").
  // NOT full NFKC — that would also rewrite Arabic/Persian presentation forms in
  // student names, which we preserve verbatim.
  return s
    .replace(/ﬀ/g, "ff").replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl")
    .replace(/ﬃ/g, "ffi").replace(/ﬄ/g, "ffl").replace(/ﬅ/g, "ft")
    .replace(/ﬆ/g, "st");
}

export async function pagesFromPdf(pdfjsLib, data) {
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent({
      disableCombineTextItems: true,
      includeMarkedContent: false,
    });

    // Raw runs with absolute positions.
    const runs = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      runs.push({
        str: normalize(it.str),
        x: it.transform[4],
        top: vp.height - it.transform[5],
        width: it.width || 0,
        height: it.height || 9,
      });
    }
    runs.sort((a, b) => a.top - b.top || a.x - b.x);

    // Cluster runs into visual lines.
    const lines = [];
    let cur = [], curTop = null;
    for (const r of runs) {
      if (curTop === null || Math.abs(r.top - curTop) <= 3) { cur.push(r); curTop = r.top; }
      else { lines.push(cur); cur = [r]; curTop = r.top; }
    }
    if (cur.length) lines.push(cur);

    // Re-assemble words within each line, left to right. A run is split on its
    // internal spaces into segments; the FIRST segment merges into the previous
    // word when the inter-run gap is near-zero (a split ligature like "Con|fi|rmed"),
    // otherwise it starts a new word. Later segments are always new words.
    const words = [];
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      let prevEnd = -Infinity;
      for (const r of line) {
        const total = r.str.length || 1;
        const parts = r.str.split(/\s+/).filter(Boolean);
        let cursor = 0;
        parts.forEach((part, idx) => {
          const at = r.str.indexOf(part, cursor); cursor = at + part.length;
          const px = idx === 0 ? r.x : r.x + (at / total) * r.width;
          const contiguous = r.x - prevEnd < Math.max(0.8, 0.18 * r.height);
          if (idx === 0 && words.length && contiguous) {
            words[words.length - 1].str += part; // re-join split ligature
          } else {
            words.push({ str: part, x0: px, top: r.top });
          }
        });
        prevEnd = r.x + r.width;
      }
    }
    pages.push({ width: vp.width, height: vp.height, words });
  }
  return pages;
}
