// Auth + per-user data layer (classic script; runs before the seating engine).
//
// Static-site model: login is a client-side gate (PBKDF2 verify against baked-in
// hashes in window.CS_USERS). Each user's courses + seat arrangements live in their
// own localStorage namespace `cs:<user>:*`, so data isn't shared between users.
// Admin (yar) can "View as" any user (their data on THIS browser) and Import a file
// another user exported. See HOSTED-APP-PLAN.md for the honest security limits.
(function () {
  "use strict";

  var SESSION = "cs:session";   // sessionStorage: logged-in username
  var VIEWAS = "cs:viewas";     // sessionStorage: admin viewing-as username
  var users = window.CS_USERS || [];
  var byName = {};
  users.forEach(function (u) { byName[u.username] = u; });

  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lib(user) { try { return JSON.parse(ls("cs:" + user + ":courses")) || {}; } catch (e) { return {}; } }

  var sessionUser = (function () { try { return sessionStorage.getItem(SESSION); } catch (e) { return null; } })();
  var me = sessionUser ? byName[sessionUser] : null;
  var isAdmin = !!(me && me.role === "admin");
  var viewAs = null;
  try { viewAs = sessionStorage.getItem(VIEWAS); } catch (e) {}
  var viewUser = (isAdmin && viewAs && byName[viewAs]) ? viewAs : sessionUser;

  // ---- feed the seating engine the active user's roster (synchronous) ----
  var rostersObj = viewUser ? lib(viewUser) : {};
  var rosters = Object.keys(rostersObj).map(function (k) { return rostersObj[k]; });
  window.__ROSTER = {
    user: sessionUser, role: me ? me.role : null, isAdmin: isAdmin,
    viewUser: viewUser, storagePrefix: "cs:" + (viewUser || "guest"),
    rosters: rosters,
    activeKey: viewUser ? ls("cs:" + viewUser + ":active") : null,
  };

  // No-flash gate: mark the document authed/anon for CSS.
  document.documentElement.setAttribute("data-authed", sessionUser ? "1" : "0");

  // ---- crypto ----
  function hexToBytes(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  async function pbkdf2Hex(pw, saltHex, iter) {
    var key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(saltHex), iterations: iter, hash: "SHA-256" }, key, 256);
    return Array.from(new Uint8Array(bits)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  async function verify(username, password) {
    var u = byName[username];
    if (!u) return false;
    var h = await pbkdf2Hex(password, u.salt, u.iter);
    // constant-ish compare
    if (h.length !== u.hash.length) return false;
    var diff = 0; for (var i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ u.hash.charCodeAt(i);
    return diff === 0;
  }

  // ---- expose a small API the picker/upload use ----
  window.CalmAuth = {
    state: window.__ROSTER,
    saveCourse: function (course, students) {
      var key = (course && course.label) ? course.label : "Course " + (Object.keys(lib(viewUser)).length + 1);
      var L = lib(viewUser); L[key] = { course: course || null, students: students };
      lsSet("cs:" + viewUser + ":courses", JSON.stringify(L));
      lsSet("cs:" + viewUser + ":active", key);
      try { localStorage.removeItem("cs:" + viewUser + ":arr"); } catch (e) {}
      return key;
    },
    setActive: function (key) {
      lsSet("cs:" + viewUser + ":active", key);
      try { localStorage.removeItem("cs:" + viewUser + ":arr"); } catch (e) {}
      location.reload();
    },
    removeCourse: function (key) {
      var L = lib(viewUser); delete L[key];
      lsSet("cs:" + viewUser + ":courses", JSON.stringify(L));
      if (ls("cs:" + viewUser + ":active") === key) { try { localStorage.removeItem("cs:" + viewUser + ":active"); } catch (e) {} }
      location.reload();
    },
  };

  // ---- UI wiring ----
  document.addEventListener("DOMContentLoaded", function () {
    var overlay = document.getElementById("login-overlay");
    var form = document.getElementById("login-form");
    var uEl = document.getElementById("login-user");
    var pEl = document.getElementById("login-pass");
    var errEl = document.getElementById("login-error");
    var whoEl = document.getElementById("who");
    var logoutBtn = document.getElementById("logout-btn");
    var exportBtn = document.getElementById("export-btn");
    var adminWrap = document.getElementById("admin-tools");
    var viewSel = document.getElementById("viewas-select");
    var importBtn = document.getElementById("import-btn");
    var importInput = document.getElementById("import-input");

    if (form) {
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        errEl.textContent = "";
        var ok = false;
        try { ok = await verify(uEl.value.trim().toLowerCase(), pEl.value); }
        catch (err) { errEl.textContent = "Login error: " + err.message; return; }
        if (!ok) { errEl.textContent = "Incorrect username or password."; pEl.value = ""; return; }
        try {
          sessionStorage.setItem(SESSION, uEl.value.trim().toLowerCase());
          sessionStorage.removeItem(VIEWAS);
          sessionStorage.setItem("cs:freshLogin", "1"); // land on the setup "home", not a restored chart
        } catch (e) {}
        location.reload();
      });
    }
    if (!sessionUser) { if (uEl) setTimeout(function () { uEl.focus(); }, 50); return; }

    // logged in
    if (whoEl) whoEl.textContent = isAdmin && viewUser !== sessionUser
      ? (sessionUser + " · viewing " + viewUser) : sessionUser;
    if (logoutBtn) logoutBtn.addEventListener("click", function () {
      try { sessionStorage.removeItem(SESSION); sessionStorage.removeItem(VIEWAS); } catch (e) {}
      location.reload();
    });
    if (exportBtn) exportBtn.addEventListener("click", function () {
      var data = { exportedBy: viewUser, courses: lib(viewUser), active: ls("cs:" + viewUser + ":active") };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = viewUser + "-calm-seating.json"; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    if (isAdmin && adminWrap) {
      adminWrap.hidden = false;
      if (viewSel) {
        users.forEach(function (u) {
          var o = document.createElement("option"); o.value = u.username; o.textContent = u.username + (u.role === "admin" ? " (you)" : "");
          if (u.username === viewUser) o.selected = true; viewSel.appendChild(o);
        });
        viewSel.addEventListener("change", function () {
          try { if (viewSel.value === sessionUser) sessionStorage.removeItem(VIEWAS); else sessionStorage.setItem(VIEWAS, viewSel.value); } catch (e) {}
          location.reload();
        });
      }
      if (importBtn && importInput) {
        importBtn.addEventListener("click", function () { importInput.click(); });
        importInput.addEventListener("change", function () {
          var f = importInput.files && importInput.files[0]; if (!f) return;
          var r = new FileReader();
          r.onload = function () {
            try {
              var d = JSON.parse(String(r.result || ""));
              var incoming = d.courses || {};
              var L = lib(viewUser);
              Object.keys(incoming).forEach(function (k) { L[k] = incoming[k]; });
              lsSet("cs:" + viewUser + ":courses", JSON.stringify(L));
              location.reload();
            } catch (e) { alert("Could not import: " + e.message); }
            finally { importInput.value = ""; }
          };
          r.readAsText(f);
        });
      }
    }
  });
})();
