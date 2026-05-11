# Branch protection setup

This is the **enforcement** layer for the parallel-bot workflow. After applying these settings, GitHub rejects any direct push to `main` for *any* changes (source code, `hive/` files, anything). All work flows through PRs gated by the `ci` status check from `.github/workflows/ci.yml`. Bots can self-merge their own PRs once `ci` goes green via auto-merge.

**Who runs this:** the repo admin (you). Bots can't flip these toggles — GitHub doesn't expose branch protection to non-admin tokens.

**When to run:** after `.github/workflows/ci.yml` is on `main` (HV-032 merged) and you've watched at least one PR's `ci` check go green so you know the workflow's check name is `ci` exactly. Both conditions are now true.

---

## The settings

There are two GitHub-side changes — branch protection (per-branch rule) and auto-merge (per-repo setting).

### Path A — apply via `gh api` (recommended)

The branch-protection API needs a **nested JSON body** (`required_status_checks` and `required_pull_request_reviews` are objects). `gh api`'s `-F` flag does NOT build nested objects from dot notation — it sends each `-F` as a flat top-level form field. So we pipe real JSON via `--input`.

#### PowerShell (Windows)

```powershell
$json = @{
  required_status_checks = @{ strict = $true; contexts = @("ci") }
  enforce_admins = $true
  required_pull_request_reviews = @{
    required_approving_review_count = 0
    dismiss_stale_reviews = $false
    require_code_owner_reviews = $false
  }
  required_linear_history = $true
  allow_force_pushes = $false
  allow_deletions = $false
  restrictions = $null
} | ConvertTo-Json -Depth 4

[System.IO.File]::WriteAllText("$pwd\branch-protection.json", $json)

gh api -X PUT repos/allavallc/bot-hive/branches/main/protection --input branch-protection.json

Remove-Item branch-protection.json

gh api -X PATCH repos/allavallc/bot-hive `
  -F allow_auto_merge=true `
  -F delete_branch_on_merge=true
```

`[System.IO.File]::WriteAllText` writes UTF-8 without BOM — important because PowerShell's default `Out-File` writes UTF-16 with BOM, which gh api can't parse.

#### Bash / zsh (macOS, Linux, WSL)

```bash
cat > /tmp/branch-protection.json <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["ci"] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "restrictions": null
}
JSON

gh api -X PUT repos/allavallc/bot-hive/branches/main/protection --input /tmp/branch-protection.json
rm /tmp/branch-protection.json

gh api -X PATCH repos/allavallc/bot-hive \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=true
```

The first call sets branch protection on `main`. The second enables auto-merge at the repo level. The auto-merge call uses flat `-F` flags because those fields aren't nested.

### Path B — apply via the GitHub web UI

Go to https://github.com/allavallc/bot-hive/settings/branches → **Add branch protection rule** for `main`:

- [ ] **Branch name pattern:** `main`
- [ ] **Require a pull request before merging:** ON
  - [ ] **Required approvals:** `0` — bots self-merge; CI is the gate, human acceptance happens at the in-review ticket level
  - [ ] **Dismiss stale pull request approvals when new commits are pushed:** OFF (no approvals required, so moot)
  - [ ] **Require review from Code Owners:** OFF
- [ ] **Require status checks to pass before merging:** ON
  - [ ] Required check: `ci` (search and select)
  - [ ] **Require branches to be up to date before merging:** ON (forces rebase before merge — catches stale-branch conflicts)
- [ ] **Require conversation resolution before merging:** OFF
- [ ] **Require signed commits:** OFF (future hardening, out of scope)
- [ ] **Require linear history:** ON (rebase or squash merges only; no merge commits — keeps `git log` readable for provenance trailers)
- [ ] **Allow force pushes:** OFF
- [ ] **Allow deletions:** OFF
- [ ] **Restrict who can push to matching branches:** OFF (no bypass list)
- [ ] **Do not allow bypassing the above settings:** ON (admins included — no escape hatch for "just this once")

Then https://github.com/allavallc/bot-hive/settings → **General**:

- [ ] **Allow auto-merge:** ON
- [ ] **Automatically delete head branches:** ON

---

## What changes after this lands

### All commits go via PR

GitHub blocks direct pushes to `main`. **Including `hive/` ticket moves.** A bot or human trying `git push` on `main` will see:

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: error: Cannot update this protected ref.
```

The new workflow for *any* change:

```bash
git checkout -b hv-XXX-<slug>          # branch off main
# ... edit files ...
git commit -am "..."
git push -u origin hv-XXX-<slug>
gh pr create --title "..." --body "..."
gh pr merge --auto --squash --delete-branch  # waits for CI green, then auto-merges
```

The `--auto` flag is the magic — it queues the merge and fires it the moment CI goes green. No manual step.

### CI runs on every PR (including hive-only)

A PR that only touches `hive/` files still runs the full `ci` workflow. It passes trivially in ~2 minutes since no source code changed. That's the cost of uniform enforcement; we trade ~2 min of wasted CI minutes per hive-only PR for the guarantee that no source change ever bypasses CI.

If CI minutes become a real concern, we can add `paths-ignore` filtering to the workflow later (HV-?). Not worth the complexity today.

### Auto-merge behavior

When a bot opens a PR and runs `gh pr merge --auto --squash`:

1. PR is queued for auto-merge.
2. CI runs.
3. The moment `ci` reports green, GitHub auto-merges the PR (squashed, branch deleted).
4. Bot's next `git pull` sees the merged change on `main`.

Total ceremony per change: ~2-3 minutes of wall time, ~5 seconds of bot interaction.

---

## What doesn't change

- The split between hive/ coordination metadata and source code in **mental model** stays the same — hive/ is still small atomic moves, source is still the substantive work. The only difference: both now go through PRs.
- Provenance trailers (`Bot:`, `Model:`, `Trigger:`) stay the same.
- The handle convention stays the same.
- The per-actor `hive/events/`, `hive/notes-to-bots/`, `hive/notes-to-humans/`, and `focus.md` conventions stay the same.

---

## Verifying it worked

1. **Branch protection visible:** https://github.com/allavallc/bot-hive/settings/branches should show a rule for `main` with the settings above.
2. **Auto-merge enabled:** https://github.com/allavallc/bot-hive/settings — "Allow auto-merge" is checked.
3. **Direct push to main is rejected:**

   ```bash
   echo "test" >> README.md
   git add README.md
   git commit -m "test direct push"
   git push
   # Should fail with: "Cannot update this protected ref"
   ```

   Then `git reset --hard origin/main` to discard the test commit.

4. **PR with green CI auto-merges:**
   - Open a no-op PR (touch any file in `hive/`).
   - Run `gh pr merge <#> --auto --squash --delete-branch`.
   - Wait ~2-3 minutes; the PR auto-merges.

5. **PR with broken CI is blocked:**
   - Open a PR that breaks something (e.g., add a syntax error to a `.ts` file).
   - CI fails.
   - The PR shows "Required statuses must pass before merging." Manual merge button is disabled.

If all four pass, branch protection + auto-merge are working end-to-end.

---

## If something goes wrong

- **Bots get stuck on direct pushes after this lands.** Expected; the rule changed. Bots need to update to use the PR + auto-merge flow. The convention in `hive/HIVE.md` and `AGENTS.md` is being updated in this same ticket to reflect that.
- **Auto-merge isn't firing on green CI.** Double-check the per-repo "Allow auto-merge" toggle. Also check that the PR was opened with `gh pr merge --auto` (not just merged manually after).
- **A bot is blocked, can't open a PR for some legitimate reason.** Use the normal "blocked ticket" flow: move ticket to `hive/blocked/` with `Failure mode`, surface to the human.
- **You need to bypass for an emergency.** Toggle off "Do not allow bypassing the above settings," do the bypass push, toggle back on. **Document the bypass in `tasks/lessons.md`.** Bypasses should be rare and visible.
