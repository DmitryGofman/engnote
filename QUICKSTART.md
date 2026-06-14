# Quickstart

This MVP is a static web app — no install, no build, no backend.

## Option A — just open it

Double-click `index.html` (or open it in your browser). Everything runs
client-side and data persists in that browser's `localStorage`.

> Note: opening via `file://` works for all core features. If your browser
> restricts anything under `file://`, use Option B.

## Option B — serve it locally (recommended)

Any static server works. With Python installed:

```bash
cd engnote
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## The 30-second loop

1. Click **+ New Decision**.
2. In **Quick Mode**, fill Title / Context / Chosen Option / Reasoning.
3. **Save** → you land on the decision detail view.
4. Back on the list, use the search box and status/project filters.
5. Need more structure? Open a decision → **Edit** → toggle **Full Mode** for
   risks, assumptions, tags, project, attachments, follow-ups.
6. Changed your mind? Open the decision → **Supersede** → save the new one. The
   original stays, struck-through, linked.

## Getting data out / in

- On a decision: **Export Markdown** or **Export JSON**.
- On the list: **Export all (JSON)** for the whole corpus, and **Import** to
  load a previously exported JSON document back in.

## Where's the data?

In your browser's `localStorage` under the `engnote.v1` key, with rolling
backups under `engnote.v1.backups`. Clearing site data wipes it — export first
if it matters.
