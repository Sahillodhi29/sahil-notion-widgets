# Workout Planner widgets

Seven small rounded widgets for your Workout Planner page. Same setup as /meal: one page, many pieces, picked with `&w=`.

## What's in this zip (all new, nothing existing is changed)

```
api/workout.js            NEW  data + actions (read, tick a box, start today's row)
workout/index.html        NEW
workout/style.css         NEW  aubergine + perch palette
workout/script.js         NEW
workout/assets/plum.svg   NEW  the little plum on the ripple card
```

Your repo after unzipping:

```
sahil-notion-widgets/
  api/        health.js  meal.js  sail.js  status.js  workout.js   <- new
  lib/        notion.js          (untouched)
  meal/ sail/ status/ ...        (untouched)
  workout/                       <- new
    assets/plum.svg
    index.html  script.js  style.css
  index.html  vercel.json        (untouched)
```

## Setup (about two minutes)

1. Unzip into the repo root (it merges into `api/` and adds `workout/`).
2. Commit and push. Vercel deploys by itself.
3. **No new environment variables.** It reuses `NOTION_TOKEN`, `WIDGET_KEY` and the Workout Log id already inside `api/status.js` (override with `DB_WORKOUT` if you ever move the database).
4. Open `https://YOUR-SITE.vercel.app/api/health?key=YOUR_WIDGET_KEY`. `workoutLog` should say `ok: true`.
5. Open `https://YOUR-SITE.vercel.app/workout/index.html?key=YOUR_WIDGET_KEY&w=all` to see every widget.

## Embed URLs

Base: `https://YOUR-SITE.vercel.app/workout/index.html?key=YOUR_WIDGET_KEY&w=`

| Widget | Add to the base | Embed height |
|---|---|---|
| Session Ripples | `ripple` | 235 px |
| Today's Session (tap to tick, Start button) | `session` | 450 px |
| This Week's Plan | `week` | 225 px |
| Session Streak | `streak` | 265 px |
| Tile Mosaic (five weeks) | `mosaic` | 455 px |
| Push, pull, legs | `balance` | 425 px |
| Fuel Check | `fuel` | 250 px |

- Heights are for a normal desktop column (about 560 px wide). On a phone-width column the taller widgets need more room (Today's Session about 730 px, Push, pull, legs about 620 px). On a rest day Today's Session only needs about 170 to 250 px, so 450 leaves some air; pick a lower number if you prefer.
- You can combine widgets in one embed: `&w=ripple,session`.
- Background is Notion dark `#191919`. Add `&bg=transparent` or `&bg=HEXCODE` (no #) to change it.

## How a day is judged

The weekly schedule lives in one place: `SCHEDULE` at the top of `api/workout.js` (0 = Sunday ... 6 = Saturday). Change it there and every widget follows.

| Day | Type | Counts as done when |
|---|---|---|
| Mon, Wed, Fri | workout | 6 of 7 exercises are ticked (85%). Snacks don't count. |
| Sun | bonus | Same, but it is optional: it never breaks your streak. |
| Tue, Thu, Sat | rest | Both snack boxes are ticked. |

- **Start button:** if today has no row, Today's Session shows a Start button. On a workout day it creates "Wednesday's Workout". On a rest day it creates "Tuesday's Rest" and shows only the two snack tiles (labelled "Evening snack" and "Refuel meal"). It never creates a second row for the same date.
- **Streak** counts only workout days (plus completed bonus days). Rest days never break it. Days before your first log are ignored.
- **Fuel Check** reads training days and rest days separately, so a rest day is never mistaken for a missed workout.
- Rows made ahead of time by your Notion button (future dates) show as "upcoming" in the week strip.

## If something doesn't work

| What you see | What to check |
|---|---|
| "Missing or wrong key" | The `key=` in the embed URL must equal `WIDGET_KEY` in Vercel. |
| `/api/workout` shows a 404 | Make sure `api/workout.js` was committed and Vercel finished deploying. If your `vercel.json` lists functions or rewrites by name, add `api/workout.js` there too. |
| "Notion cannot find that page or database" | Open your Workout Planner page, then the ... menu, then Connections, and add your integration. |
| A tick bounces back and a red toast appears | The toast shows Notion's real message. Run `/api/health?key=...` to see if a checkbox was renamed or deleted. |
| Rows with a time before 5:30 AM show on the wrong day | Notion stores that time on the previous UTC day. Use a date without a time, or a later time. |
| Fonts look plain | Google Fonts (Fraunces, DM Sans) is blocked. Widgets still work with fallback fonts. |

## Palette (sampled from your aubergine + perch image)

`#1C0D14` card, `#38172A` aubergine, `#582F45` plum, `#242B11` moss, `#3B3F2E` perch, `#746C36` olive, `#948872` sage, `#665A5B` mauve, `#BFABBC` lilac, `#070305` ink.
