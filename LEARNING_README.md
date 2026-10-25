# Learning Planner widgets: "Mulberry & Fuchsia"

Six widgets for your Learning Planner page. Every card is split in two, like your theme image: a fuchsia band with a heavy italic title, and a mulberry body below.

## What's in this zip

Unzip into the **repo root**. It only adds files; nothing existing is overwritten.

```
api/learning.js            data + all actions for the Learning Planner
api/learning-health.js     "is everything wired up?" check page
learning/index.html
learning/style.css
learning/script.js
learning/assets/.gitkeep   (empty folder, ready for images later)
LEARNING_README.md         this file
```

Not changed: `lib/notion.js`, `api/sail.js`, `api/meal.js`, `api/status.js`, `api/health.js`, `vercel.json`. `vercel.json` needs no change, because `/learning/index.html` is a normal static file, the same way `/meal/index.html` works.

## What I changed in Notion

I created one new database on your Learning Planner page: **Study Log** (the last block on the page). It has Name, Date, Topic (linked to Learnings), Minutes and Note. Your Learnings and To Do List (2) databases were not changed. The Study Log is filled in by the widgets, so you can drag it somewhere tidy or put it inside a toggle.

## Setup (3 steps)

1. **Copy the files in, commit, push.** Vercel deploys by itself.
2. **Make sure your integration can see the page.** In Notion, open *Learning Planner*, then `...` > Connections, and add your integration if it isn't there. (It's often inherited from the page above it.)
3. **Open the health page:**
   `https://YOUR-SITE.vercel.app/api/learning-health?key=YOUR_WIDGET_KEY`
   It should say "Everything looks good". If not, it lists exactly which database or property to fix.

No new environment variables are needed. `NOTION_TOKEN` and `WIDGET_KEY` are the ones you already have. Optional overrides, only if you ever move a database: `DB_LEARNINGS`, `DB_LEARN_TODO`, `DB_STUDY_LOG`.

## Embed URLs and recommended heights

Use Notion's `/embed`. Base address:

`https://YOUR-SITE.vercel.app/learning/index.html?key=YOUR_WIDGET_KEY&w=`

| Add this at the end | Widget | Height |
|---|---|---|
| `today` | Today's study | 420 |
| `focus` | Focus timer | 460 |
| `streak` | Streak | 400 |
| `topics` | Topics | 560 |
| `newtopic` | New topic | 440 |
| `newtask` | New task | 480 |
| `all` | Everything as separate cards (for testing) | tall |

Options for any URL: `&goal=30` sets your daily study goal in minutes (default 20, used by the Streak widget). `&sound=off` silences the timer chime. `&bg=transparent` or `&bg=HEX` changes the page background (default is Notion dark).

## What each widget does

- **today**: Tasks from To Do List (2) that are due today or overdue, with a progress ring. Tabs for This week and Someday (tasks with no date). Tick a task to complete it. Repeating tasks move to their next date instead of finishing, the same way your Sail widget does. Undo from the toast. Blank rows in your database are ignored.
- **focus**: Pick a topic, choose 15, 25, 45 or 60 minutes (or use the minus and plus buttons), and start. Pause, resume, or "Finish and save" to log the time you actually studied. A finished timer saves itself to the Study Log with a short chime. If the save fails you see the real error and nothing is lost silently. The timer survives a page refresh.
- **streak**: Your day streak, best streak, this week's minutes as bars against your goal, and a 12-week heatmap. A streak counts any day you logged study time.
- **topics**: Your Learnings as cover-image tiles, most recently studied first (or A to Z). A dot marks topics studied this week. Tap a tile for total time, sessions, last studied, recent sessions, and a quick "Log a session" box (10, 15, 25, 45 or your own minutes, plus an optional note).
- **newtopic**: Name, tags (pick existing ones or make new ones), and an optional cover link with a live preview. After saving, the form keeps going so you can add several topics in a row.
- **newtask**: Name and category, then when it's due and its priority, then whether it repeats (every day, week, month, or a custom number of days, weeks, months, quarters or years).

## Photos and covers

Notion can't take a file upload for a page cover from a widget, so the cover field takes an **image link** (https only), with a live preview that tells you if the link can't be shown. Topics without a cover get a block of colour with their initial.

## If something goes wrong

| What you see | What to check |
|---|---|
| "Missing or wrong key" | The `key=` in the embed URL must match `WIDGET_KEY` in Vercel. |
| "Notion cannot find that page or database" | Step 2: connect your integration to the Learning Planner page. |
| Focus or Streak show no history | Open `/api/learning-health` and check the Study Log line. |
| "'X' is not an option for ..." when saving a task | That category, priority or repeat unit was removed in Notion. Re-add it there. |
| "Couldn't save: ..." toast | The widget undoes the change and shows Notion's real message. Send it to me if it isn't clear. |
| Changes made in Notion take a moment to show | Widgets refresh every minute, when you hover them, and when you switch back to the tab. |

## Limits

- Study history is read for the last 120 days, so streaks longer than that stop counting at 120.
- Reads up to 300 topics and 400 open tasks. The Someday tab shows the first 80.
- A task counts as "done today" the same way it does in the Sail widget: marked Done, or a repeating task moved forward today.

## Updated repo tree

```
sahil-notion-widgets
├─ api
│  ├─ health.js
│  ├─ meal.js
│  ├─ sail.js
│  ├─ status.js
│  ├─ learning.js            (new)
│  ├─ learning-health.js     (new)
│  └─ wardrobe.js, wardrobe-health.js   (if you deployed the wardrobe page)
├─ clock  home  islands
├─ learning                  (new)
│  ├─ assets
│  ├─ index.html
│  ├─ script.js
│  └─ style.css
├─ lib
│  └─ notion.js
├─ meal
├─ sail  sexyclock  sky  status
├─ wardrobe
├─ weather
├─ index.html
└─ vercel.json
```
