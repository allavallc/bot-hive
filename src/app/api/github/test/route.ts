import { auth } from "@/lib/auth";
import { appOctokit, installationOctokit } from "@/lib/github";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

type Installation = {
  id: number;
  account: { login?: string; name?: string } | null;
};
type Repo = { full_name: string };

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const app = appOctokit();
    const installationsResp = await app.request("GET /app/installations");
    const installations = installationsResp.data as Installation[];

    const result = await Promise.all(
      installations.map(async (inst) => {
        const oct = await installationOctokit(inst.id);
        const reposResp = await oct.request("GET /installation/repositories", {
          per_page: 100,
        });
        const repositories = (reposResp.data.repositories ?? []) as Repo[];
        return {
          installationId: inst.id,
          account: inst.account?.login ?? inst.account?.name ?? null,
          repos: repositories.map((r) => r.full_name),
        };
      }),
    );

    return NextResponse.json({ installations: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
