# Calm Seating — Hosted Self-Service App: Plan

Turn the single-file seating chart into a **hosted, multi-user, self-service** web
app so Daryoush and Hasti can make their own seating charts without you running the
converter. Hosted on **GitHub Pages** (static, no backend), styled to the **Vipassana
Recommended Design Standards**.

---

## 1. What changes vs. today

| | Today | Hosted app |
|---|---|---|
| Who makes charts | You (run `convert_roster.py`, share `index.html`) | Daryoush & Hasti, themselves |
| Get a course in | Python converter bakes it into `index.html` | User **uploads the PDF**, parsed **in the browser** |
| Access | Anyone with the file | **Login** (you create the 2 accounts) |
| Data | One shared roster set baked in | **Per-user**, private, saved in their browser |
| Hosting | Double-click a file | `https://<you>.github.io/calm-seating/` |
| Look | Custom green theme | Vipassana design standards (gold/blue, Amiri + Noto Sans, wheel logo) |

The **seating chart itself is unchanged** — same setup screen, sort/fill rules,
drag-to-swap, pin, flip, print, removed-students panel. We wrap it in login + upload +
per-user storage, and restyle it.

---

## 2. Architecture (static-only, chosen)

Pure GitHub Pages — no server. Three pieces, all client-side:

1. **Login gate.** Two accounts (Daryoush, Hasti) created by us, no self-signup. Each
   account is a username + a **PBKDF2 password hash + random salt** baked into the app
   (never plaintext). Login re-hashes the typed password and compares. Web Crypto API,
   works offline.
2. **In-browser PDF parser.** The roster PDF is parsed **in the browser** with
   [pdf.js] (bundled in the repo, no CDN). This is a JavaScript port of the now
   header-driven `convert_roster.py` logic — so it adapts to different report
   templates (we just proved that with the Pallava A4 vs Padhana landscape layouts).
3. **Per-user encrypted storage.** Each user's courses + seating arrangements are saved
   in `localStorage`, **namespaced per user and encrypted at rest** with a key derived
   from their password (AES-GCM via Web Crypto). So one user can't read another's data
   even on the same computer, and the data is unreadable without the password.

[pdf.js]: https://mozilla.github.io/pdf.js/ (Apache-2.0)

### Why this satisfies the requirements
- **Hosted on GitHub Pages** ✔ static files only.
- **We create the users** ✔ accounts are baked in by us; no signup UI.
- **Per-user, not shared** ✔ separate encrypted namespaces; each user uploads their own
  courses.
- **All seating features + saving** ✔ existing engine reused; saves per user.

---

## 3. Privacy & security model (read this — it's honest)

Static hosting can't do real server-side auth, so be clear-eyed:

**What's protected**
- **No student PII is ever in the repo or on any server.** Rosters are uploaded by
  users at runtime and live only in their own browser. The public site contains only
  app code, fonts, and the logo. *(This is the most important property — and it's why
  static-only is actually a strong privacy choice here.)*
- **Per-user data is encrypted at rest** with a password-derived key, so it can't be
  read from `localStorage` without that user's password — even by the other user on a
  shared computer.
- Login keeps casual visitors out.

**What's NOT protected (limits of static hosting)**
- The login gate is **not bank-grade**. The password hashes ship in the public app, so
  a determined technical person could attempt an offline brute-force. **Mitigation: use
  strong passphrases** (I'll generate 4–5 random words each). Weak passwords would be
  the only real exposure, and even then there's no PII on the server to steal.
- A technical person could bypass the *gate* by editing the page — but they'd see no
  data, because the data is encrypted in someone else's browser.
- **Forgotten password = that user's saved charts are unrecoverable** (they're
  encrypted with the password). They'd just re-upload the PDF. Password "reset" = we
  ship a new hash; old saved data is lost. This is an acceptable tradeoff for the model.

If those limits ever become a problem, the upgrade path is a real backend (e.g.
Supabase) — but that reintroduces the dormancy issue you correctly flagged.

---

## 4. Build phases

Each phase is independently reviewable; nothing is pushed public until Phase 1's
privacy hygiene is done.

### Phase 1 — Repo & privacy hygiene
- `git init`; create `.gitignore` excluding **all real data**: `*.pdf`, `Dhamma-*.json`,
  `Dhamma-*.csv`, `Registration*.*`, the `Design-Standards/*.zip`, `/.claude` local bits.
- **Strip the real rosters** currently baked into `index.html` (`#students-data`) — ship
  it **empty or with one tiny fake sample course**. Real courses come from uploads.
- Keep `convert_roster.py` as an internal/admin tool (not used by end users).
- Create the GitHub repo + enable Pages (branch `main`, `/root`).
- **Gate:** confirm no PII anywhere in the tree before the first push.

### Phase 2 — In-browser PDF parser (biggest piece)
- Bundle `pdf.js` (lib + worker) locally.
- Port `convert_roster.py` to JS: word extraction → line clustering → **header-driven
  column detection** → value-based field classification → course-header parse →
  section-count validation. (Coordinate mapping: pdf.js gives x = `transform[4]`,
  y from bottom → `top = pageHeight − y`.)
- **Test oracle:** we already have ground-truth JSON from the Python parser for
  **Pallava, Padhana, Talaka**. The JS parser must reproduce those byte-for-byte (or
  field-for-field). Diff in CI/manually before trusting it.
- On parse failure / unknown template: clear, friendly error (no silent garbage).

### Phase 3 — Auth gate + per-user encrypted storage
- Login screen; PBKDF2 verify; session in `sessionStorage`.
- Namespace every storage key per user: `cs:<user>:library`, `cs:<user>:active`,
  `cs:<user>:arrangement`.
- AES-GCM encrypt/decrypt the per-user blob with the password-derived key (kept in
  memory for the session only).
- Logout clears the session key (data stays, encrypted).

### Phase 4 — Redesign to Vipassana Design Standards
- **Fonts:** bundle Amiri (headings) + Noto Sans (body) via `@font-face` (files already
  in `Design-Standards/`). Persian/Arabic names fall back to Noto family.
- **Palette:** dark blue `#1E3461` (primary/buttons), light gold `#B78730` & dark gold
  `#9C6B14` (accents/headers), grey `#4F4D47` (secondary text); backgrounds gold-tint
  `#FBF9F5` / `#F1E7D6`, blue-tint `#F4F5F7`. Replace the current green theme.
- **Logo:** use the wheel lockups in `Design-Standards/logos/` (reverse/white version on
  dark-blue bars). Login screen modeled on the MyCourses example (logo top-centre, blue
  bars, gold accents).
- **Contrast:** verify WCAG 2.1 AA (standards call this out).
- Optional: dark mode (palette is defined) — defer unless wanted.

### Phase 5 — Upload-course flow
- "Upload course PDF…" on the setup screen → parse (Phase 2) → validate → add to the
  user's encrypted library → it appears in their **Course roster** dropdown (the model
  we already built), selectable thereafter. Remove/rename courses per user.

### Phase 6 — QA
- Every existing feature (setup, fill, drag-swap, pin, flip, print, removed panel).
- Two-user isolation: log in as each; confirm no data bleed; encrypted at rest.
- Parser across all 3 real PDFs + a malformed file.
- Print layout (course label in header prints).
- Responsive + AA contrast.

### Phase 7 — Deploy & hand off
- Push, enable Pages, verify the live URL.
- Generate strong passphrases for Daryoush & Hasti; deliver securely.
- Short "how to use" note (log in → upload PDF → build chart).

---

## 5. Assumptions
- Each user works independently; a course/chart one uploads is **not** visible to the
  other (matches "not shared"). Same course → each uploads their own PDF.
- Default GitHub Pages URL (`*.github.io`) unless you want a custom domain.
- Light mode first; dark mode optional.
- Just two users for now, both created by us; adding a third = ship a new hash.

## 6. Risks / watch-items
- **Parser port fidelity** — the main effort/risk; mitigated by the 3-PDF test oracle.
- **`localStorage` limits** (~5 MB/origin) — fine for tens of courses; large rosters
  (100+ students) are still only ~tens of KB each.
- **Password loss** = encrypted data loss (by design; re-upload to recover).
- **Browser data clearing** wipes saved charts (it's local) — re-upload to restore.

## 7. What I'll need from you to ship
1. GitHub account/org + desired repo name (e.g. `calm-seating`).
2. OK to generate strong passphrases for Daryoush & Hasti (or you provide them).
3. Whether **you** (yar) also get a login.
4. Custom domain? (otherwise `*.github.io`.)
5. Dark mode now or later?
