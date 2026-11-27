import { COMMUNITY_API } from './config';
import { toBuyIds, type Selection } from './engine';

/**
 * Email price alerts (worker/src/alerts.js). One signup per browser watches every saved build here;
 * the signup's token lives in this browser and the watched list is re-sent whenever My builds changes.
 */

export interface AlertSignup { token: string; email: string; confirmed: boolean }

export const ALERTS_KEY = 'firearm-designer:alerts:v1';
const KEY = ALERTS_KEY;

/** A signup's token as the alert service makes it and accepts it (TOKEN in worker/src/alerts.js): 32 lowercase hex characters. */
const TOKEN = /^[a-f0-9]{32}$/;

/**
 * The stored signup, or null when what is stored isn't one: the three fields the service answers a signup with,
 * each of its own type. Anything else stored there is left unused, so it can't reach the page or a request.
 */
export function loadAlertSignup(): AlertSignup | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s: unknown = raw ? JSON.parse(raw) : null;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    const { token, email, confirmed } = s as Record<string, unknown>;
    if (typeof token !== 'string' || !TOKEN.test(token) || typeof email !== 'string' || typeof confirmed !== 'boolean') return null;
    return { token, email, confirmed };
  } catch { return null; }
}
export function storeAlertSignup(s: AlertSignup | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else { localStorage.removeItem(KEY); localStorage.removeItem(ALERTS_UNSENT_KEY); } } catch { /* this visit only */ }
}

/** Owner-approved wording (2026-11-27). */
export const ALERTS_UNREACHABLE = "Couldn't reach the price alert service. Check your connection and try again.";
/** Owner-approved wording (2026-11-27). */
export const ALERTS_BEHIND = "Your latest changes haven't reached your price alerts yet. We'll try again next time you visit.";

/**
 * A send of the watched builds that failed is remembered here, as the token of the signup it was for, so the next visit
 * tries it again. Only that same signup's token counts: a newer signup was made with the list as it then was.
 */
export const ALERTS_UNSENT_KEY = 'firearm-designer:alerts-unsent:v1';
export function loadAlertsUnsent(): string | null {
  try {
    const token = localStorage.getItem(ALERTS_UNSENT_KEY);
    return token && TOKEN.test(token) ? token : null;
  } catch { return null; }
}
export function storeAlertsUnsent(token: string | null) {
  try { if (token) localStorage.setItem(ALERTS_UNSENT_KEY, token); else localStorage.removeItem(ALERTS_UNSENT_KEY); } catch { /* this visit only */ }
}

/** Parts the builder already owns aren't watched: their price no longer matters to them. */
type Watched = { name: string; platform: string; selection: Selection };
const payload = (builds: Watched[]) => builds.map((b) => ({ name: b.name, platform: b.platform, parts: toBuyIds(b.selection) }));

/**
 * A request that hangs is given up on after 10 seconds. A browser from before AbortSignal.timeout (Safari before 16,
 * Chrome before 103, Firefox before 100) sends it with no limit, as the community calls do (src/community.ts).
 */
const timeLimit = () => (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(10000) : undefined);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const signal = timeLimit();
  let res: Response;
  try {
    // The service needs the JSON header on a request with a body (it answers 415 without it); a request without one sends none.
    res = await fetch(`${COMMUNITY_API}${path}`, { ...init, headers: init?.body ? { 'content-type': 'application/json' } : undefined, ...(signal ? { signal } : {}) });
  } catch {
    // The browser's own words for this ("Failed to fetch", "Load failed") never reach the page.
    throw new Error(ALERTS_UNREACHABLE);
  }
  const body = await res.json().catch(() => ({}));
  // Time ran out while the answer was still arriving: there is no answer to read.
  if (signal?.aborted) throw new Error(ALERTS_UNREACHABLE);
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
  try { return { ...s, ...(await call<{ email: string; confirmed: boolean }>(`/api/alerts/${encodeURIComponent(s.token)}`)) }; } catch (e) {
    return (e as { status?: number }).status === 404 ? null : s;
  }
}

/**
 * What sending the watched builds came to: sent; gone, the service no longer has the signup (unsubscribed by email);
 * refused, the service answered that it won't take this list (a 4xx other than 404 and 429), so sending it again
 * would get the same answer; or failed, not sent this time (not reached, timed out, 429 or a 5xx) and worth trying again.
 */
export type AlertSync = 'sent' | 'gone' | 'refused' | 'failed';

export async function syncAlertBuilds(s: AlertSignup, builds: Watched[]): Promise<AlertSync> {
  try { await call(`/api/alerts/${encodeURIComponent(s.token)}`, { method: 'PUT', body: JSON.stringify({ builds: payload(builds) }) }); return 'sent'; } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404) return 'gone';
    return status !== undefined && status >= 400 && status < 500 && status !== 429 ? 'refused' : 'failed';
  }
}

/**
 * Records a send's result for the next visit, and gives the token of the signup whose emailed list is now behind My Builds
 * (null: none is). Only a failed send is kept to try again; any other result clears what was kept.
 * `current` is the signup as it is when the answer arrives. If the send's signup has been turned off or replaced since,
 * nothing is recorded (undefined), so its token is never written back.
 */
export function alertsBehindAfter(token: string, result: AlertSync, current: AlertSignup | null): string | null | undefined {
  if (current?.token !== token) return undefined;
  const behind = result === 'failed' ? token : null;
  storeAlertsUnsent(behind);
  return behind;
}

/** Throws if the request didn't go through, so the page doesn't say alerts are off while they're still on. */
export async function stopAlerts(s: AlertSignup) {
  const signal = timeLimit();
  let res: Response;
  try {
    res = await fetch(`${COMMUNITY_API.replace(/\/$/, '')}/alerts/stop?t=${encodeURIComponent(s.token)}`, { method: 'POST', ...(signal ? { signal } : {}) });
  } catch {
    throw new Error(ALERTS_UNREACHABLE);
  }
  if (!res.ok) throw new Error("Couldn't turn off price alerts. Please try again.");
}
