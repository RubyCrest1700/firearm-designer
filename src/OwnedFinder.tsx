import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { bestOffer, money, type Owned } from './engine';
import { findParts, isLink, type Found } from './find';
import { titleCase } from './text';
import type { Build, Part, Platform } from './types';
import { useDrawer } from './ui';

/**
 * "Parts I Own": search the catalog by what's on the box or paste a product link, then mark the part as owned.
 * Owned parts stay in the build and its fit checks but leave the total. A part we don't list can still be
 * marked as owned by slot; it fills the slot without a fit check.
 */
export function OwnedFinder({ platform, build, owned, onOwn, onOwnOther, onSwitch, onClose }: {
  platform: Platform; build: Build; owned: Owned; onOwn: (p: Part) => void; onOwnOther: (slot: string) => void;
  onSwitch: (platformId: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [otherSlot, setOtherSlot] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useDrawer(onClose, inputRef);
  const { here, elsewhere } = useMemo(() => findParts(query, platform), [query, platform]);
  const shown = here.slice(0, 30);
  const otherPlatforms = [...new Map(elsewhere.map((f) => [f.platform.id, f.platform])).values()];
  const ownedList = platform.slots.filter((s) => owned.owned.has(s.id) || owned.other.has(s.id));
  const searched = query.trim().length > 0;

  return createPortal(
    <div className="drawer-wrap">
      <div className="scrim" onClick={onClose} />
      <div className="drawer finder" role="dialog" aria-modal="true" aria-labelledby="finder-title">
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
      </div>
    </div>,
    document.body,
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
