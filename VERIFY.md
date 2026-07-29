# VERIFY — manual checklist

Things a human should eyeball that automation can't fully prove. Machine-side
verification already run for every stage lives in `captures/report.json`
(regenerate any time with `pnpm smoke`).

## Stage 2 — pet on screen

```sh
pnpm start
```

- [ ] Pip appears bottom-right, transparent background, above other windows,
      **without stealing focus** from the app you're typing in.
- [ ] Animations look alive (the smoke test proves frames advance; judge the
      *feel*): idle bobs and blinks (~5.5 s loop), working spins the gear,
      alarm flashes red and shakes. `captures/*.png` has one still per state.
- [ ] `alarm` reads as "stop and look" vs `failed`'s "that didn't work"
      (red + flashing + warning sign vs gray + X-eyes + rain cloud).
- [ ] Drag the pet somewhere else; quit (🐾 menu-bar icon → Quit) and
      relaunch: it remembers the position (per monitor, if you have several).
- [ ] Click-through: when the cursor is *not* over the pet, clicks land on
      whatever is underneath the transparent window. Over the pet, a click
      makes it wave; right-click opens a menu.
- [ ] The 🐾 tray icon shows and Quit works.
