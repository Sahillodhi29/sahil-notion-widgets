# Studio: pictures, colours and themes for every widget

One page (`/studio/`) that restyles the widget pages without editing any file. Embed it once in Notion:

`https://YOUR-SITE.vercel.app/studio/index.html` (no `key` needed: it never reads your Notion data). Give it a tall embed (about 1100px) or open it as a full page.

## What it controls
- **Colours** per page: three roles (Accent, Secondary, Wall) plus six presets. Only hue and saturation move; every light/dark tone, texture and layout stays as designed.
- **Pictures** per card and per theme: upload a file or paste a link, drag to position, scroll or slider to zoom, flip, brightness, back to the original.
- **Active theme** per page (the green dot shows which theme your widgets are showing now).
- **Export / Import**: one JSON file carries your whole look (pictures included) to another device.

## How it works
```
/shared/registry.js   what each page is: folder, themes, cards, default art, sample markup, colour roles
/shared/skin.js       loaded in <head> of every widget page; applies the saved look as CSS variables
/shared/preview.html  the Studio's live preview (a real card header drawn with the page's own CSS)
/studio/              the Studio itself
/tools/tokenize-colours.py   one-off helper used to move a page's CSS colours onto the three roles
```
- Settings: `localStorage["nw-studio-v1"]` (small JSON). Pictures: IndexedDB `nw-studio` (uploads are shrunk to 1600px WebP). Links are stored as the link.
- Every widget follows changes live (storage events + BroadcastChannel). Nothing happens on a page until the Studio has been used.
- Storage is per browser and per origin. Embeds on notion.so share it, so one Studio styles all your pages **on that device**. Another device needs Export/Import until server sync is added.

## The page contract (what makes a page Studio-ready)
1. `<script src="/shared/skin.js" data-page="<id>"></script>` in `<head>`, after `theme.js`.
2. Colours in `style.css` and the theme css are written as `hsl(calc(var(--a-h) + Δ) calc(S% * var(--a-k)) L% / α)` for the roles `a` (accent), `b` (secondary), `w` (wall); defaults are declared on `:root`. `tools/tokenize-colours.py` does this conversion automatically (edit its role table for the new page).
3. Card headers use the `.card > .head::before` rule with the hooks `--plate-art, --plate-pos, --plate-zoom, --plate-flip, --mask-dir, --plate-origin, --plate-bright`.
4. An entry in `shared/registry.js`.

## Limits worth knowing
- Notion image links expire; the Studio says so when it sees one. Upload the file for a permanent picture.
- Some sites block hotlinked pictures; upload instead.
- A Notion page published to the web (notion.site) is a different top-level site, so it does not see the settings made inside Notion.
- Pages not yet in the registry are untouched.

## Next steps
Add the remaining pages (workout, meal, todo, wardrobe, finance, learning, sbi, status, sail), then sync settings through Notion so every device and every buyer's own workspace keeps one look.
