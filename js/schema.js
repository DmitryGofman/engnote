/*
 * schema.js (v2) — capture-first.
 *
 * The atom is now a NOTE: a title plus one freeform body you just write (or
 * dictate). Tags + project organize it; attachments add evidence. There are NO
 * fill-in fields — the structured engineering-decision format is produced LATER
 * by the AI "Organize" step and stored in `structured` (next milestone). The
 * raw body is always the source of truth and is never destroyed by organizing.
 *
 * The decision/risk enums are kept because they describe the *target format* the
 * AI will emit — "the schema is the product" survives; it's just generated, not
 * typed.
 */
(function (global) {
  "use strict";

  const SCHEMA_VERSION = 2;

  const CONFIDENCE = Object.freeze(["low", "medium", "high"]);
  const LEVEL = Object.freeze(["low", "medium", "high"]);
  const ATTACHMENT_TYPE = Object.freeze(["image", "file", "link"]);

  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function now() {
    return new Date().toISOString();
  }

  function asList(v) {
    if (Array.isArray(v)) return v.slice();
    if (v === undefined || v === null || v === "") return [];
    return [v];
  }

  // --- Catalogs -------------------------------------------------------------
  function makeProject(name) {
    const t = now();
    return { id: uuid(), name: (name || "").trim(), created_at: t, last_used_at: t };
  }

  function makeTag(name) {
    const t = now();
    return { id: uuid(), name: (name || "").trim().toLowerCase(), created_at: t, last_used_at: t };
  }

  // --- Attachment -----------------------------------------------------------
  function makeAttachment(partial) {
    partial = partial || {};
    return {
      id: partial.id || uuid(),
      type: ATTACHMENT_TYPE.includes(partial.type) ? partial.type : "file",
      label: partial.label || "",
      url: partial.url || "", // external URL (link) or data URL (image/file)
      mime_type: partial.mime_type || "",
      size_bytes: partial.size_bytes || 0,
      added_at: partial.added_at || now(),
    };
  }

  // --- Structured layer (DERIVED, filled by the AI step — next milestone) ---
  // Kept null until the user taps "Organize". Stores the exact source it was
  // generated from so the raw note and the tidy version never drift silently.
  function makeStructured(partial) {
    partial = partial || {};
    return {
      generated_at: partial.generated_at || now(),
      model: partial.model || "",
      source_body: partial.source_body || "", // snapshot of body at generation
      markdown: partial.markdown || "", // rendered decision format
    };
  }

  // --- The atom: a Note -----------------------------------------------------
  function makeNote(partial) {
    partial = partial || {};
    const created = partial.created_at || now();
    return {
      id: partial.id || uuid(),
      title: partial.title || "",
      body: partial.body || "", // freeform — just write
      tag_ids: asList(partial.tag_ids),
      project_id: partial.project_id || null,
      attachments: asList(partial.attachments).map(makeAttachment),
      pinned: !!partial.pinned,
      created_at: created,
      updated_at: partial.updated_at || created,
      structured: partial.structured ? makeStructured(partial.structured) : null,
    };
  }

  // A note is "empty" (safe to discard on exit, Apple-Notes style) when it has
  // no title, no body, and no attachments.
  function isEmptyNote(n) {
    return !(n.title || "").trim() &&
      !(n.body || "").trim() &&
      (!n.attachments || n.attachments.length === 0);
  }

  global.Schema = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    CONFIDENCE: CONFIDENCE,
    LEVEL: LEVEL,
    ATTACHMENT_TYPE: ATTACHMENT_TYPE,
    uuid: uuid,
    now: now,
    asList: asList,
    makeProject: makeProject,
    makeTag: makeTag,
    makeAttachment: makeAttachment,
    makeStructured: makeStructured,
    makeNote: makeNote,
    isEmptyNote: isEmptyNote,
  };
})(window);
