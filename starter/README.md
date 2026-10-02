# Starter Track — an accessibility reviewer, the first member of the committee

A Cloudflare Worker that reviews GitHub pull requests for **accessibility** problems against WCAG 2.2 — the standard that
AODA (Ontario), the ADA and the EU Accessibility Act all build on. It is deliberately small, so you can read every file.

> Flags risk for humans. Not legal advice. Heuristic checks are not a substitute for an accessibility audit.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Clawbuilders/cloudflare-compliance-reviewer/tree/main/starter)

## What happens on a pull request

1. A `pull_request` webhook reaches the Worker, which verifies GitHub's HMAC signature.
2. The webhook goes to **one Agents SDK agent per PR**. Its SQLite-backed state remembers the newest commit, so a burst of
   pushes becomes one review of the latest commit (a 15 second debounce using `schedule`).
3. **Clef** (`@cf/cloudflare/clef-flash`, Cloudflare's decision model) answers one yes/no question — *does this change touch
   user-interface markup?* — and returns a probability. Below the threshold, nothing else runs.
4. Deterministic checks (`src/a11y-rules.ts`) flag missing `alt`, unnamed buttons and links, unlabeled inputs, positive
   `tabindex`, removed focus outlines, and click handlers on non-interactive elements. Each maps to a WCAG success criterion.
5. A Workers AI model (Qwen 2.5 Coder) turns the flags into one-line explanations and corrected snippets.
6. The result is posted as **one comment that is edited in place** on later pushes.

The checks are plain functions with unit tests (`npm test`) — read them first, they are the heart of the track.

## Run it

```bash
npm install
npm test
npx wrangler dev --var DRY_RUN:true        # DRY_RUN returns the review in the response instead of posting to GitHub
```

Send it a sample pull-request event (see the workshop guide), or deploy and add a webhook:

```bash
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put GITHUB_TOKEN       # fine-grained PAT: Pull requests (read), Issues (read/write)
npm run deploy
```

In your repository: **Settings → Webhooks → Add webhook** — payload URL = your Worker URL, content type `application/json`,
the secret above, event **Pull requests**.

## Grow it into a committee
The [Advanced track](..) keeps this shape and adds five more specialists, a policy engine, durable workflows, waivers and an
audit log.
