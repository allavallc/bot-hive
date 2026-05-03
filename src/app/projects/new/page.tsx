import { PageShell, pageShellStyles as ui } from "@/components/page-shell";
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
    <PageShell signedIn showCrumb>
      <span className={ui.kicker}>Connect a repo</span>
      <h1 className={ui.pageTitle}>Install Hive on a repository.</h1>
      <p className={ui.lede}>
        Bot Hive will read the <code>hive/</code> folder in your repo and render every ticket as a
        live card. If the folder doesn't exist yet, we'll scaffold it for you in a single commit.
      </p>
      {installUrl ? (
        <a href={installUrl} className={ui.btnOut}>
          Install Hive on a repo →
        </a>
      ) : (
        <p className={ui.lede}>
          Could not resolve the GitHub App slug. Check <code>GITHUB_APP_ID</code> and the private
          key in <code>.env</code>.
        </p>
      )}
    </PageShell>
  );
}
