import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PLATFORMS, PRICES_UPDATED_AT } from './data';
import { RETAILERS, buyUrl } from './data/retailers';
import {
  bestOffer, candidateIssues, encodeMount, issuesFor, money, ownedOf, ownsAny, partIds, placementOf, presetSelection, priceRange,
  selectionTokens, singleRetailerCarts, toBuild, withoutOwned, worst, type Owned, type Selection,
} from './engine';
import { findParts, isLink, type Found } from './find';
import { ComparePage, loadCompare, storeCompare, type CompareItem } from './Compare';
import { Blueprint, sceneFor, type RegionState } from './Blueprint';
import { buildStatus, statesFor } from './status';
import {
  FEATURED, TIER_LABEL, buildOf, droppedBuilds, loadSavedBuilds, priceChanges, priceSnapshot, newId, readSharedBuild, selectionFromParts, shareUrl, checkShareLinks, storeSavedBuilds, totalOf,
  type FeaturedBuild, type SavedBuild,
} from './store';
import {
  communityLive, featuredBuilds, listBuilds, myVotes, recordBuyClick, reportBuild, setVote, shareBuild,
  type CommunityBuild, type CommunitySort,
} from './community';
import { awarenessFor, type Aware } from './awareness';
import { buildWeight, formatWeight } from './weight';
import { daysAgo, hasHistory, partSeries, recentChange, totalSeries } from './data/history';
import { PriceChart } from './PriceChart';
import { alertsAvailable, checkAlertSignup, loadAlertSignup, signUpForAlerts, stopAlerts, storeAlertSignup, syncAlertBuilds, type AlertSignup } from './alerts';
import { MOVABLE, SIDE_LABEL, mountsFor, railLength, type Resolved } from './data/addons';
import { GUIDES } from './guides/content';
import { titleCase } from './text';
import type { Build, Issue, Part, Placement, Platform, Severity, Side, Slot, Tier } from './types';

const STORE_KEY = 'firearm-designer:v2';
const SEV_LABEL: Record<Severity, string> = { error: 'Conflict', warn: 'Check', info: 'Note' };
const FAMILIES = ['Rifle', 'Pistol'];
type Route = 'home' | 'build' | 'community' | 'saved' | 'compare';

interface Persisted { platform: string; selections: Record<string, Selection> }

/**
 * The build in progress lives only for this browser tab (sessionStorage), so a reload keeps it but every new
 * visit starts blank. Builds are kept only when the user saves them to My builds.
 */
function loadPersisted(): Persisted | null {
  try {
    localStorage.removeItem(STORE_KEY); // older versions kept the draft forever
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

const routeFromHash = (): Route => {
  const h = location.hash.replace('#', '');
  if (h === 'community' || h === 'featured') return 'community';
  if (h === 'saved' || h === 'build' || h === 'compare') return h;
  return 'home';
};

const DROPS_SEEN_KEY = 'firearm-designer:drops-seen:v1';

const shortDate = (iso: string, year = false) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });

export default function App() {
  const persisted = useMemo(loadPersisted, []);
  const shared = useMemo(readSharedBuild, []);
  const [route, setRoute] = useState<Route>(() => (shared ? 'build' : routeFromHash()));
  const [platformId, setPlatformId] = useState(shared?.platform ?? persisted?.platform ?? PLATFORMS[0].id);
  const [selections, setSelections] = useState<Record<string, Selection>>(() => ({
    ...persisted?.selections,
    ...(shared ? { [shared.platform]: shared.selection } : {}),
  }));
  const [saved, setSaved] = useState<SavedBuild[]>(loadSavedBuilds);
  /** The saved build open in the builder, so Save can update it instead of adding a copy. */
  const [openSavedId, setOpenSavedId] = useState<string | null>(null);
  /** The community build open in the builder, so retailer clicks count toward it. Cleared on any edit. */
  const [communityOpen, setCommunityOpen] = useState<CommunityBuild | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** The two builds on the Compare page, kept for this tab like the build in progress. */
  const [compare, setCompare] = useState<(CompareItem | null)[]>(loadCompare);
  useEffect(() => { storeCompare(compare); }, [compare]);

  useEffect(() => { void checkShareLinks(); }, []);
  useEffect(() => {
    const onHash = () => { setRoute(routeFromHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    if (shared) history.replaceState(null, '', location.pathname + (location.hash || '#build'));
    return () => window.removeEventListener('hashchange', onHash);
  }, [shared]);
  useEffect(() => {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ platform: platformId, selections })); } catch { /* not persisted */ }
  }, [platformId, selections]);
  useEffect(() => { storeSavedBuilds(saved); }, [saved]);
  const dropped = useMemo(() => droppedBuilds(saved), [saved]);
  const [alertsOn, setAlertsOn] = useState(false);
  const [signup, setSignup] = useState<AlertSignup | null>(loadAlertSignup);
  useEffect(() => { storeAlertSignup(signup); }, [signup]);
  useEffect(() => {
    void alertsAvailable().then(setAlertsOn);
    const s = loadAlertSignup();
    if (s) void checkAlertSignup(s).then(setSignup);
  }, []);
  // Keep the emailed list in step with My builds; a signup that was unsubscribed by email is forgotten.
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) { firstSync.current = false; return; }
    if (!signup) return;
    const t = setTimeout(() => { void syncAlertBuilds(signup, saved).then((ok) => { if (!ok) setSignup(null); }); }, 1000);
    return () => clearTimeout(t);
  }, [saved]);
  // Tell a returning visitor once when a saved build gets cheaper; a new drop tells them again.
  useEffect(() => {
    const seen = dropped.map((s) => `${s.id}:${priceChanges(s).drop.toFixed(2)}`).sort().join(',');
    try {
      if (!seen || localStorage.getItem(DROPS_SEEN_KEY) === seen) return;
      localStorage.setItem(DROPS_SEEN_KEY, seen);
    } catch { return; }
    setToast(dropped.length === 1 ? `Price drop: "${dropped[0].name}" costs less than when you saved it. See My Builds.` : `Price drop: ${dropped.length} of your saved builds cost less than when you saved them. See My Builds.`);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // Each page gets its own history entry, so Back returns to the page before (the hashchange listener follows it).
  const go = (r: Route) => {
    const url = r === 'home' ? location.pathname : `#${r}`;
    try { if (r === route) history.replaceState(null, '', url); else history.pushState(null, '', url); } catch { /* sandboxed */ }
    setRoute(r);
    window.scrollTo(0, 0);
  };
  const openInBuilder = (pid: string, sel: Selection, savedId: string | null = null, community: CommunityBuild | null = null) => {
    setPlatformId(pid);
    setSelections((s) => ({ ...s, [pid]: { ...sel } }));
    setOpenSavedId(savedId);
    setCommunityOpen(community);
    go('build');
  };
  const saveCopy = (name: string, pid: string, sel: Selection) => {
    setSaved((list) => [{ id: newId(), name, platform: pid, selection: { ...sel }, savedAt: new Date().toISOString(), prices: priceSnapshot(pid, sel) }, ...list]);
    setToast(`Saved "${name}" to My Builds`);
  };
  const share = async (name: string, note: string) => {
    const sel = selections[platformId] ?? {};
    const b = await shareBuild(platformId, name, note, selectionTokens(withoutOwned(sel)));
    setCommunityOpen(b);
    setToast(`Shared "${b.name}". It's on the Community page now.`);
  };
  const saveBuild = (name: string, asNew: boolean) => {
    const sel = selections[platformId] ?? {};
    const now = new Date().toISOString();
    if (!asNew && openSavedId && saved.some((s) => s.id === openSavedId)) {
      setSaved((list) => list.map((s) => (s.id === openSavedId ? { ...s, name, selection: { ...sel }, savedAt: now, prices: priceSnapshot(platformId, sel, s.prices) } : s)));
    } else {
      const id = newId();
      setSaved((list) => [{ id, name, platform: platformId, selection: { ...sel }, savedAt: now, prices: priceSnapshot(platformId, sel) }, ...list]);
      setOpenSavedId(id);
    }
    setToast(`Saved "${name}" to My Builds`);
  };
  /** Puts a build on the Compare page: the first empty side, or in place of the second build. */
  const addToCompare = (item: CompareItem) => {
    setCompare(([a, b]) => (!a ? [item, b] : !b ? [a, item] : [a, item]));
    go('compare');
  };
  const copyLink = async (pid: string, sel: Selection, communityId?: string) => {
    const url = shareUrl(pid, sel, communityId);
    try {
      await navigator.clipboard.writeText(url);
      setToast('Link copied. Anyone who opens it sees this exact build.');
    } catch {
      setToast(`Copy this link: ${url}`);
    }
  };

  const openSaved = saved.find((s) => s.id === openSavedId && s.platform === platformId) ?? null;

  // Each page names itself in the browser tab, history and bookmarks.
  useEffect(() => {
    const name = PLATFORMS.find((p) => p.id === platformId)?.name ?? '';
    const page = { home: 'Plan Your Build, Check the Fit, Pay Less', build: `Build Your ${name}`, saved: 'My Builds', community: 'Community Builds', compare: 'Compare Builds' }[route];
    document.title = `${page} | Drop-In Builds`;
  }, [route, platformId]);

  return (
    <div className="site">
      <header className="site-header">
        <div className="wrap header-row">
          <a className="brand" href="./" onClick={(e) => { e.preventDefault(); go('home'); }}>
            <Mark />
            <span className="brand-name">Drop-In <b>Builds</b></span>
          </a>
          <nav className="site-nav" aria-label="Main">
            <NavLink active={route === 'home'} onClick={() => go('home')}>Home</NavLink>
            <NavLink active={route === 'build'} onClick={() => go('build')}>Build</NavLink>
            <NavLink active={route === 'saved'} onClick={() => go('saved')}>
              My Builds{saved.length > 0 && <span className="count">{saved.length}</span>}
              {dropped.length > 0 && <span className="count drop" title={`Prices dropped on ${dropped.length} saved build${dropped.length > 1 ? 's' : ''}`}>↓</span>}
            </NavLink>
            <NavLink active={route === 'community'} onClick={() => go('community')}>Community</NavLink>
            <a className="nav-link" href="./guides/">FAQ</a>
          </nav>
          <p className="price-status">
            <span className={'pulse' + (PRICES_UPDATED_AT ? ' live' : '')} aria-hidden="true" />
            {PRICES_UPDATED_AT ? <>Prices checked {shortDate(PRICES_UPDATED_AT, true)}</> : <>Sample prices</>}
          </p>
        </div>
      </header>

      <main className="site-main">
        {route === 'home' && (
          <HomePage
            onPick={(id) => { setPlatformId(id); setOpenSavedId(null); setCommunityOpen(null); go('build'); }}
            onStart={() => go('build')}
            onBrowse={() => go('community')}
          />
        )}
        {route === 'build' && (
          <BuilderPage
            platformId={platformId}
            setPlatformId={(id) => { setPlatformId(id); setOpenSavedId(null); setCommunityOpen(null); }}
            selection={selections[platformId] ?? {}}
            setSelection={(sel) => { setSelections((s) => ({ ...s, [platformId]: sel })); setCommunityOpen(null); }}
            openSaved={openSaved}
            communityOpen={communityOpen?.platform === platformId ? communityOpen : null}
            onSave={saveBuild}
            onShare={share}
            onCopyLink={() => copyLink(platformId, selections[platformId] ?? {}, communityOpen?.platform === platformId ? communityOpen.id : undefined)}
            onBuyClick={() => { if (communityOpen) void recordBuyClick(communityOpen.id); }}
            onBrowseFeatured={() => go('community')}
            onCompare={() => addToCompare({ kind: 'Current Build', name: openSaved?.name ?? communityOpen?.name ?? `Your ${PLATFORMS.find((p) => p.id === platformId)?.name} build`, platform: platformId, selection: { ...(selections[platformId] ?? {}) } })}
          />
        )}
        {route === 'community' && (
          <CommunityPage
            onOpen={(b) => openInBuilder(b.platform, selectionFromParts(b.platform, b.parts), null, b)}
            onOpenStarter={(fb) => openInBuilder(fb.platform.id, fb.selection)}
            onSave={(name, pid, sel) => saveCopy(name, pid, sel)}
            onCopyLink={(b) => copyLink(b.platform, selectionFromParts(b.platform, b.parts), b.id)}
            onCompare={(item) => addToCompare(item)}
            onStart={() => go('build')}
            onToast={setToast}
          />
        )}
        {route === 'saved' && (
          <SavedPage
            saved={saved}
            alerts={alertsOn ? (
              <AlertsPanel signup={signup} hasBuilds={saved.length > 0}
                onSignUp={async (email) => { const s = await signUpForAlerts(email, saved); setSignup(s); }}
                onRefresh={() => { if (signup) void checkAlertSignup(signup).then(setSignup); }}
                onStop={async () => { if (signup) await stopAlerts(signup); setSignup(null); setToast('Price alert emails are off.'); }} />
            ) : null}
            onOpen={(s) => openInBuilder(s.platform, s.selection, s.id)}
            onRename={(id, name) => setSaved((list) => list.map((s) => (s.id === id ? { ...s, name } : s)))}
            onDuplicate={(s) => setSaved((list) => [{ ...s, id: newId(), name: `${s.name} (copy)`, savedAt: new Date().toISOString() }, ...list])}
            onDelete={(id) => { setSaved((list) => list.filter((s) => s.id !== id)); if (id === openSavedId) setOpenSavedId(null); }}
            onCopyLink={(s) => copyLink(s.platform, s.selection)}
            onCompare={(s) => addToCompare({ kind: 'My Builds', name: s.name, platform: s.platform, selection: s.selection })}
            onCompareAll={() => go('compare')}
            onStart={() => go('build')}
            onBrowse={() => go('community')}
          />
        )}
        {route === 'compare' && (
          <ComparePage
            items={compare}
            onSet={(i, item) => setCompare((list) => list.map((x, k) => (k === i ? item : x)))}
            saved={saved}
            current={partIds(selections[platformId] ?? {}).length || ownsAny(selections[platformId] ?? {}) ? { platform: platformId, selection: selections[platformId] ?? {}, name: openSaved?.name } : null}
            onOpen={(item) => openInBuilder(item.platform, item.selection)}
          />
        )}
      </main>

      <footer className="site-footer">
        <div className="wrap footer-row">
          <div>
            <p className="brand-name small">Drop-In <b>Builds</b></p>
            <p>Plan a build part by part, check that everything fits, and see where each part costs least. We don't sell anything.</p>
          </div>
          <div>
            <p className="foot-title">Good to Know</p>
            <p>Prices marked Sample aren't tracked yet. Always confirm the price at the retailer.</p>
            <p>Parts marked FFL are serialized. They are legally the firearm and ship to a licensed dealer. Laws vary by state.</p>
            <p>Some retailer links may earn us a small commission at no extra cost to you. It never changes which parts we show or how we check fit.</p>
          </div>
        </div>
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/** One "Change platform" button next to the builder's title; its panel lists rifles and pistols side by side, grouped by maker. */
function PlatformMenu({ current, onPick }: { current: Platform; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="pmenu" ref={ref}>
      <button className="pmenu-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
        Change Platform
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
      </button>
      {open && (
        <div className="pmenu-panel" role="menu">
          {FAMILIES.map((fam) => {
            const list = PLATFORMS.filter((p) => p.family === fam);
            return (
              <div className="pmenu-col" key={fam}>
                <p className="pmenu-fam">{fam}s</p>
                {[...new Set(list.map((p) => p.maker))].map((m) => (
                  <div className="pmenu-group" key={m}>
                    <p className="pmenu-maker">{m}</p>
                    {list.filter((p) => p.maker === m).map((p) => (
                      <button key={p.id} role="menuitem" className={'pmenu-item' + (p.id === current.id ? ' active' : '')}
                        onClick={() => { onPick(p.id); setOpen(false); }}>
                        <span>{p.name}</span>
                        <span className="pmenu-blurb">{p.blurb}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NavLink({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button className={'nav-link' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined} onClick={onClick}>{children}</button>;
}

function Mark() {
  /* Drop-In Builds header mark (P1): DI monogram inside a hex patch outline. The tab icon (public/favicon.svg) is the solid patch (P2). */
  return (
    <svg className="mark" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3l18.19 10.5v21L24 45 5.81 34.5v-21z" className="hex" />
      <g transform="translate(11.7 10.8) scale(.55)">
        <path d="M4 9h10a15 15 0 0 1 0 30H4z" className="d" />
        <rect x="36" y="9" width="7" height="30" rx="1.5" className="fill" />
      </g>
    </svg>
  );
}

/* ===================================================================== home */

const FAQ_PICKS = ['glock-19-slide-compatibility', 'glock-red-dot-footprints', 'sig-p365-slide-grip-compatibility', 'ar-15-barrel-compatibility'];

function HomePage({ onPick, onStart, onBrowse }: { onPick: (id: string) => void; onStart: () => void; onBrowse: () => void }) {
  const partCount = PLATFORMS.reduce((n, p) => n + p.parts.length, 0);
  const hero = buildOf('ar15', presetSelection(PLATFORMS.find((p) => p.id === 'ar15')!, 'value'));
  const faqs = FAQ_PICKS.map((slug) => GUIDES.find((g) => g.slug === slug)).filter((g): g is (typeof GUIDES)[number] => !!g);
  return (
    <div className="home">
      <section className="hero">
        <div className="wrap hero-row">
          <div className="hero-copy">
            <p className="kicker">Plan It Before You Buy It</p>
            <h1>Build Your Next Rifle or Pistol, Part by Part</h1>
            <p className="lede">Pick a platform, choose every part, and we check that it all fits and show where each part costs least. We don't sell anything.</p>
            <div className="hero-actions">
              <button className="btn primary big" onClick={onStart}>Start a Build</button>
              <button className="btn big" onClick={onBrowse}>Browse Community Builds</button>
            </div>
            <p className="hero-facts">{PLATFORMS.length} platforms · {partCount} parts · {Object.keys(RETAILERS).length} retailers compared</p>
          </div>
          <div className="hero-art thumb" aria-hidden="true">
            <Blueprint platform={hero.platform} build={hero.build} place={hero.place} states={statesFor(hero.platform, hero.build, hero.place).states} compact />
          </div>
        </div>
      </section>

      <div className="wrap">
        <section className="home-section">
          <h2 className="home-h2">Pick a Platform</h2>
          {FAMILIES.map((fam) => (
            <div className="tile-family" key={fam}>
              <p className="tile-fam">{fam}s</p>
              <div className={'tile-grid ' + fam.toLowerCase()}>
                {PLATFORMS.filter((p) => p.family === fam).map((p) => {
                  const starter = buildOf(p.id, presetSelection(p, 'value'));
                  const from = totalOf(p, toBuild(p, presetSelection(p, 'budget')));
                  return (
                    <button className="tile card" key={p.id} onClick={() => onPick(p.id)}>
                      <span className="thumb">
                        <Blueprint platform={p} build={starter.build} place={starter.place} states={statesFor(p, starter.build, starter.place).states} compact />
                      </span>
                      <span className="tile-body">
                        <span className="tile-maker">{p.maker}</span>
                        <span className="tile-name">{p.name}</span>
                        <span className="tile-blurb">{p.blurb}</span>
                        <span className="tile-from">Starter builds from <b>{money(from)}</b></span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="home-section">
          <h2 className="home-h2">How It Works</h2>
          <ol className="steps">
            <li className="card"><b>Pick a Platform</b><span>Start blank, or from a budget, value or premium build that already fits together.</span></li>
            <li className="card"><b>Choose Your Parts</b><span>Every part is checked against the rest of the build. Anything that won't fit, or needs a second look, is flagged before you buy.</span></li>
            <li className="card"><b>Buy at the Best Price</b><span>See each part's price at every retailer we track, save the build, and get an email if a part drops in price.</span></li>
          </ol>
        </section>

        <section className="home-section home-split">
          <div className="card home-panel">
            <h2 className="home-h2">Community Builds</h2>
            <p>See what other builders put together, vote for the best ones, and open any build to make it your own.</p>
            <button className="btn" onClick={onBrowse}>Browse Community Builds</button>
          </div>
          <div className="card home-panel">
            <h2 className="home-h2">Common Questions</h2>
            <ul className="faq-links">
              {faqs.map((g) => <li key={g.slug}><a href={`./guides/${g.slug}/`}>{g.h1}</a></li>)}
            </ul>
            <a className="link" href="./guides/">See All Questions</a>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ================================================================== builder */

function BuilderPage({ platformId, setPlatformId, selection, setSelection, openSaved, communityOpen, onSave, onShare, onCopyLink, onBuyClick, onBrowseFeatured, onCompare }: {
  platformId: string; setPlatformId: (id: string) => void; selection: Selection; setSelection: (s: Selection) => void;
  openSaved: SavedBuild | null; communityOpen: CommunityBuild | null; onSave: (name: string, asNew: boolean) => void;
  onShare: (name: string, note: string) => Promise<void>; onCopyLink: () => void; onBuyClick: () => void; onBrowseFeatured: () => void;
  onCompare: () => void;
}) {
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const platform = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS[0];
  // Zooming in on a phone widens the drawing; start the view on its middle.
  useEffect(() => {
    const el = canvasRef.current;
    if (el) el.scrollLeft = zoom ? (el.scrollWidth - el.clientWidth) / 2 : 0;
  }, [zoom, platformId]);
  const build = toBuild(platform, selection);
  const place = placementOf(selection);
  const { issues, states } = statesFor(platform, build, place);
  const scene = sceneFor(platform, build, place);
  const mounts = platform.family === 'Rifle' ? mountsFor(build, place, railLength(build, platform.id === 'ar10')) : {};
  const setMount = (slot: string, side: Side, at: number) => setSelection({ ...selection, ['@' + slot]: encodeMount(side, at) });
  const owned = ownedOf(selection);
  const status = buildStatus(platform, build, issues, owned.other);
  const total = totalOf(platform, build, owned.owned);
  const ownsSome = owned.owned.size + owned.other.size > 0;
  const chosen = platform.slots.filter((s) => build[s.id] || owned.other.has(s.id)).length;
  const rifle = platform.family === 'Rifle';
  const weight = buildWeight(platform, build);
  const weightTitle = `Unloaded, as built (not counting the case or holster). ${weight.estimated ? `${weight.estimated} of ${weight.counted} part weights are estimates.` : 'All part weights are listed figures.'}`;
  const openSlotObj = platform.slots.find((s) => s.id === openSlot);

  /** Puts a part in its slot; `own` marks it as one the builder already has. */
  const choose = (slot: string, partId: string, own = false) => {
    const next = { ...selection, [slot]: partId };
    if (own) next['+' + slot] = 'own'; else delete next['+' + slot];
    setSelection(next);
    setOpenSlot(null);
  };
  const remove = (slot: string) => { const next = { ...selection }; delete next[slot]; delete next['@' + slot]; delete next['+' + slot]; setSelection(next); };
  const toggleOwn = (slot: string) => {
    const next = { ...selection };
    if (next['+' + slot]) delete next['+' + slot]; else next['+' + slot] = 'own';
    setSelection(next);
  };
  /** Fills a slot with the builder's own part that isn't in our catalog. */
  const ownOther = (slot: string) => {
    const next = { ...selection, ['+' + slot]: 'other' };
    delete next[slot]; delete next['@' + slot];
    setSelection(next);
    setOpenSlot(null);
  };

  return (
    <>
      <div className="wrap builder">
        <div className="builder-head">
          <p className="kicker">{communityOpen ? <>Community Build · {communityOpen.name}</> : openSaved ? <>My Builds · {openSaved.name}</> : <>{platform.family} Build · {platform.maker}</>}</p>
          <div className="title-row">
            <h1>Build Your {platform.name}</h1>
            <PlatformMenu current={platform} onPick={(id) => { setPlatformId(id); setOpenSlot(null); }} />
          </div>
          <p className="lede">{platform.blurb}</p>
        </div>

        <div className="workbench">
          <div className="wb-center">
            <div className="bp-toolbar" role="toolbar" aria-label="Build actions">
              <span className="tb-label">{chosen === 0 ? 'Start From' : 'Start Over From'}</span>
              {(['budget', 'value', 'premium'] as Tier[]).map((t) => (
                <button key={t} className="chip" onClick={() => { setSelection(presetSelection(platform, t)); setOpenSlot(null); }}>
                  {TIER_LABEL[t]} <span className="chip-amt">{money(totalOf(platform, toBuild(platform, presetSelection(platform, t))))}</span>
                </button>
              ))}
              <button className="chip" onClick={onBrowseFeatured}>Community Builds</button>
              <button className="chip chip-own" onClick={() => setFinding(true)}>Parts I Own</button>
              {chosen > 0 && <button className="chip chip-clear" onClick={() => { setSelection({}); setOpenSlot(null); }}>Clear Build</button>}
            </div>
            <figure className="blueprint">
              <div className="bp-strip">
                <span>DWG FD-{platform.id.toUpperCase()} · Side Elevation</span>
                <button className="bp-zoom" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>{zoom ? 'Fit Drawing' : 'Zoom In'}</button>
                <span className="bp-legend" aria-hidden="true">
                  <span className="lg lg-sel">Selected</span>
                  <span className="lg lg-hid">Internal</span>
                  <span className="lg lg-emp">Empty</span>
                  <span className="lg lg-err">Conflict</span>
                </span>
              </div>
              <div className={'bp-canvas' + (zoom ? ' zoomed ' + platform.family.toLowerCase() : '')} ref={canvasRef}>
                <Blueprint platform={platform} build={build} place={place} states={states} active={hover ?? openSlot} onPick={setOpenSlot} onHover={setHover}
                  onMove={(slot, at) => setMount(slot, mounts[slot]?.side ?? MOVABLE[slot].side, at)} />
              </div>
              <figcaption className="title-block">
                <div><span>Platform</span><b>{platform.name}</b></div>
                <div><span>Spec</span><b>{scene.spec}</b></div>
                <div><span>Parts</span><b>{chosen} of {platform.slots.length}</b></div>
                <div><span>Status</span><b className={'tb-' + status.cls}>{status.text}</b></div>
                <div><span>Weight</span><b title={weightTitle}>{chosen ? `${weight.estimated ? '≈ ' : ''}${formatWeight(weight.oz, rifle)}` : '—'}</b></div>
                <div><span>{ownsSome ? 'To Buy' : 'Total'}</span><b>{money(total)}</b></div>
              </figcaption>
            </figure>
            <p className="hint">{zoom ? 'Zoomed in. Swipe the drawing sideways to see the rest, or tap a part to change it. ' : ''}{chosen === 0 ? 'Blank build. Pick parts from the list or click any part on the drawing, or start from a ready-made build above.' : Object.keys(mounts).length ? 'Select any part to change it. Drag a light, laser or grip along the rail to move it; pick its side in the parts list. Parts on the left side show as dashed lines.' : 'Select any part on the drawing or in the list to change it. The drawing updates with every part you choose.'}</p>
          </div>
          <PartsList platform={platform} build={build} issues={issues} states={states} hover={hover} onHover={setHover} onOpen={setOpenSlot} onRemove={remove}
            mounts={mounts} onMount={setMount} owned={owned} onToggleOwn={toggleOwn} />
          <Summary
            platform={platform} build={build} issues={issues} aware={awarenessFor(platform, build)} states={states} status={status} total={total}
            owned={owned} openSaved={openSaved} onSave={onSave} onShare={onShare} onCopyLink={onCopyLink} onOpen={setOpenSlot} onCompare={onCompare}
            onFindOwned={() => setFinding(true)}
          />
        </div>
      </div>

      <Dock total={total} status={status} toBuy={ownsSome} />

      {openSlotObj && (
        <Picker
          key={platform.id + openSlotObj.id}
          platform={platform}
          slot={openSlotObj}
          number={platform.slots.indexOf(openSlotObj) + 1}
          build={build}
          place={place}
          selectedId={build[openSlotObj.id]?.id}
          ownsSelected={owned.owned.has(openSlotObj.id)}
          onChoose={(id, own) => choose(openSlotObj.id, id, own)}
          onToggleOwn={() => toggleOwn(openSlotObj.id)}
          onOwnOther={() => ownOther(openSlotObj.id)}
          onRemove={build[openSlotObj.id] && !openSlotObj.required ? () => { remove(openSlotObj.id); setOpenSlot(null); } : undefined}
          onClose={() => setOpenSlot(null)}
          onBuyClick={onBuyClick}
        />
      )}

      {finding && (
        <OwnedFinder platform={platform} build={build} owned={owned}
          onOwn={(part) => choose(part.slot, part.id, true)}
          onOwnOther={ownOther}
          onSwitch={(id) => { setPlatformId(id); setOpenSlot(null); }}
          onClose={() => setFinding(false)} />
      )}
    </>
  );
}

function groupSlots(slots: Slot[]): [string, Slot[]][] {
  const m = new Map<string, Slot[]>();
  for (const s of slots) m.set(s.group, [...(m.get(s.group) ?? []), s]);
  return [...m.entries()];
}

function FitTag({ state }: { state: RegionState }) {
  const text = { empty: 'Empty', ok: 'Fits', warn: 'Check', error: 'Conflict' }[state];
  return <span className={'fit-tag ' + state}>{text}</span>;
}

function PartsList({ platform, build, issues, states, hover, onHover, onOpen, onRemove, mounts, onMount, owned, onToggleOwn }: {
  platform: Platform; build: Build; issues: Issue[]; states: Record<string, RegionState>; hover: string | null;
  onHover: (s: string | null) => void; onOpen: (s: string) => void; onRemove: (s: string) => void;
  mounts: Record<string, Resolved>; onMount: (slot: string, side: Side, at: number) => void;
  owned: Owned; onToggleOwn: (s: string) => void;
}) {
  return (
    <section className="card parts" aria-label="Parts list">
      <div className="parts-head" aria-hidden="true">
        <span>#</span><span>Component</span><span className="r">Best Price</span><span className="r">Fit</span>
      </div>
      {groupSlots(platform.slots).map(([group, slots]) => (
        <div className="parts-group" key={group}>
          <h2 className="parts-group-title">{group}</h2>
          <ol className="parts-rows">
            {slots.map((slot) => {
              const part = build[slot.id];
              const offer = part && bestOffer(part);
              const own = owned.owned.has(slot.id);
              const other = owned.other.has(slot.id);
              const rowIssues = issues.filter((i) => i.severity === 'info' ? i.slots[0] === slot.id : i.slots.includes(slot.id));
              return (
                <li key={slot.id} className={'part-row ' + (other ? 'other' : states[slot.id]) + (own ? ' owned' : '') + (hover === slot.id ? ' hover' : '')}
                  onMouseEnter={() => onHover(slot.id)} onMouseLeave={() => onHover(null)}>
                  <span className="part-no">{platform.slots.indexOf(slot) + 1}</span>
                  <button className="part-main" onClick={() => onOpen(slot.id)} aria-label={`${slot.name}: ${part ? `${part.brand} ${part.name}. Change` : 'choose a part'}`}>
                    <span className="part-slot">{slot.name}{!slot.required && <span className="opt">Optional</span>}</span>
                    {part ? (
                      <span className="part-name"><span className="brand-dim">{part.brand}</span> {part.name}{part.serialized && <span className="ffl" title="Serialized: ships to an FFL">FFL</span>}</span>
                    ) : other ? (
                      <span className="part-name">Your own {slot.name.toLowerCase()} <span className="brand-dim">(not in our list, so its fit isn't checked)</span></span>
                    ) : (
                      <span className="part-name choose">{slot.required ? `Choose a ${slot.name.toLowerCase()}` : 'Add one'} →</span>
                    )}
                    {rowIssues.map((i, k) => <span key={k} className={'row-issue ' + i.severity}>{i.message}</span>)}
                  </button>
                  <span className="part-price">
                    {other ? <span className="src owned-note">You Own It</span>
                      : own && offer ? <><s className="amt dim">{money(offer.price)}</s><span className="src owned-note">You Own It</span></>
                      : offer ? <><span className="amt">{money(offer.price)}</span><span className="src">{RETAILERS[offer.retailer].name}</span>{part && <ChangeChip part={part} />}</> : <span className="amt dim">—</span>}
                    {part && (
                      <button className={'own-btn' + (own ? ' on' : '')} aria-pressed={own} onClick={() => onToggleOwn(slot.id)}
                        title={own ? "Count this part's price in the total again" : 'Already have this part? It stays in the fit checks but leaves the total.'}>
                        {own ? '✓ Owned' : 'I Own This'}
                      </button>
                    )}
                  </span>
                  <span className="part-fit">
                    {other ? <span className="fit-tag empty">Not Checked</span> : <FitTag state={states[slot.id]} />}
                    {(part || other) && !slot.required && <button className="x" onClick={() => onRemove(slot.id)} aria-label={`Remove ${slot.name}`} title="Remove">×</button>}
                  </span>
                  {mounts[slot.id] && <MountControl slot={slot} m={mounts[slot.id]} onMount={(side, at) => onMount(slot.id, side, at)} />}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}

/** Price move over the last 30 days: green when it fell, amber when it rose. */
function ChangeChip({ part, long }: { part: Part; long?: boolean }) {
  const c = recentChange(part);
  if (!c) return null;
  return (
    <span className={'change-chip ' + (c.by > 0 ? 'down' : 'up')} title={`${money(c.was)} 30 days ago`}>
      {c.by > 0 ? '↓' : '↑'} {money(Math.abs(c.by))}{long && ' this month'}
    </span>
  );
}

function WeightLine({ platform, build }: { platform: Platform; build: Build }) {
  const rifle = platform.family === 'Rifle';
  const w = buildWeight(platform, build);
  const bare = buildWeight(platform, build, true);
  return (
    <p className="weight-line">
      <b>{w.estimated ? 'About ' : ''}{formatWeight(w.oz, rifle)}</b> unloaded{rifle && bare.oz < w.oz ? `, ${formatWeight(bare.oz, rifle)} without optic, magazine and add-ons` : ''}.
      {w.estimated > 0 && <span className="dim"> {w.estimated === w.counted ? 'Part weights are estimates' : `${w.estimated} of ${w.counted} part weights are estimates`} until we confirm the makers' listings.</span>}
    </p>
  );
}

/** Side and rail position for a light, laser or grip. Dragging it on the drawing does the same. */
function MountControl({ slot, m, onMount }: { slot: Slot; m: Resolved; onMount: (side: Side, at: number) => void }) {
  const sides = MOVABLE[slot.id].sides;
  return (
    <div className="mount-ctl">
      {sides.length > 1 && (
        <div className="segctl small" role="radiogroup" aria-label={`${slot.name} side`}>
          {sides.map((sd) => (
            <button key={sd} role="radio" aria-checked={m.side === sd} className={m.side === sd ? 'on' : ''} onClick={() => onMount(sd, m.at)}>{SIDE_LABEL[sd]}</button>
          ))}
        </div>
      )}
      {m.fits && (
        <label className="mount-pos">
          <input type="range" min={m.min} max={m.max} step={m.step} value={m.at} aria-label={`${slot.name} distance from the receiver`}
            onChange={(e) => onMount(m.side, Number(e.target.value))} />
          <span>{m.at.toFixed(1)}" from receiver</span>
        </label>
      )}
    </div>
  );
}

function Summary({ platform, build, issues, aware, states, status, total, owned, openSaved, onSave, onShare, onCopyLink, onOpen, onCompare, onFindOwned }: {
  platform: Platform; build: Build; issues: Issue[]; aware: Aware[]; states: Record<string, RegionState>; status: { cls: string; text: string }; total: number;
  owned: Owned; openSaved: SavedBuild | null; onSave: (name: string, asNew: boolean) => void; onShare: (name: string, note: string) => Promise<void>;
  onCopyLink: () => void; onOpen: (s: string) => void; onCompare: () => void; onFindOwned: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState('');
  const [shareError, setShareError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A part that isn't in our catalog can't go on the Community page, where every part has to be checkable.
  const canShare = status.cls === 'ok' && owned.other.size === 0;
  const all = platform.slots.map((s) => build[s.id]).filter((p): p is Part => !!p);
  const chosen = all.filter((p) => !owned.owned.has(p.slot));
  const ownedParts = all.filter((p) => owned.owned.has(p.slot));
  const ownedCount = ownedParts.length + owned.other.size;
  const ownedWorth = ownedParts.reduce((sum, p) => sum + (bestOffer(p)?.price ?? 0), 0);
  const highest = chosen.reduce((sum, p) => sum + priceRange(p)[1], 0);
  const retailers = new Set(chosen.map((p) => bestOffer(p)?.retailer)).size;
  const carts = singleRetailerCarts(chosen).slice(0, 4);
  const [dollars, cents] = money(total).split('.');

  const startSave = () => { setName(openSaved?.name ?? `My ${platform.name} build`); setSaving(true); };
  const submit = (asNew: boolean) => { if (name.trim()) { onSave(name.trim(), asNew); setSaving(false); } };
  const startShare = () => { setName(openSaved?.name ?? `My ${platform.name} build`); setNote(''); setShareError(null); setSharing(true); setSaving(false); };
  const submitShare = async () => {
    if (name.trim().length < 3) { setShareError('Give the build a name of at least 3 characters.'); return; }
    setBusy(true);
    try { await onShare(name.trim(), note.trim()); setSharing(false); } catch (e) { setShareError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <aside className="summary" id="summary" aria-label="Build summary">
      <section className="card total-card">
        <p className="kicker">{ownedCount ? 'Left to Buy at Best Prices' : 'Build Total at Best Prices'}</p>
        <p className="total"><span>{dollars}</span><small>.{cents}</small></p>
        <p className="total-sub">
          {chosen.length} part{chosen.length === 1 ? '' : 's'}{ownedCount ? ' to buy' : ''} from {retailers} retailer{retailers === 1 ? '' : 's'}
          {highest > total && <> · {money(highest - total)} below the highest prices</>}
        </p>
        {ownedCount > 0 && (
          <p className="owned-line">
            You already own {ownedCount} part{ownedCount === 1 ? '' : 's'}{ownedWorth > 0 && <>, about {money(ownedWorth)} at today's prices</>}. {ownedCount === 1 ? "It's" : "They're"} left out of the total but still checked for fit{owned.other.size ? ', except parts that aren\'t in our list' : ''}.
          </p>
        )}
        {all.length > 0 && <WeightLine platform={platform} build={build} />}
        <div className="segments" aria-hidden="true">
          {platform.slots.map((s) => (
            <button key={s.id} tabIndex={-1} className={'seg ' + states[s.id] + (s.required ? '' : ' optional')} title={s.name} onClick={() => onOpen(s.id)} />
          ))}
        </div>
        <p className={'status ' + status.cls}>{status.text}</p>

        {sharing ? (
          <form className="save-form" onSubmit={(e) => { e.preventDefault(); void submitShare(); }}>
            <label htmlFor="share-name">Build Name</label>
            <input id="share-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
            <label htmlFor="share-note">What's It For? <span className="dim">(optional)</span></label>
            <textarea id="share-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} rows={3} placeholder="Daily carry, competition, home defense…" />
            <p className="form-note">Shared builds are public on the Community page. Just the name, note and parts list are shared.</p>
            {shareError && <p className="form-error" role="alert">{shareError}</p>}
            <div className="save-actions">
              <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Sharing…' : 'Share Build'}</button>
              <button type="button" className="btn ghost" onClick={() => setSharing(false)}>Cancel</button>
            </div>
          </form>
        ) : saving ? (
          <form className="save-form" onSubmit={(e) => { e.preventDefault(); submit(!openSaved); }}>
            <label htmlFor="build-name">Build Name</label>
            <input id="build-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
            <div className="save-actions">
              {openSaved ? (
                <>
                  <button type="submit" className="btn primary">Update Saved Build</button>
                  <button type="button" className="btn" onClick={() => submit(true)}>Save as New</button>
                </>
              ) : <button type="submit" className="btn primary">Save Build</button>}
              <button type="button" className="btn ghost" onClick={() => setSaving(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="total-actions">
            <button className="btn primary" onClick={startSave}>{openSaved ? 'Save Changes' : 'Save Build'}</button>
            <button className="btn" onClick={onCopyLink}>Copy Link</button>
            <button className="btn wide-row" onClick={startShare} disabled={!canShare}
              title={canShare ? 'Post this build to the Community page' : owned.other.size ? 'Choose a listed part for every slot to share it' : 'Finish the build and fix any conflicts to share it'}>
              Share to Community
            </button>
            <button className="btn ghost" onClick={onCompare} disabled={all.length === 0 && owned.other.size === 0}>Compare</button>
            <button className="btn ghost" onClick={onFindOwned}>Parts I Own</button>
          </div>
        )}
      </section>

      {issues.length > 0 && (
        <section className="card">
          <h2 className="card-title">Compatibility</h2>
          <ul className="issues">
            {issues.map((i, n) => (
              <li key={n} className={'issue ' + i.severity}><span className="issue-tag">{SEV_LABEL[i.severity]}</span><span>{i.message}</span></li>
            ))}
          </ul>
        </section>
      )}

      {aware.length > 0 && (
        <section className="card">
          <h2 className="card-title">Heads Up</h2>
          <p className="card-note">Things to know about this build. None of them stop it from working.</p>
          <ul className="issues">
            {aware.map((a, n) => (
              <li key={n} className={'issue aware ' + a.level}>
                <span className="issue-tag">{a.level === 'caution' ? 'Caution' : 'Note'}</span>
                <span>
                  <b>{a.title}.</b> {a.message}
                  <span className="aware-basis">
                    {a.basis}
                    {a.source && <> · <a href={a.source.url} target="_blank" rel="noopener noreferrer">{a.source.label}</a></>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {chosen.length > 0 && <section className="card">
        <h2 className="card-title">Buy It All from One Store</h2>
        <p className="card-note">Fewer shipments can beat a lower parts total. In-stock parts only.</p>
        <table className="carts">
          <tbody>
            {carts.map((c) => (
              <tr key={c.retailer}>
                <td>{RETAILERS[c.retailer].name}</td>
                <td className="num dim">{c.carried} of {chosen.length}</td>
                <td className="num">{money(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>}
    </aside>
  );
}

function Dock({ total, status, toBuy }: { total: number; status: { cls: string; text: string }; toBuy: boolean }) {
  return (
    <div className="dock" role="region" aria-label="Build total">
      <div>
        <div className="dock-total">{money(total)}{toBuy && <small> to buy</small>}</div>
        <p className={'status ' + status.cls}>{status.text}</p>
      </div>
      <button className="btn" onClick={() => document.getElementById('summary')?.scrollIntoView({ behavior: 'smooth' })}>Summary</button>
    </div>
  );
}

/* ------------------------------------------------------------------ picker */

type SortKey = 'fit' | 'price' | 'picks';

function Picker({ platform, slot, number, build, place, selectedId, ownsSelected, onChoose, onToggleOwn, onOwnOther, onRemove, onClose, onBuyClick }: {
  platform: Platform; slot: Slot; number: number; build: Build; place: Placement; selectedId?: string; ownsSelected: boolean;
  onChoose: (id: string, own: boolean) => void; onToggleOwn: () => void; onOwnOther: () => void; onRemove?: () => void; onClose: () => void; onBuyClick: () => void;
}) {
  const [sort, setSort] = useState<SortKey>('fit');
  const [hideConflicts, setHideConflicts] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeFn = useRef(onClose);
  closeFn.current = onClose;
  const rank = { ok: 0, info: 0, warn: 1, error: 2 } as const;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFn.current(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);

  const all = platform.parts.filter((p) => p.slot === slot.id).map((p) => {
    const iss = candidateIssues(platform, build, p, place);
    return { part: p, issues: iss, sev: worst(iss) ?? ('ok' as const), price: bestOffer(p)?.price ?? Infinity };
  });
  const conflicts = all.filter((c) => c.sev === 'error').length;
  const candidates = all
    .filter((c) => !hideConflicts || c.sev !== 'error')
    .sort((a, b) => {
      if (sort === 'price') return a.price - b.price;
      if (sort === 'picks') return Number(!!b.part.pick) - Number(!!a.part.pick) || a.price - b.price;
      return rank[a.sev] - rank[b.sev] || a.price - b.price;
    });

  return (
    <div className="drawer-wrap">
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="picker-title">
        <header className="drawer-head">
          <div>
            <p className="kicker">Item {number} · {platform.name}</p>
            <h2 id="picker-title">{titleCase(slot.name)}</h2>
            <p className="drawer-hint">{slot.hint}</p>
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="drawer-tools">
          <div className="segctl" role="radiogroup" aria-label="Sort by">
            {([['fit', 'Best Fit'], ['price', 'Lowest Price'], ['picks', 'Our Picks']] as [SortKey, string][]).map(([k, label]) => (
              <button key={k} role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{label}</button>
            ))}
          </div>
          {conflicts > 0 && (
            <label className="toggle" htmlFor={`hide-${slot.id}`}>
              <input id={`hide-${slot.id}`} type="checkbox" checked={hideConflicts} onChange={(e) => setHideConflicts(e.target.checked)} />
              <span>Hide {conflicts} that conflict</span>
            </label>
          )}
        </div>
        <ul className="cands">
          {candidates.map((c) => (
            <Candidate key={c.part.id} part={c.part} issues={c.issues} sev={c.sev} selected={c.part.id === selectedId} owned={c.part.id === selectedId && ownsSelected}
              onChoose={(own) => (c.part.id === selectedId ? onToggleOwn() : onChoose(c.part.id, own))} onBuyClick={onBuyClick} />
          ))}
          {candidates.length === 0 && <li className="cand-empty">Every option conflicts with your current build. Turn off the filter to see why.</li>}
        </ul>
        <div className="own-other">
          <p>Already have a {slot.name.toLowerCase()} that isn't listed here?</p>
          <button className="btn" onClick={onOwnOther}>Use My Own {titleCase(slot.name)}</button>
          <p className="dim">It's left out of the total. We can't check its fit, so double-check it with the maker.</p>
        </div>
        {onRemove && <button className="btn ghost wide" onClick={onRemove}>Remove {titleCase(slot.name)} from Build</button>}
      </aside>
    </div>
  );
}

function Candidate({ part, issues, sev, selected, owned, onChoose, onBuyClick }: {
  part: Part; issues: Issue[]; sev: Severity | 'ok'; selected: boolean; owned: boolean; onChoose: (own: boolean) => void; onBuyClick: () => void;
}) {
  const [showPrices, setShowPrices] = useState(false);
  const best = bestOffer(part);
  const [lo, hi] = priceRange(part);
  const fit: RegionState = sev === 'ok' || sev === 'info' ? 'ok' : sev;
  const live = part.offers.some((o) => o.checkedAt);
  return (
    <li className={'cand ' + fit + (selected ? ' selected' : '')}>
      <div className="cand-top">
        <FitTag state={fit} />
        {part.pick && <span className={'pick ' + part.pick.tier}>{TIER_LABEL[part.pick.tier]} Pick</span>}
        {part.serialized && <span className="ffl">FFL</span>}
        {selected && <span className="in-build">{owned ? 'In Your Build · You Own It' : 'In Your Build'}</span>}
      </div>
      <div className="cand-mid">
        <div className="cand-body">
          <h3 className="cand-name"><span className="brand-dim">{part.brand}</span> {part.name}</h3>
          <ul className="specs">{part.specs.map((s) => <li key={s}>{s}</li>)}{part.weight && <li className="spec-weight" title={part.weight.published ? 'Listed weight' : 'Estimated weight'}>{part.weight.published ? '' : '≈ '}{part.weight.oz} oz</li>}</ul>
          {part.pick && <p className="pick-note">{part.pick.note}</p>}
          {issues.map((i, n) => <p key={n} className={'row-issue ' + i.severity}>{i.message}</p>)}
        </div>
        <div className="cand-buy">
          {best && <span className="amt">{money(best.price)}</span>}
          {best && <span className="src">{RETAILERS[best.retailer].name}{live ? '' : ' · sample'}</span>}
          <ChangeChip part={part} long />
          {!selected && <button className="btn primary" onClick={() => onChoose(false)}>Add to Build</button>}
          <button className={'own-btn' + (owned ? ' on' : '')} aria-pressed={owned} onClick={() => onChoose(true)}>{owned ? '✓ Owned' : 'I Own This'}</button>
        </div>
      </div>
      <button className="compare" aria-expanded={showPrices} onClick={() => setShowPrices(!showPrices)}>
        <span>{part.offers.length > 1 ? `Compare ${part.offers.length} Retailers` : 'View Retailer'}</span>
        {hi > lo && <span className="save">Save Up to {money(hi - lo)}</span>}
        <span className="chev" aria-hidden="true">{showPrices ? '−' : '+'}</span>
      </button>
      {showPrices && (
        <div className="offers-wrap">
          {hasHistory(part) && <PriceChart points={partSeries(part, daysAgo(90))} label="Best Price, Last 90 Days" />}
          <table className="offers">
            <thead><tr><th>Retailer</th><th className="num">Price</th><th>Stock</th><th>Checked</th><th /></tr></thead>
            <tbody>
              {[...part.offers].sort((a, b) => a.price - b.price).map((o) => (
                <tr key={o.retailer} className={best && o.retailer === best.retailer ? 'best' : ''}>
                  <td>{RETAILERS[o.retailer].name}</td>
                  <td className="num">{money(o.price)}</td>
                  <td>{o.inStock ? 'In Stock' : <span className="oos">Out</span>}</td>
                  <td className="dim">{o.checkedAt ? `Live ${shortDate(o.checkedAt)}` : 'Sample'}</td>
                  <td className="num"><a href={buyUrl(o, `${part.brand} ${part.name}`)} target="_blank" rel="sponsored noopener" onClick={onBuyClick}>{o.url ? 'View ↗' : 'Search ↗'}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------ parts I own */

/**
 * "Parts I Own": search the catalog by what's on the box or paste a product link, then mark the part as owned.
 * Owned parts stay in the build and its fit checks but leave the total. A part we don't list can still be
 * marked as owned by slot; it fills the slot without a fit check.
 */
function OwnedFinder({ platform, build, owned, onOwn, onOwnOther, onSwitch, onClose }: {
  platform: Platform; build: Build; owned: Owned; onOwn: (p: Part) => void; onOwnOther: (slot: string) => void;
  onSwitch: (platformId: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [otherSlot, setOtherSlot] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const closeFn = useRef(onClose);
  closeFn.current = onClose;
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFn.current(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);
  const { here, elsewhere } = useMemo(() => findParts(query, platform), [query, platform]);
  const shown = here.slice(0, 30);
  const otherPlatforms = [...new Map(elsewhere.map((f) => [f.platform.id, f.platform])).values()];
  const ownedList = platform.slots.filter((s) => owned.owned.has(s.id) || owned.other.has(s.id));
  const searched = query.trim().length > 0;

  return (
    <div className="drawer-wrap">
      <div className="scrim" onClick={onClose} />
      <aside className="drawer finder" role="dialog" aria-modal="true" aria-labelledby="finder-title">
        <header className="drawer-head">
          <div>
            <p className="kicker">{platform.name}</p>
            <h2 id="finder-title">Parts I Own</h2>
            <p className="drawer-hint">Upgrading a gun you already have? Find each part you own and we'll leave it out of the total. It still counts in every fit check.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <label className="finder-search">
          <span className="sr">Search parts</span>
          <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Brand, model, part number, or paste a product link" autoComplete="off" />
        </label>
        <p className="finder-tip">Try "Glock Gen3 slide", "Holosun 507", "Magpul MOE" or paste the link from the store where you bought it.</p>

        {searched ? (
          <ul className="finder-results">
            {shown.map((f) => <FoundRow key={f.part.id} f={f} build={build} owned={owned} onOwn={onOwn} />)}
            {here.length > shown.length && <li className="dim finder-more">{here.length - shown.length} more. Add a word to narrow it down.</li>}
            {here.length === 0 && (
              <li className="finder-empty">
                {isLink(query)
                  ? otherPlatforms.length ? <>That link is for a part we list on another build, not the {platform.name}.</> : <>We don't track that product page yet. Search by the part's name instead, or use "Not in Our List" below.</>
                  : <>No {platform.name} parts match "{query.trim()}".</>}
                {otherPlatforms.length > 0 && (
                  <span className="finder-elsewhere">
                    {isLink(query) ? 'It goes with the ' : 'It matches parts for '}{otherPlatforms.map((p, i) => (
                      <span key={p.id}>{i > 0 && (i === otherPlatforms.length - 1 ? ' and ' : ', ')}<button className="link" onClick={() => onSwitch(p.id)}>{p.name}</button></span>
                    ))}. Switch to that build to mark it.
                  </span>
                )}
              </li>
            )}
          </ul>
        ) : ownedList.length > 0 && (
          <section className="finder-owned">
            <h3 className="card-title">Marked as Owned</h3>
            <ul>
              {ownedList.map((s) => <li key={s.id}><span className="part-slot">{s.name}</span> {build[s.id] ? <><span className="brand-dim">{build[s.id]!.brand}</span> {build[s.id]!.name}</> : 'Your own part (not in our list)'}</li>)}
            </ul>
          </section>
        )}

        <section className="own-other">
          <h3 className="card-title">Not in Our List?</h3>
          <p>Pick the part type and we'll count it as one you own. We can't check its fit, so double-check it with the maker.</p>
          <div className="own-other-row">
            <label className="sr" htmlFor="own-other-slot">Part type</label>
            <select id="own-other-slot" value={otherSlot} onChange={(e) => setOtherSlot(e.target.value)}>
              <option value="">Choose a part type</option>
              {platform.slots.map((s) => <option key={s.id} value={s.id}>{titleCase(s.name)}</option>)}
            </select>
            <button className="btn" disabled={!otherSlot} onClick={() => { onOwnOther(otherSlot); setOtherSlot(''); }}>Mark as Owned</button>
          </div>
        </section>
        <button className="btn primary wide" onClick={onClose}>Done</button>
      </aside>
    </div>
  );
}

function FoundRow({ f, build, owned, onOwn }: { f: Found; build: Build; owned: Owned; onOwn: (p: Part) => void }) {
  const { part, platform } = f;
  const slot = platform.slots.find((s) => s.id === part.slot)!;
  const inBuild = build[part.slot]?.id === part.id;
  const isOwned = inBuild && owned.owned.has(part.slot);
  const replaces = !inBuild && build[part.slot];
  const best = bestOffer(part);
  return (
    <li className={'found' + (isOwned ? ' on' : '')}>
      <div className="found-body">
        <span className="part-slot">{slot.name}{f.byLink && <span className="opt">Exact Match</span>}</span>
        <span className="part-name"><span className="brand-dim">{part.brand}</span> {part.name}</span>
        <span className="found-specs">{part.specs.join(' · ')}{part.mpn ? ` · Part # ${part.mpn}` : ''}</span>
        {replaces && <span className="row-issue">Replaces the {replaces.brand} {replaces.name} in your build.</span>}
      </div>
      <div className="found-act">
        {best && <span className="src">{money(best.price)} new</span>}
        {isOwned ? <span className="own-btn on">✓ Owned</span> : <button className="btn primary" onClick={() => onOwn(part)}>I Own This</button>}
      </div>
    </li>
  );
}

/* ================================================================ cards */

function BuildCard({ platformId, selection, badge, title, meta, body, actions, className }: {
  platformId: string; selection: Selection; badge?: ReactNode; title: ReactNode; meta: ReactNode; body?: ReactNode; actions: ReactNode; className?: string;
}) {
  const { platform, build, place } = buildOf(platformId, selection);
  const { issues, states } = statesFor(platform, build, place);
  const owned = ownedOf(selection);
  const status = buildStatus(platform, build, issues, owned.other);
  const ownsSome = owned.owned.size + owned.other.size > 0;
  return (
    <article className={'build-card card' + (className ? ' ' + className : '')}>
      <div className="thumb">
        <Blueprint platform={platform} build={build} place={place} states={states} compact />
        {badge}
      </div>
      <div className="build-card-body">
        <h3>{title}</h3>
        <p className="meta">{meta}</p>
        {body}
        <div className="build-card-foot">
          <span className="amt big">{money(totalOf(platform, build, owned.owned))}{ownsSome && <small className="to-buy"> to buy</small>}</span>
          <span className={'status small ' + status.cls}>{status.text}</span>
        </div>
        <div className="build-card-actions">{actions}</div>
      </div>
    </article>
  );
}

function topParts(build: Build) {
  return Object.values(build).filter((p): p is Part => !!p)
    .sort((a, b) => (bestOffer(b)?.price ?? 0) - (bestOffer(a)?.price ?? 0)).slice(0, 3);
}

const SORT_LABEL: [CommunitySort, string][] = [['top', 'Top Voted'], ['new', 'Newest'], ['bought', 'Most Bought']];

function CommunityPage({ onOpen, onOpenStarter, onSave, onCopyLink, onCompare, onStart, onToast }: {
  onOpen: (b: CommunityBuild) => void; onOpenStarter: (fb: FeaturedBuild) => void; onCopyLink: (b: CommunityBuild) => void;
  onSave: (name: string, platform: string, sel: Selection) => void; onCompare: (item: CompareItem) => void; onStart: () => void; onToast: (t: string) => void;
}) {
  const [filter, setFilter] = useState<string>('all');
  const [sort, setSort] = useState<CommunitySort>('top');
  const [builds, setBuilds] = useState<CommunityBuild[] | null>(null);
  const [featured, setFeatured] = useState<CommunityBuild[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [votes, setVotes] = useState(myVotes);
  const [confirmReport, setConfirmReport] = useState<string | null>(null);
  const isPlatform = PLATFORMS.some((p) => p.id === filter);
  const matches = (pid: string) => {
    const p = PLATFORMS.find((x) => x.id === pid);
    return !!p && (filter === 'all' || p.family === filter || p.id === filter);
  };

  useEffect(() => {
    let live = true;
    setError(null);
    listBuilds(isPlatform ? filter : null, sort)
      .then((list) => { if (live) setBuilds(list.filter((b) => matches(b.platform))); })
      .catch((e: Error) => { if (live) { setBuilds([]); setError(e.message); } });
    return () => { live = false; };
  }, [filter, sort]);
  useEffect(() => { featuredBuilds().then(setFeatured).catch(() => setFeatured([])); }, []);

  const replace = (b: CommunityBuild | undefined) => {
    if (!b) return;
    setBuilds((list) => list?.map((x) => (x.id === b.id ? b : x)) ?? null);
    setFeatured((list) => list.map((x) => (x.id === b.id ? b : x)));
  };
  const toggleVote = async (b: CommunityBuild) => {
    const on = !votes.has(b.id);
    try { replace(await setVote(b.id, on)); setVotes(myVotes()); } catch (e) { onToast((e as Error).message); }
  };
  const report = async (b: CommunityBuild) => {
    try {
      await reportBuild(b.id);
      setBuilds((list) => list?.filter((x) => x.id !== b.id) ?? null);
      setFeatured((list) => list.filter((x) => x.id !== b.id));
      onToast('Thanks. Builds reported by several people are hidden.');
    } catch (e) { onToast((e as Error).message); }
    setConfirmReport(null);
  };

  const card = (b: CommunityBuild, rank?: number) => {
    const sel = selectionFromParts(b.platform, b.parts);
    const { platform, build } = buildOf(b.platform, sel);
    const voted = votes.has(b.id);
    return (
      <BuildCard
        key={b.id}
        platformId={b.platform}
        selection={sel}
        badge={rank !== undefined ? <span className="tier-badge value">#{rank + 1} This Week</span> : undefined}
        title={b.name}
        meta={<>{platform.name} · {partIds(sel).length} parts · Shared {shortDate(b.createdAt, true)}</>}
        body={<>
          {b.note && <p className="summary-text">{b.note}</p>}
          <ul className="highlights">{topParts(build).map((p) => <li key={p.id}><span className="brand-dim">{p.brand}</span> {p.name}</li>)}</ul>
          <p className="community-stats">
            <span>{b.votes} vote{b.votes === 1 ? '' : 's'}</span>
            <span>{b.clicks} buy click{b.clicks === 1 ? '' : 's'}</span>
          </p>
        </>}
        actions={confirmReport === b.id ? (
          <>
            <span className="confirm">Report this build?</span>
            <button className="btn danger" onClick={() => void report(b)}>Report</button>
            <button className="btn ghost" onClick={() => setConfirmReport(null)}>Cancel</button>
          </>
        ) : (
          <>
            <button className={'btn vote' + (voted ? ' on' : '')} aria-pressed={voted} onClick={() => void toggleVote(b)}>
              ▲ {voted ? 'Voted' : 'Vote'}
            </button>
            <button className="btn primary" onClick={() => onOpen(b)}>Open in Builder</button>
            <button className="btn ghost" onClick={() => onSave(b.name, b.platform, sel)}>Save</button>
            <button className="btn ghost" onClick={() => onCopyLink(b)}>Copy Link</button>
            <button className="btn ghost" onClick={() => onCompare({ kind: 'Community', name: b.name, platform: b.platform, selection: sel })}>Compare</button>
            <button className="btn ghost" onClick={() => setConfirmReport(b.id)}>Report</button>
          </>
        )}
      />
    );
  };

  const starters = FEATURED.filter((fb) => matches(fb.platform.id));
  return (
    <div className="wrap page">
      <div className="page-head">
        <p className="kicker">Community</p>
        <h1>Builds from the Community</h1>
        <p className="lede">Real builds shared by other builders. Vote for the ones you'd run. The best each week, by votes and by how many people click through to buy the parts, get featured at the top.</p>
      </div>
      {!communityLive && (
        <p className="notice">Preview mode: the community service isn't connected yet, so builds you share here are kept in this browser only.</p>
      )}

      {featured.length > 0 && (
        <section className="community-section">
          <h2 className="section-title">Featured This Week</h2>
          <div className="card-grid">{featured.map((b, i) => card(b, i))}</div>
        </section>
      )}

      <section className="community-section">
        <div className="section-head">
          <h2 className="section-title">All Shared Builds</h2>
          <div className="segctl" role="radiogroup" aria-label="Sort by">
            {SORT_LABEL.map(([k, label]) => (
              <button key={k} role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="filters" role="group" aria-label="Filter by platform">
          {[['all', 'All'], ['Rifle', 'Rifles'], ['Pistol', 'Pistols'], ...PLATFORMS.map((p) => [p.id, p.name])].map(([k, label]) => (
            <button key={k} className={'chip' + (filter === k ? ' on' : '')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {builds === null ? <p className="dim">Loading shared builds…</p> : builds.length === 0 ? (
          <div className="empty-state card">
            <h2>No Shared Builds Here Yet</h2>
            <p>Be the first. Put together a complete build, then press Share to Community.</p>
            <div className="build-card-actions"><button className="btn primary" onClick={onStart}>Start a Build</button></div>
          </div>
        ) : <div className="card-grid">{builds.map((b) => card(b))}</div>}
      </section>

      <section className="community-section">
        <h2 className="section-title">Starter Builds</h2>
        <p className="section-note">Our own Budget, Best Value and Premium lists for each platform. Complete, compatible and a good place to begin.</p>
        <div className="card-grid">
          {starters.map((fb) => {
            const { build } = buildOf(fb.platform.id, fb.selection);
            return (
              <BuildCard
                key={fb.id}
                className="starter"
                platformId={fb.platform.id}
                selection={fb.selection}
                badge={<span className={'tier-badge ' + fb.tier}>{TIER_LABEL[fb.tier]}</span>}
                title={fb.name}
                meta={<>{fb.platform.family} · {partIds(fb.selection).length} parts</>}
                body={<>
                  <p className="summary-text">{fb.summary}</p>
                  <ul className="highlights">{topParts(build).map((p) => <li key={p.id}><span className="brand-dim">{p.brand}</span> {p.name}</li>)}</ul>
                </>}
                actions={<>
                  <button className="btn primary" onClick={() => onOpenStarter(fb)}>Open in Builder</button>
                  <button className="btn" onClick={() => onSave(fb.name, fb.platform.id, fb.selection)}>Save</button>
                  <button className="btn ghost" onClick={() => onCompare({ kind: 'Starter Build', name: fb.name, platform: fb.platform.id, selection: fb.selection })}>Compare</button>
                </>}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** Email alerts for every saved build in this browser: sign up, waiting to confirm, or on. */
function AlertsPanel({ signup, hasBuilds, onSignUp, onRefresh, onStop }: {
  signup: AlertSignup | null; hasBuilds: boolean; onSignUp: (email: string) => Promise<void>; onRefresh: () => void; onStop: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!signup || signup.confirmed) return;
    const onFocus = () => onRefresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [signup, onRefresh]);

  if (signup) return (
    <section className="alerts-panel card on">
      <div>
        <h2>{signup.confirmed ? 'Price Alert Emails Are On' : 'Check Your Inbox'}</h2>
        <p>{signup.confirmed
          ? <>We'll email <b>{signup.email}</b> when parts in your saved builds go up or down in price, at most once a day. Builds you save here are added automatically.</>
          : <>We sent a link to <b>{signup.email}</b>. Press it to turn on price alerts.</>}</p>
      </div>
      <button className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); await onStop(); setBusy(false); }}>{signup.confirmed ? 'Turn Off' : 'Cancel'}</button>
    </section>
  );
  return (
    <section className="alerts-panel card">
      <div>
        <h2>Get Price Alerts by Email</h2>
        <p>{hasBuilds ? 'We\'ll email you when parts in your saved builds get cheaper or more expensive.' : 'Save a build, then get an email when its parts get cheaper or more expensive.'} One email a day at most, only when something changed. We only use your address for these alerts.</p>
      </div>
      <form onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        try { await onSignUp(email.trim()); } catch (err) { setError((err as Error).message); }
        setBusy(false);
      }}>
        <label className="sr" htmlFor="alert-email">Email address</label>
        <input id="alert-email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email Me'}</button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </section>
  );
}

/** What the build's parts cost now against when it was saved: the net change and the biggest movers. */
function PriceSinceSaved({ s }: { s: SavedBuild }) {
  const { changes, drop } = priceChanges(s);
  if (!s.prices || !Object.keys(s.prices).length) return null;
  const { build } = buildOf(s.platform, s.selection);
  const chart = <PriceChart points={totalSeries(Object.values(build).filter((p): p is Part => !!p), s.savedAt.slice(0, 10))} label="Build Total Since You Saved It" />;
  if (Math.abs(drop) < 1) return <><p className="since-saved flat">Same price as when you saved it</p>{chart}</>;
  return (
    <div className={'since-saved ' + (drop > 0 ? 'down' : 'up')}>
      {chart}
      <p className="since-total">{drop > 0 ? <>↓ {money(drop)} less than when you saved it</> : <>↑ {money(-drop)} more than when you saved it</>}</p>
      <ul>
        {changes.slice(0, 3).map((c) => (
          <li key={c.part.id}><span>{c.part.brand} {c.part.name}</span><s>{money(c.was)}</s><b>{money(c.now)}</b></li>
        ))}
        {changes.length > 3 && <li className="more">and {changes.length - 3} more</li>}
      </ul>
    </div>
  );
}

function SavedPage({ saved, alerts, onOpen, onRename, onDuplicate, onDelete, onCopyLink, onCompare, onCompareAll, onStart, onBrowse }: {
  saved: SavedBuild[]; alerts: ReactNode; onOpen: (s: SavedBuild) => void; onRename: (id: string, name: string) => void;
  onDuplicate: (s: SavedBuild) => void; onDelete: (id: string) => void; onCopyLink: (s: SavedBuild) => void;
  onCompare: (s: SavedBuild) => void; onCompareAll: () => void; onStart: () => void; onBrowse: () => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  return (
    <div className="wrap page">
      <div className="page-head">
        <p className="kicker">My Builds</p>
        <h1>Your Saved Builds</h1>
        <p className="lede">Builds are saved in this browser. We check prices every night, and each build shows what changed since you saved it. Use Copy Link to open one on another device or send it to someone.</p>
        {saved.length > 0 && <button className="btn" onClick={onCompareAll}>Compare Two Builds</button>}
      </div>
      {alerts}
      {saved.length === 0 ? (
        <div className="empty-state card">
          <h2>No Saved Builds Yet</h2>
          <p>Put a build together and press Save Build, or save one from the Community page to start from.</p>
          <div className="build-card-actions">
            <button className="btn primary" onClick={onStart}>Start a Build</button>
            <button className="btn" onClick={onBrowse}>Browse Community Builds</button>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {saved.map((s) => {
            const platform = PLATFORMS.find((p) => p.id === s.platform)!;
            return (
              <BuildCard
                key={s.id}
                platformId={s.platform}
                selection={s.selection}
                title={renaming === s.id ? (
                  <form className="rename" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) onRename(s.id, draft.trim()); setRenaming(null); }}>
                    <label className="sr" htmlFor={`rename-${s.id}`}>Build Name</label>
                    <input id={`rename-${s.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus maxLength={60} />
                    <button className="btn primary" type="submit">Save</button>
                  </form>
                ) : s.name}
                meta={<>{platform.name} · {partIds(s.selection).length} parts{ownsAny(s.selection) ? ` (${ownedOf(s.selection).owned.size + ownedOf(s.selection).other.size} owned)` : ''} · Saved {shortDate(s.savedAt, true)}</>}
                body={<PriceSinceSaved s={s} />}
                actions={confirmDelete === s.id ? (
                  <>
                    <span className="confirm">Delete this build?</span>
                    <button className="btn danger" onClick={() => { onDelete(s.id); setConfirmDelete(null); }}>Delete</button>
                    <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Keep</button>
                  </>
                ) : (
                  <>
                    <button className="btn primary" onClick={() => onOpen(s)}>Open</button>
                    <button className="btn" onClick={() => onCopyLink(s)}>Copy Link</button>
                    <button className="btn ghost" onClick={() => { setRenaming(s.id); setDraft(s.name); }}>Rename</button>
                    <button className="btn ghost" onClick={() => onCompare(s)}>Compare</button>
                    <button className="btn ghost" onClick={() => onDuplicate(s)}>Duplicate</button>
                    <button className="btn ghost" onClick={() => setConfirmDelete(s.id)}>Delete</button>
                  </>
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
