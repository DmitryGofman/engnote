/*
 * app.js — bootstrap + hash router.
 *
 * Routes (ARCHITECTURE.md §6):
 *   #/                     decision list (home, search + filter)
 *   #/new                  new decision form (quick/full)
 *   #/edit/:id             edit existing decision
 *   #/supersede/:id        new decision pre-filled, supersedes :id
 *   #/decision/:id         decision detail view
 */
(function (global) {
  "use strict";

  const Store = global.Store;
  const Schema = global.Schema;
  const UI = global.UI;

  function route() {
    const hash = location.hash || "#/";
    const parts = hash.replace(/^#\//, "").split("/"); // ["decision","<id>"]

    if (parts[0] === "" || parts[0] === undefined) {
      UI.renderList();
      return;
    }
    if (parts[0] === "new") {
      UI.renderForm(null, {});
      return;
    }
    if (parts[0] === "edit" && parts[1]) {
      const d = Store.getDecision(parts[1]);
      UI.renderForm(d, {});
      return;
    }
    if (parts[0] === "supersede" && parts[1]) {
      const orig = Store.getDecision(parts[1]);
      if (!orig) { location.hash = "#/"; return; }
      // Pre-fill a fresh decision from the original, drop its identity/lineage.
      const prefill = Schema.makeDecision(orig);
      prefill.id = Schema.uuid();
      prefill.supersedes = orig.id;
      prefill.superseded_by = null;
      prefill.status = "decided";
      prefill.status_history = [];
      prefill.date_created = Schema.now();
      prefill.date_decided = null;
      UI.renderForm(prefill, { supersedeOf: orig });
      return;
    }
    if (parts[0] === "decision" && parts[1]) {
      UI.renderView(parts[1]);
      return;
    }
    UI.renderList();
  }

  global.addEventListener("hashchange", route);
  global.addEventListener("DOMContentLoaded", route);
  // In case the script loads after DOMContentLoaded already fired:
  if (document.readyState !== "loading") route();
})(window);
