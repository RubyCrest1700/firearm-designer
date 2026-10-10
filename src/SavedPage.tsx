import { useEffect, useState, type ReactNode } from 'react';
import { PLATFORMS } from './data';
import { money, ownedOf, ownsAny, partIds } from './engine';
import { buildOf, priceChanges, type SavedBuild } from './store';
import { totalSeries } from './data/history';
import { PriceChart } from './PriceChart';
import { type AlertSignup } from './alerts';
import type { Part } from './types';
import { BuildCard, shortDate } from './ui';

/** Email alerts for every saved build in this browser: sign up, waiting to confirm, or on. */
export function AlertsPanel({ signup, hasBuilds, onSignUp, onRefresh, onStop }: {
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
      <button className="btn ghost" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { await onStop(); } catch (err) { setError((err as Error).message); }
        setBusy(false);
      }}>{signup.confirmed ? 'Turn Off' : 'Cancel'}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
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

export function SavedPage({ saved, alerts, onOpen, onRename, onDuplicate, onDelete, onCopyLink, onCompare, onCompareAll, onStart, onBrowse }: {
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
