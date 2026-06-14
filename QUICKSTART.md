# Quickstart

EngNote is a static web app — no install, no build, no backend.

## Use it now (no setup)

Open the live app: **https://dmitrygofman.github.io/engnote/** — works on your phone.

## Run it locally

Double-click `index.html`, or serve the folder:

```bash
cd engnote
python3 -m http.server 8000
# open http://localhost:8000
```

Serving (rather than `file://`) is recommended — some browsers restrict the
microphone and camera on `file://`.

## The loop

1. Tap **+** to start a note.
2. Type a title and **just write** — or tap **🎙 Dictate** and talk.
3. Add a **📷 Photo** or **📎 File** (on a phone, the camera opens).
4. Set a **Project** and add **#tags** — both autocomplete and create inline.
5. Go **‹ Notes**. Everything autosaved. Empty notes are discarded automatically.
6. On the list, search or filter by project / tag to find anything fast.

## Voice notes

Dictation uses your browser's built-in speech recognition. It works on most
phones (Android Chrome, iOS Safari) and desktop Chrome/Edge. If your browser
doesn't support it, the 🎙 button is disabled — typing still works everywhere.

## Getting data out / in

- Per note: **⤓** exports Markdown (includes the organized version once that ships).
- On the list: **Export** dumps everything as JSON; **Import** loads it back
  (older "decision"-format exports auto-migrate to notes).

## Where's my data?

In this browser's `localStorage` (key `engnote.v1`), with rolling backups under
`engnote.v1.backups`. It's local to this device/browser. Clearing site data wipes
it — export first if it matters. Attachments are stored inline, so keep images
modest (10 MB cap each) until the backend phase.

## Coming next: ✨ Organize

Write freely, then tap **✨ Organize** to have Claude lay your note out as a clean
engineering decision (context, options, reasoning, risks). Your original text is
always kept. The button is in the editor now and previews what it'll do.
