/*
 * organize.js — the AI "Organize" step.
 *
 * Reads a freeform note and asks Claude to lay it out as a clean engineering
 * decision (context, options, decision, reasoning, risks, follow-ups). The raw
 * note is never sent for rewriting-in-place — the result is stored alongside it
 * (note.structured), so the original is always preserved.
 *
 * Static-app constraints: there's no backend, so we call the Claude API directly
 * from the browser with the user's own key (kept in localStorage on their device)
 * and the documented browser-access header. When the backend phase lands, the key
 * moves server-side and this module's surface stays the same.
 */
(function (global) {
  "use strict";

  const KEY_STORE = "engnote.claude_key";
  const MODEL = "claude-opus-4-8"; // current default Claude model
  const ENDPOINT = "https://api.anthropic.com/v1/messages";

  function getKey() {
    try { return (global.localStorage.getItem(KEY_STORE) || "").trim(); } catch (e) { return ""; }
  }
  function setKey(k) {
    try { global.localStorage.setItem(KEY_STORE, (k || "").trim()); } catch (e) {}
  }
  function clearKey() {
    try { global.localStorage.removeItem(KEY_STORE); } catch (e) {}
  }
  function hasKey() { return !!getKey(); }

  const SYSTEM = [
    "You are an engineering decision assistant. An engineer has captured a rough,",
    "freeform note — possibly dictated, rambling, or in shorthand. Reorganize it into",
    "a clear engineering decision record in Markdown.",
    "",
    "Rules:",
    "- Use ONLY information present in the note. Do not invent facts, numbers, or",
    "  options. If something important is missing, write \"(not specified)\" rather",
    "  than guessing.",
    "- Preserve the engineer's intent and meaning. Clean up grammar and structure;",
    "  do not change the substance.",
    "- Be concise and skimmable.",
    "- Output ONLY the Markdown decision record — no preamble, no commentary, no code fences.",
    "",
    "Use this structure, omitting any section the note has nothing for (never output an",
    "empty section):",
    "",
    "## Context",
    "Why this decision matters / what triggered it.",
    "",
    "## Options Considered",
    "- one per line (only if alternatives are mentioned)",
    "",
    "## Decision",
    "What was chosen.",
    "",
    "## Reasoning",
    "Why.",
    "",
    "## Assumptions",
    "- what must be true (only if present)",
    "",
    "## Risks",
    "| Risk | Likelihood | Impact | Mitigation |",
    "|------|------------|--------|------------|",
    "(only if risks are mentioned; use Low/Medium/High; \"—\" for unknown mitigation)",
    "",
    "## Follow-up Actions",
    "- [ ] next steps / open questions (only if present)",
  ].join("\n");

  function buildUserContent(note) {
    return "TITLE: " + (note.title || "(untitled)") + "\n\nNOTE:\n" + (note.body || "");
  }

  // Returns { markdown, model }. Throws Error with a user-friendly message.
  async function organize(note) {
    const key = getKey();
    if (!key) throw new Error("NO_KEY");

    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2048,
          system: SYSTEM,
          messages: [{ role: "user", content: buildUserContent(note) }],
        }),
      });
    } catch (e) {
      throw new Error("Network error reaching Claude. Check your connection and try again.");
    }

    if (!res.ok) {
      let msg = "Request failed (HTTP " + res.status + ").";
      try {
        const err = await res.json();
        if (err && err.error && err.error.message) msg = err.error.message;
      } catch (e) { /* ignore */ }
      if (res.status === 401) throw new Error("Invalid API key — check it and try again.");
      if (res.status === 429) throw new Error("Rate limited — wait a moment and retry.");
      throw new Error(msg);
    }

    const data = await res.json();
    if (data.stop_reason === "refusal") {
      throw new Error("Claude declined to organize this note.");
    }
    const block = (data.content || []).find(function (b) { return b.type === "text"; });
    const markdown = block ? (block.text || "").trim() : "";
    if (!markdown) throw new Error("Claude returned no content. Try again.");
    return { markdown: markdown, model: data.model || MODEL };
  }

  global.Organizer = {
    getKey: getKey,
    setKey: setKey,
    clearKey: clearKey,
    hasKey: hasKey,
    organize: organize,
    MODEL: MODEL,
  };
})(window);
