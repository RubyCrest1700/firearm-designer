import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PLATFORMS, PRICES_UPDATED_AT } from './data';
import { RETAILERS, offerUrl } from './data/retailers';
import {
  bestOffer, candidateIssues, issuesFor, money, presetSelection, priceRange,
  singleRetailerCarts, toBuild, worst, type Selection,
} from './engine';
import { Blueprint, sceneFor, type RegionState } from './Blueprint';
import {
  FEATURED, TIER_LABEL, buildOf, loadSavedBuilds, newId, readSharedBuild, shareUrl, storeSavedBuilds, totalOf,
  type FeaturedBuild, type SavedBuild,
} from './store';
import type { Build, Issue, Part, Platform, Severity, Slot, Tier } from './types';

const STORE_KEY = 'firearm-designer:v2';
const SEV_LABEL: Record<Severity, string> = { error: 'Conflict', warn: 'Check', info: 'Note' };
const FAMILIES = ['Rifle', 'Pistol'];
type Route = 'build' | 'featured' | 'saved';

interface Persisted { platform: string; selections: Record<string, Selection> }

function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

const routeFromHash = (): Route => {
  const h = location.hash.replace('#', '');
  return h === 'featured' || h === 'saved' ? h : 'build';
};

const shortDate = (iso: string, year = false) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });

function slotState(build: Build, issues: Issue[], slotId: string): RegionState {
  if (!build[slotId]) return 'empty';
  const w = worst(issues.filter((i) => i.slots.includes(slotId)));
  return w === 'error' ? 'error' : w === 'warn' ? 'warn' : 'ok';
}

function statesFor(platform: Platform, build: Build) {
  const issues = issuesFor(platform, build);
  const states = Object.fromEntries(platform.slots.map((s) => [s.id, slotState(build, issues, s.id)])) as Record<string, RegionState>;
  return { issues, states };
}

function buildStatus(platform: Platform, build: Build, issues: Issue[]) {
  const missing = platform.slots.filter((s) => s.required && !build[s.id]).length;
  const errors = issues.filter((i) => i.severity === 'error').length;
  if (errors) return { cls: 'error', text: `${errors} conflict${errors > 1 ? 's' : ''} to fix` };
  if (missing) return { cls: 'warn', text: `${missing} required part${missing > 1 ? 's' : ''} missing` };
  return { cls: 'ok', text: 'Complete and compatible' };
}

export default function App() {
  const persisted = useMemo(loadPersisted, []);
  const shared = useMemo(readSharedBuild, []);
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [platformId, setPlatformId] = useState(shared?.platform ?? persisted?.platform ?? PLATFORMS[0].id);
  const [selections, setSelections] = useState<Record<string, Selection>>(() => ({
    ...Object.fromEntries(PLATFORMS.map((p) => [p.id, presetSelection(p, 'value')])),
    ...persisted?.selections,
    ...(shared ? { [shared.platform]: shared.selection } : {}),
  }));
  const [saved, setSaved] = useState<SavedBuild[]>(loadSavedBuilds);
  /** The saved build open in the builder, so Save can update it instead of adding a copy. */
  const [openSavedId, setOpenSavedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => { setRoute(routeFromHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    if (shared) history.replaceState(null, '', location.pathname + location.hash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [shared]);
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ platform: platformId, selections })); } catch { /* not persisted */ }
  }, [platformId, selections]);
  useEffect(() => { storeSavedBuilds(saved); }, [saved]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const go = (r: Route) => {
    try { history.replaceState(null, '', r === 'build' ? location.pathname : `#${r}`); } catch { /* sandboxed */ }
    setRoute(r);
    window.scrollTo(0, 0);
  };
  const openInBuilder = (pid: string, sel: Selection, savedId: string | null = null) => {
    setPlatformId(pid);
    setSelections((s) => ({ ...s, [pid]: { ...sel } }));
    setOpenSavedId(savedId);
    go('build');
  };
  const saveBuild = (name: string, asNew: boolean) => {
    const sel = selections[platformId] ?? {};
    const now = new Date().toISOString();
    if (!asNew && openSavedId && saved.some((s) => s.id === openSavedId)) {
      setSaved((list) => list.map((s) => (s.id === openSavedId ? { ...s, name, selection: { ...sel }, savedAt: now } : s)));
    } else {
      const id = newId();
      setSaved((list) => [{ id, name, platform: platformId, selection: { ...sel }, savedAt: now }, ...list]);
      setOpenSavedId(id);
    }
    setToast(`Saved "${name}" to My builds`);
  };
  const copyLink = async (pid: string, sel: Selection) => {
    const url = shareUrl(pid, sel);
    try {
      await navigator.clipboard.writeText(url);
      setToast('Link copied. Anyone who opens it sees this exact build.');
    } catch {
      setToast(`Copy this link: ${url}`);
    }
  };

  const openSaved = saved.find((s) => s.id === openSavedId && s.platform === platformId) ?? null;

  return (
    <div className="site">
      <header className="site-header">
        <div className="wrap header-row">
          <a className="brand" href="./" onClick={(e) => { e.preventDefault(); go('build'); }}>
            <Mark />
            <span className="brand-name">Firearm<b>Designer</b></span>
          </a>
          <nav className="site-nav" aria-label="Main">
            <NavLink active={route === 'build'} onClick={() => go('build')}>Build</NavLink>
            <NavLink active={route === 'featured'} onClick={() => go('featured')}>Featured builds</NavLink>
            <NavLink active={route === 'saved'} onClick={() => go('saved')}>
              My builds{saved.length > 0 && <span className="count">{saved.length}</span>}
            </NavLink>
          </nav>
          <p className="price-status">
            <span className={'pulse' + (PRICES_UPDATED_AT ? ' live' : '')} aria-hidden="true" />
            {PRICES_UPDATED_AT ? <>Prices checked {shortDate(PRICES_UPDATED_AT, true)}</> : <>Sample prices</>}
          </p>
        </div>
      </header>

      <main className="site-main">
        {route === 'build' && (
          <BuilderPage
            platformId={platformId}
            setPlatformId={(id) => { setPlatformId(id); setOpenSavedId(null); }}
            selection={selections[platformId] ?? {}}
            setSelection={(sel) => setSelections((s) => ({ ...s, [platformId]: sel }))}
            openSaved={openSaved}
            onSave={saveBuild}
            onCopyLink={() => copyLink(platformId, selections[platformId] ?? {})}
            onBrowseFeatured={() => go('featured')}
          />
        )}
        {route === 'featured' && (
          <FeaturedPage
            onOpen={(fb) => openInBuilder(fb.platform.id, fb.selection)}
            onSave={(fb) => {
              setSaved((list) => [{ id: newId(), name: fb.name, platform: fb.platform.id, selection: { ...fb.selection }, savedAt: new Date().toISOString() }, ...list]);
              setToast(`Saved "${fb.name}" to My builds`);
            }}
          />
        )}
        {route === 'saved' && (
          <SavedPage
            saved={saved}
            onOpen={(s) => openInBuilder(s.platform, s.selection, s.id)}
            onRename={(id, name) => setSaved((list) => list.map((s) => (s.id === id ? { ...s, name } : s)))}
            onDuplicate={(s) => setSaved((list) => [{ ...s, id: newId(), name: `${s.name} (copy)`, savedAt: new Date().toISOString() }, ...list])}
            onDelete={(id) => { setSaved((list) => list.filter((s) => s.id !== id)); if (id === openSavedId) setOpenSavedId(null); }}
            onCopyLink={(s) => copyLink(s.platform, s.selection)}
            onStart={() => go('build')}
            onBrowse={() => go('featured')}
          />
        )}
      </main>

      <footer className="site-footer">
        <div className="wrap footer-row">
          <div>
            <p className="brand-name small">Firearm<b>Designer</b></p>
            <p>Plan a build part by part, check that everything fits, and see where each part costs least. We don't sell anything.</p>
          </div>
          <div>
            <p className="foot-title">Good to know</p>
            <p>Prices marked Sample aren't tracked yet. Always confirm the price at the retailer.</p>
            <p>Parts marked FFL are serialized. They are legally the firearm and ship to a licensed dealer. Laws vary by state.</p>
          </div>
        </div>
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function NavLink({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button className={'nav-link' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined} onClick={onClick}>{children}</button>;
}

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="10.5" />
      <circle cx="16" cy="16" r="2.2" className="fill" />
      <path d="M16 1v8M16 23v8M1 16h8M23 16h8" />
    </svg>
  );
}

/* ================================================================== builder */

function BuilderPage({ platformId, setPlatformId, selection, setSelection, openSaved, onSave, onCopyLink, onBrowseFeatured }: {
  platformId: string; setPlatformId: (id: string) => void; selection: Selection; setSelection: (s: Selection) => void;
  openSaved: SavedBuild | null; onSave: (name: string, asNew: boolean) => void; onCopyLink: () => void; onBrowseFeatured: () => void;
}) {
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const platform = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS[0];
  const build = toBuild(platform, selection);
  const { issues, states } = statesFor(platform, build);
  const scene = sceneFor(platform, build);
  const status = buildStatus(platform, build, issues);
  const total = totalOf(platform, build);
  const chosen = platform.slots.filter((s) => build[s.id]).length;
  const openSlotObj = platform.slots.find((s) => s.id === openSlot);

  const choose = (slot: string, partId: string) => { setSelection({ ...selection, [slot]: partId }); setOpenSlot(null); };
  const remove = (slot: string) => { const next = { ...selection }; delete next[slot]; setSelection(next); };

  return (
    <>
      <div className="platform-bar">
        <div className="wrap platform-row" aria-label="Platform">
          {FAMILIES.map((fam) => (
            <div className="platform-group" key={fam}>
              <span className="platform-label">{fam}s</span>
              {PLATFORMS.filter((p) => p.family === fam).map((p) => (
                <button key={p.id} aria-pressed={p.id === platform.id} className={'platform-tab' + (p.id === platform.id ? ' active' : '')}
                  onClick={() => { setPlatformId(p.id); setOpenSlot(null); }}>
                  {p.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="wrap builder">
        <div className="builder-head">
          <p className="kicker">{openSaved ? <>My builds · {openSaved.name}</> : <>{platform.family} build</>}</p>
          <h1>Build your {platform.name}</h1>
          <p className="lede">{platform.blurb}</p>
        </div>

        <figure className="blueprint">
          <div className="bp-strip">
            <span>DWG FD-{platform.id.toUpperCase()} · Side elevation</span>
            <span className="bp-legend" aria-hidden="true">
              <span className="lg lg-sel">Selected</span>
              <span className="lg lg-hid">Internal</span>
              <span className="lg lg-emp">Empty</span>
              <span className="lg lg-err">Conflict</span>
            </span>
          </div>
          <div className="bp-canvas">
            <Blueprint platform={platform} build={build} states={states} active={hover ?? openSlot} onPick={setOpenSlot} onHover={setHover} />
          </div>
          <figcaption className="title-block">
            <div><span>Platform</span><b>{platform.name}</b></div>
            <div><span>Spec</span><b>{scene.spec}</b></div>
            <div><span>Parts</span><b>{chosen} of {platform.slots.length}</b></div>
            <div><span>Status</span><b className={'tb-' + status.cls}>{status.text}</b></div>
            <div><span>Total</span><b>{money(total)}</b></div>
          </figcaption>
        </figure>
        <p className="hint">Select any part on the drawing or in the list to change it. The drawing updates with every part you choose.</p>

        <div className="builder-grid">
          <PartsList platform={platform} build={build} issues={issues} states={states} hover={hover} onHover={setHover} onOpen={setOpenSlot} onRemove={remove} />
          <Summary
            platform={platform} build={build} issues={issues} states={states} status={status} total={total}
            openSaved={openSaved} onSave={onSave} onCopyLink={onCopyLink} onOpen={setOpenSlot}
            onPreset={(t) => { setSelection(presetSelection(platform, t)); setOpenSlot(null); }}
            onClear={() => setSelection({})} onBrowseFeatured={onBrowseFeatured}
          />
        </div>
      </div>

      <Dock total={total} status={status} />

      {openSlotObj && (
        <Picker
          key={platform.id + openSlotObj.id}
          platform={platform}
          slot={openSlotObj}
          number={platform.slots.indexOf(openSlotObj) + 1}
          build={build}
          selectedId={build[openSlotObj.id]?.id}
          onChoose={(id) => choose(openSlotObj.id, id)}
          onRemove={build[openSlotObj.id] && !openSlotObj.required ? () => { remove(openSlotObj.id); setOpenSlot(null); } : undefined}
          onClose={() => setOpenSlot(null)}
        />
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

function PartsList({ platform, build, issues, states, hover, onHover, onOpen, onRemove }: {
  platform: Platform; build: Build; issues: Issue[]; states: Record<string, RegionState>; hover: string | null;
  onHover: (s: string | null) => void; onOpen: (s: string) => void; onRemove: (s: string) => void;
}) {
  return (
    <section className="card parts" aria-label="Parts list">
      <div className="parts-head" aria-hidden="true">
        <span>#</span><span>Component</span><span className="r">Best price</span><span className="r">Fit</span>
      </div>
      {groupSlots(platform.slots).map(([group, slots]) => (
        <div className="parts-group" key={group}>
          <h2 className="parts-group-title">{group}</h2>
          <ol className="parts-rows">
            {slots.map((slot) => {
              const part = build[slot.id];
              const offer = part && bestOffer(part);
              const rowIssues = issues.filter((i) => i.slots.includes(slot.id) && i.severity !== 'info');
              return (
                <li key={slot.id} className={'part-row ' + states[slot.id] + (hover === slot.id ? ' hover' : '')}
                  onMouseEnter={() => onHover(slot.id)} onMouseLeave={() => onHover(null)}>
                  <span className="part-no">{platform.slots.indexOf(slot) + 1}</span>
                  <button className="part-main" onClick={() => onOpen(slot.id)} aria-label={`${slot.name}: ${part ? `${part.brand} ${part.name}. Change` : 'choose a part'}`}>
                    <span className="part-slot">{slot.name}{!slot.required && <span className="opt">Optional</span>}</span>
                    {part ? (
                      <span className="part-name"><span className="brand-dim">{part.brand}</span> {part.name}{part.serialized && <span className="ffl" title="Serialized: ships to an FFL">FFL</span>}</span>
                    ) : (
                      <span className="part-name choose">{slot.required ? `Choose a ${slot.name.toLowerCase()}` : 'Add one'} →</span>
                    )}
                    {rowIssues.map((i, k) => <span key={k} className={'row-issue ' + i.severity}>{i.message}</span>)}
                  </button>
                  <span className="part-price">
                    {offer ? <><span className="amt">{money(offer.price)}</span><span className="src">{RETAILERS[offer.retailer].name}</span></> : <span className="amt dim">—</span>}
                  </span>
                  <span className="part-fit">
                    <FitTag state={states[slot.id]} />
                    {part && !slot.required && <button className="x" onClick={() => onRemove(slot.id)} aria-label={`Remove ${slot.name}`} title="Remove">×</button>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}

function Summary({ platform, build, issues, states, status, total, openSaved, onSave, onCopyLink, onOpen, onPreset, onClear, onBrowseFeatured }: {
  platform: Platform; build: Build; issues: Issue[]; states: Record<string, RegionState>; status: { cls: string; text: string }; total: number;
  openSaved: SavedBuild | null; onSave: (name: string, asNew: boolean) => void; onCopyLink: () => void; onOpen: (s: string) => void;
  onPreset: (t: Tier) => void; onClear: () => void; onBrowseFeatured: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const chosen = platform.slots.map((s) => build[s.id]).filter((p): p is Part => !!p);
  const highest = chosen.reduce((sum, p) => sum + priceRange(p)[1], 0);
  const retailers = new Set(chosen.map((p) => bestOffer(p)?.retailer)).size;
  const carts = singleRetailerCarts(chosen).slice(0, 4);
  const [dollars, cents] = money(total).split('.');
  const presetTotal = (t: Tier) => totalOf(platform, toBuild(platform, presetSelection(platform, t)));

  const startSave = () => { setName(openSaved?.name ?? `My ${platform.name} build`); setSaving(true); };
  const submit = (asNew: boolean) => { if (name.trim()) { onSave(name.trim(), asNew); setSaving(false); } };

  return (
    <aside className="summary" id="summary" aria-label="Build summary">
      <section className="card total-card">
        <p className="kicker">Build total at best prices</p>
        <p className="total"><span>{dollars}</span><small>.{cents}</small></p>
        <p className="total-sub">
          {chosen.length} parts from {retailers} retailer{retailers === 1 ? '' : 's'}
          {highest > total && <> · {money(highest - total)} below the highest prices</>}
        </p>
        <div className="segments" aria-hidden="true">
          {platform.slots.map((s) => (
            <button key={s.id} tabIndex={-1} className={'seg ' + states[s.id] + (s.required ? '' : ' optional')} title={s.name} onClick={() => onOpen(s.id)} />
          ))}
        </div>
        <p className={'status ' + status.cls}>{status.text}</p>

        {saving ? (
          <form className="save-form" onSubmit={(e) => { e.preventDefault(); submit(!openSaved); }}>
            <label htmlFor="build-name">Build name</label>
            <input id="build-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
            <div className="save-actions">
              {openSaved ? (
                <>
                  <button type="submit" className="btn primary">Update saved build</button>
                  <button type="button" className="btn" onClick={() => submit(true)}>Save as new</button>
                </>
              ) : <button type="submit" className="btn primary">Save build</button>}
              <button type="button" className="btn ghost" onClick={() => setSaving(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="total-actions">
            <button className="btn primary" onClick={startSave}>{openSaved ? 'Save changes' : 'Save build'}</button>
            <button className="btn" onClick={onCopyLink}>Copy link</button>
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

      <section className="card">
        <h2 className="card-title">Buy it all from one store</h2>
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
      </section>

      <section className="card">
        <h2 className="card-title">Start from a featured build</h2>
        <div className="presets">
          {(['budget', 'value', 'premium'] as Tier[]).map((t) => (
            <button key={t} className="preset" onClick={() => onPreset(t)}>
              <span className="preset-name">{TIER_LABEL[t]}</span>
              <span className="preset-amt">{money(presetTotal(t))}</span>
            </button>
          ))}
        </div>
        <div className="card-links">
          <button className="link" onClick={onBrowseFeatured}>See all featured builds</button>
          <button className="link dim" onClick={onClear}>Clear this build</button>
        </div>
      </section>
    </aside>
  );
}

function Dock({ total, status }: { total: number; status: { cls: string; text: string } }) {
  return (
    <div className="dock" role="region" aria-label="Build total">
      <div>
        <div className="dock-total">{money(total)}</div>
        <p className={'status ' + status.cls}>{status.text}</p>
      </div>
      <button className="btn" onClick={() => document.getElementById('summary')?.scrollIntoView({ behavior: 'smooth' })}>Summary</button>
    </div>
  );
}

/* ------------------------------------------------------------------ picker */

type SortKey = 'fit' | 'price' | 'picks';

function Picker({ platform, slot, number, build, selectedId, onChoose, onRemove, onClose }: {
  platform: Platform; slot: Slot; number: number; build: Build; selectedId?: string;
  onChoose: (id: string) => void; onRemove?: () => void; onClose: () => void;
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
    const iss = candidateIssues(platform, build, p);
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
            <h2 id="picker-title">{slot.name}</h2>
            <p className="drawer-hint">{slot.hint}</p>
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="drawer-tools">
          <div className="segctl" role="radiogroup" aria-label="Sort by">
            {([['fit', 'Best fit'], ['price', 'Lowest price'], ['picks', 'Our picks']] as [SortKey, string][]).map(([k, label]) => (
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
            <Candidate key={c.part.id} part={c.part} issues={c.issues} sev={c.sev} selected={c.part.id === selectedId} onChoose={() => onChoose(c.part.id)} />
          ))}
          {candidates.length === 0 && <li className="cand-empty">Every option conflicts with your current build. Turn off the filter to see why.</li>}
        </ul>
        {onRemove && <button className="btn ghost wide" onClick={onRemove}>Remove {slot.name.toLowerCase()} from build</button>}
      </aside>
    </div>
  );
}

function Candidate({ part, issues, sev, selected, onChoose }: {
  part: Part; issues: Issue[]; sev: Severity | 'ok'; selected: boolean; onChoose: () => void;
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
        {part.pick && <span className={'pick ' + part.pick.tier}>{TIER_LABEL[part.pick.tier]} pick</span>}
        {part.serialized && <span className="ffl">FFL</span>}
        {selected && <span className="in-build">In your build</span>}
      </div>
      <div className="cand-mid">
        <div className="cand-body">
          <h3 className="cand-name"><span className="brand-dim">{part.brand}</span> {part.name}</h3>
          <ul className="specs">{part.specs.map((s) => <li key={s}>{s}</li>)}</ul>
          {part.pick && <p className="pick-note">{part.pick.note}</p>}
          {issues.map((i, n) => <p key={n} className={'row-issue ' + i.severity}>{i.message}</p>)}
        </div>
        <div className="cand-buy">
          {best && <span className="amt">{money(best.price)}</span>}
          {best && <span className="src">{RETAILERS[best.retailer].name}{live ? '' : ' · sample'}</span>}
          {!selected && <button className="btn primary" onClick={onChoose}>Add to build</button>}
        </div>
      </div>
      <button className="compare" aria-expanded={showPrices} onClick={() => setShowPrices(!showPrices)}>
        <span>{part.offers.length > 1 ? `Compare ${part.offers.length} retailers` : 'View retailer'}</span>
        {hi > lo && <span className="save">Save up to {money(hi - lo)}</span>}
        <span className="chev" aria-hidden="true">{showPrices ? '−' : '+'}</span>
      </button>
      {showPrices && (
        <div className="offers-wrap">
          <table className="offers">
            <thead><tr><th>Retailer</th><th className="num">Price</th><th>Stock</th><th>Checked</th><th /></tr></thead>
            <tbody>
              {[...part.offers].sort((a, b) => a.price - b.price).map((o) => (
                <tr key={o.retailer} className={best && o.retailer === best.retailer ? 'best' : ''}>
                  <td>{RETAILERS[o.retailer].name}</td>
                  <td className="num">{money(o.price)}</td>
                  <td>{o.inStock ? 'In stock' : <span className="oos">Out</span>}</td>
                  <td className="dim">{o.checkedAt ? `Live ${shortDate(o.checkedAt)}` : 'Sample'}</td>
                  <td className="num"><a href={o.url ?? offerUrl(o.retailer, `${part.brand} ${part.name}`)} target="_blank" rel="noopener noreferrer">{o.url ? 'View ↗' : 'Search ↗'}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

/* ================================================================ cards */

function BuildCard({ platformId, selection, badge, title, meta, body, actions }: {
  platformId: string; selection: Selection; badge?: ReactNode; title: ReactNode; meta: ReactNode; body?: ReactNode; actions: ReactNode;
}) {
  const { platform, build } = buildOf(platformId, selection);
  const { issues, states } = statesFor(platform, build);
  const status = buildStatus(platform, build, issues);
  return (
    <article className="build-card card">
      <div className="thumb">
        <Blueprint platform={platform} build={build} states={states} compact />
        {badge}
      </div>
      <div className="build-card-body">
        <h3>{title}</h3>
        <p className="meta">{meta}</p>
        {body}
        <div className="build-card-foot">
          <span className="amt big">{money(totalOf(platform, build))}</span>
          <span className={'status small ' + status.cls}>{status.text}</span>
        </div>
        <div className="build-card-actions">{actions}</div>
      </div>
    </article>
  );
}

function FeaturedPage({ onOpen, onSave }: { onOpen: (fb: FeaturedBuild) => void; onSave: (fb: FeaturedBuild) => void }) {
  const [filter, setFilter] = useState<string>('all');
  const list = FEATURED.filter((fb) => filter === 'all' || fb.platform.family === filter || fb.platform.id === filter);
  return (
    <div className="wrap page">
      <div className="page-head">
        <p className="kicker">Featured builds</p>
        <h1>Proven parts lists to start from</h1>
        <p className="lede">Three complete, compatible builds for every platform. Open one in the builder to swap parts, or save it to My builds.</p>
      </div>
      <div className="filters" role="group" aria-label="Filter by platform">
        {[['all', 'All'], ['Rifle', 'Rifles'], ['Pistol', 'Pistols'], ...PLATFORMS.map((p) => [p.id, p.name])].map(([k, label]) => (
          <button key={k} className={'chip' + (filter === k ? ' on' : '')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      <div className="card-grid">
        {list.map((fb) => {
          const { build } = buildOf(fb.platform.id, fb.selection);
          const top = Object.values(build).filter((p): p is Part => !!p)
            .sort((a, b) => (bestOffer(b)?.price ?? 0) - (bestOffer(a)?.price ?? 0)).slice(0, 3);
          return (
            <BuildCard
              key={fb.id}
              platformId={fb.platform.id}
              selection={fb.selection}
              badge={<span className={'tier-badge ' + fb.tier}>{TIER_LABEL[fb.tier]}</span>}
              title={fb.name}
              meta={<>{fb.platform.family} · {Object.keys(fb.selection).length} parts</>}
              body={<>
                <p className="summary-text">{fb.summary}</p>
                <ul className="highlights">{top.map((p) => <li key={p.id}><span className="brand-dim">{p.brand}</span> {p.name}</li>)}</ul>
              </>}
              actions={<>
                <button className="btn primary" onClick={() => onOpen(fb)}>Open in builder</button>
                <button className="btn" onClick={() => onSave(fb)}>Save</button>
              </>}
            />
          );
        })}
      </div>
    </div>
  );
}

function SavedPage({ saved, onOpen, onRename, onDuplicate, onDelete, onCopyLink, onStart, onBrowse }: {
  saved: SavedBuild[]; onOpen: (s: SavedBuild) => void; onRename: (id: string, name: string) => void;
  onDuplicate: (s: SavedBuild) => void; onDelete: (id: string) => void; onCopyLink: (s: SavedBuild) => void;
  onStart: () => void; onBrowse: () => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  return (
    <div className="wrap page">
      <div className="page-head">
        <p className="kicker">My builds</p>
        <h1>Your saved builds</h1>
        <p className="lede">Builds are saved in this browser. Use Copy link to open one on another device or send it to someone.</p>
      </div>
      {saved.length === 0 ? (
        <div className="empty card">
          <h2>No saved builds yet</h2>
          <p>Put a build together and press Save build, or save one of the featured builds to start from.</p>
          <div className="build-card-actions">
            <button className="btn primary" onClick={onStart}>Start a build</button>
            <button className="btn" onClick={onBrowse}>Browse featured builds</button>
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
                    <label className="sr" htmlFor={`rename-${s.id}`}>Build name</label>
                    <input id={`rename-${s.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus maxLength={60} />
                    <button className="btn primary" type="submit">Save</button>
                  </form>
                ) : s.name}
                meta={<>{platform.name} · {Object.keys(s.selection).length} parts · Saved {shortDate(s.savedAt, true)}</>}
                actions={confirmDelete === s.id ? (
                  <>
                    <span className="confirm">Delete this build?</span>
                    <button className="btn danger" onClick={() => { onDelete(s.id); setConfirmDelete(null); }}>Delete</button>
                    <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Keep</button>
                  </>
                ) : (
                  <>
                    <button className="btn primary" onClick={() => onOpen(s)}>Open</button>
                    <button className="btn" onClick={() => onCopyLink(s)}>Copy link</button>
                    <button className="btn ghost" onClick={() => { setRenaming(s.id); setDraft(s.name); }}>Rename</button>
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
