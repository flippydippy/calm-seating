# Calm Seating — Interactive Seating Chart Plan

## Goal

Build an interactive seating chart that non-technical users can run locally by double-clicking a file. Each course's roster is loaded into the chart from a roster file (no code editing). Users can pick chart dimensions and gender, the chart auto-fills with sorted students, and they can rearrange, pin, and flip the layout.

## Architecture

- **Tech**: single `index.html`, vanilla HTML/CSS/JS, no build step, no CDN — fully offline.
- **Data flow** (per course): `.claude/convert_roster.py` converts the registration **PDF** into a roster and **bakes it into `index.html`** — into a registry `<script id="students-data">{ "rosters": [ {course, students}, … ] }`, newest course first. (It also writes a standalone `<base>.json`/`.csv` next to the PDF as a reference/backup.) On the setup screen a **"Course roster" dropdown** lists every baked-in roster; picking one switches courses with no file dialog. The selected course label is remembered per browser in `localStorage` (`calm-seating:active`); the chart boots from it on reload, falling back to the first roster if that selection is gone. (Baking-in is deliberate: a double-clicked `file://` page can't list a folder or set the file-picker's directory, so courses live inside the app file and travel with it — every machine sees the full list.)
  - **Roster shape** (per entry in the registry, and in the standalone `.json`): `{ "course": {center, type, start, end, label, raw}, "students": [...] }`. The `course` block is parsed from the PDF's `Course from:` header and shown in the app header + status line (and prints with the chart). The standalone filename is auto-derived from the centre + dates, e.g. `Dhamma-Padhana_2026-06-10_to_2026-06-21.json`.
  - Switching the dropdown clears the saved seat arrangement (`calm-seating:v4`) so layouts from the previous course don't leave empty seats. Servers (`Male Servers` / `Female Servers`) are excluded from seating.
- **Converting a new course**: see [ROSTER-CONVERSION.md](ROSTER-CONVERSION.md) — run `python3 .claude/convert_roster.py "<course>.pdf"`, confirm every section validates `[ok]`; it bakes the course into `index.html` automatically. Then share that `index.html`.
- **Deliverable** (what they double-click): a single self-contained `index.html` with all courses baked in. The generated `<course>.json`/`.csv` files are references/backups (and the source for re-baking), not needed at runtime.

  ```
  Calm-Seating/
    index.html                                    ← double-click; pick a course from the dropdown
    Dhamma-Padhana_2026-06-10_to_2026-06-21.json  ← reference/backup (also baked into index.html)
    Dhamma-Padhana_2026-06-10_to_2026-06-21.csv   ← human-readable reference
  ```

- **Trade-off (by design)**: courses live *inside* `index.html`, so adding one means running the converter (it edits `index.html`) and then using/sharing **that** updated file — the roster isn't a separate drop-in file. The upside, and the reason for this design: every machine sees the full course list with zero setup — no file-loading or folder-hunting. The alternative (loose roster files the app auto-discovers) is impossible on a `file://` page, since the browser forbids listing a folder or setting the file picker's directory.

- **State model** (seat coordinate is the source of truth, not student position):

  ```
  state = { gender, rows, cols, flipped, seats[row][col] = { studentId, pinned } }
  ```

  Labels `A1, A2, …` are bound to seat coordinates. When two boxes swap, the *students* swap; the *labels* stay put. "Flip" only changes visual column order; labels and students both follow the flip so the labels still read correctly.

## Sorting & Fill Rule

- **Female chart** seats `Participant == OF` then `NF`. Male chart seats `OM` then `NM`.
- Within OF/OM: sort by "sat" (first number of `Total Courses (sat/served)`) **descending**.
- Within NF/NM (no totals): sort alphabetically by last name.
- Fill order: `A1, A2, … An, B1, B2, … Bn, …` (bottom row first, leftward column for female / rightward column for male — i.e., `A1` is the bottom-edge corner per gendered orientation).
- Extra seats stay empty; extra students appear in an overflow side panel.

## Box Content

Each box shows:
- First name
- Last name (below)
- Stats line in smaller font:
  - Total courses as `sat/served` (e.g., `15/5`)
  - `STP X/Y` (only if present)
  - `LC X/Y` (only if present)
- Drag handle on the left
- Pin icon on the right
- Border thickness: OF/OM **thick**, NF/NM **thin**

## Interactions

- **Drag-to-swap**: dropping box X onto box Y swaps their students; labels stay fixed.
- **Pin**: per-box toggle. Pinned target **blocks** the swap; dragged box snaps back with a brief shake.
- **Flip**: top-bar button mirrors columns horizontally. Labels follow the flip so each box still reads correctly. Toggling again restores the original orientation.

## Defaults

- Include all students from the roster (pt + unconfirmed too); servers are excluded from seating.
- Overflow: leftover students shown in a sidebar list; extra seats left empty.
- Persistence: arrangements saved to browser `localStorage` so an accidental refresh doesn't wipe the work.

## Step-by-Step Build

Each step has a clear deliverable, a review agent, and a "done" gate. The review loop runs on every step:

```
implement step → run review agent
   if it finds critical or high issues → fix → re-run review → repeat
   else → advance to next step
```

Medium/low findings are deferred to the Step 7 polish pass.

> **Note:** the table below records the *original* build, when the roster was baked into `index.html` from a CSV. Runtime roster selection (the "Course roster" dropdown + library + `.claude/convert_roster.py`) was added afterward — see **Architecture** above. The baked-in array now serves as the default/built-in roster.

| # | Step | Deliverable | Review agent |
|---|---|---|---|
| 1 | **Skeleton + data baking** | `index.html` with embedded students array (parsed from CSV), minimal page chrome, CSS reset, layout shell, no functionality yet. | `voltagent-qa-sec:code-reviewer` |
| 2 | **Setup screen** | Form: gender toggle (F/M), rows count, cols count, "Build chart" button. Validates inputs (≥ 1, integers). Shows preview of how many students of each type will fill. | `voltagent-qa-sec:code-reviewer` |
| 3 | **Grid + auto-fill** | Renders the grid with seat labels `A1…Hn`. Boxes show name, stats, OF/OM thick vs NF/NM thin border. Sort + fill applied correctly. | `voltagent-qa-sec:code-reviewer` then `voltagent-qa-sec:ui-ux-tester` |
| 4 | **Drag-to-swap** | HTML5 drag-and-drop; dropping X onto Y swaps their students; labels stay fixed. Visual drop-target highlight. | `voltagent-qa-sec:code-reviewer` |
| 5 | **Pin / lock** | Pin icon per box; clicking toggles pinned state with visible cue. Pinned target blocks the swap with a shake animation. | `voltagent-qa-sec:code-reviewer` |
| 6 | **Flip button** | Top-bar Flip button mirrors columns horizontally. Labels follow the flip. Toggle re-flips back. | `voltagent-qa-sec:code-reviewer` |
| 7 | **Polish + end-to-end QA** | Empty-state, overflow panel, responsive sanity check, brief "How to use" line, browser-tested. | `voltagent-qa-sec:ui-ux-tester` (full flow via Chrome MCP) |
