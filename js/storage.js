/*
 * storage.js — persistence seam (localStorage today, backend later).
 *
 * Stores notes + project/tag catalogs under one key. Rolling auto-backups on
 * every write. Migrates any v1 "decisions" data into v2 notes so early captures
 * are never lost (schema-is-the-product: never break backward compatibility).
 */
(function (global) {
  "use strict";

  const KEY = "engnote.v1"; // single doc key (kept stable across schema bumps)
  const BACKUP_KEY = "engnote.v1.backups";
  const MAX_BACKUPS = 10;

  function emptyDoc() {
    return {
      schema_version: global.Schema.SCHEMA_VERSION,
      notes: [],
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
    cache.projects = cache.projects || [];
    cache.tags = cache.tags || [];
    migrateIfNeeded(cache);
    cache.notes = cache.notes || [];
    return cache;
  }

  // v1 (decisions) → v2 (notes): fold the old structured fields into a readable
  // freeform body, preserving the content as plain text the user can edit.
  function migrateIfNeeded(doc) {
    if (Array.isArray(doc.notes)) return; // already v2+
    const decisions = Array.isArray(doc.decisions) ? doc.decisions : [];
    doc.notes = decisions.map(function (d) {
      const parts = [];
      if (d.context) parts.push(d.context);
      if (d.chosen_option) parts.push("Chosen: " + d.chosen_option);
      if (d.reasoning) parts.push("Why: " + d.reasoning);
      if (Array.isArray(d.options_considered) && d.options_considered.length)
        parts.push("Options: " + d.options_considered.join(", "));
      if (d.notes) parts.push(d.notes);
      return global.Schema.makeNote({
        id: d.id,
        title: d.title,
        body: parts.join("\n\n"),
        tag_ids: d.tag_ids,
        project_id: d.project_id,
        attachments: (d.attachments || []).map(function (a) {
          return { type: a.type === "image" ? "image" : a.url && !a.path ? "link" : "file",
            label: a.label, url: a.url, mime_type: a.mime_type, size_bytes: a.size_bytes };
        }),
        created_at: d.date_created,
        updated_at: d.date_decided || d.date_created,
      });
    });
    delete doc.decisions;
    doc.schema_version = global.Schema.SCHEMA_VERSION;
  }

  function persist() {
    const doc = load();
    doc.schema_version = global.Schema.SCHEMA_VERSION;
    doc.updated_at = global.Schema.now();
    snapshot(doc);
    try {
      global.localStorage.setItem(KEY, JSON.stringify(doc));
    } catch (e) {
      // Out of space — drop backups (they're a safety net, not the data) and retry.
      try { global.localStorage.removeItem(BACKUP_KEY); } catch (e2) {}
      try {
        global.localStorage.setItem(KEY, JSON.stringify(doc));
      } catch (e3) {
        throw new Error("QUOTA: browser storage is full. Remove some photos/files or export, then retry.");
      }
    }
  }

  // Backups keep only attachment METADATA, never the inline bytes — otherwise a
  // few photos × 10 snapshots would blow the storage budget (ARCHITECTURE.md §3:
  // attachments are excluded from the every-write backup).
  function snapshot(doc) {
    try {
      const lite = {
        schema_version: doc.schema_version,
        updated_at: doc.updated_at,
        projects: doc.projects,
        tags: doc.tags,
        notes: doc.notes.map(function (n) {
          const copy = Object.assign({}, n);
          copy.attachments = (n.attachments || []).map(function (a) {
            const m = Object.assign({}, a);
            m.url = a.url && a.url.indexOf("data:") === 0 ? "" : a.url; // strip inline bytes
            return m;
          });
          return copy;
        }),
      };
      const raw = global.localStorage.getItem(BACKUP_KEY);
      const backups = raw ? JSON.parse(raw) : [];
      backups.push({ at: global.Schema.now(), doc: lite });
      while (backups.length > MAX_BACKUPS) backups.shift();
      global.localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
    } catch (e) {
      // Backups are best-effort; never block a write on them.
      try { global.localStorage.removeItem(BACKUP_KEY); } catch (e2) {}
      console.warn("Backup skipped:", e);
    }
  }

  // --- Notes ----------------------------------------------------------------
  function listNotes() { return load().notes.slice(); }

  function getNote(id) {
    return load().notes.find(function (n) { return n.id === id; }) || null;
  }

  function saveNote(note) {
    const doc = load();
    note.updated_at = global.Schema.now();
    const idx = doc.notes.findIndex(function (n) { return n.id === note.id; });
    if (idx >= 0) doc.notes[idx] = note;
    else doc.notes.push(note);
    persist();
    return note;
  }

  function removeNote(id) {
    const doc = load();
    doc.notes = doc.notes.filter(function (n) { return n.id !== id; });
    persist();
  }

  // --- Catalogs -------------------------------------------------------------
  function listProjects() { return load().projects.slice(); }
  function listTags() { return load().tags.slice(); }
  function addProject(p) { load().projects.push(p); persist(); return p; }
  function addTag(t) { load().tags.push(t); persist(); return t; }

  // Bump recency so autocomplete can surface most-recently-used first.
  function touchProject(id) {
    const p = load().projects.find(function (x) { return x.id === id; });
    if (p) { p.last_used_at = global.Schema.now(); persist(); }
  }
  function touchTag(id) {
    const t = load().tags.find(function (x) { return x.id === id; });
    if (t) { t.last_used_at = global.Schema.now(); persist(); }
  }

  // --- Whole-document import/export ----------------------------------------
  function exportDoc() { return JSON.parse(JSON.stringify(load())); }

  function importDoc(doc) {
    if (!doc || (!Array.isArray(doc.notes) && !Array.isArray(doc.decisions))) {
      throw new Error("Invalid document: missing notes array");
    }
    cache = {
      schema_version: doc.schema_version,
      notes: doc.notes,
      decisions: doc.decisions, // let migrateIfNeeded fold these in
      projects: doc.projects || [],
      tags: doc.tags || [],
      updated_at: global.Schema.now(),
    };
    migrateIfNeeded(cache);
    persist();
    return cache;
  }

  function stats() {
    const doc = load();
    let bytes = 0;
    try { bytes = (global.localStorage.getItem(KEY) || "").length; } catch (e) {}
    return { notes: doc.notes.length, projects: doc.projects.length, tags: doc.tags.length, bytes: bytes };
  }

  global.Store = {
    listNotes: listNotes,
    getNote: getNote,
    saveNote: saveNote,
    removeNote: removeNote,
    listProjects: listProjects,
    listTags: listTags,
    addProject: addProject,
    addTag: addTag,
    touchProject: touchProject,
    touchTag: touchTag,
    exportDoc: exportDoc,
    importDoc: importDoc,
    stats: stats,
  };
})(window);
