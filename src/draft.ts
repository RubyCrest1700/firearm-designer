import { PLATFORMS, canonicalPlatform } from './data';
import { baseSelection, toBuild, type Selection } from './engine';
import type { CommunityBuild } from './community';

/**
 * The builder's state for this tab: the platform on screen, each platform's build in progress, and the saved build
 * or community build the one on screen was opened from.
 */
export interface Draft {
  platform: string;
  selections: Record<string, Selection>;
  openSavedId: string | null;
  community: CommunityBuild | null;
}

/** Owner-approved wording (2026-11-27). The Undo toast after a starter chip: Base, Budget, Best Value or Premium. */
export const startedOverText = (starter: string) => `Started over from ${starter}.`;
/** Owner-approved wording (2026-11-27). The Undo toast after Clear Build. */
export const CLEARED_TEXT = 'Cleared the build.';
/** Owner-approved wording (2026-11-27). The Undo toast after a link to a plain factory build replaced a build in progress. */
export const openedFactoryText = (platformName: string) => `Opened the ${platformName} factory build. Your earlier build is one tap away.`;
/** Owner-approved wording (2026-11-27): the pattern above, for a link to any other build. */
export const openedLinkText = (platformName: string) => `Opened the ${platformName} build from the link. Your earlier build is one tap away.`;
/** Owner-approved wording (2026-11-27): the same pattern for Open in Builder, with the build's name. */
export const openedText = (buildName: string) => `Opened ${buildName}.`;
/** Owner-approved wording (2026-11-27): the same pattern for a model chip, with the model's short name. */
export const switchedText = (model: string) => `Switched to ${model}.`;

/** Whether a selection holds anything a replace would lose: a part or an owned mark. Placements alone are nothing. */
export const hasBuild = (sel?: Selection) => !!sel && Object.keys(sel).some((k) => !k.startsWith('@'));

/**
 * Replaces the whole build on one platform and shows that platform. `savedId` and `community` say what the new build
 * was opened from. `undo` is offered when a build was lost: it puts back that build exactly (parts, owned marks,
 * placements) and, when it was the build on screen, the saved or community build it was. It takes the draft as it is
 * when Undo is pressed, so other platforms keep what they have gained since. `shown` is the build on screen when the
 * platform has none stored yet (a builder not touched starts on its factory build): Undo then leaves it untouched again.
 */
export function replaceDraft(d: Draft, pid: string, sel: Selection, savedId: string | null = null, community: CommunityBuild | null = null, shown?: Selection): { next: Draft; undo: ((now: Draft) => Draft) | null } {
  const next: Draft = { platform: pid, selections: { ...d.selections, [pid]: { ...sel } }, openSavedId: savedId, community };
  const stored = pid in d.selections;
  if (!hasBuild(stored ? d.selections[pid] : shown)) return { next, undo: null };
  const onScreen = d.platform === pid;
  const undo = (now: Draft): Draft => {
    const selections = { ...now.selections };
    if (stored) selections[pid] = d.selections[pid]; else delete selections[pid];
    return { platform: pid, selections, openSavedId: onScreen ? d.openSavedId : null, community: onScreen ? d.community : null };
  };
  return { next, undo };
}

/**
 * What Undo does after a replace made from draft `d`, whose own undo is `undo` (null when it lost nothing). `offered`
 * is the Undo still on offer from the replace before, with the draft that replace left; null once its toast has gone.
 * While the builder is exactly as that replace left it (nothing edited, saved, shared or switched since), Undo goes
 * all the way back to the build before the first replace: Budget, then Premium, then Undo is the visitor's own build,
 * not Budget. Otherwise it is one level.
 */
export function undoAfter(offered: { after: Draft; undo: (now: Draft) => Draft } | null, d: Draft, undo: ((now: Draft) => Draft) | null): ((now: Draft) => Draft) | null {
  const unedited = !!offered && d.platform === offered.after.platform && d.selections === offered.after.selections && d.openSavedId === offered.after.openSavedId && d.community === offered.after.community;
  if (!offered || !unedited) return undo;
  return (now) => offered.undo(undo ? undo(now) : now);
}

/** What the tab keeps of the open saved build and community build (see draftEntry). */
export interface KeptOpen { openSavedId: string | null; community: CommunityBuild | null }

/** What the tab stores (sessionStorage): the draft, with only the id, name and platform of an open community build. */
export const draftEntry = (d: Draft) => ({
  platform: d.platform,
  selections: d.selections,
  openSavedId: d.openSavedId,
  community: d.community && { id: d.community.id, name: d.community.name, platform: d.community.platform },
});

/** The shape of a community build's id (the same pattern Compare reads from a pasted link). */
const COMMUNITY_ID = /^[a-z0-9]{10}$/;

/** Reads the open saved build and community build out of a stored entry. Anything that isn't what draftEntry stores reads as nothing open. */
export function keptOpen(entry: unknown): KeptOpen {
  const e = (entry && typeof entry === 'object' ? entry : {}) as { openSavedId?: unknown; community?: unknown };
  const openSavedId = typeof e.openSavedId === 'string' && e.openSavedId.length > 0 && e.openSavedId.length <= 100 ? e.openSavedId : null;
  const c = (e.community && typeof e.community === 'object' ? e.community : {}) as { id?: unknown; name?: unknown; platform?: unknown };
  const platform = typeof c.platform === 'string' ? canonicalPlatform(c.platform) : '';
  const community = typeof c.id === 'string' && COMMUNITY_ID.test(c.id) && typeof c.name === 'string' && PLATFORMS.some((p) => p.id === platform)
    ? { id: c.id, platform, name: c.name.slice(0, 200), note: '', parts: [], createdAt: '', votes: 0, clicks: 0 }
    : null;
  return { openSavedId, community };
}

/** The name to call a linked build by: its platform, or for a builder with models the model its parts make ("Glock 19"), else the maker. */
function linkedName(pid: string, sel: Selection) {
  const platform = PLATFORMS.find((p) => p.id === pid);
  if (!platform) return '';
  if (!platform.models) return platform.name;
  const made = platform.modelOf?.(toBuild(platform, sel));
  return made?.id ? made.name : platform.maker;
}

/** Whether a selection is exactly a plain factory build: the platform's, or one of its models'. */
function isFactoryBuild(pid: string, sel: Selection) {
  const platform = PLATFORMS.find((p) => p.id === pid);
  if (!platform) return false;
  const same = (a: Selection) => Object.keys(a).length === Object.keys(sel).length && Object.keys(a).every((k) => a[k] === sel[k]);
  return [platform, ...(platform.models ?? []).map((m) => ({ ...platform, presets: m.presets, base: m.base }))].some((p) => same(baseSelection(p)));
}

/**
 * The builder's state as the page opens. `kept` and `open` are what the tab stored; `shared` is the build a `?b=`
 * link names, and `bare` says the link names no parts (the guide and platform pages' builder buttons).
 *
 * The open saved build is kept only while it's still in My Builds for the platform on screen, and the open community
 * build only while it's for that platform. A bare link shows its platform's build in progress when there is one, and
 * its factory build otherwise. Any other link replaces the build in progress on its platform; when that loses a build,
 * `undo` puts it back and `said` is the toast's words.
 */
export function openDraft(
  kept: { platform: string; selections: Record<string, Selection> } | null,
  open: KeptOpen,
  shared: { platform: string; selection: Selection } | null,
  bare: boolean,
  saved: { id: string; platform: string }[],
): { draft: Draft; undo: ((now: Draft) => Draft) | null; said: string } {
  const platform = kept && PLATFORMS.some((p) => p.id === kept.platform) ? kept.platform : PLATFORMS[0].id;
  const draft: Draft = {
    platform,
    selections: kept?.selections ?? {},
    openSavedId: saved.some((s) => s.id === open.openSavedId && s.platform === platform) ? open.openSavedId : null,
    community: open.community?.platform === platform ? open.community : null,
  };
  if (!shared) return { draft, undo: null, said: '' };
  if (bare && hasBuild(draft.selections[shared.platform])) {
    const same = shared.platform === platform;
    return { draft: { ...draft, platform: shared.platform, openSavedId: same ? draft.openSavedId : null, community: same ? draft.community : null }, undo: null, said: '' };
  }
  const { next, undo } = replaceDraft(draft, shared.platform, shared.selection);
  if (!undo) return { draft: next, undo, said: '' };
  const name = linkedName(shared.platform, shared.selection);
  return { draft: next, undo, said: isFactoryBuild(shared.platform, shared.selection) ? openedFactoryText(name) : openedLinkText(name) };
}
