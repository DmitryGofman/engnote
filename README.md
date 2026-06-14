# engnote — Engineering Decision Log

Capture engineering decisions the moment you make them, and — more importantly —
capture **why you changed your mind** later. A decision is never silently
overwritten; reversals and supersessions are first-class data.

> This repo currently contains the **MVP frontend skeleton**: a 100% static,
> client-side web app (no backend, no build step). Data lives in the browser's
> `localStorage`. The storage layer is isolated behind a narrow interface so the
> Flask + SQLite backend described in `ARCHITECTURE.md` can drop in later without
> touching the UI.

## What's here

```
engnote/
├── index.html          app shell + script load order
├── css/style.css       all styling, no framework
├── js/
│   ├── schema.js       the data model (Decision, Risk, StatusEvent, Project, Tag, Attachment)
│   ├── storage.js      persistence seam (localStorage today, backend tomorrow) + rolling backups
│   ├── catalog.js      project/tag get-or-create + normalization (no duplicate catalogs)
│   ├── export.js       Markdown + JSON export, single & whole-doc
│   ├── ui.js           list / form / detail rendering
│   └── app.js          hash router + bootstrap
├── ARCHITECTURE.md     the full product/architecture spec (source of truth)
└── QUICKSTART.md       how to run it
```

## Features in this skeleton

- **Decision list** (home) with inline search + status/project filters.
- **Quick / Full mode form.** Quick mode = 4 fields (title, context, chosen
  option, reasoning). Full mode exposes options, assumptions, structured risks,
  confidence, owner, project (autocomplete + create), subsystem, tags
  (multi, create inline), references, attachments, follow-ups, notes.
- **Draft autosave** while capturing a new decision.
- **Supersede flow** — pre-fills a new decision, stamps the original as
  superseded (struck-through, never deleted), links both directions.
- **Status history** trail, appended on every status change.
- **Attachments** — links (zero storage) plus file/image (read inline as data
  URLs in this static MVP, 25 MB cap).
- **Export** — Markdown (single decision) and JSON (single + whole document,
  re-importable). Import a previously exported JSON document.
- **Auto-backup** — rolling snapshots kept in `localStorage` before each write.

## Run it

No toolchain. See `QUICKSTART.md` — open `index.html`, or serve the folder.

## Scope note

This is deliberately the frontend slice of the MVP. Backend persistence,
on-disk attachment storage, thumbnails, and filtered/bundled exports are
specified in `ARCHITECTURE.md` and intended to slot in behind the existing
`Store` interface.
