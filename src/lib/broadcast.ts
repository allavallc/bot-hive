// Server-side pub/sub for project state changes.
//
// Two event types:
//   - `project-changed`: fires from the GitHub webhook handler when a `hive/`
//     commit lands on the connected repo. Subscribers (board, swarm panel)
//     use it as a "refresh now" signal.
//   - `ticket-action`: fires from the human Accept/Reject buttons (HV-046)
//     so the board can render an optimistic column move (HV-055/072) within
//     ~200ms of the click, before the underlying PR + deploy lands.

export type BroadcastEvent =
  | { type: "project-changed"; projectId: string }
  | {
      type: "ticket-action";
      projectId: string;
      hvId: string;
      kind: "approved" | "rejected";
      actor: string;
      message?: string;
    };

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
