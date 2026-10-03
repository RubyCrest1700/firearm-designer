import { useEffect, useMemo, useRef, useState } from 'react';
import { PLATFORMS, PRICES_UPDATED_AT } from './data';
import { RETAILERS, offerUrl } from './data/retailers';
import {
  bestOffer, candidateIssues, issuesFor, money, presetSelection, priceRange,
  singleRetailerCarts, toBuild, worst, type Selection,
} from './engine';
import { BuildRender, type RegionState } from './Render';
import type { Build, Issue, Part, Platform, Severity, Slot, Tier } from './types';

const STORE_KEY = 'firearm-designer:v2';
const TIER_LABEL: Record<Tier, string> = { budget: 'Budget', value: 'Best value', premium: 'Premium' };
const TIER_NOTE: Record<Tier, string> = { budget: 'Lowest cost that runs right', value: 'Where the money matters', premium: 'Top-shelf parts throughout' };
const SEV_LABEL: Record<Severity, string> = { error: 'Conflict', warn: 'Check', info: 'Note' };
const FAMILIES = ['Rifle', 'Pistol'];

interface Saved { platform: string; selections: Record<string, Selection> }

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function defaultSelections(): Record<string, Selection> {
  return Object.fromEntries(PLATFORMS.map((p) => [p.id, presetSelection(p, 'value')]));
}

const shortDate = (iso: string, year = false) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });

function slotState(build: Build, issues: Issue[], slotId: string): RegionState {
  if (!build[slotId]) return 'empty';
  const w = worst(issues.filter((i) => i.slots.includes(slotId)));
  return w === 'error' ? 'error' : w === 'warn' ? 'warn' : 'ok';
}

export default function App() {
  const saved = useMemo(loadSaved, []);
  const [platformId, setPlatformId] = useState(saved?.platform ?? PLATFORMS[0].id);
  const [selections, setSelections] = useState<Record<string, Selection>>({ ...defaultSelections(), ...saved?.selections });
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ platform: platformId, selections }));
    } catch {
      /* storage unavailable: the build just won't persist */
    }
  }, [platformId, selections]);

  const platform = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS[0];
  const sel = selections[platform.id] ?? {};
  const build = toBuild(platform, sel);
  const issues = issuesFor(platform, build);
  const states = Object.fromEntries(platform.slots.map((s) => [s.id, slotState(build, issues, s.id)]));

  const setSel = (next: Selection) => setSelections((s) => ({ ...s, [platform.id]: next }));
  const choose = (slot: string, partId: string) => {
    setSel({ ...sel, [slot]: partId });
    setOpenSlot(null);
  };
  const remove = (slot: string) => {
    const next = { ...sel };
    delete next[slot];
    setSel(next);
  };

  const openSlotObj = platform.slots.find((s) => s.id === openSlot);

  return (
    <div className="app">
      <header className="masthead">
        <a className="wordmark" href="./" aria-label="Firearm Designer home">
          <Mark />
          <span>Firearm<b>Designer</b></span>
        </a>
        <p className="price-status">
          <span className={'pulse' + (PRICES_UPDATED_AT ? ' live' : '')} aria-hidden="true" />
          {PRICES_UPDATED_AT ? <>Prices checked {shortDate(PRICES_UPDATED_AT, true)}</> : <>Sample prices</>}
        </p>
      </header>

      <nav className="rack" aria-label="Platform">
        {FAMILIES.map((fam) => (
          <div className="rack-group" key={fam}>
            <span className="rack-label">{fam}s</span>
            <div className="rack-items">
              {PLATFORMS.filter((p) => p.family === fam).map((p) => (
                <button
                  key={p.id}
                  className={'rack-item' + (p.id === platform.id ? ' active' : '')}
                  aria-pressed={p.id === platform.id}
                  onClick={() => { setPlatformId(p.id); setOpenSlot(null); }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <main className="layout">
        <section className="work" aria-label={`${platform.name} build`}>
          <div className="title-row">
            <div className="title-text">
              <p className="eyebrow">{platform.family} build · {platform.slots.length} components</p>
              <h1>{platform.name}</h1>
              <p className="blurb">{platform.blurb}</p>
            </div>
          </div>

          <figure className="sheet">
            <figcaption className="sheet-head">
              <span>Build preview · {platform.name}</span>
              <span className="legend" aria-hidden="true">
                <span className="lg lg-ok">Selected</span>
                <span className="lg lg-hidden">Internal</span>
                <span className="lg lg-empty">Empty</span>
                <span className="lg lg-error">Conflict</span>
              </span>
            </figcaption>
            <BuildRender platform={platform} build={build} states={states} active={hover ?? openSlot} onPick={setOpenSlot} onHover={setHover} />
            <p className="sheet-hint">The drawing redraws as you choose parts. Select any part, here or in the list, to change it.</p>
          </figure>

          <BillOfMaterials
            platform={platform}
            build={build}
            issues={issues}
            states={states}
            hover={hover}
            onHover={setHover}
            onOpen={setOpenSlot}
            onRemove={remove}
          />
        </section>

        <Summary
          platform={platform}
          build={build}
          issues={issues}
          states={states}
          onPreset={(t) => { setSel(presetSelection(platform, t)); setOpenSlot(null); }}
          onClear={() => setSel({})}
          onOpen={setOpenSlot}
        />
      </main>

      <footer className="foot">
        <p>Firearm Designer doesn't sell anything. Prices marked Sample aren't tracked yet; always confirm the price at the retailer.</p>
        <p>Parts marked FFL are serialized. They are legally the firearm and ship to a licensed dealer. Laws vary by state, so check yours before you buy.</p>
      </footer>

      <Dock platform={platform} build={build} issues={issues} />

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
    </div>
  );
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

function groupSlots(slots: Slot[]): [string, Slot[]][] {
  const m = new Map<string, Slot[]>();
  for (const s of slots) m.set(s.group, [...(m.get(s.group) ?? []), s]);
  return [...m.entries()];
}

function StateTag({ state }: { state: RegionState }) {
  const text = { empty: 'Empty', ok: 'Fits', warn: 'Check', error: 'Conflict' }[state];
  return <span className={'tag ' + state}>{text}</span>;
}

function BillOfMaterials({ platform, build, issues, states, hover, onHover, onOpen, onRemove }: {
  platform: Platform; build: Build; issues: Issue[]; states: Record<string, RegionState>; hover: string | null;
  onHover: (s: string | null) => void; onOpen: (s: string) => void; onRemove: (s: string) => void;
}) {
  return (
    <div className="bom">
      {groupSlots(platform.slots).map(([group, slots]) => (
        <section className="bom-group" key={group} aria-label={group}>
          <h2 className="bom-title">{group}</h2>
          <ol className="bom-rows">
            {slots.map((slot) => {
              const part = build[slot.id];
              const offer = part && bestOffer(part);
              const n = platform.slots.indexOf(slot) + 1;
              const rowIssues = issues.filter((i) => i.slots.includes(slot.id) && i.severity !== 'info');
              return (
                <li
                  key={slot.id}
                  className={'bom-row ' + states[slot.id] + (hover === slot.id ? ' hover' : '')}
                  onMouseEnter={() => onHover(slot.id)}
                  onMouseLeave={() => onHover(null)}
                >
                  <span className="bom-no">{n}</span>
                  <button className="bom-main" onClick={() => onOpen(slot.id)} aria-label={`${slot.name}: ${part ? `${part.brand} ${part.name}. Change` : 'choose a part'}`}>
                    <span className="bom-slot">
                      {slot.name}
                      {!slot.required && <span className="opt">Optional</span>}
                    </span>
                    {part ? (
                      <span className="bom-part">
                        <span className="brand">{part.brand}</span> {part.name}
                        {part.serialized && <span className="ffl" title="Serialized: ships to an FFL">FFL</span>}
                      </span>
                    ) : (
                      <span className="bom-part empty">{slot.required ? 'Choose a part' : 'None selected'}</span>
                    )}
                    {rowIssues.map((i, k) => <span key={k} className={'bom-issue ' + i.severity}>{i.message}</span>)}
                  </button>
                  <span className="bom-price">
                    {offer ? (
                      <>
                        <span className="amt">{money(offer.price)}</span>
                        <span className="src">{RETAILERS[offer.retailer].name}</span>
                      </>
                    ) : <span className="amt dim">—</span>}
                  </span>
                  <span className="bom-act">
                    <StateTag state={states[slot.id]} />
                    {part && !slot.required && (
                      <button className="x" onClick={() => onRemove(slot.id)} aria-label={`Remove ${slot.name}`} title="Remove">×</button>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

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
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  const all = platform.parts
    .filter((p) => p.slot === slot.id)
    .map((p) => {
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
            <p className="eyebrow">Item {number} · {platform.name}</p>
            <h2 id="picker-title">{slot.name}</h2>
            <p className="drawer-hint">{slot.hint}</p>
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="drawer-tools">
          <div className="seg" role="radiogroup" aria-label="Sort by">
            {([['fit', 'Best fit'], ['price', 'Price'], ['picks', 'Our picks']] as [SortKey, string][]).map(([k, label]) => (
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
  const query = `${part.brand} ${part.name}`;
  const live = part.offers.some((o) => o.checkedAt);
  return (
    <li className={'cand ' + fit + (selected ? ' selected' : '')}>
      <div className="cand-top">
        <StateTag state={fit} />
        {part.pick && <span className={'pick ' + part.pick.tier}>{TIER_LABEL[part.pick.tier]} pick</span>}
        {part.serialized && <span className="ffl">FFL</span>}
        {selected && <span className="in-build">In your build</span>}
      </div>
      <div className="cand-mid">
        <div className="cand-body">
          <h3 className="cand-name"><span className="brand">{part.brand}</span> {part.name}</h3>
          <ul className="specs">{part.specs.map((s) => <li key={s}>{s}</li>)}</ul>
          {part.pick && <p className="pick-note">{part.pick.note}</p>}
          {issues.map((i, n) => <p key={n} className={'cand-issue ' + i.severity}>{i.message}</p>)}
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
                  <td className="num"><a href={o.url ?? offerUrl(o.retailer, query)} target="_blank" rel="noopener noreferrer">{o.url ? 'View ↗' : 'Search ↗'}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

function buildStatus(platform: Platform, build: Build, issues: Issue[]) {
  const required = platform.slots.filter((s) => s.required);
  const missing = required.filter((s) => !build[s.id]).length;
  const errors = issues.filter((i) => i.severity === 'error').length;
  if (errors) return { cls: 'error', text: `${errors} conflict${errors > 1 ? 's' : ''} to fix` };
  if (missing) return { cls: 'warn', text: `${missing} required part${missing > 1 ? 's' : ''} missing` };
  return { cls: 'ok', text: 'Complete and compatible' };
}

const buildTotal = (platform: Platform, build: Build) =>
  platform.slots.reduce((sum, s) => sum + (build[s.id] ? bestOffer(build[s.id]!)?.price ?? 0 : 0), 0);

function Dock({ platform, build, issues }: { platform: Platform; build: Build; issues: Issue[] }) {
  const state = buildStatus(platform, build, issues);
  return (
    <div className="dock" role="region" aria-label="Build total">
      <div>
        <div className="dock-total">{money(buildTotal(platform, build))}</div>
        <p className={'status ' + state.cls}>{state.text}</p>
      </div>
      <a className="btn" href="#summary">Summary</a>
    </div>
  );
}

function Summary({ platform, build, issues, states, onPreset, onClear, onOpen }: {
  platform: Platform; build: Build; issues: Issue[]; states: Record<string, RegionState>;
  onPreset: (t: Tier) => void; onClear: () => void; onOpen: (s: string) => void;
}) {
  const chosen = platform.slots.map((s) => build[s.id]).filter((p): p is Part => !!p);
  const required = platform.slots.filter((s) => s.required);
  const filled = required.filter((s) => build[s.id]).length;
  const total = buildTotal(platform, build);
  const highest = chosen.reduce((sum, p) => sum + priceRange(p)[1], 0);
  const retailersUsed = new Set(chosen.map((p) => bestOffer(p)?.retailer)).size;
  const carts = singleRetailerCarts(chosen).slice(0, 4);
  const [dollars, cents] = money(total).split('.');
  const state = buildStatus(platform, build, issues);

  const presetTotal = (t: Tier) => {
    const b = toBuild(platform, presetSelection(platform, t));
    return Object.values(b).reduce((s, p) => s + (p ? bestOffer(p)?.price ?? 0 : 0), 0);
  };

  return (
    <aside className="rail" id="summary" aria-label="Build summary">
      <section className="ticket">
        <p className="eyebrow">Build total at best prices</p>
        <p className="total"><span>{dollars}</span><small>.{cents}</small></p>
        <p className="total-sub">
          {chosen.length} parts from {retailersUsed} retailer{retailersUsed === 1 ? '' : 's'}
          {highest > total && <><br />{money(highest - total)} below the highest listed prices</>}
        </p>
        <div className="segments" role="img" aria-label={`${filled} of ${required.length} required parts chosen`}>
          {platform.slots.map((s) => (
            <button key={s.id} className={'segment ' + states[s.id] + (s.required ? '' : ' optional')} onClick={() => onOpen(s.id)} aria-label={s.name} title={s.name} tabIndex={-1} />
          ))}
        </div>
        <p className={'status ' + state.cls}>{state.text}</p>
      </section>

      {issues.length > 0 && (
        <section className="panel">
          <h2 className="panel-title">Compatibility</h2>
          <ul className="issues">
            {issues.map((i, n) => (
              <li key={n} className={'issue ' + i.severity}>
                <span className="issue-tag">{SEV_LABEL[i.severity]}</span>
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2 className="panel-title">Buy it all from one store</h2>
        <p className="panel-note">Fewer shipments can beat a lower parts total. In-stock parts only.</p>
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

      <section className="panel">
        <h2 className="panel-title">Start from a recommended build</h2>
        <div className="presets">
          {(['budget', 'value', 'premium'] as Tier[]).map((t) => (
            <button key={t} className="preset" onClick={() => onPreset(t)}>
              <span className="preset-name">{TIER_LABEL[t]}</span>
              <span className="preset-note">{TIER_NOTE[t]}</span>
              <span className="preset-amt">{money(presetTotal(t))}</span>
            </button>
          ))}
        </div>
        <button className="btn ghost wide" onClick={onClear}>Clear build</button>
      </section>
    </aside>
  );
}
