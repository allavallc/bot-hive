// HV-075: optimistic column placement helpers.
// Extracted from board.client.tsx into a JSX-free module so it's
// directly testable from vitest without the .tsx runtime.

// When the human clicks Accept or Reject on an in-review card, the panel
// sets a pending-transition entry on that ticket's hvId. The bucketing
// loop calls effectiveState to decide which column the card renders in.
// The actual ticket.state is unchanged on the data model — only the
// visual placement shifts. SSE refresh clears the pending entry once
// ticket.state catches up to the server-side move.
//
// Pending only applies from in-review (the only state where Accept/Reject
// fires). For any other state, return the raw state — defensive against
// stale pending entries that didn't get cleared.
export function effectiveState(
  state: string,
  pending: "approved" | "rejected" | undefined,
): string {
  if (!pending) return state;
  if (state !== "in-review") return state;
  return pending === "approved" ? "done" : "in-progress";
}
