/*
 * ui.js — capture-first UI: a note list and an open editor.
 *
 * The editor is the whole experience: a title and one body you just write or
 * dictate, plus a quiet toolbar for photos, tags and project. Everything
 * autosaves. No fill-in fields. The "Organize" button is the seam for the AI
 * step shipping next.
 */
(function (global) {
  "use strict";

  const Store = global.Store;
  const Catalog = global.Catalog;
  const Schema = global.Schema;
  const Exporter = global.Exporter;

  const app = function () { return document.getElementById("app"); };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function relDate(iso) {
    if (!iso) return "";
    const d = new Date(iso), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "2-digit" });
  }
  function firstImage(n) {
    return (n.attachments || []).find(function (a) { return a.type === "image" && a.url; });
  }
  function snippet(n) {
    const body = (n.body || "").replace(/\s+/g, " ").trim();
    return body.slice(0, 140);
  }
  function setStats() {
    const s = Store.stats();
    const node = document.getElementById("storage-stats");
    if (node) node.textContent = s.notes + " notes · " + (s.bytes / 1024).toFixed(0) + " KB";
  }

  // =========================================================================
  // LIST
  // =========================================================================
  const listState = { q: "", project: "", tag: "" };

  function renderList() {
    const root = app();
    root.innerHTML = "";

    const projects = Store.listProjects();
    const tags = Store.listTags();
    const projOpts = ['<option value="">All projects</option>'].concat(
      projects.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === listState.project ? " selected" : "") + ">" + esc(p.name) + "</option>";
      })).join("");
    const tagOpts = ['<option value="">All tags</option>'].concat(
      tags.map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === listState.tag ? " selected" : "") + ">#" + esc(t.name) + "</option>";
      })).join("");

    root.appendChild(el(
      '<div class="toolbar">' +
        '<input id="f-q" class="search" type="search" placeholder="Search notes…" value="' + esc(listState.q) + '" />' +
        '<select id="f-project" class="filter">' + projOpts + "</select>" +
        '<select id="f-tag" class="filter">' + tagOpts + "</select>" +
        '<span class="spacer"></span>' +
        '<button id="export-all" class="btn" title="Export everything as JSON">Export</button>' +
        '<button id="import-doc" class="btn" title="Import a JSON export">Import</button>' +
      "</div>"
    ));

    const grid = el('<div class="note-grid"></div>');
    root.appendChild(grid);
    renderCards(grid);

    root.querySelector("#f-q").addEventListener("input", function (e) { listState.q = e.target.value; renderCards(grid); });
    root.querySelector("#f-project").addEventListener("change", function (e) { listState.project = e.target.value; renderCards(grid); });
    root.querySelector("#f-tag").addEventListener("change", function (e) { listState.tag = e.target.value; renderCards(grid); });
    root.querySelector("#export-all").addEventListener("click", function () {
      Exporter.download("engnote-export.json", Exporter.docToJSON(), "application/json");
    });
    root.querySelector("#import-doc").addEventListener("click", importFlow);

    // Floating compose button
    const fab = el('<button class="fab" title="New note">+</button>');
    fab.addEventListener("click", newNote);
    root.appendChild(fab);

    setStats();
  }

  function filtered() {
    const q = listState.q.trim().toLowerCase();
    return Store.listNotes()
      .filter(function (n) {
        if (listState.project && n.project_id !== listState.project) return false;
        if (listState.tag && (n.tag_ids || []).indexOf(listState.tag) < 0) return false;
        if (q) {
          const hay = (n.title + " " + n.body).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      })
      .sort(function (a, b) {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        return (b.updated_at || "").localeCompare(a.updated_at || "");
      });
  }

  function renderCards(grid) {
    const notes = filtered();
    if (!notes.length) {
      grid.innerHTML = '<div class="empty"><p>No notes yet.</p><p class="muted">Tap + to start writing.</p></div>';
      return;
    }
    grid.innerHTML = "";
    notes.forEach(function (n) {
      const project = Catalog.getProject(n.project_id);
      const tags = Catalog.tagNames(n.tag_ids);
      const img = firstImage(n);
      const card = el(
        '<div class="note-card" data-id="' + esc(n.id) + '">' +
          (n.pinned ? '<span class="pin">📌</span>' : "") +
          (img ? '<div class="card-thumb" style="background-image:url(' + esc(img.url) + ')"></div>' : "") +
          '<div class="card-body">' +
            '<div class="card-title">' + esc(n.title || "Untitled") + (n.structured ? ' <span class="organized" title="organized">✨</span>' : "") + "</div>" +
            '<div class="card-snippet">' + esc(snippet(n) || "No additional text") + "</div>" +
            '<div class="card-meta">' +
              '<span class="card-date">' + relDate(n.updated_at) + "</span>" +
              (project ? '<span class="card-project">' + esc(project.name) + "</span>" : "") +
            "</div>" +
            (tags.length ? '<div class="card-tags">' + tags.map(function (t) { return '<span class="chip">#' + esc(t) + "</span>"; }).join("") + "</div>" : "") +
          "</div>" +
        "</div>"
      );
      card.addEventListener("click", function () { location.hash = "#/note/" + n.id; });
      grid.appendChild(card);
    });
  }

  function newNote() {
    const n = Schema.makeNote({});
    Store.saveNote(n);
    location.hash = "#/note/" + n.id;
  }

  function importFlow() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", function () {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          Store.importDoc(JSON.parse(reader.result));
          renderList();
        } catch (e) { alert("Import failed: " + e.message); }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // =========================================================================
  // EDITOR
  // =========================================================================
  const MAX_FILE_BYTES = 10 * 1024 * 1024; // localStorage is small; keep media modest

  function renderEditor(id) {
    const root = app();
    const note = Store.getNote(id);
    if (!note) { location.hash = "#/"; return; }

    root.innerHTML = "";

    // --- top action bar
    root.appendChild(el(
      '<div class="editor-bar">' +
        '<button id="back" class="iconbtn" title="Back to notes">‹ Notes</button>' +
        '<span class="spacer"></span>' +
        '<button id="pin" class="iconbtn" title="Pin">' + (note.pinned ? "📌" : "📍") + "</button>" +
        '<button id="organize" class="iconbtn organize-btn" title="Organize into a decision (AI — coming soon)">✨ Organize</button>' +
        '<button id="export" class="iconbtn" title="Export">⤓</button>' +
        '<button id="del" class="iconbtn danger" title="Delete">🗑</button>' +
      "</div>"
    ));

    const editor = el(
      '<div class="editor">' +
        '<input id="e-title" class="e-title" type="text" placeholder="Title" value="' + esc(note.title) + '" />' +
        '<div class="e-stamp">' + relDate(note.updated_at) + "</div>" +
        '<textarea id="e-body" class="e-body" placeholder="Start writing… or tap the mic and just talk.">' + esc(note.body) + "</textarea>" +
        '<div id="e-attachments" class="e-attachments"></div>' +
        '<div id="organize-panel" class="organize-panel" hidden></div>' +
      "</div>"
    );
    root.appendChild(editor);

    // --- chips bar (project + tags) sits just above the bottom toolbar
    root.appendChild(el(
      '<div class="meta-bar">' +
        '<div class="meta-row"><span class="meta-label">Project</span>' +
          '<input id="e-project" class="meta-input" type="text" list="project-list" placeholder="none" value="' + esc((Catalog.getProject(note.project_id) || {}).name || "") + '" />' +
          projectDatalist() +
        "</div>" +
        '<div class="meta-row"><span class="meta-label">Tags</span>' +
          '<div id="tag-chips" class="tag-chips"></div>' +
          '<input id="e-tag" class="meta-input" type="text" list="tag-list" placeholder="add tag + Enter" />' +
          tagDatalist() +
        "</div>" +
      "</div>"
    ));

    // --- bottom capture toolbar (mic / photo / file)
    root.appendChild(el(
      '<div class="capture-bar">' +
        '<button id="mic" class="capbtn" title="Dictate">🎙 <span class="caplabel">Dictate</span></button>' +
        '<button id="photo" class="capbtn" title="Add photo">📷 <span class="caplabel">Photo</span></button>' +
        '<button id="file" class="capbtn" title="Attach file">📎 <span class="caplabel">File</span></button>' +
      "</div>"
    ));

    const titleEl = root.querySelector("#e-title");
    const bodyEl = root.querySelector("#e-body");
    const stampEl = root.querySelector(".e-stamp");

    autoGrow(bodyEl);
    renderAttachments(root, note);
    renderTagChips(root, note);

    // --- autosave
    function touch() {
      note.title = titleEl.value;
      note.body = bodyEl.value;
      Store.saveNote(note);
      stampEl.textContent = relDate(note.updated_at);
    }
    let saveTimer = null;
    function debouncedSave() { clearTimeout(saveTimer); saveTimer = setTimeout(touch, 300); }
    titleEl.addEventListener("input", debouncedSave);
    bodyEl.addEventListener("input", function () { autoGrow(bodyEl); debouncedSave(); });

    // --- back (discard if untouched/empty)
    root.querySelector("#back").addEventListener("click", function () {
      clearTimeout(saveTimer); touch();
      if (Schema.isEmptyNote(note)) Store.removeNote(note.id);
      location.hash = "#/";
    });

    // --- pin
    root.querySelector("#pin").addEventListener("click", function (e) {
      note.pinned = !note.pinned;
      Store.saveNote(note);
      e.target.textContent = note.pinned ? "📌" : "📍";
    });

    // --- delete
    root.querySelector("#del").addEventListener("click", function () {
      if (confirm("Delete this note?")) { Store.removeNote(note.id); location.hash = "#/"; }
    });

    // --- export
    root.querySelector("#export").addEventListener("click", function () {
      touch();
      Exporter.download(Exporter.slug(note.title) + ".md", Exporter.noteToMarkdown(note), "text/markdown");
    });

    // --- organize (AI seam — next milestone)
    root.querySelector("#organize").addEventListener("click", function () {
      const panel = root.querySelector("#organize-panel");
      panel.hidden = !panel.hidden;
      panel.innerHTML =
        '<div class="organize-inner">' +
          "<strong>✨ Organize — shipping next</strong>" +
          "<p>This will read your note and lay it out as a clean engineering decision " +
          "(context, options, decision, reasoning, risks, follow-ups). Your original text " +
          "is always kept underneath — organizing never overwrites what you wrote.</p>" +
          "<p class=\"muted\">Powered by Claude. We'll wire it up in the next update.</p>" +
        "</div>";
    });

    // --- project autosave
    const projEl = root.querySelector("#e-project");
    projEl.addEventListener("change", function () {
      const p = Catalog.getOrCreateProject(projEl.value);
      note.project_id = p ? p.id : null;
      Store.saveNote(note);
    });

    // --- tags
    const tagEl = root.querySelector("#e-tag");
    tagEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && tagEl.value.trim()) {
        e.preventDefault();
        const t = Catalog.getOrCreateTag(tagEl.value);
        if (t && (note.tag_ids || []).indexOf(t.id) < 0) {
          note.tag_ids = (note.tag_ids || []).concat(t.id);
          Store.saveNote(note);
          renderTagChips(root, note);
        }
        tagEl.value = "";
      }
    });

    // --- photo / file
    root.querySelector("#photo").addEventListener("click", function () { pickFile(root, note, "image/*", true); });
    root.querySelector("#file").addEventListener("click", function () { pickFile(root, note, "", false); });

    // --- dictation
    wireDictation(root, bodyEl, note, debouncedSave);

    setStats();
    setTimeout(function () { if (!note.title) titleEl.focus(); else bodyEl.focus(); }, 50);
  }

  function autoGrow(ta) {
    ta.style.height = "auto";
    ta.style.height = Math.max(ta.scrollHeight, 200) + "px";
  }

  function projectDatalist() {
    return '<datalist id="project-list">' +
      Store.listProjects().map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join("") + "</datalist>";
  }
  function tagDatalist() {
    return '<datalist id="tag-list">' +
      Store.listTags().map(function (t) { return '<option value="' + esc(t.name) + '">'; }).join("") + "</datalist>";
  }

  function renderTagChips(root, note) {
    const wrap = root.querySelector("#tag-chips");
    if (!wrap) return;
    const tags = (note.tag_ids || []).map(Catalog.getTag).filter(Boolean);
    wrap.innerHTML = tags.map(function (t) {
      return '<span class="chip removable" data-id="' + esc(t.id) + '">#' + esc(t.name) + ' <span class="x">×</span></span>';
    }).join("");
    wrap.querySelectorAll(".chip").forEach(function (c) {
      c.querySelector(".x").addEventListener("click", function () {
        const tid = c.getAttribute("data-id");
        note.tag_ids = (note.tag_ids || []).filter(function (x) { return x !== tid; });
        Store.saveNote(note);
        renderTagChips(root, note);
      });
    });
  }

  function pickFile(root, note, accept, isImage) {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;
    if (isImage) input.capture = "environment"; // hint phones toward the camera
    input.addEventListener("change", function () {
      const file = input.files[0];
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) {
        alert("That file is " + (file.size / 1048576).toFixed(1) + " MB — over the 10 MB limit for in-browser storage.");
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        note.attachments = (note.attachments || []).concat(Schema.makeAttachment({
          type: /^image\//.test(file.type) ? "image" : "file",
          label: file.name,
          url: reader.result,
          mime_type: file.type,
          size_bytes: file.size,
        }));
        Store.saveNote(note);
        renderAttachments(root, note);
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  function renderAttachments(root, note) {
    const wrap = root.querySelector("#e-attachments");
    if (!wrap) return;
    const atts = note.attachments || [];
    wrap.innerHTML = atts.map(function (a) {
      const inner = a.type === "image"
        ? '<img src="' + esc(a.url) + '" alt="' + esc(a.label) + '" />'
        : '<a class="file-att" href="' + esc(a.url) + '" target="_blank" rel="noopener">📄 ' + esc(a.label || "file") + "</a>";
      return '<div class="att" data-id="' + esc(a.id) + '">' + inner + '<button class="att-x" title="Remove">×</button></div>';
    }).join("");
    wrap.querySelectorAll(".att").forEach(function (node) {
      node.querySelector(".att-x").addEventListener("click", function () {
        const aid = node.getAttribute("data-id");
        note.attachments = (note.attachments || []).filter(function (x) { return x.id !== aid; });
        Store.saveNote(note);
        renderAttachments(root, note);
      });
    });
  }

  // --- live dictation via Web Speech API (graceful if unsupported) ---------
  function wireDictation(root, bodyEl, note, save) {
    const micBtn = root.querySelector("#mic");
    const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SR) {
      micBtn.disabled = true;
      micBtn.title = "Dictation isn't supported in this browser";
      micBtn.classList.add("disabled");
      return;
    }
    let rec = null, listening = false, baseText = "";

    function start() {
      rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || "en-US";
      baseText = bodyEl.value;
      rec.onresult = function (e) {
        let finalAdd = "", interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const tr = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalAdd += tr;
          else interim += tr;
        }
        if (finalAdd) baseText = (baseText ? baseText.replace(/\s*$/, "") + " " : "") + finalAdd.trim();
        bodyEl.value = baseText + (interim ? " " + interim : "");
        autoGrow(bodyEl);
        save();
      };
      rec.onerror = function () { stop(); };
      rec.onend = function () { if (listening) { try { rec.start(); } catch (e) {} } };
      try { rec.start(); listening = true; micBtn.classList.add("recording"); micBtn.innerHTML = '⏺ <span class="caplabel">Stop</span>'; }
      catch (e) { listening = false; }
    }
    function stop() {
      listening = false;
      if (rec) { try { rec.stop(); } catch (e) {} }
      micBtn.classList.remove("recording");
      micBtn.innerHTML = '🎙 <span class="caplabel">Dictate</span>';
      save();
    }
    micBtn.addEventListener("click", function () { listening ? stop() : start(); });
  }

  global.UI = {
    renderList: renderList,
    renderEditor: renderEditor,
  };
})(window);
