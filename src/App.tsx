import { useEffect, useMemo, useState } from 'react';
import { PLATFORMS, PRICES_UPDATED_AT } from './data';
import { RETAILERS, offerUrl } from './data/retailers';
import {
  bestOffer, candidateIssues, issuesFor, money, presetSelection, priceRange,
  singleRetailerCarts, toBuild, worst, type Selection,
} from './engine';
import type { Build, Issue, Part, Platform, Severity, Slot, Tier } from './types';

const STORE_KEY = 'firearm-designer:v2';
const TIER_LABEL: Record<Tier, string> = { budget: 'Budget', value: 'Best value', premium: 'Premium' };
const SEV_LABEL: Record<Severity, string> = { error: 'Conflict', warn: 'Check', info: 'Note' };

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

export default function App() {
  const saved = useMemo(loadSaved, []);
  const [platformId, setPlatformId] = useState(saved?.platform ?? PLATFORMS[0].id);
  const [selections, setSelections] = useState<Record<string, Selection>>({ ...defaultSelections(), ...saved?.selections });
  const [openSlot, setOpenSlot] = useState<string | null>(saved ? null : 'barrel');

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

  const switchPlatform = (id: string) => {
    setPlatformId(id);
    setOpenSlot(null);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <h1>Firearm Designer</h1>
            <p className="tagline">Plan a build part by part. Check fit, compare prices, buy where it's cheapest.</p>
          </div>
        </div>
        <nav className="platforms" aria-label="Platform">
          {PLATFORMS.map((p) => (
            <button key={p.id} className={'platform' + (p.id === platform.id ? ' active' : '')} aria-pressed={p.id === platform.id} onClick={() => switchPlatform(p.id)}>
              <span className="platform-name">{p.name}</span>
              <span className="platform-family">{p.family}</span>
            </button>
          ))}
        </nav>
      </header>

      <p className="notice">
        {PRICES_UPDATED_AT ? (
          <><strong>Prices checked {new Date(PRICES_UPDATED_AT).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.</strong> Prices marked “sample” aren't tracked yet. </>
        ) : (
          <><strong>Sample prices.</strong> Live price tracking is being set up; these numbers are illustrative. </>
        )}
        This site doesn't sell anything. Always confirm the price at the retailer.
      </p>

      <main className="layout">
        <section className="build" aria-label={`${platform.name} build`}>
          <div className="build-head">
            <h2>{platform.name} build</h2>
            <p className="muted">{platform.blurb}</p>
          </div>
          {groupSlots(platform.slots).map(([group, slots]) => (
            <div className="group" key={group}>
              <h3 className="group-title">{group}</h3>
              <ul className="rows">
                {slots.map((slot) => (
                  <SlotRow
                    key={slot.id}
                    platform={platform}
                    slot={slot}
                    build={build}
                    issues={issues.filter((i) => i.slots.includes(slot.id))}
                    open={openSlot === slot.id}
                    onToggle={() => setOpenSlot(openSlot === slot.id ? null : slot.id)}
                    onChoose={(id) => choose(slot.id, id)}
                    onRemove={() => remove(slot.id)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>

        <Summary platform={platform} build={build} issues={issues} onPreset={(t) => { setSel(presetSelection(platform, t)); setOpenSlot(null); }} onClear={() => setSel({})} />
      </main>

      <footer className="foot muted">
        Serialized parts (marked FFL) are legally the firearm and ship to a licensed dealer. Laws vary by state; check yours before you buy.
      </footer>
    </div>
  );
}

function groupSlots(slots: Slot[]): [string, Slot[]][] {
  const m = new Map<string, Slot[]>();
  for (const s of slots) m.set(s.group, [...(m.get(s.group) ?? []), s]);
  return [...m.entries()];
}

function SevDot({ sev }: { sev?: Severity | 'ok' | 'empty' }) {
  return <span className={'dot ' + (sev ?? 'ok')} aria-hidden="true" />;
}

function SlotRow(props: {
  platform: Platform; slot: Slot; build: Build; issues: Issue[]; open: boolean;
  onToggle: () => void; onChoose: (id: string) => void; onRemove: () => void;
}) {
  const { platform, slot, build, issues, open } = props;
  const part = build[slot.id];
  const offer = part && bestOffer(part);
  const sev = part ? worst(issues) ?? 'ok' : 'empty';
  return (
    <li className={'row' + (open ? ' open' : '') + (part ? '' : ' empty')}>
      <div className="row-main">
        <div className="row-slot">
          <SevDot sev={sev} />
          <div>
            <div className="slot-name">{slot.name}</div>
            <div className="slot-req">{slot.required ? 'Required' : 'Optional'}</div>
          </div>
        </div>
        <div className="row-part">
          {part ? (
            <>
              <div className="part-name"><span className="part-brand">{part.brand}</span> {part.name}</div>
              <div className="chips">
                {part.serialized && <span className="chip ffl" title="Serialized: ships to an FFL">FFL</span>}
                {part.specs.slice(0, 3).map((s) => <span key={s} className="chip">{s}</span>)}
              </div>
              {issues.map((i, n) => <p key={n} className={'inline-issue ' + i.severity}>{i.message}</p>)}
            </>
          ) : (
            <div className="part-empty">{slot.hint}</div>
          )}
        </div>
        <div className="row-price">
          {offer && (
            <>
              <div className="price">{money(offer.price)}</div>
              <div className="price-src">{RETAILERS[offer.retailer].name}</div>
            </>
          )}
        </div>
        <div className="row-actions">
          <button className={part ? 'btn' : 'btn primary'} aria-expanded={open} onClick={props.onToggle}>
            {open ? 'Close' : part ? 'Change' : `Choose`}
          </button>
          {part && !open && <button className="btn ghost" onClick={props.onRemove} aria-label={`Remove ${slot.name}`}>Remove</button>}
        </div>
      </div>
      {open && <Picker platform={platform} slot={slot} build={build} selectedId={part?.id} onChoose={props.onChoose} />}
    </li>
  );
}

type SortKey = 'fit' | 'price' | 'picks';

function Picker({ platform, slot, build, selectedId, onChoose }: {
  platform: Platform; slot: Slot; build: Build; selectedId?: string; onChoose: (id: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>('fit');
  const [hideConflicts, setHideConflicts] = useState(false);
  const rank = { ok: 0, info: 0, warn: 1, error: 2 } as const;

  const candidates = platform.parts
    .filter((p) => p.slot === slot.id)
    .map((p) => {
      const iss = candidateIssues(platform, build, p);
      return { part: p, issues: iss, sev: worst(iss) ?? ('ok' as const), price: bestOffer(p)?.price ?? Infinity };
    })
    .filter((c) => !hideConflicts || c.sev !== 'error')
    .sort((a, b) => {
      if (sort === 'price') return a.price - b.price;
      if (sort === 'picks') return Number(!!b.part.pick) - Number(!!a.part.pick) || a.price - b.price;
      return rank[a.sev] - rank[b.sev] || a.price - b.price;
    });

  return (
    <div className="picker">
      <div className="picker-head">
        <p className="muted">{slot.hint}</p>
        <div className="picker-controls">
          <label className="ctl">
            <span>Sort</span>
            <select id={`sort-${slot.id}`} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="fit">Best fit</option>
              <option value="price">Lowest price</option>
              <option value="picks">Recommended</option>
            </select>
          </label>
          <label className="ctl check">
            <input id={`hide-${slot.id}`} type="checkbox" checked={hideConflicts} onChange={(e) => setHideConflicts(e.target.checked)} />
            <span>Hide conflicts</span>
          </label>
        </div>
      </div>
      <ul className="cands">
        {candidates.map((c) => (
          <Candidate key={c.part.id} part={c.part} issues={c.issues} sev={c.sev} selected={c.part.id === selectedId} onChoose={() => onChoose(c.part.id)} />
        ))}
        {candidates.length === 0 && <li className="muted cand-empty">Every option conflicts with your current build. Turn off “Hide conflicts” to see why.</li>}
      </ul>
    </div>
  );
}

function Candidate({ part, issues, sev, selected, onChoose }: {
  part: Part; issues: Issue[]; sev: Severity | 'ok'; selected: boolean; onChoose: () => void;
}) {
  const [showPrices, setShowPrices] = useState(false);
  const best = bestOffer(part);
  const [lo, hi] = priceRange(part);
  const fitLabel = sev === 'ok' || sev === 'info' ? 'Fits' : SEV_LABEL[sev];
  const query = `${part.brand} ${part.name}`;
  return (
    <li className={'cand' + (selected ? ' selected' : '')}>
      <div className="cand-main">
        <span className={'fit ' + (sev === 'info' ? 'ok' : sev)}>{fitLabel}</span>
        <div className="cand-body">
          <div className="part-name"><span className="part-brand">{part.brand}</span> {part.name}</div>
          <div className="chips">
            {part.serialized && <span className="chip ffl">FFL</span>}
            {part.pick && <span className={'chip pick ' + part.pick.tier}>{TIER_LABEL[part.pick.tier]} pick</span>}
            {part.specs.map((s) => <span key={s} className="chip">{s}</span>)}
          </div>
          {part.pick && <p className="pick-note">{part.pick.note}</p>}
          {issues.map((i, n) => <p key={n} className={'inline-issue ' + i.severity}>{i.message}</p>)}
        </div>
        <div className="cand-price">
          {best && <div className="price">{money(best.price)}</div>}
          {best && <div className="price-src">at {RETAILERS[best.retailer].name}</div>}
          <button className="linkish" aria-expanded={showPrices} onClick={() => setShowPrices(!showPrices)}>
            {part.offers.length > 1 ? `Compare ${part.offers.length} prices` : '1 retailer'}{hi > lo ? ` · save ${money(hi - lo)}` : ''}
          </button>
        </div>
        <div className="cand-act">
          {selected ? <span className="in-build">In build</span> : <button className="btn primary" onClick={onChoose}>Add</button>}
        </div>
      </div>
      {showPrices && (
        <div className="offers-wrap">
          <table className="offers">
            <thead><tr><th>Retailer</th><th className="num">Price</th><th>Stock</th><th>Price data</th><th /></tr></thead>
            <tbody>
              {[...part.offers].sort((a, b) => a.price - b.price).map((o) => (
                <tr key={o.retailer} className={best && o.retailer === best.retailer ? 'best' : ''}>
                  <td>{RETAILERS[o.retailer].name}</td>
                  <td className="num">{money(o.price)}</td>
                  <td>{o.inStock ? 'In stock' : <span className="oos">Out of stock</span>}</td>
                  <td className="muted">{o.checkedAt ? `Live, ${new Date(o.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Sample'}</td>
                  <td className="num"><a href={o.url ?? offerUrl(o.retailer, query)} target="_blank" rel="noopener noreferrer">{o.url ? 'View' : 'Search'}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

function Summary({ platform, build, issues, onPreset, onClear }: {
  platform: Platform; build: Build; issues: Issue[]; onPreset: (t: Tier) => void; onClear: () => void;
}) {
  const chosen = platform.slots.map((s) => build[s.id]).filter((p): p is Part => !!p);
  const required = platform.slots.filter((s) => s.required);
  const filled = required.filter((s) => build[s.id]).length;
  const total = chosen.reduce((sum, p) => sum + (bestOffer(p)?.price ?? 0), 0);
  const highest = chosen.reduce((sum, p) => sum + priceRange(p)[1], 0);
  const retailersUsed = new Set(chosen.map((p) => bestOffer(p)?.retailer)).size;
  const errors = issues.filter((i) => i.severity === 'error').length;
  const carts = singleRetailerCarts(chosen).slice(0, 4);
  const complete = filled === required.length;

  let state: { cls: string; text: string };
  if (errors) state = { cls: 'error', text: `${errors} conflict${errors > 1 ? 's' : ''} to fix` };
  else if (!complete) state = { cls: 'warn', text: `${required.length - filled} required part${required.length - filled > 1 ? 's' : ''} missing` };
  else state = { cls: 'ok', text: 'Complete and compatible' };

  const presetTotal = (t: Tier) => {
    const b = toBuild(platform, presetSelection(platform, t));
    return Object.values(b).reduce((s, p) => s + (p ? bestOffer(p)?.price ?? 0 : 0), 0);
  };

  return (
    <aside className="summary" aria-label="Build summary">
      <div className="panel">
        <div className="total-label">Build total at best prices</div>
        <div className="total">{money(total)}</div>
        <div className="total-sub muted">
          {chosen.length} parts from {retailersUsed} retailer{retailersUsed === 1 ? '' : 's'}
          {highest > total && <> · {money(highest - total)} less than paying the highest listed price</>}
        </div>
        <div className="progress" role="img" aria-label={`${filled} of ${required.length} required parts chosen`}>
          <div className="bar" style={{ width: `${(filled / required.length) * 100}%` }} />
        </div>
        <div className={'state ' + state.cls}><SevDot sev={state.cls as Severity | 'ok'} />{state.text}</div>
      </div>

      {issues.length > 0 && (
        <div className="panel">
          <h3 className="panel-title">Compatibility</h3>
          <ul className="issues">
            {issues.map((i, n) => (
              <li key={n} className={'issue ' + i.severity}>
                <span className="issue-tag">{SEV_LABEL[i.severity]}</span>
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel">
        <h3 className="panel-title">One-store checkout</h3>
        <p className="muted small">Fewer shipments can beat a lower parts total. In-stock parts only.</p>
        <table className="carts">
          <tbody>
            {carts.map((c) => (
              <tr key={c.retailer}>
                <td>{RETAILERS[c.retailer].name}</td>
                <td className="num muted">{c.carried}/{chosen.length}</td>
                <td className="num">{money(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3 className="panel-title">Start from a recommended build</h3>
        <div className="presets">
          {(['budget', 'value', 'premium'] as Tier[]).map((t) => (
            <button key={t} className="preset" onClick={() => onPreset(t)}>
              <span>{TIER_LABEL[t]}</span>
              <span className="num">{money(presetTotal(t))}</span>
            </button>
          ))}
        </div>
        <button className="btn ghost wide" onClick={onClear}>Clear build</button>
      </div>
    </aside>
  );
}
