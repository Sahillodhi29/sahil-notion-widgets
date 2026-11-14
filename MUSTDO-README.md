# Must Do's

Your daily must-do list, ticked off from a widget instead of a hand-maintained table, with the week and the month drawn from the same history.

Everything is driven by one Notion database, **Must Do's**.

## How the database works

One row per day (`Name` = "Sat, 14 Nov", `Date` = that day) and **one checkbox property per must-do**. A row with `Wake up before 6 am` ticked means that was done that day. The widgets create today's row the first time you tick something, so you never have to add rows by hand.

| Property | Type | What it is |
|---|---|---|
| Name | Title | The day, written by the widget |
| Date | Date | Which day the row belongs to |
| Status | Status | Unused by the widgets |
| Progress | Formula | Kept in step with the list when you add or remove a must-do |
| *(one per must-do)* | Checkbox | Ticked for that day |

Adding a must-do adds a checkbox property; removing one deletes it. Both happen from the "Your must do's" widget.

## Embed URLs

Base address:

`https://YOUR-SITE.vercel.app/mustdo/index.html?key=YOUR_WIDGET_KEY&w=`

| Add this at the end | Widget | Height |
|---|---|---|
| `check` | Must do's — today's list, tap to tick | 460 |
| `week` | This week — seven bars, one per day | 300 |
| `month` | Last 30 days — heatmap, average and streak | 340 |
| `manage` | Your must do's — add and remove | 420 |
| `all` | Everything as separate cards (for testing) | tall |

Combine with commas, for example `w=check,week`. Add `&theme=shanks` to open in the Shanks theme, `&toggle=0` to hide the theme switch, `&bg=transparent` or `&bg=HEX` to change the background.

## The widgets

- **check**: today's must-do's with a tick each. The header shows `3 / 11` and the bar fills as you go. Tapping writes straight to today's Notion row.
- **week**: the last seven days as bars, in the percentage of that day's must-do's you completed, with the week's average. A perfect day turns gold.
- **month**: thirty-five days as a heatmap (five weeks, Monday first), plus the average and any run of perfect days ending today.
- **manage**: add a must-do (Enter or Add) and remove one with ×. Removal asks first, because it deletes the property and its past ticks.

## Theme

Two themes, switched in the corner and remembered in the browser:

- **classic** — ink and copper on dark paper.
- **shanks** — vermilion and blood on black, parchment text, gold accents (from the reference art in `mustdo/shanks/`).

The four reference pictures in `mustdo/shanks/` are baked into heading plates, one per widget, at the strip's own aspect so the crop never drifts: `band-check.webp` (laughing on the sky), `band-week.webp` (sword raised), `band-month.webp` (the ship at sunset), `band-manage.webp` (the ink portrait, its white paper keyed out so it sits on the card instead of in a white box). Add more pictures as `5.png`, `6.png` … and they can be baked the same way.

## Setup

1. Commit and push — Vercel deploys by itself.
2. Share the **Must Do's** page with the integration if it is not already.
3. Open `/api/mustdo?key=YOUR_WIDGET_KEY` — it should return `habits` and `rows`.

No new environment variables. Optional override: `DB_MUSTDO`.
