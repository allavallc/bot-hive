// HV-113 follow-up: deterministic animation-delay derivation.
//
// PR #218 used `Math.random()` inside `useMemo` to stagger walking-mascot
// animations. The server and client both ran the call and got different
// values, breaking hydration (React error #418) — the entire client tree
// failed to mount and the board appeared empty on prod.
//
// This helper produces a stable, deterministic delay from any stable
// string seed (a ticket id, an assignee handle). Same input -> same
// output on server and client -> identical SSR markup -> clean hydration.

export function staggerSeconds(seed: string | undefined, maxSeconds: number): number {
  if (!seed) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  // Hundredths of a second; negate so the animation has already advanced
  // by some fraction of its cycle by first paint, matching the prior
  // Math.random()*-maxSeconds visual.
  return -((Math.abs(h) % (maxSeconds * 100)) / 100);
}
