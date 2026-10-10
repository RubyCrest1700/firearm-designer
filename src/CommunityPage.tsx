import { useEffect, useState } from 'react';
import { PLATFORMS } from './data';
import { bestOffer, partIds, type Selection } from './engine';
import { type CompareItem } from './Compare';
import { FEATURED, TIER_LABEL, buildOf, selectionFromParts, type FeaturedBuild } from './store';
import { communityLive, featuredBuilds, listBuilds, myVotes, reportBuild, setVote, type CommunityBuild, type CommunitySort } from './community';
import type { Build, Part } from './types';
import { BuildCard, shortDate } from './ui';

function topParts(build: Build) {
  return Object.values(build).filter((p): p is Part => !!p)
    .sort((a, b) => (bestOffer(b)?.price ?? 0) - (bestOffer(a)?.price ?? 0)).slice(0, 3);
}

const SORT_LABEL: [CommunitySort, string][] = [['top', 'Top Voted'], ['new', 'Newest'], ['bought', 'Most Bought']];

export function CommunityPage({ onOpen, onOpenStarter, onSave, onCopyLink, onCompare, onStart, onToast }: {
  onOpen: (b: CommunityBuild) => void; onOpenStarter: (fb: FeaturedBuild) => void; onCopyLink: (b: CommunityBuild) => void;
  onSave: (name: string, platform: string, sel: Selection) => void; onCompare: (item: CompareItem) => void; onStart: () => void; onToast: (t: string) => void;
}) {
  const [filter, setFilter] = useState<string>('all');
  const [sort, setSort] = useState<CommunitySort>('top');
  const [builds, setBuilds] = useState<CommunityBuild[] | null>(null);
  const [featured, setFeatured] = useState<CommunityBuild[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Bumped by Try Again to load the list again. */
  const [attempt, setAttempt] = useState(0);
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
    const family = PLATFORMS.filter((p) => p.family === filter).map((p) => p.id).join(',');
    listBuilds(isPlatform ? filter : family || null, sort)
      .then((list) => { if (live) setBuilds(list.filter((b) => matches(b.platform))); })
      .catch((e: Error) => { if (live) { setBuilds([]); setError(e.message); } });
    return () => { live = false; };
  }, [filter, sort, attempt]);
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
        {error ? (
          <div className="load-error">
            <p className="form-error" role="alert">{error}</p>
            <button className="btn" onClick={() => { setBuilds(null); setAttempt(attempt + 1); }}>Try Again</button>
          </div>
        ) : builds === null ? <p className="dim">Loading shared builds…</p> : builds.length === 0 ? (
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
