# Finance & Investing widgets

Nine small rounded cards, one page, picked with `w=`. Same pattern as `/meal`.

## What is in this zip (unzip into the repo root)

```
api/finance.js              reads + safe writes for the 5 finance databases
api/finance-health.js       checker: open it after deploying
finance/index.html          the widget page
finance/style.css           French wine + butter yellow theme
finance/script.js           all nine widgets
finance/assets/             (empty for now)
dev/finance-mock-server.js  OPTIONAL local preview with fake data. Safe to delete.
```

Nothing existing is changed. `lib/notion.js`, `api/meal.js`, `api/sail.js`, `api/status.js`, `api/health.js` are untouched.

## Setup (4 steps)

1. Unzip into the repo root (it merges into your existing `api/` folder and adds `finance/`).
2. Commit and push. Vercel deploys by itself.
3. **No new environment variables.** The five database IDs are already inside `api/finance.js`.
   (Optional overrides if you ever recreate a database: `DB_FIN_TX`, `DB_FIN_BUDGETS`, `DB_FIN_GLOSSARY`, `DB_FIN_ROADMAP`, `DB_FIN_GOALS`. To change which categories count as income: `FIN_INCOME_CATEGORIES`, default `Pocket Money,Other Income`.)
4. Open `https://YOUR-SITE.vercel.app/api/finance-health?key=YOUR_WIDGET_KEY`. You want `"ok": true` for all five databases.

## Embed URLs

Notion: type `/embed`, paste a link. Replace `YOUR-SITE` and `YOUR_WIDGET_KEY`.

`https://YOUR-SITE.vercel.app/finance/index.html?key=YOUR_WIDGET_KEY&w=NAME`

| `w=` | What it is | Writes? | Height, wide column (~560px) | Height, narrow (~340px / phone) |
|---|---|---|---|---|
| `add` | Quick add: amount, category, UPI/Cash/Card, note, last 5 with Undo | yes | 650 | 810 |
| `left` | Left to spend + safe amount per day + month of glass tiles. Week/Month | no | 530 | 520 |
| `ledger` | Book-spine shelf, one per category. Week/Month | no | 610 | 630 |
| `trend` | Last 8 weeks or 6 months as glass tiles, dashed budget line | no | 470 | 420 |
| `term` | Term of the day flashcard, "I know this one" | yes | 310 | 380 |
| `wall` | One tile per glossary term; butter = learned | yes | 400 | 580 |
| `path` | Money roadmap steps; next step highlighted | yes | 580 | 750 |
| `future` | Future me calculator (no database needed) | no | 700 | 1160 |
| `goals` | Lily per goal, petals fill as you save, +100 / +300 / +500 / custom | yes | 340 | 500 |

Notes on heights:
- Notion embeds have a fixed height, so pick the column that matches where you place it. Each card scrolls inside itself if it is a little short.
- `goals` grows by about 140px per extra goal. `ledger` grows by about 50px per extra budget category.
- `w=all` shows everything as separate cards. Combine pieces with commas: `w=left,ledger`.

## URL options

- `&bg=transparent` or `&bg=HEX` changes the page background (default Notion dark `#191919`).
- Future me starting values: `&sip=300&rate=10&years=30&delay=10`.

## Palette (sampled from the theme image by clustering)

`#330810` oxblood (card) · `#670d1d` deep wine · `#891a2e` wine · `#a91f40` French wine · `#d43b59` raspberry · `#d96f7c` rose · `#f3e5ad` butter yellow · `#ddc78c` cream gold · `#ccae6d` gold

Fonts: Fraunces (headings) and Figtree (all numbers).

## How it behaves

- Reads use `?key=` in the page URL. Writes send the `x-widget-key` header, read from the same URL.
- Every write goes through `wrap()` and `getAllowedPage()`, so it can only touch pages in the five finance databases. Amounts, categories, modes and dates are validated on the server.
- Writes appear instantly. If Notion refuses, the change is undone and the real error shows in a toast.
- Savings: logging a spend with category **Savings** counts as saved, not spent. It does not reduce "left to spend".
- Undo moves the entry to Notion's trash, so you can still restore it there.
- Widgets in different embeds update each other, and refresh once a minute and when you hover.
- New Category / Mode options you add in the Transactions database show up in the Add widget automatically.

## If something is wrong, check this

| What you see | What to check |
|---|---|
| "Missing or wrong key" | The `key=` in the link must equal `WIDGET_KEY` in Vercel. |
| "Notion cannot find that page or database" | Notion: your Finance page > ... > Connections > add your integration. Then reopen `/api/finance-health`. |
| `finance-health` lists "Missing property" | A column was renamed or deleted in Notion. Rename it back, the names are listed. |
| "X is not a category in Transactions" | Add that option to the Category column in Notion (or pick another). |
| Add widget shows "Loading categories..." | Transactions database could not be read: check `/api/finance-health`. |
| Widget works but fonts look plain | Google Fonts blocked by your network. The layout still works. |
| Saves fail with a Notion message | The toast shows Notion's own message. Quote it and I will help. |

## Preview locally (optional)

```
node dev/finance-mock-server.js
# open http://localhost:8787/finance/index.html?key=testkey&w=all
# http://localhost:8787/__fail?on=1   makes every save fail, to see the revert + toast. on=0 to stop.
```
It runs your real `api/finance.js` against a fake in-memory Notion. It never touches your workspace.
