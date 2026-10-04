import { COMMUNITY_API } from './config';

/**
 * Community builds client. Talks to the Cloudflare Worker in worker/ when COMMUNITY_API is set.
 * Until then (and in the preview) it runs in preview mode: shared builds, votes and clicks are
 * kept in this browser only, so the whole flow can be tried before the service is connected.
 */

export interface CommunityBuild {
  id: string;
  platform: string;
  name: string;
  note: string;
  parts: string[];
  createdAt: string;
  votes: number;
  clicks: number;
}

export type CommunitySort = 'top' | 'new' | 'bought';

export const communityLive = !!COMMUNITY_API;

const MY_VOTES_KEY = 'firearm-designer:votes:v1';
const PREVIEW_KEY = 'firearm-designer:community-preview:v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not persisted */ }
}

/** Builds this visitor has voted for, so the vote button shows its state. */
export const myVotes = () => new Set(readJson<string[]>(MY_VOTES_KEY, []));
function setMyVote(id: string, on: boolean) {
  const s = myVotes();
  if (on) s.add(id); else s.delete(id);
  writeJson(MY_VOTES_KEY, [...s]);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(COMMUNITY_API.replace(/\/$/, '') + path, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    });
  } catch {
    throw new Error("Couldn't reach the community service. Check your connection and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'The community service is not responding. Please try again.');
  return body as T;
}

/* --------------------------------------------------------- preview mode store */

interface PreviewRow extends CommunityBuild { voteLog: number[]; clickLog: number[] }
const previewRows = () => readJson<PreviewRow[]>(PREVIEW_KEY, []);
const savePreview = (rows: PreviewRow[]) => writeJson(PREVIEW_KEY, rows);
const strip = ({ voteLog: _v, clickLog: _c, ...b }: PreviewRow): CommunityBuild => b;
const ORDER: Record<CommunitySort, (a: CommunityBuild, b: CommunityBuild) => number> = {
  top: (a, b) => b.votes - a.votes || b.clicks - a.clicks || b.createdAt.localeCompare(a.createdAt),
  new: (a, b) => b.createdAt.localeCompare(a.createdAt),
  bought: (a, b) => b.clicks - a.clicks || b.votes - a.votes || b.createdAt.localeCompare(a.createdAt),
};
function updatePreview(id: string, fn: (r: PreviewRow) => void) {
  const rows = previewRows();
  const row = rows.find((r) => r.id === id);
  if (row) { fn(row); savePreview(rows); }
  return row ? strip(row) : undefined;
}

/* ------------------------------------------------------------------- calls */

export async function listBuilds(platform: string | null, sort: CommunitySort): Promise<CommunityBuild[]> {
  if (communityLive) {
    const q = new URLSearchParams({ sort, ...(platform ? { platform } : {}) });
    return (await api<{ builds: CommunityBuild[] }>(`/api/builds?${q}`)).builds;
  }
  return previewRows().filter((r) => !platform || r.platform === platform).map(strip).sort(ORDER[sort]);
}

/** The week's best: votes plus half-weight buy clicks in the last 7 days. */
export async function featuredBuilds(): Promise<CommunityBuild[]> {
  if (communityLive) return (await api<{ builds: CommunityBuild[] }>('/api/featured')).builds;
  const since = Date.now() - 7 * 86_400_000;
  const score = (r: PreviewRow) => r.voteLog.filter((t) => t > since).length + 0.5 * r.clickLog.filter((t) => t > since).length;
  return previewRows().filter((r) => score(r) > 0).sort((a, b) => score(b) - score(a)).slice(0, 3).map(strip);
}

export async function shareBuild(platform: string, name: string, note: string, parts: string[]): Promise<CommunityBuild> {
  if (communityLive)
    return (await api<{ build: CommunityBuild }>('/api/builds', { method: 'POST', body: JSON.stringify({ platform, name, note, parts }) })).build;
  const build: PreviewRow = {
    id: Math.random().toString(36).slice(2, 12).padEnd(10, '0'),
    platform, name, note, parts, createdAt: new Date().toISOString(), votes: 0, clicks: 0, voteLog: [], clickLog: [],
  };
  savePreview([build, ...previewRows()]);
  return strip(build);
}

export async function setVote(id: string, on: boolean): Promise<CommunityBuild | undefined> {
  setMyVote(id, on);
  if (communityLive) return (await api<{ build: CommunityBuild }>(`/api/builds/${id}/${on ? 'vote' : 'unvote'}`, { method: 'POST' })).build;
  return updatePreview(id, (r) => {
    r.votes = Math.max(0, r.votes + (on ? 1 : -1));
    if (on) r.voteLog.push(Date.now()); else r.voteLog.pop();
  });
}

/** Counts a click through to a retailer while this community build is open. */
export async function recordBuyClick(id: string) {
  if (communityLive) {
    await api(`/api/builds/${id}/click`, { method: 'POST' }).catch(() => undefined);
    return;
  }
  updatePreview(id, (r) => { r.clicks += 1; r.clickLog.push(Date.now()); });
}

export async function reportBuild(id: string) {
  if (communityLive) {
    await api(`/api/builds/${id}/report`, { method: 'POST' });
    return;
  }
  savePreview(previewRows().filter((r) => r.id !== id));
}
