import { auth } from "@/lib/auth";
import { validateToken } from "@/lib/bot-tokens";
import { getProjectForUser } from "@/lib/projects";

export type Actor =
  | { kind: "user"; userId: string; displayName: string }
  | { kind: "bot"; tokenId: string; projectId: string; displayName: string };

// Resolves the requester for a project-scoped HTTP request. Accepts either a
// Better Auth session cookie (humans) or a Bearer bot token scoped to the
// requested projectId (bots). Session wins when both are present, so a bot
// running in a logged-in browser doesn't double-attribute.
export async function getActor(req: Request, projectId: string): Promise<Actor | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (session) {
    const project = await getProjectForUser(session.user.id, projectId);
    if (project) {
      return {
        kind: "user",
        userId: session.user.id,
        displayName: session.user.name ?? session.user.id,
      };
    }
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const raw = authHeader.slice("Bearer ".length).trim();
    const info = await validateToken(raw);
    if (info && info.projectId === projectId) {
      return {
        kind: "bot",
        tokenId: info.id,
        projectId: info.projectId,
        displayName: info.displayName,
      };
    }
  }

  return null;
}
