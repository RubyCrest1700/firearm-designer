import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PLATFORMS } from './data';
import { money, ownedOf, type Selection } from './engine';
import type { RegionState } from './Blueprint';
import { Blueprint } from './drawings';
import { buildStatus, statesFor } from './status';
import { buildOf, totalOf } from './store';
import { recentChange } from './data/history';
import type { Part, Platform, Severity } from './types';

export const FAMILIES = ['Rifle', 'Pistol'];

export const SEV_LABEL: Record<Severity, string> = { error: 'Conflict', warn: 'Check', info: 'Note' };

export const shortDate = (iso: string, year = false) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });

/** One "Change platform" button next to the builder's title; its panel lists rifles and pistols side by side, grouped by maker. */
export function PlatformMenu({ current, onPick }: { current: Platform; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  /** Which item to focus once the menu opens: the current platform, or the first or last item. */
  const [focusOn, setFocusOn] = useState<'current' | 'first' | 'last' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const items = () => [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
  useEffect(() => {
    if (!open || !focusOn) return;
    const list = items();
    (focusOn === 'last' ? list[list.length - 1] : focusOn === 'current' ? list.find((x) => x.classList.contains('active')) ?? list[0] : list[0])?.focus();
    setFocusOn(null);
  }, [open, focusOn]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (ref.current?.contains(document.activeElement)) btnRef.current?.focus();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="pmenu" ref={ref}>
      <button ref={btnRef} className="pmenu-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          setOpen(true);
          setFocusOn(e.key === 'ArrowUp' ? 'last' : 'current');
        }}>
        Change Platform
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
      </button>
      {open && (
        <div className="pmenu-panel" role="menu" aria-label="Platforms" onKeyDown={(e) => {
          const list = items();
          const at = list.indexOf(document.activeElement as HTMLButtonElement);
          const next = { ArrowDown: at + 1, ArrowUp: at < 0 ? -1 : at - 1, Home: 0, End: list.length - 1 }[e.key];
          if (next === undefined) return;
          e.preventDefault();
          list[(next + list.length) % list.length]?.focus();
        }}>
          {FAMILIES.map((fam) => {
            const list = PLATFORMS.filter((p) => p.family === fam);
            return (
              <div className="pmenu-col" key={fam}>
                <p className="pmenu-fam">{fam}s</p>
                {[...new Set(list.map((p) => p.maker))].map((m) => (
                  <div className="pmenu-group" key={m}>
                    <p className="pmenu-maker">{m}</p>
                    {list.filter((p) => p.maker === m).map((p) => (
                      <button key={p.id} role="menuitem" className={'pmenu-item' + (p.id === current.id ? ' active' : '')}
                        onClick={() => { onPick(p.id); setOpen(false); }}>
                        <span>{p.name}</span>
                        <span className="pmenu-blurb">{p.blurb}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FitTag({ state }: { state: RegionState }) {
  const text = { empty: 'Empty', ok: 'Fits', warn: 'Check', error: 'Conflict' }[state];
  return <span className={'fit-tag ' + state}>{text}</span>;
}

/** Price move over the last 30 days: green when it fell, amber when it rose. */
export function ChangeChip({ part, long }: { part: Part; long?: boolean }) {
  const c = recentChange(part);
  if (!c) return null;
  return (
    <span className={'change-chip ' + (c.by > 0 ? 'down' : 'up')} title={`${money(c.was)} 30 days ago`}>
      {c.by > 0 ? '↓' : '↑'} {money(Math.abs(c.by))}{long && ' this month'}
    </span>
  );
}

/**
 * Shared by the side drawers. Focus starts inside the drawer and the page behind it is inert, so Tab stays
 * in the drawer. Escape closes it, and focus goes back to the button that opened it. Drawers render into
 * <body> (a portal) so they sit outside the inert #root.
 */
export function useDrawer(onClose: () => void, focusRef: RefObject<HTMLElement>) {
  const closeFn = useRef(onClose);
  closeFn.current = onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const page = document.getElementById('root');
    page?.setAttribute('inert', '');
    focusRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFn.current(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      page?.removeAttribute('inert');
      if (opener?.isConnected) opener.focus();
    };
  }, []);
}

export function BuildCard({ platformId, selection, badge, title, meta, body, actions, className }: {
  platformId: string; selection: Selection; badge?: ReactNode; title: ReactNode; meta: ReactNode; body?: ReactNode; actions: ReactNode; className?: string;
}) {
  const { platform, build, place } = buildOf(platformId, selection);
  const { issues, states } = statesFor(platform, build, place);
  const owned = ownedOf(selection);
  const status = buildStatus(platform, build, issues, owned.other);
  const ownsSome = owned.owned.size + owned.other.size > 0;
  return (
    <article className={'build-card card' + (className ? ' ' + className : '')}>
      <div className="thumb">
        <Blueprint platform={platform} build={build} place={place} states={states} compact />
        {badge}
      </div>
      <div className="build-card-body">
        <h3>{title}</h3>
        <p className="meta">{meta}</p>
        {body}
        <div className="build-card-foot">
          <span className="amt big">{money(totalOf(platform, build, owned.owned))}{ownsSome && <small className="to-buy"> to buy</small>}</span>
          <span className={'status small ' + status.cls}>{status.text}</span>
        </div>
        <div className="build-card-actions">{actions}</div>
      </div>
    </article>
  );
}
