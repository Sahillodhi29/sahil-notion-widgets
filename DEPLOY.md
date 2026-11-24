Copy into your repo (same folders), then redeploy on Vercel:
  backend/api/[endpoint].js            (adds /api/hair and /api/face)
  backend/lib/tracker.js               (new: shared checklist engine)
  backend/lib/handlers/mustdo.js hair.js face.js sail.js status.js
  mustdo/script.js mustdo/style.css    (sub-lines, groups, weekday items)
  hair/  face/                         (new widget folders)

Item names in Notion (the checkbox property name):
  "07 · Label :: small line under it @opt"
  number = order; ":: text" = small line; @opt = tracked but not in the %; @wed or @sat,sun = only counts on those days.

Databases (already created in your Notion): Best Hair, Best Face. Override ids with DB_HAIR / DB_FACE if you ever move them.
