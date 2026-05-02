import { auth } from "@/lib/auth";
import { appOctokit } from "@/lib/github";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function NewProjectPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const appResp = await appOctokit().request("GET /app");
  const slug = appResp.data?.slug;
  const installUrl = slug ? `https://github.com/apps/${slug}/installations/new` : null;

  return (
    <main>
      <h1>Connect a repo</h1>
      <p>
        Install Hive on a repository. If the repo doesn't have a <code>hive/</code> folder yet,
        we'll scaffold one.
      </p>
      {installUrl ? (
        <a href={installUrl}>
          <button type="button">Install Hive on a repo</button>
        </a>
      ) : (
        <p>
          Could not resolve the GitHub App slug. Check <code>GITHUB_APP_ID</code> and the private
          key in <code>.env</code>.
        </p>
      )}
    </main>
  );
}
