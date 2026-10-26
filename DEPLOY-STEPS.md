# Merge 14 API functions into 1 (Vercel Hobby limit is 12)

What changes in your repo
  DELETE   api/finance.js, finance-health.js, health.js, learning.js, learning-health.js, meal.js, sail.js,
           sbi.js, status.js, todo.js, wardrobe.js, wardrobe-health.js, wardrobe-photo.js, workout.js   (all 14 files in /api)
  ADD      api/[endpoint].js          <- the one function (keep the square brackets in the name)
  ADD      lib/handlers/ (14 files)   <- your same handler code, moved here (Vercel does not count this folder)
  KEEP     lib/notion.js, vercel.json, package.json, every widget folder: unchanged

The old files MUST be deleted. If they stay in /api next to the new one, you are still over 12.

Your URLs do not change: /api/workout, /api/meal, /api/status, /api/sail, /api/todo, /api/health, /api/wardrobe, /api/wardrobe-health,
/api/wardrobe-photo, /api/finance, /api/finance-health, /api/learning, /api/learning-health, /api/sbi.

Steps (one commit = one deployment)
  1. Copy api/[endpoint].js and lib/handlers/ into your repo, delete the 14 old files from /api.
  2. git add -A && git commit -m "One API function" && git push
  3. When it finishes, open /api/health?key=YOUR_KEY and /api/wardrobe-health?key=YOUR_KEY: if those answer, the merge works.
  4. Then open Home and a widget or two (the widgets themselves did not change).
  If anything is off, "Redeploy" the previous good deployment from the Vercel dashboard (Deployments > ... > Promote/Redeploy) or git revert.

Adding a new endpoint later (never counts toward the 12)
  1. Put myThing.js in lib/handlers/ (require('../notion') like the others).
  2. Add one line to ROUTES in api/[endpoint].js:   'my-thing': () => require('../lib/handlers/myThing'),
