import { useEffect, useRef, useState } from 'react';
import { PLATFORMS } from './data';
import { RETAILERS } from './data/retailers';
import { bestOffer, encodeMount, money, ownedOf, placementOf, presetSelection, baseSelection, priceRange, singleRetailerCarts, toBuild, type Owned, type Selection } from './engine';
import type { RegionState } from './Blueprint';
import { Blueprint, useDrawings } from './drawings';
import { buildStatus, statesFor } from './status';
import { TIER_LABEL, totalOf, type SavedBuild } from './store';
import { type CommunityBuild } from './community';
import { awarenessFor, type Aware } from './awareness';
import { buildWeight, formatWeight } from './weight';
import { MOVABLE, SIDE_LABEL, mountsFor, railLength, type Resolved } from './data/addons';
import { withArticle } from './text';
import type { Build, Issue, Part, Platform, Side, Slot, Tier } from './types';
import { OwnedFinder } from './OwnedFinder';
import { Picker } from './Picker';
import { ChangeChip, FitTag, PlatformMenu, SEV_LABEL } from './ui';

export function BuilderPage({ platformId, startPart, setPlatformId, selection, setSelection, startOver, openSaved, communityOpen, onSave, onShare, onCopyLink, onBuyClick, onBrowseFeatured, onCompare }: {
  platformId: string; startPart: Part | null; setPlatformId: (id: string) => void; selection: Selection; setSelection: (s: Selection) => void;
  /** Replaces the whole build, leaving the saved or community build it came from: the next save is a new build. */
  startOver: (s: Selection) => void;
  openSaved: SavedBuild | null; communityOpen: CommunityBuild | null; onSave: (name: string, asNew: boolean) => void;
  onShare: (name: string, note: string) => Promise<void>; onCopyLink: () => void; onBuyClick: () => void; onBrowseFeatured: () => void;
  onCompare: () => void;
}) {
  const [openSlot, setOpenSlot] = useState<string | null>(startPart?.slot ?? null);
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
  const drawings = useDrawings();
  const spec = drawings ? drawings.sceneFor(platform, build, place).spec : '';
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
  // A builder with models (the double-stack 9mm Glocks): the model the chosen parts make, and the model the
  // starter builds and part lists follow (the one made, else the last one picked, else the default).
  const [modelPick, setModelPick] = useState<Record<string, string>>({});
  const made = platform.modelOf?.(build);
  const model = platform.models?.find((m) => m.id === (made?.id ?? modelPick[platform.id])) ?? platform.models?.find((m) => m.presets === platform.presets);
  const starter = model ? { ...platform, presets: model.presets, base: model.base } : platform;
  const baseNote = rifle ? 'Base is a plain rifle: standard parts, no sights or optic.' : 'Base is the factory gun as it comes in the box.';

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
          {platform.models && (
            <div className="model-row" role="group" aria-label="Model">
              <span className="tb-label">Model</span>
              {platform.models.map((m) => (
                <button key={m.id} className={'chip' + (made?.id === m.id ? ' on' : '')} aria-pressed={made?.id === m.id} title={`${m.name}: ${m.blurb}`}
                  onClick={() => { setModelPick({ ...modelPick, [platform.id]: m.id }); startOver(baseSelection({ ...platform, presets: m.presets, base: m.base })); setOpenSlot(null); }}>
                  {m.short}
                </button>
              ))}
              {made && !made.id && <span className="model-made">{made.name}</span>}
            </div>
          )}
        </div>

        <div className="workbench">
          <div className="wb-center">
            <div className="bp-toolbar" role="toolbar" aria-label="Build actions">
              <span className="tb-label">{chosen === 0 ? 'Start From' : 'Start Over From'}</span>
              <button className="chip" title={baseNote} onClick={() => { startOver(baseSelection(starter)); setOpenSlot(null); }}>
                Base{model ? ` ${model.short}` : ''} <span className="chip-amt">{money(totalOf(platform, toBuild(platform, baseSelection(starter))))}</span>
              </button>
              {(['budget', 'value', 'premium'] as Tier[]).map((t) => {
                const sel = presetSelection(starter, t);
                const optic = opticTag(platform.parts.find((p) => p.id === sel.optic));
                return (
                  <button key={t} className="chip" onClick={() => { startOver(sel); setOpenSlot(null); }}>
                    {TIER_LABEL[t]}{model ? ` ${model.short}` : ''} <span className="chip-amt">{money(totalOf(platform, toBuild(platform, sel)))}</span>
                    {optic && <> <span className="chip-tag">{optic}</span></>}
                  </button>
                );
              })}
              <button className="chip" onClick={onBrowseFeatured}>Community Builds</button>
              <button className="chip chip-own" onClick={() => setFinding(true)}>Parts I Own</button>
              {chosen > 0 && <button className="chip chip-clear" onClick={() => { startOver({}); setOpenSlot(null); }}>Clear Build</button>}
              <p className="tb-note">{baseNote} Budget, Best Value and Premium are builds from our parts list.</p>
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
                <div>{platform.models ? <><span>Model</span><b>{made?.name ?? '—'}</b></> : <><span>Platform</span><b>{platform.name}</b></>}</div>
                <div><span>Spec</span><b>{spec}</b></div>
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
          focusId={startPart?.slot === openSlotObj.id ? startPart.id : undefined}
          number={platform.slots.indexOf(openSlotObj) + 1}
          model={model}
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

/** The tag on a starter build's chip saying what optic it comes with, if any. */
function opticTag(optic?: Part) {
  if (!optic) return null;
  return optic.attrs.kind === 'lpvo' || optic.attrs.kind === 'scope' ? 'Scope' : 'Red Dot';
}

function groupSlots(slots: Slot[]): [string, Slot[]][] {
  const m = new Map<string, Slot[]>();
  for (const s of slots) m.set(s.group, [...(m.get(s.group) ?? []), s]);
  return [...m.entries()];
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
                  <button className="part-main" onClick={() => onOpen(slot.id)}>
                    <span className="part-slot">{slot.name}{!slot.required && <span className="opt">Optional</span>}</span>
                    {part ? (
                      <span className="part-name"><span className="brand-dim">{part.brand}</span> {part.name}{part.serialized && <span className="ffl" title="Serialized: ships to an FFL">FFL</span>}<span className="sr">. Change</span></span>
                    ) : other ? (
                      <span className="part-name">Your own {slot.name.toLowerCase()} <span className="brand-dim">(not in our list, so its fit isn't checked)</span></span>
                    ) : (
                      <span className="part-name choose">{slot.required ? `Choose ${withArticle(slot.name)}` : 'Add one'} →</span>
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
  platform: Platform; build: Build; issues: Issue[]; aware: Aware[]; states: Record<string, RegionState>; status: { cls: string; text: string; complete: boolean }; total: number;
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
  const canShare = status.complete && owned.other.size === 0;
  const all = platform.slots.map((s) => build[s.id]).filter((p): p is Part => !!p);
  const chosen = all.filter((p) => !owned.owned.has(p.slot));
  const ownedParts = all.filter((p) => owned.owned.has(p.slot));
  const ownedCount = ownedParts.length + owned.other.size;
  const ownedWorth = ownedParts.reduce((sum, p) => sum + (bestOffer(p)?.price ?? 0), 0);
  const highest = chosen.reduce((sum, p) => sum + priceRange(p)[1], 0);
  const retailers = new Set(chosen.map((p) => bestOffer(p)?.retailer)).size;
  const carts = singleRetailerCarts(chosen).slice(0, 4);
  const [dollars, cents] = money(total).split('.');

  // Name new builds after the model when the builder covers several ("My Glock 19 build").
  const defaultName = `My ${platform.modelOf?.(build)?.name ?? platform.name} build`;
  const startSave = () => { setName(openSaved?.name ?? defaultName); setSaving(true); };
  const submit = (asNew: boolean) => { if (name.trim()) { onSave(name.trim(), asNew); setSaving(false); } };
  const startShare = () => { setName(openSaved?.name ?? defaultName); setNote(''); setShareError(null); setSharing(true); setSaving(false); };
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
            <label htmlFor="share-note">What's It For? <span className="dim">(Optional)</span></label>
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
