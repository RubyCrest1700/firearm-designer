import type { Build, Part, Platform } from './types';

/**
 * Awareness warnings: things a builder should know that don't stop the build from working.
 * "caution" is a real downside to choose on purpose; "note" is worth knowing. Each one names the
 * measurement that triggered it and links the source its threshold comes from. Thresholds were
 * reviewed with the owner on 2026-10-03 (see the Build Warnings Proposal doc); lines marked
 * "judgment" have no published cutoff.
 */
export type AwareLevel = 'caution' | 'note';

export interface Aware {
  level: AwareLevel;
  title: string;
  message: string;
  /** The measurement behind it, e.g. '10.3" barrel, carbine gas' */
  basis: string;
  source?: { label: string; url: string };
}

const SRC = {
  flash: { label: 'Rifleshooter barrel-length tests', url: 'https://rifleshooter.com/2015/11/223-remington5-56mm-nato-barrel-length-versus-velocity-short-barrels-6-to-14-inches/' },
  blk: { label: 'Primary Arms on .300 BLK barrel length', url: 'https://blog.primaryarms.com/guide/best-300-blk-barrel-length/' },
  r308: { label: 'Rifleshooter .308 barrel-length test', url: 'https://rifleshooter.com/2016/02/308-winchester-7-62x51mm-nato-short-barrel-length-and-velocity-a-six-inch-308-bolt-gun/' },
  r65: { label: 'Rifleshooter 6.5 Creedmoor test', url: 'https://rifleshooter.com/2016/02/6-5-creedmoor-effect-of-barrel-length-on-velocity-cutting-up-a-creedmoor/' },
  terminal: { label: 'Lucky Gunner velocity tests', url: 'https://www.luckygunner.com/lounge/223-ballistics/' },
  gas: { label: 'Ballistic Advantage on gas lengths', url: 'https://www.ballisticadvantage.com/blog/comparing-ar-gas-system-lengths/' },
  gasBlk: { label: 'Faxon .300 BLK barrels', url: 'https://faxonfirearms.com/300-blackout-barrels/' },
  buffer: { label: 'Primary Arms buffer guide', url: 'https://blog.primaryarms.com/guide/how-to-choose-the-right-ar-15-buffer-weight/' },
  heat: { label: 'RECOIL barrel profile test', url: 'https://www.recoilweb.com/ar-15-barrel-profile-testing-187254.html' },
  sound: { label: 'NHCA position paper on firearm noise', url: 'https://www.hearingconservation.org/assets/docs/NHCA_position_paper_on_firea.pdf' },
  chamber: { label: 'NSSF on .223 vs 5.56', url: 'https://www.nssf.org/articles/223-vs-556-are-they-interchangeable/' },
  blkSafety: { label: '.300 BLK safety notes', url: 'https://en.wikipedia.org/wiki/.300_AAC_Blackout' },
  trigger: { label: 'RECOIL AR trigger guide', url: 'https://www.recoilweb.com/ar15triggerguide-175957.html' },
  comp: { label: 'RECOIL on compensated carry pistols', url: 'https://www.recoilweb.com/compensated-carry-pistols-127670.html' },
} as const;

type Cal = '556' | 'blk' | '308' | '65';
function calOf(barrel?: Part): Cal | undefined {
  const c = String(barrel?.attrs.caliber ?? '');
  if (/5\.56|\.223/.test(c)) return '556';
  if (/300/.test(c)) return 'blk';
  if (/308/.test(c)) return '308';
  if (/6\.5/.test(c)) return '65';
  return undefined;
}
const inch = (n: number) => `${n}"`;
const has = (p: Part | undefined, re: RegExp) => !!p && re.test(`${p.name} ${p.specs.join(' ')}`);
const muzzleKind = (m?: Part) => (m?.attrs.kind as string | undefined) ?? (has(m, /brake/i) ? 'brake' : has(m, /comp/i) ? 'comp' : m ? 'flash' : undefined);
const triggerLb = (t?: Part) => {
  const m = t && t.specs.join(' ').match(/(\d+(?:\.\d+)?)\s*lb/);
  return m ? Number(m[1]) : undefined;
};
const magRounds = (m?: Part) => {
  const r = m && m.specs.join(' ').match(/(\d+)\s*rd/);
  return r ? Number(r[1]) : undefined;
};

function rifle(platform: Platform, b: Build): Aware[] {
  const out: Aware[] = [];
  const { barrel, muzzle, handguard, buffer, trigger, stock } = b;
  const cal = calOf(barrel);
  if (!barrel || !cal) return out;
  const L = barrel.attrs.length as number;
  const gas = String(barrel.attrs.gas ?? '');
  const mk = muzzleKind(muzzle);
  const lenBasis = `${inch(L)} ${barrel.attrs.caliber} barrel`;
  const hiderTip = mk === 'flash' || mk === 'comp' ? '' : ' A flash hider cuts most of the visible flash.';

  // Flash, blast and noise from barrel length.
  if (cal === '556' && L < 11.5)
    out.push({ level: 'caution', title: 'Heavy flash and blast', basis: lenBasis, source: SRC.flash,
      message: `Under 11.5", a lot of powder still burns past the muzzle: big flash, strong concussion, and a sharper report at your ear.${hiderTip}` });
  else if (cal === '556' && L < 14.5)
    out.push({ level: 'note', title: 'More flash and blast', basis: lenBasis, source: SRC.flash,
      message: `Shorter than the 14.5" to 16" most 5.56 ammo is loaded for, so expect more flash and blast.${hiderTip}` });
  if (cal === 'blk' && L < 8)
    out.push({ level: 'note', title: 'More flash and blast', basis: lenBasis, source: SRC.blk,
      message: '.300 BLK is built for short barrels, but under 8" supersonic loads give noticeably more flash and blast.' });
  if ((cal === '308' || cal === '65') && L < 13)
    out.push({ level: 'caution', title: 'Severe flash and blast', basis: lenBasis, source: SRC.r308,
      message: `A full-power rifle round in a barrel this short gives severe flash and concussion, and is much louder at your ear.${hiderTip}` });
  else if ((cal === '308' || cal === '65') && L < 16)
    out.push({ level: 'note', title: 'More flash and blast', basis: lenBasis, source: SRC.r308,
      message: `Shorter than the 16" to 20" these rounds are loaded for, so expect more flash, blast and noise.${hiderTip}` });

  // Velocity and bullet performance.
  if (cal === '556' && L <= 10.5)
    out.push({ level: 'caution', title: 'Common ammo loses effectiveness', basis: lenBasis, source: SRC.terminal,
      message: 'Measured M855 leaves a 10.5" barrel at about 2,650 fps, already under the ~2,700 fps that standard 5.56 bullets need to fragment. Use loads designed for short barrels.' });
  else if (cal === '556' && L < 14.5)
    out.push({ level: 'note', title: 'Shorter effective range', basis: lenBasis, source: SRC.terminal,
      message: 'Lower velocity means standard 5.56 bullets stop fragmenting at a shorter distance than from a 16" barrel.' });
  if (cal === '308' && L < 16)
    out.push({ level: 'note', title: 'Velocity loss', basis: lenBasis, source: SRC.r308,
      message: '.308 loses roughly 60 to 80 fps per inch below about 15".' });
  if (cal === '65' && L < 18)
    out.push({ level: 'note', title: 'Gives up long-range performance', basis: lenBasis, source: SRC.r65,
      message: '6.5 Creedmoor\'s advantage is long range. Measured 120gr loads ran about 2,730 fps at 16" vs 2,850 at 20".' });

  // Gas system vs barrel length.
  const gasBasis = `${inch(L)} barrel, ${gas} gas`;
  const g = (level: AwareLevel, title: string, message: string, src: { label: string; url: string } = SRC.gas) =>
    out.push({ level, title, message, basis: gasBasis, source: src });
  if (cal === 'blk') {
    if (gas === 'midlength' || gas === 'rifle' || (gas === 'carbine' && L < 14))
      g('caution', 'Subsonic ammo may not cycle', '.300 BLK is normally built on pistol-length gas so quiet subsonic ammo runs the action. Longer gas may only run supersonic loads.', SRC.gasBlk);
  } else if (cal === '556') {
    if (gas === 'pistol' && L >= 11.5) g('caution', 'Overgassed', 'Pistol gas on a barrel this long runs hard: harsher recoil and more wear. Carbine gas is standard from 10.5".');
    else if (gas === 'pistol' && L >= 9.5) g('note', 'Slightly overgassed', 'Most makers switch to carbine gas at 10.5". Pistol gas here may run a little hard.');
    if (gas === 'carbine' && L >= 18) g('caution', 'Heavily overgassed', 'Carbine gas on an 18" or longer barrel gives harsh recoil and extra wear. Midlength or rifle gas is the usual choice.');
    else if (gas === 'carbine' && L >= 16) g('note', 'Runs overgassed', 'Common and reliable (the Colt 6920 is built this way), but midlength gas is smoother on a 16" barrel.');
  } else if (gas === 'carbine' && L >= 16) g('note', 'Runs overgassed', 'Carbine gas on a 16" or longer .308 barrel runs harder than midlength.');
  if (cal !== 'blk' && gas === 'midlength' && L < 14) g('note', 'Short dwell time', 'Midlength gas on a short barrel can be less reliable with weak ammo.');
  if (cal !== 'blk' && gas === 'rifle' && L < 18) g('caution', 'May not cycle reliably', 'Rifle-length gas on a barrel under 18" leaves little dwell time.');

  // Buffer.
  if (platform.id === 'ar15' && cal === '556' && L <= 11.5 && gas === 'carbine' && buffer && !has(buffer, /H2|H3/))
    out.push({ level: 'note', title: 'Consider a heavier buffer', basis: `${inch(L)} barrel, carbine gas, ${buffer.specs.find((s) => /buffer/i.test(s)) ?? 'standard buffer'}`, source: SRC.buffer,
      message: 'Short carbine-gas barrels run hard. An H2 buffer slows the bolt and smooths recoil.' });

  // Heat.
  if (has(barrel, /pencil|light profile|lightweight/i))
    out.push({ level: 'note', title: 'Heats up faster', basis: 'Lightweight barrel profile', source: SRC.heat,
      message: 'Thin barrels warm a little faster in long strings. A 30-round test found about 25 °F vs 18 °F for a standard profile, with no worse shift in point of impact.' });
  if (L <= 11.5 && handguard && handguard.attrs.freeFloat === false)
    out.push({ level: 'note', title: 'Hot handguard', basis: `${inch(L)} barrel, drop-in handguard`,
      message: 'Short barrels put a lot of heat into a drop-in handguard. Check that it has heat shields, or use a free-float rail. (Our judgment, not a published cutoff.)' });

  // Sound from the muzzle device.
  if (mk === 'brake')
    out.push({ level: 'caution', title: 'Much louder beside you', basis: `${muzzle!.brand} ${muzzle!.name}`, source: SRC.sound,
      message: 'Muzzle brakes push blast sideways and back. Much louder for you and anyone next to you, and unwelcome at many indoor ranges.' });
  else if (mk === 'comp')
    out.push({ level: 'note', title: 'More side blast', basis: `${muzzle!.brand} ${muzzle!.name}`, source: SRC.sound,
      message: 'A compensator sends more blast to the sides than a plain flash hider.' });

  // Ammo and chamber.
  if (/\.223 Rem/.test(String(barrel.attrs.caliber)))
    out.push({ level: 'caution', title: 'Don\'t fire 5.56 ammo', basis: '.223 Remington chamber', source: SRC.chamber,
      message: '5.56 ammo runs higher pressure than a .223 Rem chamber is made for. Use .223 Rem ammo only.' });
  if (cal === 'blk')
    out.push({ level: 'caution', title: 'Keep .300 BLK ammo separate', basis: '.300 BLK on a 5.56-size magazine', source: SRC.blkSafety,
      message: '.300 BLK uses standard 5.56 magazines. A .300 BLK round fired in a 5.56 rifle can destroy it, so mark your magazines.' });

  // Trigger.
  const lb = triggerLb(trigger);
  if (lb !== undefined && lb < 3.5)
    out.push({ level: 'note', title: 'Light trigger', basis: `${lb} lb pull`, source: SRC.trigger,
      message: 'Great for precision, but light for a defensive rifle. Mil-spec triggers run 5.5 to 9.5 lb. (The 3.5 lb line is our judgment.)' });

  // Legal reminders.
  if (platform.id === 'ar10' && L < 16 && stock)
    out.push({ level: 'caution', title: 'Short-barreled rifle', basis: `${inch(L)} barrel with a stock`,
      message: 'A rifle barrel under 16" with a stock is a short-barreled rifle under the NFA. It must be registered and approved before assembly.' });
  if (mk)
    out.push({ level: 'note', title: 'Check your state', basis: 'Muzzle device on a semi-auto rifle',
      message: 'Some states restrict flash hiders and other muzzle devices on semi-auto rifles. Check current law where you live.' });
  return out;
}

function pistol(b: Build): Aware[] {
  const out: Aware[] = [];
  const { barrel, slide, muzzle, mag } = b;
  if (slide?.attrs.comp || muzzleKind(muzzle) === 'comp')
    out.push({ level: 'note', title: 'Compensator tradeoffs', basis: slide?.attrs.comp ? `${slide.name}` : `${muzzle!.brand} ${muzzle!.name}`, source: SRC.comp,
      message: 'Less muzzle rise, but very visible flash in low light, gas toward your face if you fire from close retention, and possible ammo sensitivity.' });
  const { optic } = b;
  const extras = [optic ? 'optic' : '', slide?.attrs.comp ? 'built-in compensator' : muzzle ? 'muzzle device' : barrel?.attrs.threaded ? 'threaded barrel' : ''].filter(Boolean);
  if (extras.length && !b.holster)
    out.push({ level: 'note', title: 'Holster fit', basis: extras.join(', '),
      message: 'Holsters are molded for a specific slide length, optic and muzzle. Choose one listed for this exact setup, or one that is cut for an optic and open at the muzzle. You can add one under Add-ons.' });
  const rounds = magRounds(mag);
  if (barrel?.attrs.threaded || (rounds !== undefined && rounds > 10))
    out.push({ level: 'note', title: 'Check your state', basis: [barrel?.attrs.threaded ? 'Threaded barrel' : '', rounds && rounds > 10 ? `${rounds}-round magazine` : ''].filter(Boolean).join(', '),
      message: 'Some states restrict threaded pistol barrels or magazines over 10 rounds. Check current law where you live.' });
  return out;
}

export function awarenessFor(platform: Platform, b: Build): Aware[] {
  const list = platform.family === 'Rifle' ? rifle(platform, b) : pistol(b);
  return list.sort((x, y) => (x.level === y.level ? 0 : x.level === 'caution' ? -1 : 1));
}
