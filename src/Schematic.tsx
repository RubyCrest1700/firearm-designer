import type { Platform } from './types';

/** Visual state of one drawn part. `static` = drawn for context but not a slot on this platform. */
export type RegionState = 'static' | 'empty' | 'ok' | 'warn' | 'error';

interface Region {
  /** Internal parts are drawn with dashed hidden lines, as in a technical drawing. */
  hidden?: boolean;
  /** Where the callout leader lands on the part, and where its number sits. */
  target: [number, number];
  label: [number, number];
  draw: JSX.Element;
}

interface Drawing {
  viewBox: string;
  regions: Record<string, Region>;
  /** Slot id -> region id; several platforms reuse one drawing with different slot names. */
  slotRegion: Record<string, string>;
  /** Lines drawn under everything (not parts). */
  base?: JSX.Element;
}

const TOP_RIFLE = 28;
const BOT_RIFLE = 330;

const rifle: Drawing = {
  viewBox: '20 0 920 356',
  slotRegion: {
    stock: 'stock', buffer: 'buffer', grip: 'grip', lpk: 'lpk', trigger: 'trigger', mag: 'mag', lower: 'lower',
    upper: 'upper', charging: 'charging', bcg: 'bcg', optic: 'optic', gastube: 'gastube', handguard: 'handguard',
    gasblock: 'gasblock', barrel: 'barrel', muzzle: 'muzzle',
  },
  regions: {
    buffer: { target: [235, 140], label: [200, BOT_RIFLE],
      draw: <path d="M180,131 L304,131 L304,149 L180,149 Z" /> },
    stock: { target: [104, 172], label: [96, BOT_RIFLE],
      draw: <path d="M42,126 L168,116 Q186,116 192,124 L192,170 Q190,178 176,180 L72,206 L46,206 Q38,206 38,198 L38,134 Q38,127 42,126 Z M60,140 L150,134" /> },
    grip: { target: [326, 236], label: [314, BOT_RIFLE],
      draw: <path d="M330,182 L370,182 L344,266 Q340,272 330,271 L306,267 Q298,265 300,257 Z M322,205 L352,207 M316,228 L346,230" /> },
    lower: { target: [430, 160], label: [528, BOT_RIFLE],
      draw: <path d="M302,152 L474,152 L474,170 L458,178 L458,214 L396,214 L396,182 L372,182 L330,182 L314,194 L302,192 Z" /> },
    lpk: { target: [342, 166], label: [258, BOT_RIFLE],
      draw: <g><circle cx="342" cy="166" r="6" /><rect x="462" y="160" width="9" height="12" rx="2" /><path d="M392,184 Q402,204 420,206 M368,184 L368,212 Q370,216 376,216 L420,216 Q424,215 426,210" /></g> },
    trigger: { target: [383, 198], label: [380, BOT_RIFLE],
      draw: <path d="M384,182 Q376,196 386,208" strokeWidth="4" /> },
    mag: { target: [440, 262], label: [452, BOT_RIFLE],
      draw: <path d="M399,216 L455,216 L476,290 Q478,298 470,300 L426,306 Q418,307 416,299 Z M408,240 L460,236" /> },
    upper: { target: [482, 132], label: [478, TOP_RIFLE],
      draw: <path d="M294,112 L502,112 L502,152 L302,152 L294,142 Z M300,104 L500,104 L500,112 M330,104 L330,112 M360,104 L360,112 M390,104 L390,112 M420,104 L420,112 M450,104 L450,112 M480,104 L480,112 M392,122 L452,122 L452,142 L392,142 Z" /> },
    charging: { target: [276, 120], label: [248, TOP_RIFLE],
      draw: <path d="M262,114 L296,114 L296,126 L262,126 Q256,126 256,120 Q256,114 262,114 Z" /> },
    bcg: { hidden: true, target: [350, 132], label: [318, TOP_RIFLE],
      draw: <path d="M304,120 L440,120 L440,144 L304,144 Z M440,128 L460,128 L460,138 L440,138" /> },
    optic: { target: [404, 70], label: [400, TOP_RIFLE],
      draw: <path d="M322,64 Q332,62 350,70 L438,70 L478,56 Q484,55 484,62 L484,92 Q484,99 478,98 L438,86 L350,86 Q332,92 322,90 Z M394,70 L394,58 L412,58 L412,70 M356,86 L356,104 L372,104 L372,86 M424,86 L424,104 L440,104 L440,86" /> },
    gastube: { hidden: true, target: [590, 117], label: [562, TOP_RIFLE],
      draw: <path d="M444,117 L706,117" /> },
    handguard: { target: [648, 104], label: [640, TOP_RIFLE],
      draw: <path d="M502,104 L770,104 Q776,104 776,110 L776,148 Q776,154 770,154 L502,154 Z M502,98 L770,98 L770,104 M530,98 L530,104 M560,98 L560,104 M590,98 L590,104 M620,98 L620,104 M650,98 L650,104 M680,98 L680,104 M710,98 L710,104 M740,98 L740,104 M530,124 L560,124 M600,124 L630,124 M670,124 L700,124 M530,136 L560,136 M600,136 L630,136 M670,136 L700,136" /> },
    gasblock: { hidden: true, target: [708, 120], label: [714, TOP_RIFLE],
      draw: <path d="M696,111 L720,111 L720,138 L696,138 Z" /> },
    barrel: { target: [820, 129], label: [806, TOP_RIFLE],
      draw: <g><path d="M776,123 L862,123 L862,135 L776,135" /><path className="hl" d="M460,123 L776,123 M460,135 L776,135" /></g> },
    muzzle: { target: [884, 126], label: [884, TOP_RIFLE],
      draw: <path d="M862,118 L906,118 Q910,118 910,122 L910,136 Q910,140 906,140 L862,140 Z M872,118 L872,124 M882,118 L882,124 M892,118 L892,124" /> },
  },
};

const TOP_PISTOL = 26;
const BOT_PISTOL = 388;

const pistol: Drawing = {
  viewBox: '60 0 520 412',
  slotRegion: {
    frame: 'frame', grip: 'frame', fcg: 'trigger', fcu: 'trigger', slide: 'slide', spk: 'spk',
    barrel: 'barrel', rsa: 'spring', spring: 'spring', sights: 'sights', optic: 'optic', mag: 'mag',
  },
  regions: {
    frame: { target: [168, 262], label: [110, BOT_PISTOL],
      draw: <path d="M118,152 L506,152 L506,180 L360,180 L352,186 Q350,214 330,216 L292,216 Q262,214 254,192 L246,186 L234,192 L216,328 Q214,334 206,334 L128,334 Q120,334 121,326 L130,248 Q118,200 118,152 Z M150,214 L224,216 M146,244 L220,246 M142,274 L216,276" /> },
    trigger: { target: [282, 196], label: [306, BOT_PISTOL],
      draw: <g><path d="M280,182 Q272,198 286,210" strokeWidth="4" /><path className="hl" d="M186,156 L366,156 L366,176 L186,176 Z" /></g> },
    mag: { target: [176, 338], label: [206, BOT_PISTOL],
      draw: <g><path d="M126,334 L216,334 L214,348 Q213,352 208,352 L128,352 Q124,352 124,348 Z" /><path className="hl" d="M152,192 L226,192 L211,330 L138,330 Z" /></g> },
    slide: { target: [430, 92], label: [430, TOP_PISTOL],
      draw: <path d="M124,92 L500,92 Q508,92 508,100 L508,146 Q508,152 500,152 L118,152 L112,144 L112,104 Q112,92 124,92 Z M128,102 L128,140 M136,102 L136,140 M144,102 L144,140 M152,102 L152,140 M232,96 L304,96 L304,108 L232,108 Z" /> },
    spk: { hidden: true, target: [156, 120], label: [112, TOP_PISTOL],
      draw: <path d="M118,114 L222,114 L222,124 L118,124 Z" /> },
    barrel: { hidden: true, target: [350, 120], label: [350, TOP_PISTOL],
      draw: <path d="M226,108 L508,108 L508,128 L226,128 Z" /> },
    spring: { hidden: true, target: [470, 138], label: [508, TOP_PISTOL],
      draw: <path d="M320,134 L330,142 L340,134 L350,142 L360,134 L370,142 L380,134 L390,142 L400,134 L410,142 L420,134 L430,142 L440,134 L450,142 L460,134 L470,142 L480,134 L490,142 L500,134" /> },
    sights: { target: [172, 84], label: [172, TOP_PISTOL],
      draw: <path d="M162,92 L162,80 L184,80 L184,92 M476,92 L478,82 L490,82 L492,92" /> },
    optic: { target: [244, 64], label: [256, TOP_PISTOL],
      draw: <path d="M200,92 L204,66 Q206,58 214,58 L268,58 Q276,58 280,66 L292,92 Z M214,70 L264,70 L272,86 L210,86 Z" /> },
  },
};

const DRAWINGS: Record<string, Drawing> = { Rifle: rifle, Pistol: pistol };

export function Schematic({ platform, states, active, onPick, onHover }: {
  platform: Platform;
  /** Slot id -> state; slots not listed are drawn as empty. */
  states: Record<string, RegionState>;
  active: string | null;
  onPick: (slot: string) => void;
  onHover: (slot: string | null) => void;
}) {
  const d = DRAWINGS[platform.family] ?? rifle;
  const slotByRegion = new Map<string, string>();
  for (const s of platform.slots) {
    const r = d.slotRegion[s.id];
    if (r) slotByRegion.set(r, s.id);
  }
  const numberOf = new Map(platform.slots.map((s, i) => [s.id, i + 1]));

  // Hidden (internal) parts are drawn last so their dashed lines read through the parts around them.
  const order = Object.entries(d.regions).sort(([, a], [, b]) => Number(!!a.hidden) - Number(!!b.hidden));

  return (
    <svg className="schematic" viewBox={d.viewBox} role="group" aria-label={`${platform.name} parts diagram`}>
      {order.map(([rid, r]) => {
        const slotId = slotByRegion.get(rid);
        const state: RegionState = slotId ? states[slotId] ?? 'empty' : 'static';
        const slot = slotId ? platform.slots.find((s) => s.id === slotId) : undefined;
        const cls = ['region', state, r.hidden ? 'hidden-part' : '', slotId && slotId === active ? 'active' : ''].join(' ');
        if (!slot) return <g key={rid} className={cls} aria-hidden="true">{r.draw}</g>;
        return (
          <g
            key={rid}
            className={cls}
            role="button"
            tabIndex={0}
            aria-label={`${numberOf.get(slot.id)}. ${slot.name}`}
            onClick={() => onPick(slot.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(slot.id); } }}
            onMouseEnter={() => onHover(slot.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(slot.id)}
            onBlur={() => onHover(null)}
          >
            {r.draw}
          </g>
        );
      })}
      {order.map(([rid, r]) => {
        const slotId = slotByRegion.get(rid);
        if (!slotId) return null;
        const state = states[slotId] ?? 'empty';
        const [tx, ty] = r.target;
        const [lx, ly] = r.label;
        const dir = ly < ty ? 1 : -1;
        return (
          <g key={'c-' + rid} className={'callout ' + state + (slotId === active ? ' active' : '')} aria-hidden="true">
            <path d={`M${lx},${ly + dir * 13} L${lx},${ly + dir * 26} L${tx},${ty}`} />
            <circle cx={tx} cy={ty} r="2.5" className="tip" />
            <circle cx={lx} cy={ly} r="13" className="bubble" />
            <text x={lx} y={ly} dy="0.36em" textAnchor="middle">{numberOf.get(slotId)}</text>
          </g>
        );
      })}
    </svg>
  );
}
