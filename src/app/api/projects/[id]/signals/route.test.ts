import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { mockGetActor, mockAddSignal, mockBroadcast } = vi.hoisted(() => ({
  mockGetActor: vi.fn(),
  mockAddSignal: vi.fn(),
  mockBroadcast: vi.fn(),
}));

vi.mock("@/lib/actor", () => ({ getActor: mockGetActor }));
vi.mock("@/lib/broadcast", () => ({ broadcast: mockBroadcast }));
vi.mock("@/lib/signal-buffer", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/signal-buffer")>();
  return { ...real, addSignal: mockAddSignal };
});

import { POST } from "./route";

const PROJECT_ID = "proj-signals-test";
const params = Promise.resolve({ id: PROJECT_ID });

const userActor = { kind: "user" as const, userId: "u1", displayName: "Alice" };
const botActor = {
  kind: "bot" as const,
  tokenId: "tok-1",
  projectId: PROJECT_ID,
  displayName: "nectar",
};

function req(body: unknown): Request {
  return new Request(`https://example/api/projects/${PROJECT_ID}/signals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetActor.mockReset();
  mockAddSignal.mockReset();
  mockBroadcast.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/projects/[id]/signals", () => {
  // --- auth ---

  test("401 when no actor", async () => {
    mockGetActor.mockResolvedValueOnce(null);
    const res = await POST(req({ type: "note", message: "hi" }), { params });
    expect(res.status).toBe(401);
  });

  // --- body validation ---

  test("400 when body is invalid JSON", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const badReq = new Request("https://example/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(badReq, { params });
    expect(res.status).toBe(400);
  });

  test("400 when body is null", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const res = await POST(req(null), { params });
    expect(res.status).toBe(400);
  });

  test("400 for invalid signal type", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const res = await POST(req({ type: "bogus", message: "hi" }), { params });
    expect(res.status).toBe(400);
  });

  test("400 for missing message", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const res = await POST(req({ type: "note" }), { params });
    expect(res.status).toBe(400);
  });

  test("400 for empty message", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const res = await POST(req({ type: "note", message: "" }), { params });
    expect(res.status).toBe(400);
  });

  test("400 for message over 500 chars", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const res = await POST(req({ type: "note", message: "x".repeat(501) }), { params });
    expect(res.status).toBe(400);
  });

  test("400 for refs array over 10 entries", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const refs = Array.from({ length: 11 }, () => "HV-001");
    const res = await POST(req({ type: "note", message: "hi", refs }), { params });
    expect(res.status).toBe(400);
  });

  test("400 for refs entry over 50 chars", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const res = await POST(req({ type: "note", message: "hi", refs: ["x".repeat(51)] }), {
      params,
    });
    expect(res.status).toBe(400);
  });

  test("400 for empty refs entry", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const res = await POST(req({ type: "note", message: "hi", refs: [""] }), { params });
    expect(res.status).toBe(400);
  });

  // --- success ---

  test("201 on valid payload from user actor — signal returned with user attribution", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const res = await POST(req({ type: "claim", message: "claiming HV-062", refs: ["HV-062"] }), {
      params,
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toMatchObject({
      type: "claim",
      message: "claiming HV-062",
      user: "Alice",
      refs: ["HV-062"],
    });
    expect(data.id).toBeDefined();
    expect(data.timestamp).toBeDefined();
  });

  test("201 — addSignal called once with correct args", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    await POST(req({ type: "note", message: "hello" }), { params });
    expect(mockAddSignal).toHaveBeenCalledOnce();
    const [calledProjectId, calledSignal] = mockAddSignal.mock.calls[0];
    expect(calledProjectId).toBe(PROJECT_ID);
    expect(calledSignal).toMatchObject({ type: "note", message: "hello", user: "Alice" });
  });

  test("201 — broadcast called once with signal event", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    await POST(req({ type: "done", message: "finished" }), { params });
    expect(mockBroadcast).toHaveBeenCalledOnce();
    const [evt] = mockBroadcast.mock.calls[0];
    expect(evt).toMatchObject({ type: "signal", projectId: PROJECT_ID });
    expect(evt.signal).toMatchObject({ type: "done", message: "finished" });
  });

  test("bot actor — displayName becomes bot field, no user field", async () => {
    mockGetActor.mockResolvedValueOnce(botActor);
    const res = await POST(req({ type: "note", message: "hi" }), { params });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.bot).toBe("nectar");
    expect(data.user).toBeUndefined();
  });

  test("explicit body.bot overrides actor displayName", async () => {
    mockGetActor.mockResolvedValueOnce(botActor);
    const res = await POST(req({ type: "note", message: "hi", bot: "wren" }), { params });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.bot).toBe("wren");
  });

  test("valid payload with no refs — refs field absent in response", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const res = await POST(req({ type: "handoff", message: "HV-062 done" }), { params });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.refs).toBeUndefined();
  });

  test("each signal gets a unique id", async () => {
    mockGetActor.mockResolvedValueOnce(userActor).mockResolvedValueOnce(userActor);
    const r1 = await (await POST(req({ type: "note", message: "a" }), { params })).json();
    const r2 = await (await POST(req({ type: "note", message: "b" }), { params })).json();
    expect(r1.id).not.toBe(r2.id);
  });

  test("400 when refs is not an array", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const res = await POST(req({ type: "note", message: "hi", refs: "HV-062" }), { params });
    expect(res.status).toBe(400);
  });

  test("message exactly 500 chars is accepted", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const res = await POST(req({ type: "note", message: "x".repeat(500) }), { params });
    expect(res.status).toBe(201);
  });

  test("refs array with exactly 10 entries is accepted", async () => {
    mockGetActor.mockResolvedValueOnce(userActor);
    const refs = Array.from({ length: 10 }, (_, i) => `HV-${String(i).padStart(3, "0")}`);
    const res = await POST(req({ type: "note", message: "hi", refs }), { params });
    expect(res.status).toBe(201);
  });
});
