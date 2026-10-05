/**
 * Guide pages: static, crawlable answers to common "will this fit?" questions, built from the same
 * catalog and fit rules as the builder (see render.ts). The prose here is written by hand; every fit
 * chart and price on the page is generated from src/data at build time.
 */

import type { Part } from '../types';

/** Every part in slot `a`, checked against every part in slot `b` on the guide's platform. */
export interface PairChart {
  /** Rows: parts in this slot. */
  a: string;
  /** Checked against every part in this slot. */
  b: string;
  heading: string;
  intro: string;
  /**
   * Show a table instead of lists, with one column per label. Parts in slot `b` that share a label share a
   * column, and the build fails if they don't fit the same way.
   */
  columns?: (p: Part) => string;
  /** Parts every combination is checked with, e.g. a muzzle device so a rail can be checked against it. */
  with?: string[];
  /** Table only: a few words for a cell's reason, in place of the bare verdict. */
  short?: (reason: string) => string;
  /** Table only: row order. */
  rowOrder?: (p: Part) => number;
}

/** Every part in one slot, checked against several platforms (each with any parts it needs, such as a frame). */
export interface AcrossChart {
  slot: string;
  models: { label: string; platform: string; with?: string[] }[];
  heading: string;
  intro: string;
}

export type FitChart = PairChart | AcrossChart;

export interface Guide {
  slug: string;
  /** <title> and the search result headline. */
  title: string;
  h1: string;
  /** Meta description: one or two sentences, under ~160 characters. */
  description: string;
  /** Platform for the picks, starter builds and pair charts. */
  platform: string;
  /** Breadcrumb label, when the guide covers more than the one platform. */
  crumb?: string;
  /** Opening paragraph. */
  lede: string;
  /** Short answers, shown first. May contain inline HTML. */
  answers: string[];
  charts: FitChart[];
  /** Slots whose recommended parts and prices are listed. */
  picks: string[];
  sources: { label: string; url: string }[];
}

export const GUIDES: Guide[] = [
  {
    slug: 'glock-19-slide-compatibility',
    title: 'Glock 19 Slide Compatibility: Gen3, Gen4 and Gen5 Fit Chart',
    h1: 'Which slides fit a Glock 19 frame?',
    description: 'Will a Gen3 slide fit a Gen4 Glock 19? A fit chart for G19 frames, slides, barrels, recoil springs and trigger parts across Gen3, Gen4 and Gen5.',
    platform: 'glock19',
    lede: 'Glock parts look interchangeable, but the generation of the frame and slide decides what goes together. Here is every frame, slide, barrel and recoil spring in our Glock 19 catalog checked against each other.',
    answers: [
      'A <b>Gen3 slide fits a Gen4 G19 frame</b>. It leaves a small gap at the front of the dust cover and uses the Gen3 single-spring recoil assembly.',
      'A <b>Gen4 slide does not fit a Gen3 G19 or G17 frame</b> without cutting the frame. The G26 is the exception.',
      '<b>Gen5 only goes with Gen5.</b> A Gen5 slide needs a Gen5 frame, and a Gen5 frame needs a Gen5 slide.',
      'The <b>recoil spring goes with the slide</b>, not the frame: Gen3 single spring, Gen4 dual spring, Gen5 its own dual spring.',
      'Barrels and slide parts kits follow the slide: Gen3 and Gen4 parts interchange, Gen5 parts only fit Gen5 slides. Trigger parts follow the frame the same way.',
    ],
    charts: [
      { a: 'frame', b: 'slide', heading: 'Frame and slide', intro: 'Each frame below, checked against every G19 slide we list.' },
      { a: 'slide', b: 'barrel', heading: 'Slide and barrel', intro: 'The barrel has to match the slide generation.' },
      { a: 'slide', b: 'rsa', heading: 'Slide and recoil spring', intro: 'Pick the recoil spring assembly for the slide you are running.' },
      { a: 'frame', b: 'fcg', heading: 'Frame and trigger parts', intro: 'Trigger and frame parts are shared across the G17, G19 and G26, but not across generations.' },
    ],
    picks: ['slide', 'barrel'],
    sources: [
      { label: '3C Tactical: are Gen3 and Gen4 slides compatible?', url: 'https://3crtactical.com/blog/are-glock-gen-3-and-gen-4-slides-compatible/' },
      { label: '3C Tactical: Glock 9mm part compatibility between generations', url: 'https://3crtactical.com/blog/glock-9mm-part-compatibility-between-generations-what-you-need-to-know/' },
      { label: 'Glock: dual recoil spring assembly for the G26 (Gen3 to Gen5)', url: 'https://store.glock.us/recoil-spring-assembly-dual-g26-g27-g33-g39' },
    ],
  },
  {
    slug: 'glock-red-dot-footprints',
    title: 'Glock Red Dot Footprints: Which Optics Fit RMR-Cut and MOS Slides',
    h1: 'Which red dots fit a Glock slide?',
    description: 'RMR, RMSc, Acro or MOS? See which pistol red dots mount directly to each Glock 19 slide, which need an adapter plate, and which sights co-witness.',
    platform: 'glock19',
    lede: 'A pistol red dot bolts into a pocket milled in the slide, and the screw pattern and shape of that pocket is called the footprint. If the optic and the slide cut share a footprint it mounts directly. If not, you need an adapter plate or a different optic.',
    answers: [
      'A <b>slide with no optic cut</b> can\'t take a red dot unless it is milled.',
      'An <b>RMR-cut slide</b> takes RMR-footprint optics directly, such as the Holosun 507C and 407C and the Trijicon RMR and SRO. Other footprints need an adapter plate.',
      'A <b>Glock MOS slide</b> always uses a plate. Glock\'s own MOS plates cover RMR-footprint optics, the Aimpoint Acro needs Aimpoint\'s MOS adapter (about $60), and small RMSc-footprint optics need an aftermarket plate.',
      'With a dot on the slide, <b>suppressor-height sights</b> let you aim through the optic window if the dot fails. Standard-height sights sit below it.',
    ],
    charts: [
      { a: 'slide', b: 'optic', heading: 'Slide cut and optic footprint', intro: 'Every G19 slide we list, checked against every optic. The G17 and G26 slides use the same cuts.' },
      { a: 'optic', b: 'sights', heading: 'Optic and iron sights', intro: 'Whether the irons show through the window.' },
    ],
    picks: ['optic', 'sights'],
    sources: [
      { label: 'Glock: optic mounting and MOS', url: 'https://us.glock.com/en/about/technology/optic-mounting' },
      { label: 'Glock: MOS adapter plate 02', url: 'https://store.glock.us/mos-adapter-plate-02' },
    ],
  },
  {
    slug: 'glock-19-threaded-barrels',
    title: 'Glock 19 Threaded Barrels: 1/2x28 vs M13.5x1 LH and What Fits',
    h1: 'Glock 19 Threaded Barrels: Which Thread, Which Slide, Which Sights',
    description: 'Threaded Glock 19 barrels come in 1/2x28 and M13.5x1 left-hand. See which muzzle devices thread on, which slides take each barrel, and which sights clear a can.',
    platform: 'glock19',
    lede: 'A threaded barrel opens up compensators, thread protectors and suppressors, but the muzzle device has to match the thread exactly, and the barrel still has to match the slide.',
    answers: [
      'A muzzle device must match the barrel thread exactly: diameter, pitch and direction. A <b>1/2x28 device will not go on an M13.5x1 left-hand barrel</b>, or the other way round.',
      'Gen3/4 barrels, threaded or not, <b>don\'t fit a Gen5 slide</b>. Gen5 Marksman barrels only fit Gen5 slides.',
      'The threads stick out past the slide. A <b>thread protector</b> keeps them from getting dinged when nothing else is on.',
      'If you plan to run a suppressor, <b>standard-height sights get blocked</b>. Use suppressor-height sights.',
    ],
    charts: [
      { a: 'barrel', b: 'muzzle', heading: 'Barrel thread and muzzle device', intro: 'Every G19 barrel we list, checked against every muzzle device.' },
      { a: 'barrel', b: 'slide', heading: 'Barrel and slide', intro: 'The barrel has to match the slide generation.' },
      { a: 'barrel', b: 'sights', heading: 'Barrel and sights', intro: 'What a threaded barrel means for your sights.' },
    ],
    picks: ['barrel', 'muzzle'],
    sources: [
      { label: '3C Tactical: Glock 9mm part compatibility between generations', url: 'https://3crtactical.com/blog/glock-9mm-part-compatibility-between-generations-what-you-need-to-know/' },
    ],
  },
  {
    slug: 'glock-43x-48-slide-swap',
    title: 'Glock 43X and 48 Slide Swap: Frames, Barrels, Springs and Optics',
    h1: 'Can you put a Glock 48 slide on a 43X frame?',
    description: 'The Glock 43X and 48 share one frame, so either slide fits. See which barrels, recoil springs and red dots go with each slimline slide.',
    platform: 'glock43x',
    lede: 'The Glock 43X and 48 use the same frame and the same magazines. The 48 just has a longer slide and barrel, so swapping between them is one of the easiest upgrades in the Glock lineup.',
    answers: [
      '<b>Yes.</b> The G43X and G48 share a frame, so a G48 slide fits a G43X frame and a G43X slide fits a G48 frame.',
      'The <b>barrel and recoil spring must match the slide</b>: a G48 slide needs the G48 barrel and G48 spring.',
      'Slimline <b>MOS slides take the Shield RMSc footprint</b>. An RMR is too wide for these slides.',
      'Double-stack Glock trigger parts won\'t fit; use slimline parts.',
    ],
    charts: [
      { a: 'frame', b: 'slide', heading: 'Frame and slide', intro: 'Every slimline frame we list, checked against every slide.' },
      { a: 'slide', b: 'barrel', heading: 'Slide and barrel', intro: 'The barrel length has to match the slide.' },
      { a: 'slide', b: 'rsa', heading: 'Slide and recoil spring', intro: 'So does the recoil spring.' },
      { a: 'slide', b: 'optic', heading: 'Slide and optic', intro: 'Which red dots mount to each slide.' },
    ],
    picks: ['slide', 'optic'],
    sources: [
      { label: 'Safariland: Glock 48 vs 43X slimline shootout', url: 'https://inside.safariland.com/blog/glock-48-vs-43x-slimline-shootout/' },
      { label: 'Active Response Training: shooting the new Glock 48 and 43X', url: 'https://www.activeresponsetraining.net/shooting-the-new-glock-48-and-43x' },
      { label: 'Glock: optic mounting (slimline MOS)', url: 'https://us.glock.com/en/about/technology/optic-mounting' },
    ],
  },
  {
    slug: 'sig-p320-grip-module-compatibility',
    title: 'Sig P320 Grip Module Compatibility: Which Slides Fit Which Grips',
    h1: 'Which slides fit which Sig P320 grip modules?',
    description: 'Full, Carry, Compact or Subcompact? A P320 fit chart for grip modules, slides, barrels, recoil springs and magazines, checked against measured lengths.',
    platform: 'p320',
    lede: 'On a P320 the serialized part is the fire control unit inside the grip, so the grip module, slide and barrel are all swappable. The catch is length: the grip module\'s dust cover can\'t stick out past the slide.',
    answers: [
      'The <b>fire control unit moves between every grip size</b> listed here.',
      'A grip\'s <b>dust cover can\'t be longer than the slide</b>. A Full grip needs a full-size slide; Carry and Compact grips take compact or full-size slides; a Subcompact grip takes any of them.',
      '<b>.45 ACP slides need a .45 ACP grip module</b>, and 9mm slides need a 9mm/.40/.357 module.',
      'The <b>barrel and recoil spring must match the slide</b> in length and caliber.',
      'A <b>shorter magazine sits recessed</b> in a longer grip and is hard to strip out; a longer one sticks out below and adds capacity.',
    ],
    charts: [
      { a: 'grip', b: 'slide', heading: 'Grip module and slide', intro: 'Every grip module we list, checked against every slide assembly.' },
      { a: 'slide', b: 'barrel', heading: 'Slide and barrel', intro: 'Length and caliber both have to match.' },
      { a: 'slide', b: 'spring', heading: 'Slide and recoil spring', intro: 'Each slide length has its own spring.' },
      { a: 'grip', b: 'mag', heading: 'Grip module and magazine', intro: 'How each magazine sits in each grip.' },
    ],
    picks: ['grip', 'slide'],
    sources: [
      { label: 'Sig Sauer: P320 full-size manual safety grip module', url: 'https://www.sigsauer.com/p320-full-size-9-40-357-grip-module-manual-safety-medium-black.html' },
      { label: 'Rifle Configurator: P320 X-Carry red dot fit', url: 'https://www.rifleconfigurator.com/tools/pistol-red-dot-fit-checker/sig-p320-xcarry' },
    ],
  },
  {
    slug: 'sig-p365-slide-grip-compatibility',
    title: 'Sig P365 vs P365XL: Slide, Grip, Barrel and Optic Compatibility',
    h1: 'Mixing P365 and P365XL Slides, Grips and Barrels',
    description: 'Will a P365XL slide fit a standard P365 grip? A fit chart for P365 grips, slides, barrels, recoil springs, magazines and RMSc red dots.',
    platform: 'p365',
    lede: 'The P365 fire control unit fits every P365 grip and slide, so you can mix the standard and XL parts. What has to line up is the barrel and recoil spring for the slide, and the magazine for the grip.',
    answers: [
      'Standard and XL <b>grips and slides mix freely</b>. An XL grip with the short 3.1" slide is the P365X layout.',
      'Each slide takes <b>its own barrel and recoil spring</b>. The Spectre Comp slide is the odd one: it takes the 3.1" barrel with the XL spring, and a threaded barrel won\'t clear its built-in comp.',
      'Optic-ready P365 slides use the <b>RMSc footprint</b>. Other footprints need an adapter plate.',
      'A <b>10-round mag sits up inside the XL grip</b>; the 12 and 15-round mags extend below the standard grip.',
    ],
    charts: [
      { a: 'grip', b: 'slide', heading: 'Grip and slide', intro: 'Every P365 grip we list, checked against every slide assembly.' },
      { a: 'slide', b: 'barrel', heading: 'Slide and barrel', intro: 'The barrel length each slide is built for.' },
      { a: 'slide', b: 'spring', heading: 'Slide and recoil spring', intro: 'The recoil spring each slide takes.' },
      { a: 'slide', b: 'optic', heading: 'Slide and optic', intro: 'Which red dots mount directly.' },
      { a: 'grip', b: 'mag', heading: 'Grip and magazine', intro: 'How each magazine sits in each grip.' },
    ],
    picks: ['slide', 'optic'],
    sources: [
      { label: 'Sig Sauer: P365XL Spectre Comp', url: 'https://www.sigsauer.com/p365xl-spectre-comp-2.html' },
      { label: 'GunMag Warehouse: customizing the P365 with the Spectre Comp slide', url: 'https://gunmagwarehouse.com/blog/customize-your-p365-with-sigs-spectre-comp-slide/' },
      { label: 'Wikipedia: SIG Sauer P365', url: 'https://en.wikipedia.org/wiki/SIG_Sauer_P365' },
    ],
  },
  {
    slug: 'glock-magazine-compatibility',
    title: 'Glock 17, 19 and 26 Magazine Compatibility: Which Mags Fit Which Gun',
    h1: 'Will Glock 17 mags fit a Glock 19 or 26?',
    description: 'Glock 17, 19 and 26 mags interchange from the bottom up. See which magazines fit flush, which stick out, and which are too short for each grip.',
    platform: 'glock19',
    crumb: 'Glock 17, 19 and 26',
    lede: 'The Glock 17, 19 and 26 all take the same double-stack 9mm magazine, just in different lengths. A longer magazine works in a shorter grip; a shorter one goes in a longer grip but sits up inside it.',
    answers: [
      '<b>Yes, G17 mags work in a G19 and a G26.</b> They lock in and feed, and stick out below the grip.',
      '<b>G19 mags work in a G26</b> the same way, and the long 21 and 24-round mags work in all three.',
      'Going the other way is the problem: a <b>shorter magazine sits up inside a longer grip</b>. It locks in, but you can\'t grab it to strip it out.',
      'A sleeve or a grip extension can fill the gap when a longer magazine sticks out.',
    ],
    charts: [
      { slot: 'mag', heading: 'Magazine and pistol', intro: 'Every 9mm Glock magazine we list, checked in the Glock 17, 19 and 26.',
        models: [{ label: 'Glock 17', platform: 'glock17' }, { label: 'Glock 19', platform: 'glock19' }, { label: 'Glock 26', platform: 'glock26' }] },
    ],
    picks: ['mag'],
    sources: [
      { label: '3C Tactical: Glock 9mm part compatibility between generations', url: 'https://3crtactical.com/blog/glock-9mm-part-compatibility-between-generations-what-you-need-to-know/' },
    ],
  },
  {
    slug: 'glock-trigger-upgrade-compatibility',
    title: 'Glock Trigger Upgrades: Which Kits Fit Gen3, Gen4 and Gen5 Frames',
    h1: 'Which trigger kits fit your Glock?',
    description: 'Apex, ZEV or Timney? See which Glock 17, 19 and 26 trigger kits and slide parts kits fit Gen3, Gen4 and Gen5 frames and slides.',
    platform: 'glock19',
    crumb: 'Glock 17, 19 and 26',
    lede: 'A trigger kit replaces the trigger and the parts around it inside the frame, so it has to match the frame generation. The same kits fit the Glock 17, 19 and 26.',
    answers: [
      '<b>Gen3 and Gen4 frames take the same trigger kits</b>, and so do Gen3-pattern aftermarket frames like the Lone Wolf Timberwolf.',
      '<b>Gen5 frames need Gen5 kits.</b> A Gen3/4 trigger kit won\'t fit a Gen5, or the other way round.',
      'One kit fits the <b>G17, G19 and G26</b> of the same generation.',
      'The slide parts kit follows the slide the same way: Gen3/4 parts for Gen3 and Gen4 slides, Gen5 parts for Gen5 slides.',
    ],
    charts: [
      { a: 'frame', b: 'fcg', heading: 'Frame and trigger kit', intro: 'Each Glock 19 frame we list, checked against every trigger and frame parts kit.' },
      { a: 'slide', b: 'spk', heading: 'Slide and slide parts kit', intro: 'Each slide, checked against every slide parts kit.' },
    ],
    picks: ['fcg'],
    sources: [
      { label: '3C Tactical: Glock 9mm part compatibility between generations', url: 'https://3crtactical.com/blog/glock-9mm-part-compatibility-between-generations-what-you-need-to-know/' },
    ],
  },
  {
    slug: 'pistol-weapon-light-compatibility',
    title: 'Pistol Weapon Light Compatibility: Glock, Sig P320 and P365 Rails',
    h1: 'Which weapon lights fit your pistol?',
    description: 'TLR-7A, X300 or TLR-7 Sub? See which pistol lights fit the Glock, Glock 43X/48, Sig P320 and P365 rails, and which holsters carry each light.',
    platform: 'glock19',
    crumb: 'Pistol Lights',
    lede: 'A weapon light clamps to the accessory rail under the barrel, and pistol rails are not all the same. Full-size Glocks and the P320 take the common compact lights; the slim Glocks and the P365 need a light made for their rail.',
    answers: [
      'The <b>Streamlight TLR-7A and SureFire X300</b> fit the Glock 17, 19 and 26 rail and the P320\'s Picatinny rail.',
      'The <b>Glock 43X and 48 only take a light on a Rail frame</b>, and it needs the slimline version of the TLR-7 Sub. The plain frame has no rail.',
      'The <b>P365 and P365XL</b> need the P365 version of the TLR-7 Sub.',
      'A light-bearing holster is molded around one light, so <b>the holster has to match the light</b>, and a pistol with a light won\'t go in a holster made without one.',
    ],
    charts: [
      { slot: 'light', heading: 'Light and pistol', intro: 'Every pistol light we list, checked on each pistol\'s rail.',
        models: [
          { label: 'Glock 17, 19 and 26', platform: 'glock19', with: ['g19-frame-g3'] },
          { label: 'Glock 43X/48 Rail frame', platform: 'glock43x', with: ['gs-frame-43xr'] },
          { label: 'Glock 43X/48 standard frame', platform: 'glock43x', with: ['gs-frame-43x'] },
          { label: 'Sig P320', platform: 'p320', with: ['p-grip-carry'] },
          { label: 'Sig P365 and P365XL', platform: 'p365', with: ['p365-grip-std'] },
        ] },
      { a: 'holster', b: 'light', heading: 'Holster and light', intro: 'Glock 19 holsters we list, checked against each light. Other pistols work the same way.' },
    ],
    picks: ['light', 'holster'],
    sources: [
      { label: 'Glock: optic mounting and accessories', url: 'https://us.glock.com/en/about/technology/optic-mounting' },
    ],
  },
  {
    slug: 'sig-p320-red-dot-compatibility',
    title: 'Sig P320 Red Dot Compatibility: Romeo1Pro Footprint and RMR Plates',
    h1: 'Which red dots fit a Sig P320 slide?',
    description: 'Sig P320 optic-ready slides take the Romeo1Pro footprint. See which red dots mount directly, which need an RMR plate, and which slides have no cut.',
    platform: 'p320',
    lede: 'Sig\'s optic-ready P320 slides are cut for the Romeo1Pro footprint, which is also the DeltaPoint Pro pattern. Optics with that footprint bolt straight on; RMR-pattern optics need a plate.',
    answers: [
      'An <b>optic-ready P320 slide takes Romeo1Pro-footprint optics directly</b>, such as the Romeo1Pro and RomeoX Pro.',
      '<b>RMR-footprint optics</b> like the Holosun 407C and 507C need an RMR adapter plate, about $40.',
      'A <b>slide with no optic cut</b> can\'t take a red dot unless it is milled.',
      'The optic only cares about the slide. <b>The grip module doesn\'t change which red dots fit.</b>',
    ],
    charts: [
      { a: 'slide', b: 'optic', heading: 'Slide and optic', intro: 'Every P320 slide we list, checked against every optic.' },
    ],
    picks: ['optic', 'slide'],
    sources: [
      { label: 'Rifle Configurator: P320 X-Carry red dot fit', url: 'https://www.rifleconfigurator.com/tools/pistol-red-dot-fit-checker/sig-p320-xcarry' },
    ],
  },
  {
    slug: 'ar-15-barrel-compatibility',
    title: 'AR-15 Barrel Compatibility: Gas Block, Gas Tube, Bolt and Muzzle Threads',
    h1: 'What has to match your AR-15 barrel?',
    description: 'Gas journal, gas system length, bolt face and muzzle threads: a fit chart for AR-15 barrels against gas blocks, gas tubes, bolt carriers and muzzle devices.',
    platform: 'ar15',
    lede: 'The barrel sets most of an AR-15 upper: its gas journal decides the gas block, its gas port position decides the gas tube, its caliber decides the bolt, and its threads decide the muzzle device.',
    answers: [
      'The <b>gas block must match the barrel\'s gas journal</b> diameter exactly, such as .625" or .750".',
      'The <b>gas tube must match the gas system length</b>: pistol, carbine, midlength or rifle.',
      'A <b>5.56 bolt</b> runs 5.56 NATO, .223 Wylde and .300 Blackout barrels.',
      'The <b>muzzle device must match the barrel threads</b>, and its bore has to be big enough for the bullet. A 5.56 device on a .30 caliber barrel can thread on and be struck by the bullet.',
      'A <b>free-float handguard needs a low-profile gas block</b>. Drop-in handguards need an A2 front sight base.',
    ],
    charts: [
      { a: 'barrel', b: 'gasblock', heading: 'Barrel and gas block', intro: 'Every barrel we list, checked against every gas block.' },
      { a: 'barrel', b: 'gastube', heading: 'Barrel and gas tube', intro: 'Gas tube length follows the barrel\'s gas system.' },
      { a: 'barrel', b: 'bcg', heading: 'Barrel and bolt carrier group', intro: 'The bolt face has to match the cartridge.' },
      { a: 'barrel', b: 'muzzle', heading: 'Barrel and muzzle device', intro: 'Thread pitch and bore size.' },
      { a: 'gasblock', b: 'handguard', heading: 'Gas block and handguard', intro: 'What fits under each handguard.' },
    ],
    picks: ['barrel', 'gasblock'],
    sources: [
      { label: 'Cheaper Than Dirt: AR-15 gas system identification guide', url: 'https://blog.cheaperthandirt.com/ar-15-gas-system-identification-guide/' },
      { label: 'Wikipedia: 6.5mm Grendel (bolt face)', url: 'https://en.wikipedia.org/wiki/6.5mm_Grendel' },
    ],
  },
  {
    slug: 'ar-15-handguard-length-chart',
    title: 'AR-15 Handguard Length Chart: Which Rail Length for Your Barrel',
    h1: 'AR-15 Handguard Length Chart',
    description: 'Which handguard length fits a 10.3", 11.5", 16", 18" or 20" AR-15 barrel? A chart of every rail we list against barrel length and gas system.',
    platform: 'ar15',
    lede: 'Handguard length is measured from the front of the upper receiver. Pick it by two things on the barrel: how long the barrel is, and where the gas block sits.',
    answers: [
      'A rail <b>shorter than the barrel</b> leaves the muzzle device out front; a rail <b>as long as the barrel or longer</b> covers part of the device, a popular look. Install the device before the rail.',
      'To <b>cover the gas block</b>, the rail has to reach past it: about 4.5" from the receiver on pistol gas, 7.5" on carbine, 9.5" on midlength and 12.5" on rifle gas. A shorter rail works but leaves the block showing.',
      'A common pairing is a <b>16" midlength barrel with a 13" to 15" rail</b>.',
      '<b>Drop-in handguards</b> must match the gas system length and need an A2 front sight base to hold them.',
    ],
    charts: [
      { a: 'handguard', b: 'barrel', heading: 'Handguard and barrel', intro: 'Every handguard we list against each barrel length and gas system. "+2.0\" past" means the rail runs that far past the muzzle, "At muzzle" means it ends right at it, and "Block shows" means the gas block sits outside the rail. All of those fit.',
        columns: (p) => `${p.attrs.length}" ${p.attrs.gas === 'midlength' ? 'mid' : p.attrs.gas}`, with: ['ar-mz-a2'],
        rowOrder: (p) => (p.attrs.freeFloat ? 0 : 100) + Number(p.attrs.length),
        short: (r) => r.match(/runs ([\d.]+)" past/)?.[1].replace(/^/, '+').concat('" past') ?? (r.includes('ends almost') ? 'At muzzle' : r.includes('gas block sits') ? 'Block shows' : r.includes('drop-in') ? 'Wrong length' : 'Note') },
      { a: 'gasblock', b: 'handguard', heading: 'Gas block and handguard', intro: 'What fits under each handguard.' },
    ],
    picks: ['handguard'],
    sources: [
      { label: 'Cheaper Than Dirt: AR-15 gas system identification guide', url: 'https://blog.cheaperthandirt.com/ar-15-gas-system-identification-guide/' },
    ],
  },
  {
    slug: 'ar-15-buffer-tube-stock-compatibility',
    title: 'AR-15 Buffer Tube and Stock Compatibility: Carbine, A5 and Rifle',
    h1: 'Which AR-15 stocks fit which buffer tubes?',
    description: 'Carbine, A5 or rifle buffer tube? See which AR-15 stocks fit each buffer system, and what to check about mil-spec and commercial tube sizes.',
    platform: 'ar15',
    lede: 'The stock slides onto or bolts over the buffer tube, so the tube decides which stocks fit. There are three common tube types: carbine, A5 and rifle.',
    answers: [
      '<b>Collapsible carbine stocks</b> fit carbine tubes, and most also fit the slightly longer A5 tube.',
      '<b>Fixed rifle stocks</b> like the A2 and the Magpul PRS need a rifle-length tube and rifle buffer.',
      'Carbine tubes also come in two diameters: <b>mil-spec (1.148") and commercial (1.168")</b>. Buy a stock made for the diameter of your tube.',
    ],
    charts: [
      { a: 'buffer', b: 'stock', heading: 'Buffer system and stock', intro: 'Every buffer kit we list, checked against every stock.' },
    ],
    picks: ['buffer', 'stock'],
    sources: [
      { label: 'AR15Outfitters: buffer and tube specs', url: 'https://ar15outfitters.com/specs/buffer' },
      { label: 'PB Arms: buffer tube design', url: 'https://pb-arms.com/design/buffer-tube/' },
    ],
  },
  {
    slug: 'ar-10-dpms-vs-armalite',
    title: 'AR-10 vs LR-308: DPMS and Armalite Pattern Parts Compatibility',
    h1: 'Which AR-10 parts fit DPMS and Armalite rifles?',
    description: 'AR-10 parts are not all interchangeable. See which uppers, lowers, handguards, bolt carriers and charging handles fit DPMS and Armalite pattern rifles.',
    platform: 'ar10',
    lede: 'Unlike the AR-15, the .308 AR has no single standard. Most parts follow the DPMS (LR-308) pattern, which itself comes in high and low profile, and Armalite\'s AR-10 is its own pattern.',
    answers: [
      '<b>Pick a pattern first</b> and buy the upper, lower, handguard, bolt carrier and charging handle to match.',
      'The barrel nut threads differ (<b>DPMS 1-7/16"-16, Armalite 1-7/16"-18</b>), so handguards don\'t cross over.',
      '<b>DPMS high and low-profile</b> parts mostly mix, but the handguard\'s top rail may not line up exactly with the receiver.',
      'Lower parts kits differ too: the bolt catch and mag catch are pattern-specific.',
    ],
    charts: [
      { a: 'lower', b: 'upper', heading: 'Lower and upper', intro: 'Every lower we list, checked against every upper.' },
      { a: 'upper', b: 'handguard', heading: 'Upper and handguard', intro: 'The handguard has to match the upper\'s barrel nut.' },
      { a: 'upper', b: 'bcg', heading: 'Upper and bolt carrier group', intro: 'Bolt carriers are pattern-specific.' },
      { a: 'upper', b: 'charging', heading: 'Upper and charging handle', intro: 'So are charging handles.' },
      { a: 'lower', b: 'lpk', heading: 'Lower and lower parts kit', intro: 'The bolt catch and mag catch follow the lower.' },
    ],
    picks: ['upper', 'lower'],
    sources: [
      { label: '308AR: AR-10/.308 AR compatibility reference guide', url: 'https://308ar.com/ar-10-308-ar-compatibility-reference-guide/' },
      { label: 'Gunbuilders: AR-10 vs LR-308 parts guide', url: 'https://www.gunbuilders.com/blog/the-ar10-vs-the-lr308-parts-guide/' },
      { label: 'Wing Tactical: guide to AR-10s and LR-308s', url: 'https://www.wingtactical.com/blog/guide-to-ar10s-and-lr308s/' },
    ],
  },
];
