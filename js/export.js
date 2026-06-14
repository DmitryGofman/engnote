/*
 * export.js — get data out (ARCHITECTURE.md §7).
 *
 * Markdown for humans, JSON for re-import. Both single-decision and filtered.
 * Keeps the Markdown shape from the spec so reports read consistently.
 */
(function (global) {
  "use strict";

  const Catalog = global.Catalog;

  function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function dateOnly(iso) {
    if (!iso) return "—";
    return iso.slice(0, 10);
  }

  // --- Markdown (single decision) ------------------------------------------
  function decisionToMarkdown(d) {
    const lines = [];
    const project = Catalog.getProject(d.project_id);
    const tags = Catalog.tagNames(d.tag_ids);

    lines.push("# Decision: " + (d.title || "(untitled)"));
    lines.push("");

    const meta1 = [
      "**Date:** " + dateOnly(d.date_decided || d.date_created),
      "**Status:** " + cap(d.status),
      "**Confidence:** " + cap(d.confidence),
    ];
    lines.push(meta1.join("   "));

    const meta2 = [];
    if (project) meta2.push("**Project:** " + project.name);
    if (tags.length) meta2.push("**Tags:** " + tags.join(", "));
    if (d.subsystem_name) meta2.push("**Subsystem:** " + d.subsystem_name);
    if (meta2.length) lines.push(meta2.join("   "));

    if (d.references) lines.push("**References:** " + d.references);
    if (d.supersedes) lines.push("**Supersedes:** Decision " + d.supersedes);
    if (d.superseded_by) lines.push("**Superseded by:** Decision " + d.superseded_by);
    lines.push("");

    if (d.context) {
      lines.push("## Context");
      lines.push(d.context);
      lines.push("");
    }

    if (d.options_considered.length) {
      lines.push("## Options Considered");
      d.options_considered.forEach(function (o) { lines.push("- " + o); });
      lines.push("");
    }

    if (d.chosen_option) {
      lines.push("## Chosen Option");
      lines.push(d.chosen_option);
      lines.push("");
    }

    if (d.reasoning) {
      lines.push("## Reasoning");
      lines.push(d.reasoning);
      lines.push("");
    }

    if (d.assumptions.length) {
      lines.push("## Assumptions");
      d.assumptions.forEach(function (a) { lines.push("- " + a); });
      lines.push("");
    }

    if (d.risks.length) {
      lines.push("## Risks");
      lines.push("| Risk | Likelihood | Impact | Mitigation |");
      lines.push("|------|------------|--------|------------|");
      d.risks.forEach(function (r) {
        lines.push(
          "| " + (r.description || "") +
          " | " + cap(r.likelihood) +
          " | " + cap(r.impact) +
          " | " + (r.mitigation || "—") + " |"
        );
      });
      lines.push("");
    }

    if (d.follow_up_actions.length) {
      lines.push("## Follow-up Actions");
      d.follow_up_actions.forEach(function (f) { lines.push("- [ ] " + f); });
      lines.push("");
    }

    if (d.status_history.length) {
      lines.push("## Status History");
      lines.push(
        d.status_history
          .map(function (e) { return e.status + " (" + dateOnly(e.timestamp) + ")"; })
          .join(" → ")
      );
      lines.push("");
    }

    if (d.attachments.length) {
      lines.push("## Attachments");
      d.attachments.forEach(function (a) {
        const target = a.url || a.path;
        if (a.type === "image") {
          lines.push("- ![" + (a.label || "image") + "](" + target + ")");
        } else {
          lines.push("- [" + (a.label || target) + "](" + target + ")");
        }
      });
      lines.push("");
    }

    if (d.notes) {
      lines.push("## Notes");
      lines.push(d.notes);
      lines.push("");
    }

    return lines.join("\n");
  }

  // --- Markdown (many decisions) -------------------------------------------
  function decisionsToMarkdown(decisions) {
    return decisions.map(decisionToMarkdown).join("\n\n---\n\n");
  }

  // --- JSON (re-importable) -------------------------------------------------
  function decisionToJSON(d) {
    return JSON.stringify(d, null, 2);
  }

  function docToJSON() {
    return JSON.stringify(global.Store.exportDoc(), null, 2);
  }

  // --- Download helper ------------------------------------------------------
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function slug(s) {
    return (s || "decision")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "decision";
  }

  global.Exporter = {
    decisionToMarkdown: decisionToMarkdown,
    decisionsToMarkdown: decisionsToMarkdown,
    decisionToJSON: decisionToJSON,
    docToJSON: docToJSON,
    download: download,
    slug: slug,
  };
})(window);
