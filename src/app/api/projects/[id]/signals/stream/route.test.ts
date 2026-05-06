import { randomUUID } from "node:crypto";
import { broadcast } from "@/lib/broadcast";
import { type Signal, __resetSignals, addSignal } from "@/lib/signal-buffer";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { mockGetActor } = vi.hoisted(() => ({
  mockGetActor: vi.fn(),
}));

vi.mock("@/lib/actor", () => ({ getActor: mockGetActor }));

import { GET } from "./route";

const PROJECT_ID = "stream-proj-test";
const params = Promise.resolve({ id: PROJECT_ID });

const validActor = { kind: "user" as const, userId: "u1", displayName: "Alice" };

function makeReq(): Request {
  return new Request(`https://example/api/projects/${PROJECT_ID}/signals/stream`);
}

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: "note",
    message: "test signal",
    bot: "vitest",
    ...overrides,
  };
}

function streamReader(res: Response): ReadableStreamDefaultReader<Uint8Array> {
  if (!res.body) throw new Error("expected a streaming response");
  return res.body.getReader();
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
}

beforeEach(() => {
  mockGetActor.mockReset();
  __resetSignals();
  vi.useFakeTimers();
});

afterEach(() => {
  __resetSignals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("GET /api/projects/[id]/signals/stream", () => {
  // --- auth ---

  test("401 when no actor", async () => {
    mockGetActor.mockResolvedValueOnce(null);
    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(401);
  });

  // --- headers ---

  test("200 with correct SSE headers", async () => {
    mockGetActor.mockResolvedValueOnce(validActor);
    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");
    res.body?.cancel();
  });

  // --- initial frame ---

  test("initial frame contains a connected comment line", async () => {
    mockGetActor.mockResolvedValueOnce(validActor);
    const res = await GET(makeReq(), { params });
    const reader = streamReader(res);

    const first = await readChunk(reader);
    expect(first).toContain(": connected");

    reader.cancel();
  });

  // --- replay ---

  test("buffered signals are emitted as data frames before the connected line", async () => {
    const signal = makeSignal({ message: "replay me" });
    addSignal(PROJECT_ID, signal);

    mockGetActor.mockResolvedValueOnce(validActor);
    const res = await GET(makeReq(), { params });
    const reader = streamReader(res);

    const replayFrame = await readChunk(reader);
    expect(replayFrame).toBe(`data: ${JSON.stringify(signal)}\n\n`);

    const connectedFrame = await readChunk(reader);
    expect(connectedFrame).toContain(": connected");

    reader.cancel();
  });

  test("multiple buffered signals are all replayed in order", async () => {
    const s1 = makeSignal({ message: "first" });
    const s2 = makeSignal({ message: "second" });
    addSignal(PROJECT_ID, s1);
    addSignal(PROJECT_ID, s2);

    mockGetActor.mockResolvedValueOnce(validActor);
    const res = await GET(makeReq(), { params });
    const reader = streamReader(res);

    expect(await readChunk(reader)).toBe(`data: ${JSON.stringify(s1)}\n\n`);
    expect(await readChunk(reader)).toBe(`data: ${JSON.stringify(s2)}\n\n`);
    expect(await readChunk(reader)).toContain(": connected");

    reader.cancel();
  });

  // --- live subscribe ---

  test("broadcast after connect → stream emits matching data frame", async () => {
    mockGetActor.mockResolvedValueOnce(validActor);
    const res = await GET(makeReq(), { params });
    const reader = streamReader(res);

    await readChunk(reader); // drain connected line

    const signal = makeSignal({ message: "live signal" });
    broadcast({ type: "signal", projectId: PROJECT_ID, signal });

    const frame = await readChunk(reader);
    expect(frame).toBe(`data: ${JSON.stringify(signal)}\n\n`);

    reader.cancel();
  });

  test("broadcast for a different projectId is not forwarded", async () => {
    mockGetActor.mockResolvedValueOnce(validActor);
    const res = await GET(makeReq(), { params });
    const reader = streamReader(res);

    await readChunk(reader); // drain connected line

    // Wrong-project broadcast — should not appear in this stream
    broadcast({ type: "signal", projectId: "other-project-xyz", signal: makeSignal() });

    // Right-project broadcast — should be the next chunk we receive
    const correctSignal = makeSignal({ message: "right project" });
    broadcast({ type: "signal", projectId: PROJECT_ID, signal: correctSignal });

    const frame = await readChunk(reader);
    expect(frame).toBe(`data: ${JSON.stringify(correctSignal)}\n\n`);

    reader.cancel();
  });

  test("cancel cleans up subscription — further broadcasts do not throw", async () => {
    mockGetActor.mockResolvedValueOnce(validActor);
    const res = await GET(makeReq(), { params });
    const reader = streamReader(res);

    await readChunk(reader);
    reader.cancel();

    // Should not throw even though the subscriber is gone
    expect(() =>
      broadcast({ type: "signal", projectId: PROJECT_ID, signal: makeSignal() }),
    ).not.toThrow();
  });
});
