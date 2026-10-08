import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PLATFORMS, canonicalPlatform } from './data';
import type { RegionState } from './Blueprint';
import { Blueprint } from './drawings';
import { bestOffer, money, ownedOf, partIds, type Selection } from './engine';
import { FEATURED, buildOf, selectionFromParts, totalOf, type SavedBuild } from './store';
import { getBuild, listBuilds, type CommunityBuild } from './community';
import { buildStatus, statesFor } from './status';
import { buildWeight, formatWeight } from './weight';
import type { Issue, Part, Slot } from './types';

/** One side of the comparison: where the build came from, its name, and its parts. */
export interface CompareItem { kind: string; name: string; platform: string; selection: Selection }

const KEY = 'firearm-designer:compare:v1';

export function loadCompare(): (CompareItem | null)[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as (CompareItem | null)[]) : [];
    const ok = (x: CompareItem | null) => {
      const it = x && { ...x, platform: canonicalPlatform(x.platform) };
      return it && PLATFORMS.some((p) => p.id === it.platform) ? it : null;
    };
    return [ok(list[0] ?? null), ok(list[1] ?? null)];
  } catch {
    return [null, null];
  }
}
export function storeCompare(list: (CompareItem | null)[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch { /* this page only */ }
}

/** Reads a build link from this site or its share service: `?b=` and `/b/` links directly, `/c/` community links by id. */
export function parseBuildLink(text: string): { platform: string; selection: Selection } | { communityId: string } | null {
  let url: URL;
  try { url = new URL(text.trim()); } catch { return null; }
  const c = url.pathname.match(/\/c\/([a-z0-9]{10})\/?$/);
  if (c) return { communityId: c[1] };
  const b = url.pathname.match(/\/b\/([^/]+)\/?$/);
  const raw = url.searchParams.get('b') ?? (b ? decodeURIComponent(b[1]) : null);
  if (!raw) return null;
  const [old, ids = ''] = raw.split('~');
  const pid = canonicalPlatform(old);
  return PLATFORMS.some((p) => p.id === pid) ? { platform: pid, selection: selectionFromParts(pid, ids.split('.')) } : null;
}

/** Everything the comparison shows about one build. */
function factsOf(item: CompareItem) {
  const { platform, build, place } = buildOf(item.platform, item.selection);
  const owned = ownedOf(item.selection);
  const { issues, states } = statesFor(platform, build, place);
  return {
    item, platform, build, place, owned, issues, states,
    status: buildStatus(platform, build, issues, owned.other),
    toBuy: totalOf(platform, build, owned.owned),
    full: totalOf(platform, build),
    weight: buildWeight(platform, build),
    parts: partIds(item.selection).length + owned.other.size,
    ownedCount: owned.owned.size + owned.other.size,
    errors: issues.filter((i) => i.severity === 'error').length,
    checks: issues.filter((i) => i.severity === 'warn').length,
  };
}
type Facts = ReturnType<typeof factsOf>;

export function ComparePage({ items, onSet, saved, current, onOpen }: {
  items: (CompareItem | null)[]; onSet: (i: number, item: CompareItem | null) => void; saved: SavedBuild[];
  current: { platform: string; selection: Selection; name?: string } | null; onOpen: (item: CompareItem) => void;
}) {
  const [a, b] = items;
  const fa = useMemo(() => (a ? factsOf(a) : null), [a]);
  const fb = useMemo(() => (b ? factsOf(b) : null), [b]);
  const [onlyDiff, setOnlyDiff] = useState(false);

  const side = (i: number, f: Facts | null) => f ? (
    <div className="cmp-head card" key={i}>
      <p className="kicker">{'AB'[i]} · {f.item.kind}</p>
      <h2>{f.item.name}</h2>
      <p className="meta">{f.platform.name}</p>
      <div className="thumb"><Blueprint platform={f.platform} build={f.build} place={f.place} states={f.states} compact /></div>
      <div className="build-card-actions">
        <button className="btn primary" onClick={() => onOpen(f.item)}>Open in Builder</button>
        <button className="btn ghost" onClick={() => onSet(i, null)}>Change</button>
      </div>
    </div>
  ) : (
    <Chooser key={i} label={'AB'[i]} saved={saved} current={current} otherPlatform={(i === 0 ? b : a)?.platform} onPick={(item) => onSet(i, item)} />
  );

  return (
    <div className="wrap page compare-page">
      <div className="page-head">
        <p className="kicker">Compare</p>
        <h1>Compare Two Builds</h1>
        <p className="lede">Put two builds side by side to see what each costs, what it weighs, whether everything fits, and which parts differ. Pick from your saved builds, our starter builds, the Community page, or paste a build link.</p>
      </div>

      <div className="cmp-grid cmp-heads">
        <span className="cmp-label" aria-hidden="true" />
        {side(0, fa)}
        {side(1, fb)}
      </div>

      {fa && fb && (
        <>
          <section className="card cmp-table" aria-label="Totals">
            <h2 className="card-title">At a Glance</h2>
            <FactRow label={fa.ownedCount || fb.ownedCount ? 'Left to Buy' : 'Total at Best Prices'} a={money(fa.toBuy)} b={money(fb.toBuy)} diff={moneyDiff(fa.toBuy, fb.toBuy)} />
            {(fa.ownedCount > 0 || fb.ownedCount > 0) && (
              <FactRow label="Full Price, New" a={money(fa.full)} b={money(fb.full)} diff={moneyDiff(fa.full, fb.full)} />
            )}
            {(fa.ownedCount > 0 || fb.ownedCount > 0) && <FactRow label="Parts You Own" a={String(fa.ownedCount)} b={String(fb.ownedCount)} />}
            <FactRow label="Weight, Unloaded" a={weightText(fa, fb)} b={weightText(fb, fa)} diff={weightDiff(fa, fb)} />
            <FactRow label="Parts" a={`${fa.parts} of ${fa.platform.slots.length}`} b={`${fb.parts} of ${fb.platform.slots.length}`} />
            <FactRow label="Fit" a={<StatusText f={fa} />} b={<StatusText f={fb} />} />
            {(fa.issues.length > 0 || fb.issues.length > 0) && (
              <FactRow label="Fit Notes" a={<IssueList issues={fa.issues} />} b={<IssueList issues={fb.issues} />} />
            )}
          </section>

          <section className="card cmp-table" aria-label="Parts">
            <div className="cmp-table-head">
              <h2 className="card-title">Part by Part</h2>
              <label className="toggle" htmlFor="cmp-diff">
                <input id="cmp-diff" type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
                <span>Only Show Differences</span>
              </label>
            </div>
            <PartRows fa={fa} fb={fb} onlyDiff={onlyDiff} />
          </section>
        </>
      )}
    </div>
  );
}

/** A lower price wins: it says how much less that build costs. */
function moneyDiff(x: number, y: number): [ReactNode, ReactNode] | undefined {
  if (Math.abs(x - y) < 0.5) return undefined;
  return x < y ? [`${money(y - x)} less`, null] : [null, `${money(x - y)} less`];
}

const rifleUnits = (f: Facts, g: Facts) => f.platform.family === 'Rifle' || g.platform.family === 'Rifle';
const weightText = (f: Facts, g: Facts) => (f.weight.counted ? `${f.weight.estimated ? '≈ ' : ''}${formatWeight(f.weight.oz, rifleUnits(f, g))}` : '—');
function weightDiff(fa: Facts, fb: Facts): [ReactNode, ReactNode] | undefined {
  const d = fa.weight.oz - fb.weight.oz;
  if (!fa.weight.counted || !fb.weight.counted || Math.abs(d) < 0.5) return undefined;
  const t = `${formatWeight(Math.abs(d), rifleUnits(fa, fb))} lighter`;
  return d < 0 ? [t, null] : [null, t];
}

function FactRow({ label, a, b, diff }: { label: string; a: ReactNode; b: ReactNode; diff?: [ReactNode, ReactNode] }) {
  return (
    <div className="cmp-grid cmp-row">
      <span className="cmp-label">{label}</span>
      <span className={'cmp-cell' + (diff?.[0] ? ' better' : '')}>{a}{diff?.[0] && <span className="cmp-diff">{diff[0]}</span>}</span>
      <span className={'cmp-cell' + (diff?.[1] ? ' better' : '')}>{b}{diff?.[1] && <span className="cmp-diff">{diff[1]}</span>}</span>
    </div>
  );
}

function StatusText({ f }: { f: Facts }) {
  return <span className={'status small ' + f.status.cls}>{f.status.text}{f.checks > 0 && f.status.cls !== 'error' ? `, ${f.checks} to check` : ''}</span>;
}

function IssueList({ issues }: { issues: Issue[] }) {
  const shown = issues.filter((i) => i.severity !== 'info');
  if (!shown.length) return <span className="dim">None</span>;
  return <ul className="cmp-issues">{shown.map((i, n) => <li key={n} className={'row-issue ' + i.severity}>{i.message}</li>)}</ul>;
}

function PartRows({ fa, fb, onlyDiff }: { fa: Facts; fb: Facts; onlyDiff: boolean }) {
  // Slots line up by id, so an AR-15 and an AR-10, or two Glocks, compare part for part.
  const slots: Slot[] = [...fa.platform.slots, ...fb.platform.slots.filter((s) => !fa.platform.slots.some((x) => x.id === s.id))];
  const rows = slots.map((slot) => {
    const pa = fa.build[slot.id];
    const pb = fb.build[slot.id];
    const same = (pa?.id ?? '') === (pb?.id ?? '') && fa.owned.other.has(slot.id) === fb.owned.other.has(slot.id) && fa.owned.owned.has(slot.id) === fb.owned.owned.has(slot.id);
    return { slot, same };
  }).filter((r) => !onlyDiff || !r.same);
  if (!rows.length) return <p className="dim cmp-none">These two builds use the same parts.</p>;
  return (
    <>
      {rows.map(({ slot, same }) => (
        <div key={slot.id} className={'cmp-grid cmp-row' + (same ? ' same' : ' differs')}>
          <span className="cmp-label">{slot.name}</span>
          <PartCell f={fa} slot={slot} />
          <PartCell f={fb} slot={slot} />
        </div>
      ))}
    </>
  );
}

const FIT_TEXT: Partial<Record<RegionState, string>> = { warn: 'Check', error: 'Conflict' };

function PartCell({ f, slot }: { f: Facts; slot: Slot }) {
  const part: Part | undefined = f.build[slot.id];
  if (!f.platform.slots.some((s) => s.id === slot.id)) return <span className="cmp-cell dim">Not on a {f.platform.name}</span>;
  if (f.owned.other.has(slot.id)) return <span className="cmp-cell"><span className="dim">Your own part, not in our list</span><span className="cmp-price owned-note">You Own It</span></span>;
  if (!part) return <span className="cmp-cell dim">{slot.required ? 'Not chosen yet' : 'None'}</span>;
  const best = bestOffer(part);
  const fit = FIT_TEXT[f.states[slot.id]];
  return (
    <span className="cmp-cell">
      <span><span className="brand-dim">{part.brand}</span> {part.name}</span>
      <span className="cmp-price">
        {f.owned.owned.has(slot.id) ? <span className="owned-note">You Own It</span> : best ? money(best.price) : '—'}
        {fit && <span className={'fit-tag ' + f.states[slot.id]}>{fit}</span>}
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------- chooser */

type Source = 'saved' | 'current' | 'starter' | 'community' | 'link';

function Chooser({ label, saved, current, otherPlatform, onPick }: {
  label: string; saved: SavedBuild[]; current: { platform: string; selection: Selection; name?: string } | null;
  otherPlatform?: string; onPick: (item: CompareItem) => void;
}) {
  const sources: [Source, string][] = [
    ...(saved.length ? [['saved', 'My Builds'] as [Source, string]] : []),
    ...(current ? [['current', 'Current Build'] as [Source, string]] : []),
    ['starter', 'Starter Builds'], ['community', 'Community'], ['link', 'Paste a Link'],
  ];
  const [src, setSrc] = useState<Source>(sources[0][0]);
  const [platform, setPlatform] = useState(otherPlatform ?? current?.platform ?? PLATFORMS[0].id);
  const [community, setCommunity] = useState<CommunityBuild[] | null>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (src !== 'community' || community) return;
    listBuilds(null, 'top').then(setCommunity).catch(() => setCommunity([]));
  }, [src, community]);

  const option = (key: string, name: string, meta: string, item: CompareItem) => (
    <li key={key}>
      <button className="cmp-option" onClick={() => onPick(item)}>
        <span className="cmp-option-name">{name}</span>
        <span className="cmp-option-meta">{meta}</span>
      </button>
    </li>
  );
  const totalText = (pid: string, sel: Selection) => {
    const { platform: p, build } = buildOf(pid, sel);
    return `${p.name} · ${money(totalOf(p, build, ownedOf(sel).owned))}`;
  };

  const pasteLink = async () => {
    setError(null);
    const got = parseBuildLink(link);
    if (!got) { setError("That doesn't look like a Drop-In Builds link. Use Copy Link on a build, then paste it here."); return; }
    if ('communityId' in got) {
      const hit = community?.find((x) => x.id === got.communityId) ?? await getBuild(got.communityId);
      if (!hit || !PLATFORMS.some((p) => p.id === canonicalPlatform(hit.platform))) { setError("We couldn't find that community build. It may have been removed."); return; }
      onPick({ kind: 'Community', name: hit.name, platform: canonicalPlatform(hit.platform), selection: selectionFromParts(hit.platform, hit.parts) });
      return;
    }
    const p = PLATFORMS.find((x) => x.id === got.platform)!;
    onPick({ kind: 'Shared Link', name: `Shared ${p.name} build`, platform: got.platform, selection: got.selection });
  };

  return (
    <div className="cmp-chooser card">
      <p className="kicker">Build {label}</p>
      <h2>Choose a Build</h2>
      <div className="filters" role="tablist" aria-label="Where the build comes from">
        {sources.map(([k, name]) => (
          <button key={k} role="tab" aria-selected={src === k} className={'chip' + (src === k ? ' on' : '')} onClick={() => setSrc(k)}>{name}</button>
        ))}
      </div>
      {src === 'saved' && (
        <ul className="cmp-options">
          {saved.map((s) => option(s.id, s.name, totalText(s.platform, s.selection), { kind: 'My Builds', name: s.name, platform: s.platform, selection: s.selection }))}
        </ul>
      )}
      {src === 'current' && current && (
        <ul className="cmp-options">
          {option('current', current.name ?? 'The build in the builder', totalText(current.platform, current.selection),
            { kind: 'Current Build', name: current.name ?? (({ platform: p, build }) => `Your ${p.modelOf?.(build)?.name ?? p.name} build`)(buildOf(current.platform, current.selection)), platform: current.platform, selection: { ...current.selection } })}
        </ul>
      )}
      {src === 'starter' && (
        <>
          <label className="sr" htmlFor={`cmp-platform-${label}`}>Platform</label>
          <select id={`cmp-platform-${label}`} className="cmp-select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ul className="cmp-options">
            {FEATURED.filter((fb) => fb.platform.id === platform).map((fb) => option(fb.id, fb.name, totalText(fb.platform.id, fb.selection),
              { kind: 'Starter Build', name: fb.name, platform: fb.platform.id, selection: fb.selection }))}
          </ul>
        </>
      )}
      {src === 'community' && (
        community === null ? <p className="dim">Loading community builds…</p>
          : community.length === 0 ? <p className="dim">No community builds to show yet.</p>
          : <ul className="cmp-options scroll">
            {community.slice(0, 40).map((c) => {
              const sel = selectionFromParts(c.platform, c.parts);
              return option(c.id, c.name, `${totalText(c.platform, sel)} · ${c.votes} vote${c.votes === 1 ? '' : 's'}`, { kind: 'Community', name: c.name, platform: c.platform, selection: sel });
            })}
          </ul>
      )}
      {src === 'link' && (
        <form className="cmp-link" onSubmit={(e) => { e.preventDefault(); void pasteLink(); }}>
          <label className="sr" htmlFor={`cmp-link-${label}`}>Build link</label>
          <input id={`cmp-link-${label}`} type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://dropinbuilds.com/?b=…" />
          <button className="btn primary" type="submit" disabled={!link.trim()}>Compare</button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}
