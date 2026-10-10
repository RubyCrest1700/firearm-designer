// The drawings are the biggest part of the site's code, so they load in their own file. The download starts
// as soon as the page does, but the rest of the page shows without waiting for it; each drawing appears
// when the file arrives, in a placeholder the same size so nothing jumps. The pre-built home page
// (scripts/prerender-home.tsx) has the same placeholders, so React can take it over as it is.
import { startTransition, useEffect, useState, type ComponentProps } from 'react';

type Drawings = typeof import('./Blueprint');
let loaded: Drawings | null = null;
const loading = import('./Blueprint').then((m) => (loaded = m));

export function Blueprint(props: ComponentProps<Drawings['Blueprint']>) {
  const drawings = useDrawings();
  if (drawings) return <drawings.Blueprint {...props} />;
  const rifle = props.platform.family === 'Rifle';
  // Same shape as the finished drawing: thumbnails fill their box; full drawings are 1000x486 (rifles) or 720x560.
  const box = props.compact ? undefined : rifle ? '0 0 1000 486' : '0 0 720 560';
  return <svg className={'bp bp-loading' + (props.compact ? ' bp-thumb' : '')} viewBox={box} aria-hidden="true" />;
}

/** The drawing code once it has loaded, or null before then. */
export function useDrawings(): Drawings | null {
  const [m, setM] = useState(loaded);
  useEffect(() => {
    // As a transition, so drawing a page full of them is done in small steps and the page stays responsive.
    if (!m) loading.then((d) => startTransition(() => setM(d)));
  }, [m]);
  return m;
}
