# AKM and AK-74, shelved

Patrick pulled both AKs off the site on 2026-10-07. Everything made for them is kept here so they can come
back later:

- `ak.ts`: the platform definitions that lived at `src/data/ak.ts`. One factory builds both rifles
  (`make('akm')`, `make('ak74')`), with the `akm-` and `a74-` part id prefixes.
- `blueprint-ak.tsx`: the `ak()` drawing (both rifles, every upgrade part drawn to its own shape, the stocks
  seated on the receiver from Patrick's photos) and its helpers `akRail`, `stadium` and `AK_CHAMBER`, which
  lived in `src/Blueprint.tsx` above the render section.
- `weights.json`: the part weights that were in `data/weights.json`.

To bring them back: move `ak.ts` back to `src/data/`, add `akm` and `ak74` to `PLATFORMS` in
`src/data/index.ts`, paste `blueprint-ak.tsx` back into `src/Blueprint.tsx` above the render section and add
`if (platform.maker === 'AK Platform') return ak(platform, build);` at the top of `sceneFor()`, move the
weights back into `data/weights.json`, add `'akm'` and `'ak74'` to `PLATFORM_IDS` in `worker/src/api.js` and
`akm: 'AKM', ak74: 'AK-74'` to `PLATFORM_NAMES` in `worker/src/share.js`, restore the
`['akm', 'rifle', 'thread', 'muzzle', 'thread']` and `['ak74', 'rifle', 'thread', 'muzzle', 'thread']` rows in
`scripts/check-presets.ts`, and name them again in the `og:description` in `index.html`. Their platform
pages, sitemap entries and starter builds come back on their own. Either rifle can come back alone by
registering just that one.

Saved builds people made for the AKs stay in their browsers (hidden, not deleted), and community builds stay
in the database (hidden from lists and links), so both reappear once the platforms return.
Reference photos from the drawing work are in the project's `drawing-refinement/refs` folder, and the review
sheets in `drawing-refinement/ak-parts`.
