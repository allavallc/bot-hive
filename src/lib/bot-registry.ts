// HV-141: in-process registry of open bot SSE streams.
//
// Extracted from stream/route.ts so bot-notify.ts can deliver Postgres
// NOTIFY payloads to the right connection without a circular import.
// StreamEvent types live here too so both the route and the notify module
// share the same definition.

export type YourRoleEvent = {
  type: "your-role";
  role: string;
  seat: number;
  skillFiles: string[];
  colony: string;
  handle: string;
  total: number;
};

export type SnapshotEvent = {
  type: "snapshot";
  colony: string;
  seats: { handle: string; seat: number; role: string }[];
};

export type StreamEvent = YourRoleEvent | SnapshotEvent;

const streams = new Map<string, (event: StreamEvent) => void>();

export function registerStream(connectionId: string, send: (event: StreamEvent) => void): void {
  streams.set(connectionId, send);
}

export function unregisterStream(connectionId: string): void {
  streams.delete(connectionId);
}

/** Deliver an event to a specific open connection. Returns true if found. */
export function deliverToConnection(connectionId: string, event: StreamEvent): boolean {
  const send = streams.get(connectionId);
  if (!send) return false;
  send(event);
  return true;
}
