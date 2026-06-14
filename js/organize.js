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

  // --- Local heuristic organizer (no AI, no network, instant) ---------------
  // Sorts the note's own sentences into the decision layout using keyword cues.
  // Mechanical — it formats your words, it doesn't rewrite or infer like Claude.
  function splitUnits(text) {
    const out = [];
    (text || "").split(/\r?\n/).forEach(function (line) {
      line = line.replace(/^\s*([-*•]|\d{1,2}[.)])\s+/, "").trim(); // strip list markers
      if (!line) return;
      (line.match(/[^.!?]+[.!?]*/g) || [line]).forEach(function (s) {
        s = s.trim();
        if (s) out.push(s);
      });
    });
    return out;
  }

  function cleanUnit(s) {
    s = (s || "").replace(/^[\s,;:.\-–]+/, "").replace(/\s+/g, " ").trim();
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function uniq(arr) {
    const seen = {}, out = [];
    arr.forEach(function (x) {
      const k = (x || "").toLowerCase();
      if (x && !seen[k]) { seen[k] = 1; out.push(x); }
    });
    return out;
  }

  function organizeLocal(note) {
    const b = { context: [], options: [], decision: [], reasoning: [], assumptions: [], risks: [], followups: [] };
    const RX = {
      decision: /\b(decided|decision|chose|chosen|choosing|going with|go with|went with|picked|settled on|opt(?:ed|ing)? for|we'?ll use|i'?ll use|will use)\b/i,
      risk: /\b(risk|risky|concern|concerned|worried|worry|afraid|fragile|danger|downside|drawback|fail|fails|failing|break|breaks|corros|overheat|fatigue|leak|crack)\b/i,
      assumption: /\b(assum|assuming|as long as|provided that|expect(?:ed)? that|presum)\b/i,
      followup: /\b(todo|to-?do|next step|follow[- ]?up|should (?:check|test|verify|confirm|measure|order|quote)|verify|confirm|measure|double[- ]?check|revisit)\b/i,
      option: /\b(option|alternative|considered|either)\b/i,
      reasoning: /\b(because|since|reason|cheaper|lighter|faster|stronger|better|easier|costl|durable|reliable|to avoid|so that|in order to)\b/i,
    };
    const splitReason = /\b(because|since|so that|in order to)\b/i;

    splitUnits(note.body || "").forEach(function (u) {
      const vs = u.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+)/i);
      if (vs) { b.options.push(cleanUnit(vs[1])); b.options.push(cleanUnit(vs[2])); }

      if (RX.decision.test(u)) {
        const m = u.split(splitReason);
        if (m.length > 1) { b.decision.push(cleanUnit(m[0])); b.reasoning.push(cleanUnit(m.slice(1).join(" "))); }
        else b.decision.push(cleanUnit(u));
        return;
      }
      if (RX.risk.test(u)) { b.risks.push(cleanUnit(u.replace(/^\s*risks?\s*:?\s*/i, ""))); return; }
      if (RX.assumption.test(u)) { b.assumptions.push(cleanUnit(u)); return; }
      if (RX.followup.test(u) || /\?\s*$/.test(u)) { b.followups.push(cleanUnit(u.replace(/^\s*(todo|to-?do)\s*:?\s*/i, ""))); return; }
      if (vs || RX.option.test(u)) { if (!vs) b.options.push(cleanUnit(u)); return; }
      if (RX.reasoning.test(u)) { b.reasoning.push(cleanUnit(u)); return; }
      b.context.push(cleanUnit(u));
    });

    const para = function (a) { return uniq(a).join(" "); };
    const bullets = function (a) { return uniq(a).map(function (x) { return "- " + x; }).join("\n"); };
    const checks = function (a) { return uniq(a).map(function (x) { return "- [ ] " + x; }).join("\n"); };

    const md = [];
    if (b.context.length) md.push("## Context\n" + para(b.context));
    if (b.options.length) md.push("## Options Considered\n" + bullets(b.options));
    if (b.decision.length) md.push("## Decision\n" + para(b.decision));
    if (b.reasoning.length) md.push("## Reasoning\n" + para(b.reasoning));
    if (b.assumptions.length) md.push("## Assumptions\n" + bullets(b.assumptions));
    if (b.risks.length) md.push("## Risks\n" + bullets(b.risks));
    if (b.followups.length) md.push("## Follow-up Actions\n" + checks(b.followups));

    const markdown = md.length ? md.join("\n\n") : "_Add some text to the note, then organize._";
    return { markdown: markdown, model: "local" };
  }

  global.Organizer = {
    getKey: getKey,
    setKey: setKey,
    clearKey: clearKey,
    hasKey: hasKey,
    organize: organize,
    organizeLocal: organizeLocal,
    MODEL: MODEL,
  };
})(window);
