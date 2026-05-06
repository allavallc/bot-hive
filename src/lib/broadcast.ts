import type { Signal } from "@/lib/signal-buffer";

export type BroadcastEvent =
  | { type: "project-changed"; projectId: string }
  | { type: "signal"; projectId: string; signal: Signal };
type Subscriber = (event: BroadcastEvent) => void;

const subscribers = new Map<string, Set<Subscriber>>();

export function subscribe(projectId: string, fn: Subscriber): () => void {
  let set = subscribers.get(projectId);
  if (!set) {
    set = new Set();
    subscribers.set(projectId, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
    if (set && set.size === 0) {
      subscribers.delete(projectId);
    }
  };
}

export function broadcast(event: BroadcastEvent): void {
  const set = subscribers.get(event.projectId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(event);
    } catch (err) {
      console.warn("[broadcast] subscriber threw:", err);
    }
  }
}

// Test-only — clears all subscribers. Production code should never call this.
export function __resetBroadcast(): void {
  subscribers.clear();
}
