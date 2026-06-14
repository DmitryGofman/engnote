# EngNote — capture-first engineering notes

Open it, write (or talk), tag it, attach a photo. That's the whole loop. No forms,
no fill-in fields. Later, tap **Organize** and the app turns your raw note into a
clean engineering decision — context, options, reasoning, risks — while always
keeping your original words.

Think Apple Notes, but for engineering decisions: tagged, project-scoped, and
self-organizing.

> **Live app:** https://dmitrygofman.github.io/engnote/
>
> This repo is the **capture-first MVP**: a 100% static, client-side web app (no
> backend, no build step). Notes live in your browser's `localStorage`. The
> AI "Organize" step is the next milestone (see `ARCHITECTURE.md` §5).

## What's here

```
engnote/
├── index.html          app shell
├── css/style.css       styling, no framework
├── js/
│   ├── schema.js       the Note model (+ Project, Tag, Attachment, derived Structured)
│   ├── storage.js      localStorage seam + rolling backups + v1→v2 migration
│   ├── catalog.js      project/tag get-or-create + normalization
│   ├── export.js       Markdown + JSON export
│   ├── ui.js           note list + the editor (write, dictate, attach, tag)
│   └── app.js          hash router
├── ARCHITECTURE.md     full design (source of truth)
└── QUICKSTART.md       how to run it
```

## Features (this MVP)

- **Note list** — card grid, search, filter by project or tag, pinned notes first.
- **Open editor** — a title and one freeform body. Autosaves. No Save button.
- **Live dictation** — tap 🎙 and talk; it transcribes into the note (Web Speech API).
- **Photo / file attachments** — 📷 hints the camera on phones; shown inline.
- **Tags + Project** — first-class catalogs so filtering is exact (no spelling drift).
- **Export / import** — Markdown per note, JSON for the whole corpus (re-importable).
- **Auto-backup** — rolling snapshots before each write.
- **Mobile-first** — fixed capture bar, big touch targets, safe-area aware.

## ✨ Organize

Tap **✨ Organize** in the editor to lay your freeform note out as an engineering
decision — context, options, decision, reasoning, assumptions, risks, follow-ups.
Your **original note is always kept** above the result, and you can re-organize
anytime. Two engines:

- **Organize (offline, default).** Pure in-browser heuristics: it sorts your note's
  own sentences into the decision layout using keyword cues. Instant, free, fully
  offline, no key. It's *mechanical* — it formats your words, it doesn't rewrite or
  infer.
- **✨ Smarter (Claude), optional.** Sends the note to Claude (`claude-opus-4-8`)
  for a real cleanup/rewrite. Needs your own API key (paste once; stored only in
  this browser, on this device, sent only to Claude). This is the one feature that
  reaches the network; capture and storage stay fully local.

## Run it

No toolchain — see `QUICKSTART.md`. Open `index.html`, or serve the folder.
