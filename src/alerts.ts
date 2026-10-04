import { COMMUNITY_API } from './config';
import { partIds, type Selection } from './engine';

/**
 * Email price alerts (worker/src/alerts.js). One signup per browser watches every saved build here;
 * the signup's token lives in this browser and the watched list is re-sent whenever My builds changes.
 */

export interface AlertSignup { token: string; email: string; confirmed: boolean }

const KEY = 'firearm-designer:alerts:v1';

export function loadAlertSignup(): AlertSignup | null {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as AlertSignup) : null; } catch { return null; }
}
export function storeAlertSignup(s: AlertSignup | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* this visit only */ }
}

type Watched = { name: string; platform: string; selection: Selection };
const payload = (builds: Watched[]) => builds.map((b) => ({ name: b.name, platform: b.platform, parts: partIds(b.selection) }));

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${COMMUNITY_API}${path}`, { ...init, headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? 'Something went wrong. Please try again.'), { status: res.status });
  return body as T;
}

export async function alertsAvailable() {
  if (!COMMUNITY_API) return false;
  try { return (await call<{ enabled: boolean }>('/api/alerts/status')).enabled; } catch { return false; }
}

export const signUpForAlerts = (email: string, builds: Watched[]) =>
  call<AlertSignup>('/api/alerts', { method: 'POST', body: JSON.stringify({ email, builds: payload(builds) }) });

/** Current state of this browser's signup, or null once it's been unsubscribed. */
export async function checkAlertSignup(s: AlertSignup): Promise<AlertSignup | null> {
  try { return { ...s, ...(await call<{ email: string; confirmed: boolean }>(`/api/alerts/${s.token}`)) }; } catch (e) {
    return (e as { status?: number }).status === 404 ? null : s;
  }
}

export async function syncAlertBuilds(s: AlertSignup, builds: Watched[]): Promise<boolean> {
  try { await call(`/api/alerts/${s.token}`, { method: 'PUT', body: JSON.stringify({ builds: payload(builds) }) }); return true; } catch (e) {
    return (e as { status?: number }).status !== 404;
  }
}

export async function stopAlerts(s: AlertSignup) {
  await fetch(`${COMMUNITY_API.replace(/\/$/, '')}/alerts/stop?t=${s.token}`, { method: 'POST' }).catch(() => undefined);
}
