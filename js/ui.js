/*
 * ui.js — view rendering (list / form / detail).
 *
 * Plain DOM, no framework. Each render* function returns nothing and writes
 * into #app. Navigation is hash-based and lives in app.js; views call
 * location.hash to move around.
 */
(function (global) {
  "use strict";

  const Store = global.Store;
  const Catalog = global.Catalog;
  const Schema = global.Schema;
  const Exporter = global.Exporter;

  const app = function () { return document.getElementById("app"); };

  // --- tiny helpers ---------------------------------------------------------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function dateShort(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(2);
    return dd + "." + mm + "." + yy;
  }

  function maxRisk(d) {
    // crude rollup: highest impact among risks, for the list badge
    const order = { low: 1, medium: 2, high: 3 };
    let best = 0;
    (d.risks || []).forEach(function (r) {
      if (order[r.impact] > best) best = order[r.impact];
    });
    return best ? ["", "low", "medium", "high"][best] : "—";
  }

  function setStorageStats() {
    const s = Store.stats();
    const node = document.getElementById("storage-stats");
    if (node) {
      node.textContent =
        s.decisions + " decisions · " + (s.bytes / 1024).toFixed(1) + " KB";
    }
  }

  // =========================================================================
  // LIST VIEW (ARCHITECTURE.md §6.1) — search + filters inline
  // =========================================================================
  const listState = { q: "", status: "", project: "" };

  function renderList() {
    const root = app();
    root.innerHTML = "";

    const projects = Store.listProjects();
    const statusOpts = ["", ...Schema.STATUS]
      .map(function (s) {
        const sel = s === listState.status ? " selected" : "";
        return '<option value="' + esc(s) + '"' + sel + ">" + (s ? esc(s) : "all statuses") + "</option>";
      })
      .join("");
    const projOpts = ['<option value="">all projects</option>']
      .concat(projects.map(function (p) {
        const sel = p.id === listState.project ? " selected" : "";
        return '<option value="' + esc(p.id) + '"' + sel + ">" + esc(p.name) + "</option>";
      }))
      .join("");

    root.appendChild(el(
      '<div class="toolbar">' +
        '<input id="f-q" class="search" type="search" placeholder="Search title, context, reasoning…" value="' + esc(listState.q) + '" />' +
        '<select id="f-status" class="filter">' + statusOpts + "</select>" +
        '<select id="f-project" class="filter">' + projOpts + "</select>" +
        '<span class="spacer"></span>' +
        '<button id="export-all" class="btn">Export all (JSON)</button>' +
        '<button id="import-doc" class="btn">Import</button>' +
      "</div>"
    ));

    const tableWrap = el('<div class="table-wrap"></div>');
    root.appendChild(tableWrap);
    renderRows(tableWrap);

    // wire filters
    root.querySelector("#f-q").addEventListener("input", function (e) {
      listState.q = e.target.value;
      renderRows(tableWrap);
    });
    root.querySelector("#f-status").addEventListener("change", function (e) {
      listState.status = e.target.value;
      renderRows(tableWrap);
    });
    root.querySelector("#f-project").addEventListener("change", function (e) {
      listState.project = e.target.value;
      renderRows(tableWrap);
    });
    root.querySelector("#export-all").addEventListener("click", function () {
      Exporter.download("engnote-export.json", Exporter.docToJSON(), "application/json");
    });
    root.querySelector("#import-doc").addEventListener("click", importFlow);

    setStorageStats();
  }

  function filteredDecisions() {
    const q = listState.q.trim().toLowerCase();
    return Store.listDecisions()
      .filter(function (d) {
        if (listState.status && d.status !== listState.status) return false;
        if (listState.project && d.project_id !== listState.project) return false;
        if (q) {
          const hay = (d.title + " " + d.context + " " + d.reasoning + " " + d.chosen_option).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      })
      .sort(function (a, b) {
        return (b.date_created || "").localeCompare(a.date_created || "");
      });
  }

  function renderRows(wrap) {
    const rows = filteredDecisions();
    if (!rows.length) {
      wrap.innerHTML =
        '<div class="empty">' +
        "<p>No decisions yet.</p>" +
        '<a class="btn btn-primary" href="#/new">+ Capture your first decision</a>' +
        "</div>";
      return;
    }

    const body = rows.map(function (d) {
      const project = Catalog.getProject(d.project_id);
      const tags = Catalog.tagNames(d.tag_ids);
      const superseded = d.status === "superseded" || d.superseded_by;
      const titleCell = superseded
        ? '<span class="struck">' + esc(d.title || "(untitled)") + "</span>"
        : esc(d.title || "(untitled)");
      return (
        '<tr data-id="' + esc(d.id) + '">' +
          '<td class="c-title" data-label="Title">' + titleCell + (d.needs_review ? ' <span class="flag" title="needs review">⚑</span>' : "") + "</td>" +
          '<td data-label="Date">' + dateShort(d.date_created) + "</td>" +
          '<td data-label="Status"><span class="badge st-' + esc(d.status) + '">' + esc(d.status) + "</span></td>" +
          '<td data-label="Conf"><span class="badge cf-' + esc(d.confidence) + '">' + esc(d.confidence) + "</span></td>" +
          '<td data-label="Risk">' + esc(maxRisk(d)) + "</td>" +
          '<td data-label="Project">' + esc(project ? project.name : "—") + "</td>" +
          '<td class="c-tags" data-label="Tags">' + (tags.length ? tags.map(function (t) { return '<span class="chip">' + esc(t) + "</span>"; }).join("") : "—") + "</td>" +
        "</tr>"
      );
    }).join("");

    wrap.innerHTML =
      '<table class="decisions">' +
        "<thead><tr>" +
          "<th>Title</th><th>Date</th><th>Status</th><th>Conf</th><th>Risk</th><th>Project</th><th>Tags</th>" +
        "</tr></thead>" +
        "<tbody>" + body + "</tbody>" +
      "</table>";

    wrap.querySelectorAll("tr[data-id]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        location.hash = "#/decision/" + tr.getAttribute("data-id");
      });
    });
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
          const doc = JSON.parse(reader.result);
          Store.importDoc(doc);
          alert("Imported " + (doc.decisions || []).length + " decisions.");
          renderList();
        } catch (e) {
          alert("Import failed: " + e.message);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // =========================================================================
  // FORM VIEW (ARCHITECTURE.md §6.2) — quick / full toggle + autosave draft
  // =========================================================================
  const DRAFT_KEY = "engnote.draft";

  function renderForm(existing, opts) {
    opts = opts || {};
    const root = app();
    root.innerHTML = "";

    // Base record: edit target, supersede pre-fill, or a fresh draft.
    let d = existing ? JSON.parse(JSON.stringify(existing)) : Schema.makeDecision();

    // Restore an autosaved draft only for brand-new captures.
    if (!existing && !opts.supersedeOf) {
      try {
        const draft = JSON.parse(global.localStorage.getItem(DRAFT_KEY) || "null");
        if (draft) d = Schema.makeDecision(draft);
      } catch (e) { /* ignore */ }
    }

    const heading = opts.supersedeOf
      ? "Supersede decision"
      : existing ? "Edit decision" : "New decision";

    root.appendChild(el(
      '<div class="form-head">' +
        "<h1>" + esc(heading) + "</h1>" +
        '<div class="mode-toggle">' +
          '<button id="mode-quick" class="seg active">Quick Mode</button>' +
          '<button id="mode-full" class="seg">Full Mode</button>' +
        "</div>" +
      "</div>"
    ));

    if (opts.supersedeOf) {
      root.appendChild(el(
        '<div class="notice">Pre-filled from <strong>' + esc(opts.supersedeOf.title || "the original") +
        "</strong>. Saving creates a new decision and marks the original superseded.</div>"
      ));
    }

    const form = el('<form id="decision-form" class="decision-form" autocomplete="off"></form>');
    form.innerHTML = formMarkup(d);
    root.appendChild(form);

    // --- mode toggle
    const quickBtn = root.querySelector("#mode-quick");
    const fullBtn = root.querySelector("#mode-full");
    function setMode(full) {
      form.classList.toggle("show-full", full);
      quickBtn.classList.toggle("active", !full);
      fullBtn.classList.toggle("active", full);
    }
    quickBtn.addEventListener("click", function () { setMode(false); });
    fullBtn.addEventListener("click", function () { setMode(true); });
    setMode(!!(existing || opts.supersedeOf)); // existing/full records open in full mode

    wireFormDynamics(form, d);

    // --- autosave draft (new captures only)
    if (!existing && !opts.supersedeOf) {
      form.addEventListener("input", function () {
        try {
          global.localStorage.setItem(DRAFT_KEY, JSON.stringify(collectForm(form, d)));
        } catch (e) { /* ignore quota */ }
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      saveForm(form, d, existing, opts);
    });
    root.querySelector("#cancel-btn").addEventListener("click", function () {
      location.hash = existing ? "#/decision/" + existing.id : "#/";
    });

    setStorageStats();
  }

  function formMarkup(d) {
    const project = Catalog.getProject(d.project_id);
    const tagNames = Catalog.tagNames(d.tag_ids);
    const confOpts = Schema.CONFIDENCE.map(function (c) {
      return '<option value="' + c + '"' + (c === d.confidence ? " selected" : "") + ">" + c + "</option>";
    }).join("");

    return (
      // --- Quick fields (always visible)
      field("Title", '<input name="title" type="text" placeholder=\'e.g. "Servo vs stepper for gimbal"\' value="' + esc(d.title) + '" required />') +
      field("Context", '<textarea name="context" placeholder="what triggered this, why it matters">' + esc(d.context) + "</textarea>") +
      field("Chosen Option", '<input name="chosen_option" type="text" placeholder="what you picked" value="' + esc(d.chosen_option) + '" />') +
      field("Reasoning", '<textarea name="reasoning" placeholder="why">' + esc(d.reasoning) + "</textarea>") +

      // --- Full fields (toggled)
      '<div class="full-only">' +
        field("Options Considered", '<textarea name="options_considered" placeholder="one per line">' + esc(d.options_considered.join("\n")) + "</textarea>") +
        field("Assumptions", '<textarea name="assumptions" placeholder="one per line — what must be true">' + esc(d.assumptions.join("\n")) + "</textarea>") +
        riskBlock(d.risks) +
        '<div class="row">' +
          field("Confidence", '<select name="confidence">' + confOpts + "</select>") +
          field("Needs Review", '<label class="check"><input name="needs_review" type="checkbox"' + (d.needs_review ? " checked" : "") + ' /> flag to revisit</label>') +
        "</div>" +
        '<div class="row">' +
          field("Status", statusSelect(d.status)) +
          field("Owner", '<input name="owner" type="text" placeholder="who made it" value="' + esc(d.owner) + '" />') +
        "</div>" +
        field("Project", '<input name="project_name" type="text" list="project-list" placeholder="type to search or create…" value="' + esc(project ? project.name : "") + '" />' + projectDatalist()) +
        field("Subsystem", '<input name="subsystem_name" type="text" placeholder="free text" value="' + esc(d.subsystem_name) + '" />') +
        field("Tags", '<input name="tags" type="text" list="tag-list" placeholder="comma-separated; created inline" value="' + esc(tagNames.join(", ")) + '" />' + tagDatalist()) +
        field("References", '<input name="references" type="text" placeholder="drawing no. / PN / build ID / path" value="' + esc(d.references) + '" />') +
        attachmentsBlock(d.attachments) +
        field("Follow-up Actions", '<textarea name="follow_up_actions" placeholder="one per line — next steps / open questions">' + esc(d.follow_up_actions.join("\n")) + "</textarea>") +
        field("Notes", '<textarea name="notes" placeholder="freeform follow-on thoughts">' + esc(d.notes) + "</textarea>") +
      "</div>" +

      '<div class="form-actions">' +
        '<button type="submit" class="btn btn-primary">Save</button>' +
        '<button type="button" id="cancel-btn" class="btn">Cancel</button>' +
        '<span class="hint">draft auto-saves while editing</span>' +
      "</div>"
    );
  }

  function field(label, control) {
    return '<div class="field"><label>' + esc(label) + "</label>" + control + "</div>";
  }

  function statusSelect(current) {
    return '<select name="status">' + Schema.STATUS
      .filter(function (s) { return s !== "superseded"; }) // set via supersede flow only
      .map(function (s) {
        return '<option value="' + s + '"' + (s === current ? " selected" : "") + ">" + s + "</option>";
      }).join("") + "</select>";
  }

  function projectDatalist() {
    return '<datalist id="project-list">' +
      Store.listProjects().map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join("") +
      "</datalist>";
  }

  function tagDatalist() {
    return '<datalist id="tag-list">' +
      Store.listTags().map(function (t) { return '<option value="' + esc(t.name) + '">'; }).join("") +
      "</datalist>";
  }

  // --- structured risks (add/remove rows) ----------------------------------
  function riskBlock(risks) {
    return '<div class="field"><label>Risks</label>' +
      '<div id="risk-rows">' + risks.map(riskRow).join("") + "</div>" +
      '<button type="button" id="add-risk" class="btn btn-small">+ add risk</button>' +
      "</div>";
  }

  function riskRow(r) {
    r = r || { description: "", likelihood: "low", impact: "low", mitigation: "" };
    const lvl = function (name, val) {
      return '<select data-risk="' + name + '">' + Schema.LEVEL.map(function (l) {
        return '<option value="' + l + '"' + (l === val ? " selected" : "") + ">" + l + "</option>";
      }).join("") + "</select>";
    };
    return (
      '<div class="risk-row">' +
        '<input data-risk="description" type="text" placeholder="description" value="' + esc(r.description) + '" />' +
        '<span class="lvl">L ' + lvl("likelihood", r.likelihood) + "</span>" +
        '<span class="lvl">I ' + lvl("impact", r.impact) + "</span>" +
        '<input data-risk="mitigation" type="text" placeholder="mitigation" value="' + esc(r.mitigation) + '" />' +
        '<button type="button" class="btn btn-small rm-risk">✕</button>' +
      "</div>"
    );
  }

  // --- attachments (link in MVP; file/image read as data URL) --------------
  function attachmentsBlock(attachments) {
    return '<div class="field"><label>Attachments</label>' +
      '<div id="att-rows">' + attachments.map(attRow).join("") + "</div>" +
      '<div class="att-actions">' +
        '<button type="button" id="add-link" class="btn btn-small">+ Link</button>' +
        '<button type="button" id="add-file" class="btn btn-small">+ File / Image</button>' +
      "</div></div>";
  }

  function attRow(a) {
    const target = a.url || a.path;
    return (
      '<div class="att-row" data-type="' + esc(a.type) + '" data-url="' + esc(a.url) + '" data-mime="' + esc(a.mime_type) + '" data-size="' + esc(a.size_bytes) + '">' +
        '<span class="att-icon">' + (a.type === "image" ? "🖼" : a.type === "file" ? "📄" : "🔗") + "</span>" +
        '<input data-att="label" type="text" placeholder="label" value="' + esc(a.label) + '" />' +
        (a.type === "link"
          ? '<input data-att="url" type="url" placeholder="https://…" value="' + esc(a.url) + '" />'
          : '<span class="att-name">' + esc(target.slice(0, 48)) + "</span>") +
        '<button type="button" class="btn btn-small rm-att">✕</button>' +
      "</div>"
    );
  }

  const MAX_FILE_BYTES = 25 * 1024 * 1024; // §3.4 per-file cap

  function wireFormDynamics(form, d) {
    // risks
    form.querySelector("#add-risk").addEventListener("click", function () {
      form.querySelector("#risk-rows").appendChild(el(riskRow()));
      bindRemovers(form);
    });
    // attachments — link
    form.querySelector("#add-link").addEventListener("click", function () {
      form.querySelector("#att-rows").appendChild(el(attRow(Schema.makeAttachment({ type: "link" }))));
      bindRemovers(form);
    });
    // attachments — file/image
    form.querySelector("#add-file").addEventListener("click", function () {
      const input = document.createElement("input");
      input.type = "file";
      input.addEventListener("change", function () {
        const file = input.files[0];
        if (!file) return;
        if (file.size > MAX_FILE_BYTES) {
          alert("File exceeds 25 MB cap: " + (file.size / 1048576).toFixed(1) + " MB");
          return;
        }
        const reader = new FileReader();
        reader.onload = function () {
          const isImg = /^image\//.test(file.type);
          const att = Schema.makeAttachment({
            type: isImg ? "image" : "file",
            label: file.name,
            url: reader.result, // data URL (static MVP keeps bytes inline)
            mime_type: file.type,
            size_bytes: file.size,
          });
          form.querySelector("#att-rows").appendChild(el(attRow(att)));
          bindRemovers(form);
        };
        reader.readAsDataURL(file);
      });
      input.click();
    });
    bindRemovers(form);
  }

  function bindRemovers(form) {
    form.querySelectorAll(".rm-risk").forEach(function (b) {
      b.onclick = function () { b.closest(".risk-row").remove(); };
    });
    form.querySelectorAll(".rm-att").forEach(function (b) {
      b.onclick = function () { b.closest(".att-row").remove(); };
    });
  }

  // --- read the form back into a (partial) decision ------------------------
  function collectForm(form, base) {
    const get = function (name) {
      const node = form.querySelector('[name="' + name + '"]');
      return node ? node.value : "";
    };
    const risks = Array.prototype.map.call(form.querySelectorAll(".risk-row"), function (row) {
      return Schema.makeRisk({
        description: row.querySelector('[data-risk="description"]').value,
        likelihood: row.querySelector('[data-risk="likelihood"]').value,
        impact: row.querySelector('[data-risk="impact"]').value,
        mitigation: row.querySelector('[data-risk="mitigation"]').value,
      });
    }).filter(function (r) { return r.description; });

    const attachments = Array.prototype.map.call(form.querySelectorAll(".att-row"), function (row) {
      const type = row.getAttribute("data-type");
      const urlInput = row.querySelector('[data-att="url"]');
      return Schema.makeAttachment({
        type: type,
        label: row.querySelector('[data-att="label"]').value,
        url: type === "link" ? (urlInput ? urlInput.value : "") : row.getAttribute("data-url"),
        mime_type: row.getAttribute("data-mime") || "",
        size_bytes: parseInt(row.getAttribute("data-size") || "0", 10),
      });
    }).filter(function (a) { return a.url || a.path; });

    return {
      id: base.id,
      title: get("title"),
      context: get("context"),
      chosen_option: get("chosen_option"),
      reasoning: get("reasoning"),
      options_considered: Schema.linesToList(get("options_considered")),
      assumptions: Schema.linesToList(get("assumptions")),
      risks: risks,
      confidence: get("confidence") || base.confidence,
      needs_review: form.querySelector('[name="needs_review"]').checked,
      status: get("status") || base.status,
      owner: get("owner"),
      subsystem_name: get("subsystem_name"),
      references: get("references"),
      follow_up_actions: Schema.linesToList(get("follow_up_actions")),
      notes: get("notes"),
      attachments: attachments,
      // catalog-bound fields resolved at save time:
      _project_name: get("project_name"),
      _tags_raw: get("tags"),
      // preserved lineage:
      supersedes: base.supersedes || null,
      superseded_by: base.superseded_by || null,
      date_created: base.date_created,
      date_decided: base.date_decided,
      status_history: base.status_history,
      project_id: base.project_id,
      tag_ids: base.tag_ids,
    };
  }

  function saveForm(form, base, existing, opts) {
    const collected = collectForm(form, base);
    if (!collected.title.trim()) {
      alert("Title is required.");
      return;
    }

    // Resolve catalogs (get-or-create, normalized).
    const proj = Catalog.getOrCreateProject(collected._project_name);
    collected.project_id = proj ? proj.id : null;
    collected.tag_ids = (collected._tags_raw || "")
      .split(",")
      .map(function (s) { return s.trim(); })
      .filter(Boolean)
      .map(function (name) { return Catalog.getOrCreateTag(name); })
      .filter(Boolean)
      .map(function (t) { return t.id; });
    delete collected._project_name;
    delete collected._tags_raw;

    const decision = Schema.makeDecision(collected);

    // Status history: append an event when status changes (or first save).
    const prevStatus = existing ? existing.status : null;
    if (!decision.status_history.length || prevStatus !== decision.status) {
      decision.status_history = (existing ? existing.status_history.slice() : []);
      decision.status_history.push(Schema.makeStatusEvent(decision.status));
    }
    if (decision.status === "decided" && !decision.date_decided) {
      decision.date_decided = Schema.now();
    }

    Store.saveDecision(decision);

    // Supersede flow: stamp the original (ARCHITECTURE.md §5.3).
    if (opts && opts.supersedeOf) {
      const orig = Store.getDecision(opts.supersedeOf.id);
      if (orig) {
        orig.superseded_by = decision.id;
        orig.status = "superseded";
        orig.status_history = orig.status_history.slice();
        orig.status_history.push(Schema.makeStatusEvent("superseded"));
        Store.saveDecision(orig);
      }
    }

    global.localStorage.removeItem(DRAFT_KEY);
    location.hash = "#/decision/" + decision.id;
  }

  // =========================================================================
  // DETAIL VIEW (ARCHITECTURE.md §6.3)
  // =========================================================================
  function renderView(id) {
    const root = app();
    const d = Store.getDecision(id);
    if (!d) {
      root.innerHTML = '<div class="empty"><p>Decision not found.</p><a class="btn" href="#/">Back to list</a></div>';
      return;
    }
    const project = Catalog.getProject(d.project_id);
    const tags = Catalog.tagNames(d.tag_ids);

    root.innerHTML = "";
    root.appendChild(el(
      '<div class="detail-actions">' +
        '<a class="btn" href="#/edit/' + esc(d.id) + '">Edit</a>' +
        '<a class="btn" href="#/supersede/' + esc(d.id) + '">Supersede</a>' +
        '<button id="exp-md" class="btn">Export Markdown</button>' +
        '<button id="exp-json" class="btn">Export JSON</button>' +
        '<button id="del" class="btn btn-danger">Delete</button>' +
        '<a class="btn" href="#/">Back</a>' +
      "</div>"
    ));

    const superseded = d.status === "superseded" || d.superseded_by;
    const parts = [];
    parts.push('<h1' + (superseded ? ' class="struck"' : "") + ">" + esc(d.title || "(untitled)") + "</h1>");

    const meta = [];
    meta.push('<span class="badge st-' + esc(d.status) + '">' + esc(d.status) + "</span>");
    meta.push('<span class="badge cf-' + esc(d.confidence) + '">confidence: ' + esc(d.confidence) + "</span>");
    if (d.needs_review) meta.push('<span class="badge flag-badge">⚑ needs review</span>');
    if (project) meta.push('<span class="meta-pill">project: ' + esc(project.name) + "</span>");
    if (d.subsystem_name) meta.push('<span class="meta-pill">subsystem: ' + esc(d.subsystem_name) + "</span>");
    parts.push('<div class="detail-meta">' + meta.join(" ") + "</div>");
    if (tags.length) parts.push('<div class="detail-tags">' + tags.map(function (t) { return '<span class="chip">' + esc(t) + "</span>"; }).join("") + "</div>");

    parts.push(section("Context", textBlock(d.context)));
    if (d.options_considered.length) parts.push(section("Options Considered", ulist(d.options_considered)));
    parts.push(section("Chosen Option", textBlock(d.chosen_option)));
    parts.push(section("Reasoning", textBlock(d.reasoning)));
    if (d.assumptions.length) parts.push(section("Assumptions", ulist(d.assumptions)));

    if (d.risks.length) {
      const rows = d.risks.map(function (r) {
        return "<tr><td>" + esc(r.description) + "</td><td>" + esc(r.likelihood) + "</td><td>" + esc(r.impact) + "</td><td>" + esc(r.mitigation || "—") + "</td></tr>";
      }).join("");
      parts.push(section("Risks",
        '<table class="risk-table"><thead><tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th></tr></thead><tbody>' + rows + "</tbody></table>"));
    }

    if (d.references) parts.push(section("References", textBlock(d.references)));
    if (d.follow_up_actions.length) parts.push(section("Follow-up Actions", ulist(d.follow_up_actions, true)));

    if (d.status_history.length) {
      parts.push(section("Status History",
        '<p class="history">' + d.status_history.map(function (e) {
          return esc(e.status) + " (" + dateShort(e.timestamp) + ")";
        }).join(" → ") + "</p>"));
    }

    const lineage = [];
    if (d.supersedes) lineage.push("Supersedes: " + linkTo(d.supersedes));
    if (d.superseded_by) lineage.push("Superseded by: " + linkTo(d.superseded_by));
    if (lineage.length) parts.push(section("Lineage", "<p>" + lineage.join(" · ") + "</p>"));

    if (d.attachments.length) {
      const items = d.attachments.map(function (a) {
        const target = a.url || a.path;
        if (a.type === "image") {
          return '<div class="att-view"><img src="' + esc(target) + '" alt="' + esc(a.label) + '" /><span>' + esc(a.label) + "</span></div>";
        }
        const icon = a.type === "file" ? "📄" : "🔗";
        return '<div class="att-view">' + icon + ' <a href="' + esc(target) + '" target="_blank" rel="noopener">' + esc(a.label || target) + "</a></div>";
      }).join("");
      parts.push(section("Attachments", items));
    }

    if (d.notes) parts.push(section("Notes", textBlock(d.notes)));

    root.appendChild(el('<article class="detail">' + parts.join("") + "</article>"));

    root.querySelector("#exp-md").addEventListener("click", function () {
      Exporter.download(Exporter.slug(d.title) + ".md", Exporter.decisionToMarkdown(d), "text/markdown");
    });
    root.querySelector("#exp-json").addEventListener("click", function () {
      Exporter.download(Exporter.slug(d.title) + ".json", Exporter.decisionToJSON(d), "application/json");
    });
    root.querySelector("#del").addEventListener("click", function () {
      if (confirm("Delete this decision? (History principle: prefer Supersede instead.)")) {
        Store.removeDecision(d.id);
        location.hash = "#/";
      }
    });

    setStorageStats();
  }

  function section(title, body) {
    return '<section class="block"><h2>' + esc(title) + "</h2>" + body + "</section>";
  }
  function textBlock(s) {
    return '<p class="text">' + esc(s || "—").replace(/\n/g, "<br>") + "</p>";
  }
  function ulist(items, checkbox) {
    return "<ul" + (checkbox ? ' class="todo"' : "") + ">" + items.map(function (i) {
      return "<li>" + (checkbox ? "☐ " : "") + esc(i) + "</li>";
    }).join("") + "</ul>";
  }
  function linkTo(id) {
    const t = Store.getDecision(id);
    return '<a href="#/decision/' + esc(id) + '">' + esc(t ? t.title : id) + "</a>";
  }

  global.UI = {
    renderList: renderList,
    renderForm: renderForm,
    renderView: renderView,
  };
})(window);
