/*
 * schema.js — the data model is the product.
 *
 * Mirrors ARCHITECTURE.md §3. Every field in the spec exists here from day one
 * (cheap now, painful to retrofit), even where the UI does not yet surface it.
 * The schema is versioned so exports stay re-importable across upgrades.
 */
(function (global) {
  "use strict";

  const SCHEMA_VERSION = 1;

  // --- Enumerations (kept as frozen arrays so the UI can build dropdowns) ----
  const STATUS = Object.freeze([
    "open",
    "decided",
    "reopened",
    "reviewed",
    "implemented",
    "archived",
    "superseded",
  ]);

  const CONFIDENCE = Object.freeze(["low", "medium", "high"]);
  const LEVEL = Object.freeze(["low", "medium", "high"]); // likelihood / impact
  const ATTACHMENT_TYPE = Object.freeze(["link", "file", "image"]);

  // --- ID + time helpers ----------------------------------------------------
  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    // Fallback for older browsers / file:// contexts.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function now() {
    return new Date().toISOString();
  }

  // --- Nested type factories (ARCHITECTURE.md §3.2) -------------------------
  function makeRisk(partial) {
    partial = partial || {};
    return {
      description: partial.description || "",
      likelihood: LEVEL.includes(partial.likelihood) ? partial.likelihood : "low",
      impact: LEVEL.includes(partial.impact) ? partial.impact : "low",
      mitigation: partial.mitigation || "",
    };
  }

  function makeStatusEvent(status, timestamp) {
    return {
      status: STATUS.includes(status) ? status : "open",
      timestamp: timestamp || now(),
    };
  }

  function makeProject(name) {
    return {
      id: uuid(),
      name: (name || "").trim(),
      created_at: now(),
    };
  }

  function makeTag(name) {
    return {
      id: uuid(),
      // canonical form: trimmed + lowercased (ARCHITECTURE.md §3.3)
      name: (name || "").trim().toLowerCase(),
      created_at: now(),
    };
  }

  function makeAttachment(partial) {
    partial = partial || {};
    return {
      id: uuid(),
      type: ATTACHMENT_TYPE.includes(partial.type) ? partial.type : "link",
      label: partial.label || "",
      path: partial.path || "", // relative path (file / image) — backend era
      url: partial.url || "", // external URL (link) or data URL (static MVP)
      mime_type: partial.mime_type || "",
      size_bytes: partial.size_bytes || 0,
      added_at: now(),
    };
  }

  // --- The atom: a Decision (ARCHITECTURE.md §3.1) --------------------------
  function makeDecision(partial) {
    partial = partial || {};
    const created = partial.date_created || now();
    return {
      id: partial.id || uuid(),
      title: partial.title || "",
      context: partial.context || "",
      options_considered: asList(partial.options_considered),
      chosen_option: partial.chosen_option || "",
      reasoning: partial.reasoning || "",

      assumptions: asList(partial.assumptions),
      risks: asList(partial.risks).map(makeRisk),
      confidence: CONFIDENCE.includes(partial.confidence) ? partial.confidence : "medium",
      needs_review: !!partial.needs_review,

      owner: partial.owner || "",
      project_id: partial.project_id || null,
      subsystem_name: partial.subsystem_name || "",
      tag_ids: asList(partial.tag_ids),
      references: partial.references || "",

      status: STATUS.includes(partial.status) ? partial.status : "open",
      status_history: asList(partial.status_history).map(function (e) {
        return makeStatusEvent(e.status, e.timestamp);
      }),
      date_created: created,
      date_decided: partial.date_decided || null,

      supersedes: partial.supersedes || null,
      superseded_by: partial.superseded_by || null,
      links_to_decisions: asList(partial.links_to_decisions),

      follow_up_actions: asList(partial.follow_up_actions),
      notes: partial.notes || "",
      attachments: asList(partial.attachments).map(makeAttachment),
    };
  }

  // Coerce anything into an array (tolerant of undefined / single values).
  function asList(v) {
    if (Array.isArray(v)) return v.slice();
    if (v === undefined || v === null || v === "") return [];
    return [v];
  }

  // Split a textarea blob ("one per line") into a trimmed, non-empty list.
  function linesToList(text) {
    return (text || "")
      .split("\n")
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  global.Schema = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STATUS: STATUS,
    CONFIDENCE: CONFIDENCE,
    LEVEL: LEVEL,
    ATTACHMENT_TYPE: ATTACHMENT_TYPE,
    uuid: uuid,
    now: now,
    makeRisk: makeRisk,
    makeStatusEvent: makeStatusEvent,
    makeProject: makeProject,
    makeTag: makeTag,
    makeAttachment: makeAttachment,
    makeDecision: makeDecision,
    asList: asList,
    linesToList: linesToList,
  };
})(window);
