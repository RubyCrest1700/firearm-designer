# 1911 and 2011, shelved

Patrick pulled the 1911 and 2011 off the site on 2026-10-05 because they are not modular enough for the
builder yet. Everything made for them is kept here so they can come back later:

- `m1911.ts`: the platform definitions (parts, slots, presets, fit checks) that lived at `src/data/m1911.ts`.
- `blueprint-m1911.tsx`: the `m1911()` drawing (1911 and 2011, with the photo-measured Colt Government
  frame) that lived at the end of `src/Blueprint.tsx`.
- `weights.json`: the part weights that were in `data/weights.json`.

To bring them back: move the two source files back, add `m1911` and `m2011` to `PLATFORMS` in
`src/data/index.ts`, route `'1911 Platform'` to `m1911()` in `sceneFor()`, add the ids to `PLATFORM_IDS`
in `worker/src/api.js` and `PLATFORM_NAMES` in `worker/src/share.js`, restore the interface rows in
`scripts/check-presets.ts`, and mention them again in `index.html` and `scripts/og-cards.tsx`.
Reference images from the drawing work are in the project's `drawing-refinement` folder.
