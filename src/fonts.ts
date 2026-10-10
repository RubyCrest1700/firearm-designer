/**
 * The site's fonts, served from this site (public/fonts/, the Latin files Google Fonts serves) so pages don't wait on
 * a second server before showing text. The builder (index.html, see vite.config.ts) and the static pages
 * (src/guides/render.ts) both take FONT_CSS and preload the two fonts the first screen uses.
 *
 * Until a font arrives, text shows in Arial (or Roboto on Android) resized to the same widths and line heights, so
 * lines wrap the same way and nothing moves when the real font swaps in. The figures were measured in Chromium:
 * each size-adjust is the font's width over the stand-in's for the same weight, and the overrides are the font's own
 * ascent and descent divided by that size-adjust.
 */
export const FONT_PRELOADS = ['/fonts/archivo.woff2', '/fonts/archivo-narrow.woff2'];

const FACES = [
  "@font-face{font-family:'Archivo';src:url(/fonts/archivo.woff2) format('woff2');font-weight:400 700;font-display:swap}",
  "@font-face{font-family:'Archivo Narrow';src:url(/fonts/archivo-narrow.woff2) format('woff2');font-weight:500 700;font-display:swap}",
  "@font-face{font-family:'IBM Plex Mono';src:url(/fonts/plex-mono-400.woff2) format('woff2');font-weight:400;font-display:swap}",
  "@font-face{font-family:'IBM Plex Mono';src:url(/fonts/plex-mono-500.woff2) format('woff2');font-weight:500;font-display:swap}",
];

/** Local stand-ins: regular and bold file names on Windows and Mac (Arial), Linux (Liberation Sans) and Android (Roboto). */
const STANDINS = {
  Arial: { 400: "local('Arial'),local('ArialMT'),local('Liberation Sans'),local('LiberationSans')", 700: "local('Arial Bold'),local('Arial-BoldMT'),local('Liberation Sans Bold'),local('LiberationSans-Bold')" },
  Roboto: { 400: "local('Roboto'),local('Roboto-Regular')", 700: "local('Roboto Bold'),local('Roboto-Bold')" },
};
/** Per font and weight: [stand-in file, size-adjust over Arial, over Roboto]. Arial has no 500 or 600, so those use its regular or bold. */
const FALLBACKS: { family: string; ascent: number; descent: number; weights: Record<number, [400 | 700, number, number]> }[] = [
  { family: 'Archivo', ascent: 0.878, descent: 0.21, weights: { 400: [400, 0.975, 0.976], 500: [400, 0.99, 0.982], 600: [700, 0.95, 0.995], 700: [700, 0.981, 1.024] } },
  { family: 'Archivo Narrow', ascent: 1.035, descent: 0.312, weights: { 500: [400, 0.838, 0.832], 600: [700, 0.805, 0.844], 700: [700, 0.82, 0.856] } },
];

const pct = (x: number) => `${+(x * 100).toFixed(1)}%`;
const fallbackFaces = FALLBACKS.flatMap(({ family, ascent, descent, weights }) =>
  Object.entries(weights).flatMap(([weight, [file, arial, roboto]]) =>
    (['Arial', 'Roboto'] as const).map((standin) => {
      const size = standin === 'Arial' ? arial : roboto;
      return `@font-face{font-family:'${family} ${standin}';src:${STANDINS[standin][file]};font-weight:${weight};size-adjust:${pct(size)};ascent-override:${pct(ascent / size)};descent-override:${pct(descent / size)};line-gap-override:0%}`;
    }),
  ),
);

export const FONT_CSS = [...FACES, ...fallbackFaces].join('\n');

/** <head> tags for a page: preloads for the first screen's fonts, then the font faces. */
export const fontTags = (indent = '') =>
  [...FONT_PRELOADS.map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin />`), '<style>', FONT_CSS, '</style>']
    .join('\n')
    .replace(/^/gm, indent);
