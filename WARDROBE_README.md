# Wardrobe widgets

Cherry wine and periwinkle theme. Item photos sit in arch windows, and the closet gauge is three nested doorways.

## What's in this zip

Unzip into the **repo root**. Nothing existing is overwritten.

```
api/wardrobe.js            data + all actions for the Wardrobe page
api/wardrobe-health.js     "is everything wired up?" check page
wardrobe/index.html
wardrobe/style.css
wardrobe/script.js
wardrobe/assets/.gitkeep   (empty folder, ready for images later)
WARDROBE_README.md         this file
```

Not changed: `lib/notion.js`, `api/sail.js`, `api/meal.js`, `api/status.js`, `api/health.js`, `vercel.json`.
`vercel.json` needs no change: `/wardrobe/index.html` is a normal static file, the same way `/meal/index.html` works.

## Setup (3 steps)

1. **Copy the files in, commit, push.** Vercel deploys by itself.
2. **Share the Wardrobe databases with your integration.** In Notion, open the *Wardrobe Organizer* page, then `...` > Connections > add your integration. If it is inside *Sahil's Life* and that page is already connected, this usually works automatically.
3. **Open the health page** in your browser:
   `https://YOUR-SITE.vercel.app/api/wardrobe-health?key=YOUR_WIDGET_KEY`
   It should say "Everything looks good". If not, it lists exactly which property or database to fix.

No new environment variables are needed. `NOTION_TOKEN` and `WIDGET_KEY` are the ones you already have.
Optional overrides, only if you ever move a database: `DB_WARDROBE`, `DB_OUTFITS`, `DB_WISHLIST`.

## Embed URLs and recommended heights

Use Notion's `/embed`. Base address:

`https://YOUR-SITE.vercel.app/wardrobe/index.html?key=YOUR_WIDGET_KEY&w=`

| Add this at the end | Widget | Height |
|---|---|---|
| `add` | New piece (form) | 620 |
| `wish` | New wish (form) | 560 |
| `wear` | Worn today (tap to log) | 420 |
| `closet` | Closet gauge (nested arches) | 300 |
| `cats` | Arches by category or colour | 300 |
| `wishlist` | Wishlist grouped by priority | 460 |
| `all` | Everything as separate cards (for testing) | tall |

You can combine widgets in one embed with commas, for example `w=closet,cats`.

Options you can add to any URL:
- `&cur=$` changes the currency symbol (default is the rupee sign).
- `&bg=transparent` or `&bg=HEX` changes the page background (default is Notion dark `#191919`).

## What each widget does

- **add**: Name, category, type, colour, brand and price are visible. Press "More details" for the rest (status, location, season, occasion, fabric, pattern, style, care, tags, notes, photo link, wear count). The form clears after saving but keeps category, location, season, status, date and condition, so you can catalogue a whole closet quickly. It warns you if you already have a piece with the same name and brand.
- **wish**: Name, category, priority, brand, price and why you want it. "More details" has link, status, date, notes and photo link.
- **wear**: Tap a piece or an outfit you wore today. It adds 1 to Wear Count and sets Last Worn to today. Tapping an outfit does this for the outfit and for every piece in it. Press Undo in the toast, or tap the ticked tile again.
- **closet**: Share of your active pieces worn in the last 7, 30 and 90 days, plus closet value and the number never worn.
- **cats**: Your active pieces grouped by category or by primary colour.
- **wishlist**: Open wishes grouped by priority, with totals. The dropdown changes Wishlist Status. "Bought" asks whether to add the piece to your wardrobe; if yes, a new piece is created with the name, brand, price and category, marked Active with today's date.

"Active" means the piece is not marked Donated, Sold, Retired, Missing/Lost, Wishlist or Gift.

## Photos

Notion can't take a file upload from a widget, so the forms ask for an **image link** (https only). Photos already uploaded in Notion show up in the widgets. Photos copied across when you move a wish to your wardrobe are only copied if they are links, because Notion's own file links expire.

## If something goes wrong

| What you see | What to check |
|---|---|
| "Missing or wrong key" | The `key=` in the embed URL must match `WIDGET_KEY` in Vercel. |
| "Notion cannot find that page or database" | Step 2: connect your integration to the Wardrobe Organizer page. |
| A form says the Notion options could not be read | Open `/api/wardrobe-health` and fix what it lists. |
| "'X' is not an option for ..." when saving | You typed or picked something that was removed in Notion. Re-add that option in Notion. |
| "Couldn't save: ..." toast | The widget reverts the change and shows Notion's real message. Copy it to me if it isn't clear. |
| Changes in Notion take a moment to show | Widgets refresh every minute, when you hover them, and when you switch back to the tab. |

## Limits

- Reads up to 600 pieces, 200 outfits and 300 wishes.
- Blank rows in your databases are ignored.
- Outfit relations beyond 25 pieces are not followed when logging an outfit.
- The Capsule Wardrobes and Trip Packing databases are not used.

## Updated repo tree

```
sahil-notion-widgets
├─ api
│  ├─ health.js
│  ├─ meal.js
│  ├─ sail.js
│  ├─ status.js
│  ├─ wardrobe.js            (new)
│  └─ wardrobe-health.js     (new)
├─ clock  home  islands
├─ lib
│  └─ notion.js
├─ meal
├─ sail  sexyclock  sky  status
├─ wardrobe                  (new)
│  ├─ assets
│  ├─ index.html
│  ├─ script.js
│  └─ style.css
├─ weather
├─ index.html
└─ vercel.json
```
