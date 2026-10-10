import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RETAILERS, buyUrl } from './data/retailers';
import { bestOffer, candidateIssues, money, priceLabel, priceRange, priceText, worst } from './engine';
import type { RegionState } from './Blueprint';
import { TIER_LABEL } from './store';
import { daysAgo, hasHistory, partSeries } from './data/history';
import { PriceChart } from './PriceChart';
import { isPlural, titleCase, withArticle } from './text';
import type { Build, Issue, Part, Placement, Platform, PlatformModel, Severity, Slot } from './types';
import { ChangeChip, FitTag, shortDate, useDrawer } from './ui';

type SortKey = 'fit' | 'price' | 'picks';

export function Picker({ platform, slot, focusId: focusProp, number, model, build, place, selectedId, ownsSelected, onChoose, onToggleOwn, onOwnOther, onRemove, onClose, onBuyClick }: {
  platform: Platform; slot: Slot; focusId?: string; number: number; model?: PlatformModel; build: Build; place: Placement; selectedId?: string; ownsSelected: boolean;
  onChoose: (id: string, own: boolean) => void; onToggleOwn: () => void; onOwnOther: () => void; onRemove?: () => void; onClose: () => void; onBuyClick: () => void;
}) {
  const [sort, setSort] = useState<SortKey>('fit');
  const [hideConflicts, setHideConflicts] = useState(false);
  // A part opened from a home page price drop is listed first, with its prices open, even if it's for another model.
  const [focusId] = useState(focusProp);
  const [allModels, setAllModels] = useState(!!focusId && !!model?.parts && !model.parts(platform.parts.find((p) => p.id === focusId)!));
  const closeRef = useRef<HTMLButtonElement>(null);
  const rank = { ok: 0, info: 0, warn: 1, error: 2 } as const;
  useDrawer(onClose, closeRef);

  // In a builder with models, the list starts with the current model's parts (frames, slides, barrels...).
  const inSlot = platform.parts.filter((p) => p.slot === slot.id);
  const forModel = model?.parts ? inSlot.filter((p) => model.parts!(p) || p.id === selectedId) : inSlot;
  const all = (allModels ? inSlot : forModel).map((p) => {
    const iss = candidateIssues(platform, build, p, place);
    return { part: p, issues: iss, sev: worst(iss) ?? ('ok' as const), price: bestOffer(p)?.price ?? Infinity };
  });
  const conflicts = all.filter((c) => c.sev === 'error').length;
  const candidates = all
    .filter((c) => !hideConflicts || c.sev !== 'error')
    .sort((a, b) => {
      if (focusId && (a.part.id === focusId) !== (b.part.id === focusId)) return a.part.id === focusId ? -1 : 1;
      // Every sort lists parts that conflict with the build after the ones that fit.
      const clash = Number(a.sev === 'error') - Number(b.sev === 'error');
      if (sort === 'price') return clash || a.price - b.price;
      if (sort === 'picks') return clash || Number(!!b.part.pick) - Number(!!a.part.pick) || a.price - b.price;
      return rank[a.sev] - rank[b.sev] || a.price - b.price;
    });

  return createPortal(
    <div className="drawer-wrap">
      <div className="scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="picker-title">
        <header className="drawer-head">
          <div>
            <p className="kicker">Item {number} · {platform.name}</p>
            <h2 id="picker-title">{titleCase(slot.name)}</h2>
            <p className="drawer-hint">{slot.hint}</p>
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="drawer-tools">
          {model && forModel.length < inSlot.length && (
            <div className="segctl" role="radiogroup" aria-label="Show parts for">
              <button role="radio" aria-checked={!allModels} className={allModels ? '' : 'on'} onClick={() => setAllModels(false)}>{model.short} Parts ({forModel.length})</button>
              <button role="radio" aria-checked={allModels} className={allModels ? 'on' : ''} onClick={() => setAllModels(true)}>All Models ({inSlot.length})</button>
            </div>
          )}
          <div className="segctl" role="radiogroup" aria-label="Sort by">
            {([['fit', 'Best Fit'], ['price', 'Lowest Price'], ['picks', 'Our Picks']] as [SortKey, string][]).map(([k, label]) => (
              <button key={k} role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{label}</button>
            ))}
          </div>
          {conflicts > 0 && (
            <label className="toggle" htmlFor={`hide-${slot.id}`}>
              <input id={`hide-${slot.id}`} type="checkbox" checked={hideConflicts} onChange={(e) => setHideConflicts(e.target.checked)} />
              <span>Hide {conflicts} That Conflict</span>
            </label>
          )}
        </div>
        <ul className="cands">
          {candidates.map((c) => (
            <Candidate key={c.part.id} part={c.part} open={c.part.id === focusId} issues={c.issues} sev={c.sev} selected={c.part.id === selectedId} owned={c.part.id === selectedId && ownsSelected}
              onChoose={(own) => (c.part.id === selectedId ? onToggleOwn() : onChoose(c.part.id, own))} onBuyClick={onBuyClick} />
          ))}
          {candidates.length === 0 && <li className="cand-empty">Every option conflicts with your current build. Turn off the filter to see why.</li>}
        </ul>
        <div className="own-other">
          <p>Already have {withArticle(slot.name)} that {isPlural(slot.name) ? "aren't" : "isn't"} listed here?</p>
          <button className="btn" onClick={onOwnOther}>Use My Own {titleCase(slot.name)}</button>
          <p className="dim">It's left out of the total. We can't check its fit, so double-check it with the maker.</p>
        </div>
        {onRemove && <button className="btn ghost wide" onClick={onRemove}>Remove {titleCase(slot.name)} from Build</button>}
      </div>
    </div>,
    document.body,
  );
}

function Candidate({ part, open, issues, sev, selected, owned, onChoose, onBuyClick }: {
  part: Part; open?: boolean; issues: Issue[]; sev: Severity | 'ok'; selected: boolean; owned: boolean; onChoose: (own: boolean) => void; onBuyClick: () => void;
}) {
  const [showPrices, setShowPrices] = useState(!!open);
  const best = bestOffer(part);
  const [lo, hi] = priceRange(part);
  const fit: RegionState = sev === 'ok' || sev === 'info' ? 'ok' : sev;
  const label = best ? priceLabel(best) : '';
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
          {best && <span className="amt">{priceText(best)}</span>}
          {best && <span className="src">{RETAILERS[best.retailer].name}{label ? ` · ${label}` : ''}</span>}
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
            <thead><tr><th>Retailer</th><th className="num">Price</th><th>Stock</th><th>Checked</th><th><span className="sr">Link</span></th></tr></thead>
            <tbody>
              {[...part.offers].sort((a, b) => a.price - b.price).map((o) => (
                <tr key={o.retailer} className={best && o.retailer === best.retailer ? 'best' : ''}>
                  <td>{RETAILERS[o.retailer].name}</td>
                  <td className="num">{priceText(o)}</td>
                  <td>{o.inStock ? 'In Stock' : <span className="oos">Out</span>}</td>
                  <td className="dim">{o.checkedAt ? `Live ${shortDate(o.checkedAt)}` : o.asOf ? `${priceLabel(o)} ${shortDate(o.asOf)}` : priceLabel(o)}</td>
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
