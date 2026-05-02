# Onboarding

## Setup checklist

- [ ] Clone the repo
- [ ] Open `bot-horde/board.html` in your browser (or visit the GitHub Pages URL)
- [ ] To use **+ Add story**, create a fine-grained GitHub PAT for this repo with **Contents: Read and write** ([github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta))
- [ ] Click **+ Add story**, enter your name and the token once. Stored in your browser.

## How locking works

There is no separate lock registry. Git is the lock — when you move a ticket file to `bot-horde/in-progress/` and push, the push wins or fails. If two agents race for the same ticket, the second push hits a non-fast-forward conflict and that agent re-pulls and picks a different one.

---

For the full workflow, see [BOTHORDE.md](../../bot-horde/BOTHORDE.md).
