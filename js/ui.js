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
  const Organizer = global.Organizer;

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
  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3500);
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

    // --- chips bar (project + tags) sits just above the bottom toolbar.
    // Each field has a custom type-ahead dropdown (no flaky native datalist).
    root.appendChild(el(
      '<div class="meta-bar">' +
        '<div class="meta-row"><span class="meta-label">Project</span>' +
          '<div class="ac" id="ac-project">' +
            '<input id="e-project" class="meta-input" type="text" autocomplete="off" placeholder="none" value="' + esc((Catalog.getProject(note.project_id) || {}).name || "") + '" />' +
            '<div class="ac-menu" hidden></div>' +
          "</div>" +
        "</div>" +
        '<div class="meta-row"><span class="meta-label">Tags</span>' +
          '<div id="tag-chips" class="tag-chips"></div>' +
          '<div class="ac" id="ac-tag">' +
            '<input id="e-tag" class="meta-input" type="text" autocomplete="off" placeholder="add tag…" />' +
            '<div class="ac-menu" hidden></div>' +
          "</div>" +
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

    // --- organize (AI) — toggle the panel; auto-open if already organized
    const orgPanel = root.querySelector("#organize-panel");
    root.querySelector("#organize").addEventListener("click", function () {
      orgPanel.hidden = !orgPanel.hidden;
      if (!orgPanel.hidden) renderOrganizePanel(root, note);
    });
    if (note.structured) { orgPanel.hidden = false; renderOrganizePanel(root, note); }

    // --- project autocomplete (single select)
    setupAutocomplete(root.querySelector("#ac-project"), {
      search: function (q) { return Catalog.searchProjects(q); },
      onPick: function (project) {
        note.project_id = project.id;
        Store.touchProject(project.id);
        Store.saveNote(note);
        root.querySelector("#e-project").value = project.name;
      },
      onCreate: function (name) {
        const p = Catalog.getOrCreateProject(name);
        if (p) { note.project_id = p.id; Store.saveNote(note); root.querySelector("#e-project").value = p.name; }
      },
      onClear: function () { note.project_id = null; Store.saveNote(note); },
    });

    // --- tag autocomplete (multi select → chips)
    setupAutocomplete(root.querySelector("#ac-tag"), {
      clearOnPick: true,
      search: function (q) {
        return Catalog.searchTags(q).filter(function (t) { return (note.tag_ids || []).indexOf(t.id) < 0; });
      },
      onPick: function (tag) { addTagToNote(root, note, tag.id); },
      onCreate: function (name) {
        const t = Catalog.getOrCreateTag(name);
        if (t) addTagToNote(root, note, t.id);
      },
    });

    // --- photo / file
    root.querySelector("#photo").addEventListener("click", function () { pickFiles(root, note, "image/*"); });
    root.querySelector("#file").addEventListener("click", function () { pickFiles(root, note, ""); });

    // --- dictation
    wireDictation(root, bodyEl, note, debouncedSave);

    setStats();
    setTimeout(function () { if (!note.title) titleEl.focus(); else bodyEl.focus(); }, 50);
  }

  function autoGrow(ta) {
    ta.style.height = "auto";
    ta.style.height = Math.max(ta.scrollHeight, 200) + "px";
  }

  function addTagToNote(root, note, tagId) {
    if ((note.tag_ids || []).indexOf(tagId) >= 0) return;
    note.tag_ids = (note.tag_ids || []).concat(tagId);
    Store.touchTag(tagId);
    Store.saveNote(note);
    renderTagChips(root, note);
  }

  // --- reusable type-ahead dropdown ----------------------------------------
  // opts: { search(q)->[{id,name}], onPick(item), onCreate(name), onClear(), clearOnPick }
  function setupAutocomplete(wrap, opts) {
    const input = wrap.querySelector(".meta-input");
    const menu = wrap.querySelector(".ac-menu");

    function close() { menu.hidden = true; menu.innerHTML = ""; }

    function open() {
      const q = input.value.trim();
      const matches = opts.search(q).slice(0, 8);
      const rows = [];
      matches.forEach(function (m) {
        rows.push('<div class="ac-item" data-id="' + esc(m.id) + '">' + esc(m.name) + "</div>");
      });
      // Offer "Create" when the typed name doesn't exactly match an existing one.
      const exact = matches.some(function (m) { return m.name.toLowerCase() === q.toLowerCase(); });
      if (q && !exact && opts.onCreate) {
        rows.push('<div class="ac-item ac-create" data-create="1">Create “' + esc(q) + '”</div>');
      }
      if (!rows.length) { close(); return; }
      menu.innerHTML = rows.join("");
      menu.hidden = false;
      menu.querySelectorAll(".ac-item").forEach(function (item) {
        // pointerdown (not click) so it fires before the input's blur closes the menu
        item.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          if (item.getAttribute("data-create")) {
            opts.onCreate(input.value.trim());
          } else {
            const id = item.getAttribute("data-id");
            const picked = opts.search("").find(function (x) { return x.id === id; });
            if (picked) opts.onPick(picked);
          }
          if (opts.clearOnPick) input.value = "";
          close();
        });
      });
    }

    input.addEventListener("focus", open);
    input.addEventListener("input", function () {
      if (opts.onClear && !input.value.trim()) opts.onClear();
      open();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        const existing = opts.search(q).find(function (x) { return x.name.toLowerCase() === q.toLowerCase(); });
        if (existing) opts.onPick(existing);
        else if (opts.onCreate) opts.onCreate(q);
        if (opts.clearOnPick) input.value = "";
        close();
      } else if (e.key === "Escape") { close(); }
    });
    input.addEventListener("blur", function () { setTimeout(close, 150); });
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

  // Add one or more files. Images are downscaled/compressed so several fit in
  // the browser's small storage budget; a clear message shows if it fills up.
  function pickFiles(root, note, accept) {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true; // allow picking several at once
    if (accept) input.accept = accept;
    input.addEventListener("change", function () {
      const files = Array.prototype.slice.call(input.files || []);
      if (!files.length) return;
      let i = 0;
      (function next() {
        if (i >= files.length) return;
        const file = files[i++];
        const done = function () { renderAttachments(root, note); next(); };
        if (file.size > MAX_FILE_BYTES && !/^image\//.test(file.type)) {
          alert('"' + file.name + '" is ' + (file.size / 1048576).toFixed(1) + " MB — over the 10 MB limit.");
          return next();
        }
        const isImage = /^image\//.test(file.type);
        const handle = function (dataUrl, bytes, mime) {
          try {
            note.attachments = (note.attachments || []).concat(Schema.makeAttachment({
              type: isImage ? "image" : "file",
              label: file.name,
              url: dataUrl,
              mime_type: mime || file.type,
              size_bytes: bytes || file.size,
            }));
            Store.saveNote(note);
            done();
          } catch (err) {
            // Roll back the just-added attachment if the save overflowed storage.
            note.attachments = (note.attachments || []).slice(0, -1);
            alert(err && /QUOTA/.test(err.message)
              ? "Storage is full — couldn't add \"" + file.name + "\". Remove some photos or export, then try again."
              : "Couldn't add \"" + file.name + "\": " + (err && err.message));
          }
        };
        if (isImage) compressImage(file, handle);
        else { const r = new FileReader(); r.onload = function () { handle(r.result); }; r.readAsDataURL(file); }
      })();
    });
    input.click();
  }

  // Downscale to <=1600px on the long edge and re-encode as JPEG (~0.82) to keep
  // photos small enough that several survive localStorage. Falls back to the raw
  // file if anything goes wrong.
  function compressImage(file, cb) {
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        try {
          const MAX = 1600;
          let w = img.width, h = img.height;
          if (Math.max(w, h) > MAX) {
            const s = MAX / Math.max(w, h);
            w = Math.round(w * s); h = Math.round(h * s);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          const out = canvas.toDataURL("image/jpeg", 0.82);
          cb(out, Math.round(out.length * 0.75), "image/jpeg");
        } catch (e) { cb(reader.result); }
      };
      img.onerror = function () { cb(reader.result); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
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

  // --- organize panel (offline by default; Claude optional) -----------------
  function renderOrganizePanel(root, note) {
    const panel = root.querySelector("#organize-panel");
    if (!panel) return;
    const s = note.structured;
    const hasKey = Organizer.hasKey();

    panel.innerHTML =
      '<div class="organize-inner">' +
        '<div class="org-head">' +
          "<strong>✨ Organize</strong>" +
          '<span class="org-actions">' +
            '<button id="org-local" class="btn btn-primary">' + (s ? "Re-organize" : "Organize") + "</button>" +
            '<button id="org-claude" class="btn btn-small">✨ Smarter (Claude)</button>' +
          "</span>" +
        "</div>" +
        '<p class="muted">“Organize” works instantly offline — it sorts your note into a decision ' +
        "layout. “Smarter (Claude)” rewrites and cleans it up with AI (needs an API key; sends the note to Claude).</p>" +
        '<div id="org-keyform" class="key-form" hidden>' +
          '<div class="key-row">' +
            '<input id="org-key" type="password" placeholder="sk-ant-…" autocomplete="off" />' +
            '<button id="org-key-save" class="btn btn-primary">Save &amp; run</button>' +
          "</div>" +
          '<p class="muted">Stored only in this browser, sent only to Claude. ' +
          '<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Get a key →</a></p>' +
        "</div>" +
        '<div class="org-status"></div>' +
        (s
          ? '<div class="org-result">' + mdToHtml(s.markdown) + "</div>" +
            '<p class="muted org-meta">' +
              (s.model === "local" ? "Organized offline (no AI)" : "Organized by " + esc(s.model)) +
              " · " + relDate(s.generated_at) + " · original kept above." +
              (hasKey ? ' · <a href="#" id="org-forget">remove key</a>' : "") +
            "</p>"
          : "") +
      "</div>";

    panel.querySelector("#org-local").addEventListener("click", function () {
      runLocal(root, note, panel);
    });
    panel.querySelector("#org-claude").addEventListener("click", function () {
      if (Organizer.hasKey()) {
        runOrganize(root, note, panel);
      } else {
        panel.querySelector("#org-keyform").hidden = false;
        panel.querySelector("#org-key").focus();
      }
    });

    const saveBtn = panel.querySelector("#org-key-save");
    if (saveBtn) {
      const input = panel.querySelector("#org-key");
      saveBtn.addEventListener("click", function () {
        const k = input.value.trim();
        if (!k) { setOrgStatus(panel, "Enter a key first.", true); return; }
        Organizer.setKey(k);
        panel.querySelector("#org-keyform").hidden = true;
        runOrganize(root, note, panel);
      });
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") saveBtn.click(); });
    }
    const forget = panel.querySelector("#org-forget");
    if (forget) forget.addEventListener("click", function (e) {
      e.preventDefault(); Organizer.clearKey(); renderOrganizePanel(root, note);
    });
  }

  function setOrgStatus(panel, msg, isError) {
    const node = panel.querySelector(".org-status");
    if (!node) return;
    node.textContent = msg || "";
    node.className = "org-status" + (isError ? " error" : "") + (msg ? " show" : "");
  }

  // Offline organize — synchronous, no network.
  function runLocal(root, note, panel) {
    if (!(note.body || "").trim() && !(note.title || "").trim()) {
      setOrgStatus(panel, "Write something first.", true);
      return;
    }
    const result = Organizer.organizeLocal(note);
    note.structured = Schema.makeStructured({
      model: result.model,
      source_body: note.body,
      markdown: result.markdown,
    });
    Store.saveNote(note);
    renderOrganizePanel(root, note);
  }

  function runOrganize(root, note, panel) {
    const btn = panel.querySelector("#org-claude");
    if (btn) btn.setAttribute("disabled", "true");
    setOrgStatus(panel, "Organizing… Claude is reading your note.");
    Organizer.organize(note).then(function (result) {
      note.structured = Schema.makeStructured({
        model: result.model,
        source_body: note.body,
        markdown: result.markdown,
      });
      Store.saveNote(note);
      renderOrganizePanel(root, note);
    }).catch(function (e) {
      if (e && e.message === "NO_KEY") {
        panel.querySelector("#org-keyform").hidden = false;
        if (btn) btn.removeAttribute("disabled");
        return;
      }
      setOrgStatus(panel, "⚠ " + (e && e.message ? e.message : "Something went wrong."), true);
      if (btn) btn.removeAttribute("disabled");
    });
  }

  // --- compact Markdown → HTML (headings, bold, lists, checkboxes, tables) ---
  function mdToHtml(md) {
    const lines = (md || "").replace(/```/g, "").split("\n");
    const out = [];
    let i = 0;
    const inline = function (t) {
      return esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    };
    while (i < lines.length) {
      let line = lines[i];

      // table: header row, separator, then body rows
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        const cells = function (row) {
          return row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(function (c) { return c.trim(); });
        };
        const head = cells(line);
        i += 2;
        let html = "<table><thead><tr>" + head.map(function (h) { return "<th>" + inline(h) + "</th>"; }).join("") + "</tr></thead><tbody>";
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          html += "<tr>" + cells(lines[i]).map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
          i++;
        }
        out.push(html + "</tbody></table>");
        continue;
      }

      // heading
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { const lvl = Math.min(h[1].length + 1, 6); out.push("<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">"); i++; continue; }

      // list block (bullets / checkboxes / numbered)
      if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        let html = "<ul>";
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          let item = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
          let box = "";
          const cb = item.match(/^\[( |x|X)\]\s+(.*)$/);
          if (cb) { box = cb[1].toLowerCase() === "x" ? "☑ " : "☐ "; item = cb[2]; }
          html += "<li>" + box + inline(item) + "</li>";
          i++;
        }
        out.push(html + "</ul>");
        continue;
      }

      // blank line
      if (!line.trim()) { i++; continue; }

      // paragraph (gather until blank / block start)
      let para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*]|\d+\.)\s|\s*\|)/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      out.push("<p>" + para.map(inline).join("<br>") + "</p>");
    }
    return out.join("\n");
  }

  // --- live dictation via Web Speech API ------------------------------------
  // Not all browsers ship it (notably iOS Safari). Instead of a dead button, we
  // explain the fallback: most phone keyboards have their own dictation mic.
  function wireDictation(root, bodyEl, note, save) {
    const micBtn = root.querySelector("#mic");
    const SR = global.SpeechRecognition || global.webkitSpeechRecognition;

    if (!SR) {
      micBtn.classList.add("disabled");
      micBtn.addEventListener("click", function () {
        bodyEl.focus();
        toast("In-app dictation isn't supported here. Tap the 🎤 on your keyboard to dictate.");
      });
      return;
    }

    let rec = null, listening = false, baseText = "";

    function setIdle() { micBtn.classList.remove("recording"); micBtn.innerHTML = '🎙 <span class="caplabel">Dictate</span>'; }
    function setBusy() { micBtn.classList.add("recording"); micBtn.innerHTML = '⏺ <span class="caplabel">Stop</span>'; }

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
      rec.onerror = function (e) {
        if (e && (e.error === "not-allowed" || e.error === "service-not-allowed")) {
          toast("Microphone blocked. Allow mic access in your browser settings.");
        } else if (e && e.error === "no-speech") {
          toast("Didn't catch anything — try again.");
        }
        listening = false; setIdle();
      };
      rec.onend = function () { if (listening) { try { rec.start(); } catch (e) {} } else setIdle(); };
      try { rec.start(); listening = true; setBusy(); toast("Listening… tap again to stop."); }
      catch (e) { listening = false; setIdle(); toast("Couldn't start dictation: " + (e && e.message)); }
    }
    function stop() { listening = false; if (rec) { try { rec.stop(); } catch (e) {} } setIdle(); save(); }

    micBtn.addEventListener("click", function () { listening ? stop() : start(); });
  }

  global.UI = {
    renderList: renderList,
    renderEditor: renderEditor,
  };
})(window);
