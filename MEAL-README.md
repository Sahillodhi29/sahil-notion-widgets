# Meal Planner: five meals of the day

The Meals page in Notion and the widgets in `/meal` share one plan. Nothing is hard-coded:
meals and foods live in Notion, so the widgets follow whatever the plan says today.

## The three databases (all on the Meals page)

| Database | What it holds | Properties the widgets use |
| --- | --- | --- |
| **Meals** | One row per meal of the day | `Name`, `Order`, `Active`, `Purpose`, `Time` |
| **Foods** | One row per food, related to its meal | `Name`, `Meal`, `Order`, `Active`, `Optional`, `Quantity`, `Note` |
| **Daily Log** | One row per meal per day | `Name`, `Date`, `Meal`, `Planned`, `Eaten` (+ its own `Status` formula) |

How a day works:

- `start-day` writes one Daily Log row per active meal and snapshots the **required** foods into `Planned`.
- Ticking a food adds its name to `Eaten`; the "All" button ticks a whole meal.
- **Optional** foods (dose quantities, "rice if available") can be ticked but are never snapshotted
  into `Planned`, so they never count against you.
- Today reads the **live** plan, so adding or removing a food shows up immediately. Past days read
  their own snapshot, so editing the plan tomorrow never rewrites history.
- Removing a meal or food sets `Active` off. History is kept and the widget can restore it.

## Widgets

`/meal/index.html?key=YOUR_WIDGET_KEY&w=NAME`

| `w=` | Card | What it shows |
| --- | --- | --- |
| `plate` | Today's meals | All five meals, a tick per food, per-meal progress, meal counter, start button |
| `ring` | Today's plate | One arc per required food, grouped by meal, with the day's count |
| `streak` | Streak | Days in a row at 80% or more, best run, last seven days |
| `week` | This week | One bar per day, this Monday to Sunday |
| `heat` | Last five weeks | A 5×7 heatmap of day completion |
| `habits` | Meal by meal | Each meal's track record: full days out of days logged, best first |
| `skipped` | What gets skipped | The foods you leave most often, with the meal they belong to |
| `plan` | The plan | Add, rename, reorder, remove and restore meals and foods |

Combine with commas (`w=ring,plate`) or use `w=all`. Keep `&theme=luffy` or `&theme=classic`
on an embed to pin that widget's theme, exactly as before.

## API

- `GET /api/meal?days=35&key=...` returns `{ today, meals, rows }` (`meals` includes inactive rows;
  widgets filter them).
- `POST /api/meal` needs the `x-widget-key` header and takes one of:
  `toggle-food`, `toggle-meal`, `start-day`, `add-meal`, `update-meal`, `add-food`,
  `update-food`, `move-meal`, `move-food`.

`/api/health?key=...` now checks the three meal databases (property names and types) as well.

## Optional env overrides

`DB_MEALS`, `DB_MEAL_FOODS`, `DB_MEAL_LOG` (defaults are the databases already on the page).
