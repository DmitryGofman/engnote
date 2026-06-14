# Engineering Decision Log — Architecture (v2)

> Revised after design review from three perspectives: junior engineer (usability),
> senior engineer (real R&D survivability), and CTO (strategic / scaling).
> The single most important change: **decisions are superseded, not overwritten** —
> the value is in *why you changed your mind*.

-----

## 1. Core Philosophy

Fast prototype, not polished product. Get a decision in, get it out as Markdown.
A flat, expandable foundation that other engineering apps can later be built on top of.

**Three principles, locked:**

1. **The schema is the product.** The Flask UI is disposable; the structured decision
   corpus is the asset. Version the schema, never break backward compatibility, every
   export must be re-importable.
1. **History is sacred.** A decision is never silently overwritten. Reversals, reopens,
   and supersessions are first-class data.
1. **Adoption beats features.** If it isn’t used daily, it’s dead. Lowering the barrier
   to entry (quick mode) outranks any clever feature.

-----

## 2. Tech Stack

|Layer   |Choice                 |Why                                     |
|--------|-----------------------|----------------------------------------|
|Backend |Python 3.10+ with Flask|Lightweight, fast to code, no build step|
|Storage |SQLite                 |Local, zero setup, portable single file |
|Frontend|Vanilla HTML/CSS/JS    |No toolchain, fast iteration            |
|Export  |Markdown + JSON        |Human-readable AND re-importable        |
|Offline |100% local by default  |Safe for classified / sensitive projects|

No cloud. No auth. No external dependencies for the MVP.

-----

## 3. Data Model (Core Schema)

A **Decision** is the atom of the system. One mostly-flat table.

### 3.1 Fields

```
id                  uuid / int        unique identifier
title               str               short label, e.g. "Aluminum vs CF for bracket"
context             str               why this decision matters, what triggered it
options_considered  list[str]         the alternatives weighed
chosen_option       str               what was picked
reasoning           str               why it was picked

assumptions         list[str]         what must be true for this to make sense
risks               list[Risk]        structured — see 3.2 (NOT a flat list)
confidence          enum              low / medium / high
needs_review        bool              flag for "this is a guess, revisit"

owner               str               who made it
project_id          id | null         optional — FK into Project catalog (see 3.4)
subsystem_name      str               optional — free text for MVP (see 3.4)
tag_ids             list[id]          FK into Tag catalog (see 3.4)
references          str               drawing no. / PN / build ID / photo path

status              enum              open / decided / reopened / reviewed / implemented / archived
status_history      list[StatusEvent] timestamped trail — never lose the path
date_created        datetime
date_decided        datetime

supersedes          id | null         the decision THIS one replaces
superseded_by       id | null         the decision that replaced THIS one
links_to_decisions  list[id]          related decisions (dependencies)

follow_up_actions   list[str]         next steps / open questions
notes               str               freeform follow-on thoughts
attachments         list[Attachment]  evidence: files / links / images (see 3.2, 3.5)
```

### 3.2 Nested Types

```
Risk = {
    description   str
    likelihood    enum   low / medium / high
    impact        enum   low / medium / high
    mitigation    str    optional
}

StatusEvent = {
    status        enum
    timestamp     datetime
}

Project = {
    id            uuid / int
    name          str            unique (case-insensitive)
    created_at    datetime
}

Tag = {
    id            uuid / int
    name          str            unique (case-insensitive, normalized lowercase)
    created_at    datetime
}

Attachment = {
    id            uuid
    type          enum    file / link / image       (video / voice planned — see 3.5)
    label         str     human description, e.g. "FEA von Mises, final geometry"
    path          str     relative path under data/attachments/<decision_id>/  (file / image)
    url           str     external URL                                         (link)
    mime_type     str     e.g. image/png, application/pdf
    size_bytes    int     for files / images; used for the size budget
    added_at      datetime
}
```

### 3.3 Catalogs: Projects and Tags

Both Projects and Tags are **first-class catalogs**, not free text stored on the
decision. Decisions reference them by id (`project_id`, `tag_ids`) so the same
real-world project or tag can never fragment into “Base”, “base”, “Base Assy”,
“Base  Assembly” across hundreds of entries. The catalog is the single source of
truth; the spelling is stored exactly once.

**Project selection (searchable autocomplete):**

- When the user types in the Project field, the app searches the existing Project
  catalog and shows matching names in a dropdown.
- The user can either select an existing project or create a new one directly from
  the same field (type a name that doesn’t exist → “Create *<name>*” appears).
- Decisions store `project_id`, never a raw name. Renaming a project later updates
  it everywhere automatically, because the name lives in one place.

**Tag selection (same pattern, multi-select):**

- Tags get the identical treatment — they have the same duplicate / inconsistent-
  spelling problem as projects, and it’s worse because tags are entered casually and
  in bulk.
- The Tag field is a searchable multi-select chip input: type → matching tags from
  the catalog appear → select one or more, or create a new tag inline.
- Names are normalized (trimmed, lowercased) before lookup so “Assembly”, “assembly”,
  and “ assembly “ all resolve to one canonical Tag.
- Decisions store `tag_ids`. This also makes filtering on the list view exact and
  reliable (filter by a tag id, not a fuzzy string match).

**Subsystem (free text for MVP):**

- `subsystem_name` stays a plain free-text field for now. Subsystem names are more
  one-off and project-specific, so a catalog isn’t worth it yet.
- It may graduate into its own catalog later if repeated subsystem naming becomes a
  real source of inconsistency — the same upgrade path Projects and Tags already model.

### 3.4 Attachments (evidence)

Attachments turn a decision from a claim into evidence — the FEA screenshot, the
photo of the cracked prototype, the supplier’s spec link. Done wrong they break the
two locked principles (local-first, schema-is-the-moat), so the rule is:

**Files live on disk; the schema stores only a reference.**

- Uploaded files and images are saved under `data/attachments/<decision_id>/`, so all
  evidence for one decision is co-located and travels with it.
- The decision row stores an `Attachment` record (path or url + metadata), never the
  bytes. The `.db` file stays small and fast; auto-backup stays cheap.
- Links cost no storage at all — they’re just a `url`. In practice this is the most-used
  type (a Drive link, a supplier page, a GitHub issue), so it’s first-class, not an
  afterthought.

**Phase 1 (this MVP) — three types:**

|Type |Stored as                                  |Notes                         |
|-----|-------------------------------------------|------------------------------|
|link |`url`                                      |zero storage, paste-and-go    |
|file |file in `attachments/<id>/` + path metadata|PDF, STEP, drawing, CSV, etc. |
|image|file in `attachments/<id>/` + thumbnail    |inline preview on the decision|

For images, generate a small thumbnail on upload so the list/detail views render fast
without loading full-res files.

**Size budget (CTO guardrail):** per-file cap (e.g. 25 MB) enforced on upload, with a
clear message if exceeded. The `attachments/` tree is **excluded from the every-write DB
backup** (which must stay tiny) and gets its own separate, less-frequent file backup.

**Export rule:** Markdown export lists attachments as links/embedded image refs; JSON
export includes attachment metadata, and a “full export” option bundles the
`attachments/` folder so the export stays losslessly re-importable — no broken links.

**Planned later (not in this MVP):**

- **Phase 2 — video.** Same disk-reference mechanism, larger files; needs the size cap and
  a backup warning so backups don’t balloon.
- **Phase 3 — voice notes.** Captured locally via the browser `MediaRecorder` API, saved
  as `.webm` to the decision folder — fully offline. Optional future add-on: local
  speech-to-text (e.g. Whisper, offline) to auto-transcribe a note into the reasoning
  field. Prove value before building.

### 3.5 Schema Rules (the non-negotiables)

- **Never edit a decided decision’s reasoning in place.** To change your mind, create a
  NEW decision with `supersedes` set, and stamp `superseded_by` on the old one. The old
  one stays visible.
- **All new fields are added now, even if the UI surfaces them later.** Adding columns
  to a populated SQLite table is cheap to design for upfront, painful to retrofit.
- **Files on disk, references in the schema.** Never store media bytes in SQLite.
- **Every export is a valid import.** JSON export round-trips losslessly; full export
  bundles the attachment files too.

-----

## 4. File Structure (MVP)

```text
engineering-decision-log/
├── README.md
├── ARCHITECTURE.md            (this file)
├── QUICKSTART.md
├── requirements.txt
├── app/
│   ├── __init__.py
│   ├── main.py                Flask app entry point + routes
│   ├── models.py              Decision, Risk, StatusEvent, Project, Tag + schema
│   ├── storage.py             SQLite read/write (decisions + project/tag catalogs)
│   ├── catalog.py             project/tag search, get-or-create, normalization
│   ├── attachments.py         save uploads, thumbnail images, size-budget checks
│   ├── backup.py              auto-backup on every write
│   ├── export.py              Markdown + JSON generation (single + filtered)
│   ├── templates/
│   │   ├── base.html
│   │   ├── index.html         decision list WITH inline search/filter
│   │   ├── decision_form.html  quick-mode + full-mode toggle
│   │   └── view_decision.html  detail view, supersede, export
│   └── static/
│       ├── style.css
│       └── app.js             form handling, quick/full toggle, autosave draft
├── data/
│   ├── decisions.db           SQLite (created on first run)
│   ├── attachments/           per-decision media: attachments/<decision_id>/
│   ├── backups/               timestamped DB copies (auto, excludes attachments)
│   └── exports/               generated Markdown / JSON
└── tests/
    ├── test_models.py
    ├── test_storage.py
    ├── test_catalog.py
    ├── test_attachments.py
    ├── test_backup.py
    └── test_export.py
```

> Note: the standalone `search.html` from v1 is **gone** — search/filter lives on the
> list view. A separate search screen is friction for an MVP.

-----

## 5. User Workflow

### 5.1 Quick path (the daily habit)

1. Open app → `python app/main.py` → land on decision list.
1. Click **New Decision** → form opens in **Quick Mode**: only 4 fields
   (title, context, chosen option, reasoning). Draft auto-saves as you type.
1. Save → stored in SQLite, DB auto-backed-up, redirect to list.

That’s the whole loop for a fast capture. Four fields. No homework.

### 5.2 Full path (when the decision deserves it)

- Toggle **Full Mode** to expose: options considered, assumptions, structured risks,
  confidence, references, tags, project, follow-up actions, notes.
- Each field has placeholder/example text so the format is learn-by-copying.

### 5.3 Changing your mind (the important one)

- Open a decided decision → click **Supersede**.
- A new decision form opens, pre-filled from the original, with `supersedes` already set.
- On save: new decision is created; old one is stamped `superseded_by` and shown as
  superseded (struck-through in the list, but never deleted).

### 5.4 Getting data out

- **Export one** → Markdown or JSON.
- **Export filtered** → all open / all high-risk / by date range / by project / for a
  specific review. Markdown for humans, JSON for re-import.

-----

## 6. Screens

### 6.1 Decision List (home)

```
[ + New Decision ]   [ search box ]   [ filters: status ▾  risk ▾  project ▾ ]

| Title                  | Date     | Status   | Conf | Risk | Project  | Tags        |
|------------------------|----------|----------|------|------|----------|-------------|
| Aluminum vs CF         | 14.06.26 | decided  | high | med  | Base     | manufacturing|
| Fastener access        | 13.06.26 | open     | low  | high | Enclosure| assembly    |
| ~~Old CF choice~~      | 01.06.26 | superseded| —   | —    | Base     | manufacturing|
```

Search and filter act on this view. No separate screen.

### 6.2 Decision Form (Quick / Full toggle)

```
[ Quick Mode ● | Full Mode ○ ]

— Quick Mode —
Title:          [ e.g. "Servo vs stepper for gimbal" ]
Context:        [ what triggered this, why it matters ]
Chosen Option:  [ what you picked ]
Reasoning:      [ why ]

— Full Mode adds —
Options Considered:  [ one per line ]
Assumptions:         [ one per line ]
Risks:               [ + add risk: description | likelihood | impact | mitigation ]
Confidence:          ( low / medium / high )
Needs Review:        [ ] flag
References:          [ drawing no. / PN / build ID / photo path ]
Project:             [ type to search… ▾ ]  (autocomplete; pick existing or "Create <name>")
Subsystem:           [ free text ]
Tags:                [ type to search… ] (multi-select chips; pick existing or create inline)
Attachments:         [ + Link ]  [ + File ]  [ + Image ]   (drag-drop too; thumbnails for images)
Follow-ups / Notes

[ Save ]  [ Cancel ]     (draft auto-saves while editing)
```

### 6.3 View Decision

```
[ Edit ] [ Supersede ] [ Export ▾ ] [ Delete ] [ Back ]

Title, context, options, chosen, reasoning ...
Confidence: high    Needs review: no
Risks:  • corrosion (likelihood: med, impact: high) → mitigation: Type II anodize
References: DWG-1042, PN-3391, build-07
Status: decided     History: open→decided (12.06), reopened (13.06), decided (14.06)
Supersedes: #14     Superseded by: —

Attachments:
  🖼  fea_von_mises.png   "FEA, final geometry"
  📄  bracket_dwg.pdf     "DWG-1042 rev B"
  🔗  supplier spec       https://…

[ Export as Markdown ]  [ Export as JSON ]
```

-----

## 7. Export Output Example (Markdown, single decision)

```markdown
# Decision: Aluminum vs Carbon Fiber for Bracket

**Date:** 2026-06-14   **Status:** Decided   **Confidence:** High
**Project:** Base Assembly   **Tags:** manufacturing, cost
**References:** DWG-1042, PN-3391
**Supersedes:** Decision #14 (earlier CF choice)

## Context
Bracket must support 50 kg payload with minimal weight penalty.

## Options Considered
- 6061-T6 aluminum extrusion (light, machinable, low cost)
- Carbon fiber tube + aluminum fittings (lighter, costly, hard to modify)
- Cast aluminum (cheap, not field-repairable)

## Chosen Option
6061-T6 aluminum extrusion

## Reasoning
Best balance of weight, field repairability, manufacturing speed. CF is overkill here.

## Assumptions
- Fatigue loads under 10M cycles
- Field access with basic hand tools
- No thermal cycling above 60 °C

## Risks
| Risk                      | Likelihood | Impact | Mitigation              |
|---------------------------|------------|--------|-------------------------|
| Corrosion if not anodized | Medium     | High   | Specify Type II anodize |
| Stiffness at final mass   | Low        | Medium | FEA check before freeze  |

## Follow-up Actions
- [ ] Run FEA on final geometry
- [ ] Get anodize quote
- [ ] Thermal chamber test

## Status History
open → decided (2026-06-12) → reopened (2026-06-13) → decided (2026-06-14)

## Attachments
- ![FEA, final geometry](attachments/<id>/fea_von_mises.png)
- [DWG-1042 rev B](attachments/<id>/bracket_dwg.pdf)
- [Supplier spec](https://example.com/spec)
```

-----

## 8. Why This Is Foundation Infrastructure

1. **Single data model** — every decision has the same shape. Searchable, exportable,
   extendable.
1. **History-preserving** — supersession + status history capture the reasoning *evolution*,
   which is the highest-value data and exactly what notebooks throw away.
1. **Local-first** — zero setup, zero cloud risk, works offline on sensitive projects.
1. **Exportable & re-importable** — JSON round-trips; no lock-in, no migration pain.
1. **Expandable into a system** — every future app writes to (or reads from) this same table:
- **Design Review Assistant** → checklist items become pre-filled decisions.
- **Assembly Sequence Analyzer** → each step (“can we access fastener X?”) is a decision.
- **Prototype Test Logger** → test results feed decisions about design changes.
- **Risk Dashboard** → read-only query layer over the `risks` of all decisions.
1. **Shareable** → export Markdown, hand to a junior; they read not just *what* you decided
   but *why*, and the path you took to get there.

-----

## 9. Strategic Guardrails (CTO layer)

- **Auto-backup on every write.** Timestamped copies in `data/backups/`. One corrupted
  SQLite file should never cost an engineer their judgment archive.
- **Schema = moat.** Version it, never break backward compatibility, treat the corpus as
  the company asset.
- **Design for team scale, don’t build it yet.** `owner` and the `project_id` catalog
  already exist so a future sync/multi-user layer drops in without a schema rewrite. The
  Project and Tag catalogs are exactly the shared reference tables a team layer would need.
  Do NOT add team features now.
- **Analytics is a read-only seam.** Insights (“we keep choosing aluminum and regretting it”,
  “80% of reopened decisions involve fasteners”) come later as queries over the flat schema —
  never complicate the write path.

-----

## 10. Out of Scope for MVP (deliberately)

- User authentication (single user)
- Team collaboration / sync (schema-ready, not built)
- Cloud storage (intentional — data stays local)
- AI auto-completion of fields (can add later)
- Complex dashboards (one list, one form, one detail view)
- CAD integration (a decision *references* a CAD file by name/path, nothing deeper)
- Video attachments (Phase 2 — same mechanism, needs size cap + backup warning)
- Voice notes + offline transcription (Phase 3 — `MediaRecorder` local capture, then optional Whisper)

-----

## 11. Build Order (~4–5 hour prototype)

Build the new fields into the schema **from the start** — cheap now, painful to retrofit.

1. **Core schema** — Decision + Risk + StatusEvent + Project + Tag + Attachment, with supersession & history fields. (45 min)
1. **Storage + auto-backup** — SQLite read/write, timestamped backup on every write (excludes attachments). (45 min)
1. **Catalog layer** — project/tag search + get-or-create + name normalization, with a tiny JSON endpoint the form calls for autocomplete. (45 min)
1. **List view with inline search/filter** (filter by project / tag id). (45 min)
1. **Quick-entry form**, then expand to full mode with project/tag autocomplete, placeholders + autosave draft. (60 min)
1. **Attachments (Phase 1)** — link + file + image upload, save to `attachments/<id>/`, image thumbnails, size-budget check. (45 min)
1. **Supersede flow** — pre-fill + link both directions. (30 min)
1. **Markdown export** (single, with attachments), then filtered export. (30 min)

**Testable milestones:** after step 2 you can write/read a decision via tests; after step 3
catalog get-or-create is unit-tested (no duplicate projects/tags); after step 6 you can
attach a photo to a decision in the browser; after step 8 you can hand someone a report
with its evidence.

-----

## 12. First Week Plan

1. Use Quick Mode for every real decision for one week.
1. Note what’s awkward or missing (likely a field or a filter).
1. Adjust UI based on real usage — not speculation.
1. Once it feels natural, build the **Design Review Assistant** on top: same data model,
   new workflow, decisions pre-filled from checklists.