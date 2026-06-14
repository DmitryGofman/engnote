# EngNote — Architecture (v3, capture-first)

> **What changed from v2 → v3.** v2 was a structured decision *form*: many fields
> to fill in. In practice, fill-in fields are friction, and friction kills daily
> use. v3 inverts it: you **just write** (or talk), like Apple Notes — a title and
> one freeform body, plus tags, a project, and attachments. The structured
> engineering-decision format is no longer something you type; it's something the
> app **generates for you** from your raw note, on demand, with AI.
>
> The three original principles survive — they're actually served *better* this way.

-----

## 1. Core Philosophy

Capture first, structure later. The barrier to writing a note must be near zero:
open, type or dictate, done. Organizing the mess into a clean decision is the
app's job, not yours.

**Three principles, still locked:**

1. **The schema is the product.** The structured decision (context, options,
   decision, reasoning, risks…) is still the asset — but it is *derived* from your
   freeform note by the AI step, not hand-typed into a form. Version it, keep every
   export re-importable.
2. **History is sacred.** Your raw note is the source of truth and is never
   destroyed. When the app organizes it, the tidy version is stored *alongside* the
   original (with a snapshot of exactly what it was generated from), so the two can
   never silently drift.
3. **Adoption beats features.** A note you can capture in five seconds — including
   by voice — beats a perfect form you avoid filling in.

-----

## 2. Tech Stack (current MVP)

| Layer     | Choice                              | Why                                        |
|-----------|-------------------------------------|--------------------------------------------|
| Frontend  | Vanilla HTML/CSS/JS, no build       | Zero toolchain, fast iteration             |
| Storage   | Browser `localStorage` (one doc)    | Local-first, offline, no backend yet       |
| Dictation | Web Speech API (browser, on-device) | "Just talk" capture, works offline-ish     |
| Export    | Markdown + JSON                     | Human-readable AND re-importable           |
| AI (next) | Claude (cloud, opt-in, on demand)   | Turns the raw note into the decision format |

Deployed as a static site on GitHub Pages. The storage layer is a narrow seam
(`Store`), so a real backend (e.g. Flask + SQLite, on-disk attachments) can drop
in later without touching the UI.

-----

## 3. Data Model (v2 schema)

A **Note** is the atom. Everything else hangs off it.

```
Note = {
  id            uuid
  title         str        short label
  body          str        FREEFORM — just write; the source of truth
  tag_ids       [id]       FK into the Tag catalog
  project_id    id | null  FK into the Project catalog
  attachments   [Attachment]
  pinned        bool
  created_at    datetime
  updated_at    datetime
  structured    Structured | null   DERIVED by the AI step (see §5); null until organized
}

Attachment = {
  id, type (image|file|link), label,
  url        data URL (image/file in this MVP) or external URL (link),
  mime_type, size_bytes, added_at
}

Structured = {            # produced by "Organize" — the engineering-decision format
  generated_at  datetime
  model         str        which model produced it
  source_body   str        snapshot of the body it was generated from
  markdown      str        the rendered decision (context / options / decision / reasoning / risks / follow-ups)
}

Project = { id, name (unique, case-insensitive), created_at }
Tag     = { id, name (normalized lowercase, unique), created_at }
```

### Catalogs (Projects & Tags)

First-class catalogs, referenced by id — never stored as raw strings on the note —
so the same project/tag can't fragment into "Base", "base", "Base Assy". Tag names
are normalized (trim + lowercase). This is what makes "show me everything in this
project / with this tag" exact and reliable.

### Schema rules (non-negotiable)

- **Never destroy the raw body.** Organizing writes to `structured`, never over `body`.
- **Add fields now, surface later.** `structured` exists in the schema today though
  the UI ships the generator next.
- **Files referenced, not embedded (long term).** In this static MVP images/files
  are inlined as data URLs out of necessity; the backend phase moves bytes to disk
  and keeps only a reference, exactly as v2 specified.
- **Every export is a valid import.** JSON round-trips; v1 (decisions) auto-migrates
  to v2 (notes) on load.

-----

## 4. Screens

### 4.1 Note list (home)

A card grid (pinned first, then most-recently-updated). Each card shows title,
a snippet, the first image, project, tags, and a ✨ marker if it's been organized.
A search box + project filter + tag filter sit on top. A floating **+** composes a
new note. Tapping a card opens the editor.

### 4.2 Editor (the whole experience)

```
‹ Notes                          📌  ✨ Organize  ⤓  🗑
────────────────────────────────────────────────────
Title
small timestamp
[ one big freeform body — just write, or dictate ]
[ inline image / file attachments ]
────────────────────────────────────────────────────
Project   [ type to search / create ]
Tags      [ #chips ]  [ add tag + Enter ]
────────────────────────────────────────────────────
        🎙 Dictate    📷 Photo    📎 File          (fixed bottom bar)
```

- **Everything autosaves** (debounced). No Save button.
- **Dictation:** tap 🎙 and talk; interim text streams into the body, final text is
  committed. Tap again to stop. Falls back gracefully (button disabled) where the
  browser has no speech recognition.
- **Photo / File:** on a phone, 📷 hints the camera. Stored inline (≤10 MB each in
  this MVP; the backend phase lifts that).
- **Empty notes are discarded** on exit (no title, body, or attachments) — Apple-
  Notes behavior, so a stray tap never litters the list.
- **Organize (✨):** the AI seam. Currently shows what it will do; wired up next (§5).

-----

## 5. The "Organize" step (next milestone)

The headline feature. You write however you think — rambling, half-sentences,
dictated stream-of-consciousness. Then you tap **Organize** and the app reads the
note and lays it out in the engineering-decision format:

> **Context · Options considered · Decision · Reasoning · Assumptions · Risks
> (likelihood / impact / mitigation) · Follow-ups**

- **Engine:** Claude. The static app calls it on demand with a key the user pastes
  in (stored locally on device); no backend required for the MVP. When the backend
  lands, the key moves server-side.
- **Raw preserved:** the generated decision is stored in `structured` along with a
  snapshot of the exact `source_body` it came from. The original is always shown
  beneath the organized view and can be re-organized anytime.
- **Offline tension (explicit):** capture and storage stay 100% local and offline.
  The organize step is the one part that reaches the network — opt-in, on demand,
  per note. Projects needing full air-gap simply never tap Organize.

-----

## 6. Out of scope for this MVP (deliberately)

- The Organize/AI generator itself (next milestone — designed for, not yet built).
- Backend, multi-user, sync (schema-ready via the `Store` seam; not built).
- On-disk attachment storage + thumbnails (static MVP inlines as data URLs).
- Audio-file voice notes + offline transcription (we chose live dictation→text instead).
- Auth (single user).

-----

## 7. Build order

1. **✅ Capture-first app** — note list, open editor, tags/project catalogs,
   image/file attachments, live dictation, search/filter, export/import,
   auto-backup, v1→v2 migration.
2. **✅ Organize (AI)** — "Organize this note" → Claude (`claude-opus-4-8`) →
   decision-format markdown stored in `structured`, raw body preserved, re-runnable.
   Browser → Claude direct call with the user's own key (localStorage); moves
   server-side in the backend phase.
3. Filtered/bundled export; richer structured rendering (typed risk table, etc.).
4. Backend phase: move storage + attachments + the API key off the browser.

-----

## 8. Why this is still foundation infrastructure

Same single, history-preserving, local-first, exportable data model as before — only
now the high-value structured corpus is *generated from how engineers actually work*
(they write and talk) instead of demanding they fill in forms. Lower barrier, same
asset, and a clean seam (`Store`) for everything that comes after.
