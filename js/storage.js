/*
 * storage.js — persistence seam.
 *
 * In this static MVP the store is the browser's localStorage. The public API
 * (list / get / save / remove + catalog accessors) is deliberately narrow and
 * synchronous-feeling so a real backend (Flask + SQLite per ARCHITECTURE.md)
 * can be dropped in behind the same surface later without touching the UI.
 *
 * "Auto-backup on every write" (§9) is honored here with a lightweight rolling
 * snapshot kept under a separate key.
 */
(function (global) {
  "use strict";

  const KEY = "engnote.v1";
  const BACKUP_KEY = "engnote.v1.backups";
  const MAX_BACKUPS = 10;

  // Single document: everything lives under one key for trivial export/import.
  function emptyDoc() {
    return {
      schema_version: global.Schema.SCHEMA_VERSION,
      decisions: [],
      projects: [],
      tags: [],
      updated_at: global.Schema.now(),
    };
  }

  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      const raw = global.localStorage.getItem(KEY);
      cache = raw ? JSON.parse(raw) : emptyDoc();
    } catch (e) {
      console.error("Failed to read store, starting empty:", e);
      cache = emptyDoc();
    }
    // Tolerate older / partial docs.
    cache.decisions = cache.decisions || [];
    cache.projects = cache.projects || [];
    cache.tags = cache.tags || [];
    return cache;
  }

  function persist() {
    const doc = load();
    doc.updated_at = global.Schema.now();
    snapshot(doc); // backup BEFORE overwrite (cheap, rolling)
    global.localStorage.setItem(KEY, JSON.stringify(doc));
  }

  function snapshot(doc) {
    try {
      const raw = global.localStorage.getItem(BACKUP_KEY);
      const backups = raw ? JSON.parse(raw) : [];
      backups.push({ at: global.Schema.now(), doc: doc });
      while (backups.length > MAX_BACKUPS) backups.shift();
      global.localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
    } catch (e) {
      // Backups are best-effort; never block a write on them.
      console.warn("Backup skipped:", e);
    }
  }

  // --- Decisions ------------------------------------------------------------
  function listDecisions() {
    return load().decisions.slice();
  }

  function getDecision(id) {
    return load().decisions.find(function (d) { return d.id === id; }) || null;
  }

  function saveDecision(decision) {
    const doc = load();
    const idx = doc.decisions.findIndex(function (d) { return d.id === decision.id; });
    if (idx >= 0) doc.decisions[idx] = decision;
    else doc.decisions.push(decision);
    persist();
    return decision;
  }

  function removeDecision(id) {
    const doc = load();
    doc.decisions = doc.decisions.filter(function (d) { return d.id !== id; });
    persist();
  }

  // --- Catalogs (raw access; get-or-create logic lives in catalog.js) -------
  function listProjects() { return load().projects.slice(); }
  function listTags() { return load().tags.slice(); }

  function addProject(project) {
    load().projects.push(project);
    persist();
    return project;
  }

  function addTag(tag) {
    load().tags.push(tag);
    persist();
    return tag;
  }

  // --- Whole-document import/export (re-importable JSON, §3.5) --------------
  function exportDoc() {
    return JSON.parse(JSON.stringify(load()));
  }

  function importDoc(doc) {
    if (!doc || !Array.isArray(doc.decisions)) {
      throw new Error("Invalid document: missing decisions array");
    }
    cache = {
      schema_version: doc.schema_version || global.Schema.SCHEMA_VERSION,
      decisions: doc.decisions,
      projects: doc.projects || [],
      tags: doc.tags || [],
      updated_at: global.Schema.now(),
    };
    persist();
    return cache;
  }

  function stats() {
    const doc = load();
    let bytes = 0;
    try {
      bytes = (global.localStorage.getItem(KEY) || "").length;
    } catch (e) { /* ignore */ }
    return {
      decisions: doc.decisions.length,
      projects: doc.projects.length,
      tags: doc.tags.length,
      bytes: bytes,
    };
  }

  global.Store = {
    listDecisions: listDecisions,
    getDecision: getDecision,
    saveDecision: saveDecision,
    removeDecision: removeDecision,
    listProjects: listProjects,
    listTags: listTags,
    addProject: addProject,
    addTag: addTag,
    exportDoc: exportDoc,
    importDoc: importDoc,
    stats: stats,
  };
})(window);
