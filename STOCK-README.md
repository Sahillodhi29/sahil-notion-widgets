# My Stock & Resources

The old **Bank Officer in Making** page was emptied and renamed to **My Stock & Resources**. It now tracks everything at home that runs out and needs restocking — food, skincare, haircare, and whatever you add later — and tells you what to buy and when.

Everything is driven by one Notion database called **Stock**.

## The database

| Property | Type | What it is |
|---|---|---|
| Item | Title | What it is: Eggs, Curd, Sunscreen |
| Category | Select | Foods, Skincare & Haircare, … (add options in Notion any time) |
| Every | Number | How many |
| Unit | Select | Day, Week, Month, Quarter, Year |
| Cost | Number | What one restock costs (optional) |
| Pack | Text | 3 trays, 150 g, 1 bottle (optional) |
| Last Restocked | Date | Set by the widget when you press Restocked! |
| Needed | Checkbox | Ticked from the widget, cleared on restock |
| Note | Text | Anything worth remembering |

The **next due date is not stored** — it is `Last Restocked + Every × Unit`, worked out in the widget. That way you never have to keep a formula in step in Notion: change the cadence and the widget follows.

Your starting shelf:

- **Foods** — Eggs (3 trays, ₹600/month), Pumpkin / Chia / Flax Seeds (₹200 each/month), Curd (150 g, ₹50 a day), Fruits, Peanuts, Roasted Channa, Sweet Potato (every 3 days)
- **Skincare & Haircare** — Rosehip Oil, Simple Moisturizer, Sunscreen (₹400 each/month), Vaseline, Lip Balm, Rosewater, Aloe Vera Gel, Multani Powder, Neem Powder

Nothing has a Last Restocked date yet, so items read "never logged" until you press Restocked! on them once. Change any cadence or price straight in Notion.

## Embed URLs

Base address:

`https://YOUR-SITE.vercel.app/stock/index.html?key=YOUR_WIDGET_KEY&w=`

| Add this at the end | Widget | Height |
|---|---|---|
| `shelf` | The shelf — one category at a time, each item has Need restocking | 420 |
| `restock` | Restocking area — what you ticked as needed, one press to clear | 380 |
| `cost` | Monthly run rate — what the shelf costs a month, by category | 300 |
| `add` | New stock item (form) | 620 |
| `all` | Everything as separate cards (for testing) | tall |

Combine with commas, for example `w=shelf,restock`. Add `&bg=transparent` or `&bg=HEX` to change the page background. Old `w=due` links still open the restocking area.

## What each widget does

- **shelf**: the categories you actually have items in, as chips. Pick one and only that category's items are listed, each with its cadence and when it is next due, plus a **Need restocking** button that ticks the Notion *Needed* box. Press it again to untick.
- **restock**: the same category chips. Pick a category and the items you ticked as needed appear there with a **Restocked!** button — pressing it sets *Last Restocked* to today and clears *Needed*, so the item leaves the list.
- **cost**: the monthly run rate. One restock's price spread across its cadence: ₹600 of eggs monthly is ₹600/month, ₹100 of fruit every 3 days is about ₹1,000/month.
- **add**: name, category (or type a brand-new one — Notion creates the option), pack, cadence, cost, note.

## Setup (3 steps)

1. Copy the files in, commit, push. Vercel deploys by itself.
2. Share the **My Stock & Resources** page with your integration (`...` → Connections). The Stock database lives inside it.
3. Open `/api/stock-health?key=YOUR_WIDGET_KEY` — it should say "Everything looks good".

No new environment variables. Optional override if you ever move the database: `DB_STOCK`.

## Rate limits

Reads up to 500 items. Blank rows are ignored. Widgets refresh every minute, on hover, and when you come back to the tab; embeds on one page stay in step through a broadcast channel.
