// Upload flow (ES module): user picks a registration PDF → parse in the browser →
// validate → save into the logged-in user's library → reload so the engine builds it.
import * as pdfjsLib from "../vendor/pdfjs/pdf.min.js";
import { pagesFromPdf } from "./pdf-words.js";
import { parseRoster } from "./roster-parser.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js";

const btn = document.getElementById("upload-btn");
const input = document.getElementById("upload-input");
const status = document.getElementById("upload-status");

if (btn && input) {
  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    if (status) status.textContent = "Reading " + f.name + "…";
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      const pages = await pagesFromPdf(pdfjsLib, data);
      const { course, students, validation } = parseRoster(pages);
      if (!students.length) throw new Error("no students found — is this a Registration Desk Report PDF?");

      if (!validation.ok) {
        const bad = validation.sections.filter((s) => !s.ok)
          .map((s) => `${s.section}: parsed ${s.parsed}, header says ${s.declared}`).join("; ");
        const miss = validation.missing.length;
        const msg = `Parsed ${students.length} students from "${course ? course.label : f.name}", but validation flagged issues:\n\n`
          + (bad ? "• count mismatch — " + bad + "\n" : "")
          + (miss ? `• ${miss} record(s) missing a name or participant code\n` : "")
          + "\nLoad it anyway?";
        if (!confirm(msg)) { if (status) status.textContent = "Cancelled."; input.value = ""; return; }
      }
      if (!window.CalmAuth) throw new Error("not logged in");
      window.CalmAuth.saveCourse(course, students);
      location.reload();
    } catch (e) {
      if (status) status.textContent = "Couldn't load that PDF: " + (e && e.message ? e.message : e);
    } finally {
      input.value = "";
    }
  });
}
