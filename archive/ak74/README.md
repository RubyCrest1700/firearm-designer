# AK-74, shelved

Patrick pulled the AK-74 (5.45x39) off the site on 2026-10-07. The AKM stays live. Everything made for the
AK-74 is kept here so it can come back later:

- `ak.ts`: the two-caliber version of `src/data/ak.ts` from when both rifles were live. It builds the AKM and
  the AK-74 from one factory (`make('akm')`, `make('ak74')`); the AK-74's parts use the `a74-` id prefix.
- `weights.json`: the AK-74 part weights that were in `data/weights.json`.

The drawing code was not moved. `ak()` in `src/Blueprint.tsx` draws both rifles and still knows the AK-74's
lightening-groove stock, smooth dust cover and two-chamber brake, because the AKM's AK-103 pattern rifles use
some of them.

To bring it back: replace `src/data/ak.ts` with `ak.ts` here, carrying over any AKM changes made since
(compare against the live file first); add `ak74` to `PLATFORMS` in `src/data/index.ts`; move the
`a74-` entries in `weights.json` back into `data/weights.json`; add `'ak74'` to `PLATFORM_IDS` in
`worker/src/api.js` and `ak74: 'AK-74'` to `PLATFORM_NAMES` in `worker/src/share.js`; restore the
`['ak74', 'rifle', 'thread', 'muzzle', 'thread']` row in `scripts/check-presets.ts`; and name it again in the
`og:description` in `index.html`. Its platform page, sitemap entry and starter builds come back on their own.

Saved builds people made for the AK-74 stay in their browsers (hidden, not deleted), and community builds stay
in the database (hidden from lists and links), so both reappear once the platform returns.
Reference photos from the drawing work are in the project's `drawing-refinement/refs` folder.
