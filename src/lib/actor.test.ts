import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { mockGetSession, mockValidateToken, mockGetProjectForUser } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockValidateToken: vi.fn(),
  mockGetProjectForUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock("@/lib/bot-tokens", () => ({
  validateToken: mockValidateToken,
}));

vi.mock("@/lib/projects", () => ({
  getProjectForUser: mockGetProjectForUser,
}));

import { getActor } from "./actor";

const PROJECT_ID = "proj-1";

function reqWith({ cookie, bearer }: { cookie?: string; bearer?: string } = {}): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  return new Request("https://example/test", { headers });
}

beforeEach(() => {
  mockGetSession.mockReset();
  mockValidateToken.mockReset();
  mockGetProjectForUser.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getActor", () => {
  test("session-only request → user actor", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "u1", name: "Alice" } });
    mockGetProjectForUser.mockResolvedValueOnce({ id: PROJECT_ID });

    const actor = await getActor(reqWith({ cookie: "s=1" }), PROJECT_ID);

    expect(actor).toEqual({ kind: "user", userId: "u1", displayName: "Alice" });
  });

  test("session present but project access denied → falls through (and bearer ignored)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "u1", name: "Alice" } });
    mockGetProjectForUser.mockResolvedValueOnce(null);

    const actor = await getActor(reqWith({ cookie: "s=1" }), PROJECT_ID);

    expect(actor).toBeNull();
  });

  test("bearer-only request with valid token → bot actor", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    mockValidateToken.mockResolvedValueOnce({
      id: "tok-1",
      projectId: PROJECT_ID,
      createdBy: "u1",
      displayName: "kestrel-laptop",
    });

    const actor = await getActor(reqWith({ bearer: "bh_abc" }), PROJECT_ID);

    expect(actor).toEqual({
      kind: "bot",
      tokenId: "tok-1",
      projectId: PROJECT_ID,
      displayName: "kestrel-laptop",
    });
  });

  test("bearer with revoked / invalid token → null", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    mockValidateToken.mockResolvedValueOnce(null);

    const actor = await getActor(reqWith({ bearer: "bh_revoked" }), PROJECT_ID);

    expect(actor).toBeNull();
  });

  test("bearer with token for a different project → null", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    mockValidateToken.mockResolvedValueOnce({
      id: "tok-2",
      projectId: "other-proj",
      createdBy: "u1",
      displayName: "wrong-project-bot",
    });

    const actor = await getActor(reqWith({ bearer: "bh_xyz" }), PROJECT_ID);

    expect(actor).toBeNull();
  });

  test("bearer without bh_ prefix is rejected by validateToken (returns null)", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    mockValidateToken.mockResolvedValueOnce(null);

    const actor = await getActor(reqWith({ bearer: "not-a-bot-token" }), PROJECT_ID);

    expect(actor).toBeNull();
  });

  test("both auths present → session wins", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "u1", name: "Alice" } });
    mockGetProjectForUser.mockResolvedValueOnce({ id: PROJECT_ID });

    const actor = await getActor(reqWith({ cookie: "s=1", bearer: "bh_abc" }), PROJECT_ID);

    expect(actor).toMatchObject({ kind: "user", userId: "u1" });
    expect(mockValidateToken).not.toHaveBeenCalled();
  });

  test("no auth at all → null", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const actor = await getActor(reqWith({}), PROJECT_ID);

    expect(actor).toBeNull();
  });
});
