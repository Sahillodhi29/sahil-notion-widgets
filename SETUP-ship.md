# Ship Navigation: setup

1. Copy the `ship/` folder into your `sahil-notion-widgets` repo (next to `islands/`, which stays untouched) and push. Vercel deploys it.
2. In Notion, type `/embed` and paste: `https://sahil-notion-widgets-wavx.vercel.app/ship/`
3. Make the embed full width. The scene is 1000:609, so about 610px tall at 1000px wide.

## Stickers
Drop PNG, GIF or WEBP files into `ship/assets/` named `workout`, `learning`, `meal`, `wardrobe`, `bank`, `finance`. They appear next to each spot automatically (nothing shows until you add them).

## Options (add to the URL)
- `?time=18:30` preview a time of day
- `?lat=26.2&lon=78.1` sky location (default Gwalior)
- `?zoom=0` skip the push-in animation
- `?workoutLink=URL` send a door elsewhere (also learning, meal, wardrobe, bank, finance)
- `?workout=assets/x.gif` use a different sticker for one door

Spots (hover shows the name): Workout = foremast dome, Finance & Investing = arched doors of the stern cabin, Learning = deck door beside the trees, Meal = thatched pavilion, Wardrobe = stern dome, Bank Officer = door on the stern gallery.
Pages open in a new tab; the ship zooms back out when you return. If the browser blocks the pop-up, an "Open page" button appears.
