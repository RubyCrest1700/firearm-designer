import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PLATFORMS, PRICES_READ_AT, canonicalPlatform, currentSelection } from './data';
import { ownsAny, partIds, baseSelection, selectionTokens, withoutOwned, type Selection } from './engine';
import { ComparePage, loadCompare, storeCompare, type CompareItem } from './Compare';
import { droppedBuilds, loadSavedBuilds, priceChanges, newId, readSharedBuild, savedPrices, selectionFromParts, shareUrl, checkShareLinks, storeSavedBuilds, SAVED_KEY, type SavedBuild } from './store';
import { recordBuyClick, shareBuild, type CommunityBuild } from './community';
import { ALERTS_KEY, alertsAvailable, checkAlertSignup, loadAlertSignup, signUpForAlerts, stopAlerts, storeAlertSignup, syncAlertBuilds, type AlertSignup } from './alerts';
import type { Part } from './types';
import { BuilderPage } from './BuilderPage';
import { CommunityPage } from './CommunityPage';
import { HomePage } from './HomePage';
import { AlertsPanel, SavedPage } from './SavedPage';
import { ToastView, priceStatus, toastHideMs, type Toast } from './ui';

const STORE_KEY = 'firearm-designer:v2';
/** The home page's title, the same as the <title> in index.html. */
const HOME_TITLE = 'Drop-In Builds: Plan Your Firearm Build Part by Part';
type Route = 'home' | 'build' | 'community' | 'saved' | 'compare';

interface Persisted { platform: string; selections: Record<string, Selection> }

/**
 * The build in progress lives only for this browser tab (sessionStorage), so a reload keeps it but every new
 * visit starts blank. Builds are kept only when the user saves them to My builds.
 */
export function loadPersisted(): Persisted | null {
  try {
    localStorage.removeItem(STORE_KEY); // older versions kept the draft forever
    const raw = sessionStorage.getItem(STORE_KEY);
    const p = raw ? (JSON.parse(raw) as Persisted) : null;
    if (!p) return null;
    // Drafts from before the Glock 17, 19 and 26 became one builder keep their old platform ids.
    const selections: Record<string, Selection> = {};
    for (const [k, v] of Object.entries(p.selections ?? {})) selections[canonicalPlatform(k)] ??= currentSelection(v);
    return { platform: canonicalPlatform(p.platform), selections };
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

/** What a `storage` event (a change made in another tab) means here: which of My Builds and the alert signup to read again. A null key is all of storage cleared. */
export const storageChange = (key: string | null) => ({ saved: key === null || key === SAVED_KEY, signup: key === null || key === ALERTS_KEY });

/**
 * The signup to keep once a check or sync made with `token` has answered `next` (null: the service no longer has it).
 * The answer counts only while that signup is still the current one: if another tab has stopped alerts or signed up
 * again since, the current signup stays as it is.
 */
export const signupAfter = (current: AlertSignup | null, token: string, next: AlertSignup | null) => (current?.token === token ? next : current);

export default function App() {
  const persisted = useMemo(loadPersisted, []);
  const shared = useMemo(readSharedBuild, []);
  const [route, setRoute] = useState<Route>(() => (shared ? 'build' : routeFromHash()));
  const [platformId, setPlatformId] = useState(shared?.platform ?? (PLATFORMS.some((p) => p.id === persisted?.platform) ? persisted!.platform : PLATFORMS[0].id));
  const [selections, setSelections] = useState<Record<string, Selection>>(() => ({
    ...persisted?.selections,
    ...(shared ? { [shared.platform]: shared.selection } : {}),
  }));
  /** A builder not opened before starts on its plain factory build. */
  const selOf = (pid: string) => selections[pid] ?? baseSelection(PLATFORMS.find((p) => p.id === pid) ?? PLATFORMS[0]);
  const [saved, setSaved] = useState<SavedBuild[]>(loadSavedBuilds);
  /** The saved build open in the builder, so Save can update it instead of adding a copy. */
  const [openSavedId, setOpenSavedId] = useState<string | null>(null);
  /** The community build open in the builder, so retailer clicks count toward it. Cleared on any edit. */
  const [communityOpen, setCommunityOpen] = useState<CommunityBuild | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  /** The part a home page price drop opens in the builder: its slot's picker starts open on it. Used once. */
  const [startPart, setStartPart] = useState<Part | null>(null);
  useEffect(() => { if (route === 'build') setStartPart(null); }, [route]);
  /** The two builds on the Compare page, kept for this tab like the build in progress. */
  const [compare, setCompare] = useState<(CompareItem | null)[]>(loadCompare);
  useEffect(() => { storeCompare(compare); }, [compare]);
  /** Builders opened in this tab. Compare offers the build in progress only from one of these. */
  const [opened, setOpened] = useState(() => new Set(Object.keys(selections)));
  useEffect(() => { if (route === 'build' && !opened.has(platformId)) setOpened(new Set(opened).add(platformId)); }, [route, platformId, opened]);

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
  /** The list as another tab stored it, while it's still the list shown: it's already stored and that tab keeps the emailed list, so this tab does neither. */
  const fromOtherTab = useRef<SavedBuild[] | null>(null);
  useEffect(() => { if (saved !== fromOtherTab.current) storeSavedBuilds(saved); }, [saved]);
  const dropped = useMemo(() => droppedBuilds(saved), [saved]);
  const [alertsOn, setAlertsOn] = useState(false);
  const [signup, setSignup] = useState<AlertSignup | null>(loadAlertSignup);
  useEffect(() => { storeAlertSignup(signup); }, [signup]);
  useEffect(() => {
    void alertsAvailable().then(setAlertsOn);
    const s = loadAlertSignup();
    if (s) void checkAlertSignup(s).then((next) => setSignup((cur) => signupAfter(cur, s.token, next)));
  }, []);
  // My Builds and the alert signup follow a change made in another tab, so this tab never stores an older list over it.
  useEffect(() => {
    const readAgain = (changed: { saved: boolean; signup: boolean }) => {
      if (changed.saved) { const list = loadSavedBuilds(); fromOtherTab.current = list; setSaved(list); }
      if (changed.signup) setSignup(loadAlertSignup());
    };
    const onStorage = (e: StorageEvent) => readAgain(storageChange(e.key));
    // A page brought back by Back or Forward as it was left heard of no change made while it was away: it reads both again.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) readAgain(storageChange(null)); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onPageShow);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('pageshow', onPageShow); };
  }, []);
  // Keep the emailed list in step with My builds; a signup that was unsubscribed by email is forgotten.
  const firstSync = useRef(true);
  /** A change made in this tab that hasn't been sent yet. It's still sent if another tab's list arrives before it goes. */
  const unsent = useRef(false);
  useEffect(() => {
    if (firstSync.current) { firstSync.current = false; return; }
    if (saved !== fromOtherTab.current) unsent.current = true;
    if (!signup) { unsent.current = false; return; }
    if (!unsent.current) return;
    const t = setTimeout(() => { unsent.current = false; void syncAlertBuilds(signup, saved).then((ok) => { if (!ok) setSignup((cur) => signupAfter(cur, signup.token, null)); }); }, 1000);
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
    // A link the browser would not copy stays until it's closed or another toast takes its place.
    const ms = toast ? toastHideMs(toast) : null;
    if (ms === null) return;
    const t = setTimeout(() => setToast(null), ms);
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
    setSaved((list) => [{ id: newId(), name, platform: pid, selection: { ...sel }, ...savedPrices(pid, sel) }, ...list]);
    setToast(`Saved "${name}" to My Builds`);
  };
  const share = async (name: string, note: string) => {
    const sel = selOf(platformId);
    const b = await shareBuild(platformId, name, note, selectionTokens(withoutOwned(sel)));
    setCommunityOpen(b);
    setToast(`Shared "${b.name}". It's on the Community page now.`);
  };
  const saveBuild = (name: string, asNew: boolean) => {
    const sel = selOf(platformId);
    if (!asNew && openSavedId && saved.some((s) => s.id === openSavedId)) {
      setSaved((list) => list.map((s) => (s.id === openSavedId ? { ...s, name, selection: { ...sel }, ...savedPrices(platformId, sel, s.prices) } : s)));
    } else {
      const id = newId();
      setSaved((list) => [{ id, name, platform: platformId, selection: { ...sel }, ...savedPrices(platformId, sel) }, ...list]);
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
      setToast({ link: url });
    }
  };

  const openSaved = saved.find((s) => s.id === openSavedId && s.platform === platformId) ?? null;

  // Each page names itself in the browser tab, history and bookmarks.
  useEffect(() => {
    const name = PLATFORMS.find((p) => p.id === platformId)?.name ?? '';
    const page = { home: '', build: `Build Your ${name}`, saved: 'My Builds', community: 'Community Builds', compare: 'Compare Builds' }[route];
    document.title = page ? `${page} | Drop-In Builds` : HOME_TITLE;
  }, [route, platformId]);

  // The header's price line, worked out against the visitor's clock each time the page draws.
  const prices = priceStatus(PRICES_READ_AT);

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
            <a className="nav-link" href="./faq/">FAQ</a>
          </nav>
          <p className="price-status">
            <span className={'pulse' + (prices?.live ? ' live' : '')} aria-hidden="true" />
            {prices ? <>{`${prices.lead} `}{prices.date}</> : <>Estimated prices</>}
          </p>
        </div>
      </header>

      <main className="site-main">
        {route === 'home' && (
          <HomePage
            onPick={(id, part) => { setPlatformId(id); setOpenSavedId(null); setCommunityOpen(null); setStartPart(part ?? null); go('build'); }}
            onStart={() => go('build')}
            onBrowse={() => go('community')}
          />
        )}
        {route === 'build' && (
          <BuilderPage
            platformId={platformId}
            startPart={startPart}
            setPlatformId={(id) => { setPlatformId(id); setOpenSavedId(null); setCommunityOpen(null); }}
            selection={selOf(platformId)}
            setSelection={(sel) => { setSelections((s) => ({ ...s, [platformId]: sel })); setCommunityOpen(null); }}
            startOver={(sel) => { setSelections((s) => ({ ...s, [platformId]: sel })); setOpenSavedId(null); setCommunityOpen(null); }}
            openSaved={openSaved}
            communityOpen={communityOpen?.platform === platformId ? communityOpen : null}
            onSave={saveBuild}
            onShare={share}
            onCopyLink={() => copyLink(platformId, selOf(platformId), communityOpen?.platform === platformId ? communityOpen.id : undefined)}
            onBuyClick={() => { if (communityOpen) void recordBuyClick(communityOpen.id); }}
            onBrowseFeatured={() => go('community')}
            onCompare={() => addToCompare({ kind: 'Current Build', name: openSaved?.name ?? communityOpen?.name ?? `Your ${PLATFORMS.find((p) => p.id === platformId)?.name} build`, platform: platformId, selection: { ...selOf(platformId) } })}
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
                onRefresh={() => { if (signup) void checkAlertSignup(signup).then((next) => setSignup((cur) => signupAfter(cur, signup.token, next))); }}
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
            current={opened.has(platformId) && (partIds(selOf(platformId)).length || ownsAny(selOf(platformId))) ? { platform: platformId, selection: selOf(platformId), name: openSaved?.name } : null}
            lastPlatform={platformId}
            onOpen={(item) => openInBuilder(item.platform, item.selection)}
          />
        )}
      </main>

      <footer className="site-footer">
        <div className="wrap footer-row">
          <div>
            <p className="brand-name small">Drop-In <b>Builds</b></p>
            <p>Plan a build part by part, check that everything fits, and see where each part costs least. We don't sell anything.</p>
            <p><a className="foot-link" href={`/feedback/?from=${encodeURIComponent(location.pathname + location.hash)}`}>Send Feedback</a> · <a className="foot-link" href="/privacy/">Privacy Policy</a> · <a className="foot-link" href="/terms/">Terms of Use</a></p>
          </div>
          <div>
            <p className="foot-title">Good to Know</p>
            <p>Prices marked Estimate are rough figures, not current store prices. List Price and dated Factory Part prices were checked by hand on that date; undated Factory Part prices are also estimates. A From price is a holster before its light option. Always confirm the price at the retailer.</p>
            <p>Parts marked FFL are serialized and treated as the firearm under federal law, so they ship to a licensed dealer. Laws vary by state.</p>
          </div>
        </div>
      </footer>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}
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
