/*
 * export.js — get notes out. Markdown for humans, JSON for re-import.
 * If a note has been AI-organized, the structured markdown is included too,
 * with the raw body preserved beneath it (history is sacred).
 */
(function (global) {
  "use strict";

  const Catalog = global.Catalog;

  function dateOnly(iso) { return iso ? iso.slice(0, 10) : "—"; }

  function noteToMarkdown(n) {
    const lines = [];
    const project = Catalog.getProject(n.project_id);
    const tags = Catalog.tagNames(n.tag_ids);

    lines.push("# " + (n.title || "(untitled)"));
    lines.push("");
    const meta = ["**Date:** " + dateOnly(n.created_at)];
    if (project) meta.push("**Project:** " + project.name);
    if (tags.length) meta.push("**Tags:** " + tags.join(", "));
    lines.push(meta.join("   "));
    lines.push("");

    if (n.structured && n.structured.markdown) {
      lines.push(n.structured.markdown.trim());
      lines.push("");
      lines.push("---");
      lines.push("");
      lines.push("## Original note");
      lines.push("");
    }

    lines.push((n.body || "").trim());
    lines.push("");

    if (n.attachments && n.attachments.length) {
      lines.push("## Attachments");
      n.attachments.forEach(function (a) {
        const target = a.url || "";
        if (a.type === "image") lines.push("- ![" + (a.label || "image") + "](" + target + ")");
        else lines.push("- [" + (a.label || target) + "](" + target + ")");
      });
      lines.push("");
    }
    return lines.join("\n");
  }

  function noteToJSON(n) { return JSON.stringify(n, null, 2); }
  function docToJSON() { return JSON.stringify(global.Store.exportDoc(), null, 2); }

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
    return (s || "note").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "note";
  }

  global.Exporter = {
    noteToMarkdown: noteToMarkdown,
    noteToJSON: noteToJSON,
    docToJSON: docToJSON,
    download: download,
    slug: slug,
  };
})(window);
