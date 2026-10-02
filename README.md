# Build a Policy-as-Code Agent Committee on Cloudflare

ClawBuilders **S1:E6** · Agentic AI Summit Toronto · a hands-on workshop repo.

A GitHub pull-request reviewer built the way you would want a production agent built: **models extract facts, Rego decides.**
Every verdict comes from a versioned policy, cites the rule it enforces, and is written to an audit log together with the
policy version that produced it. A person can waive a finding, but only a *different* maintainer can approve the waiver.

> **This flags risk for humans. It is not legal advice.** Regulatory citations are pointers to the rule a policy encodes —
> verify them with qualified counsel. The checks are heuristics over a diff, not an audit.

## Pick a track

Each track lives in its own directory with its own `package.json` and `wrangler.json`, so each button deploys exactly one.

| Track | What you build | Deploy |
|---|---|---|
| **Starter** — [`starter/`](starter) | The first member of the committee: an accessibility (WCAG 2.2) reviewer. One Agents SDK agent per PR, Clef gates it, Workers AI explains the fixes. | [![Deploy Starter](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Clawbuilders/cloudflare-compliance-reviewer/tree/main/starter) |
| **Advanced** — this directory | The full committee: six specialists, a shared policy engine, durable workflows, four-eyes waivers, an audit log, and an MCP tool. | [![Deploy Advanced](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Clawbuilders/cloudflare-compliance-reviewer) |
| **Bonus** — [`compliance-preview-auditor`](https://github.com/Clawbuilders/compliance-preview-auditor) | Audit a live PR preview URL with Browser Rendering: axe-core, third-party requests before consent, and screenshots classified by Clef vision. | see its README |

New to Cloudflare Workers? The Starter is the place to begin. The workshop guide is [`docs/workshop-guide.md`](docs/workshop-guide.md).

## How the committee works

```
GitHub webhook (pull_request, issue_comment)
        │  signature verified (HMAC)
        ▼
 PrCommittee  — one Agents SDK agent per PR (Durable Object + SQLite)
        │  15 s debounce · audit_log · waivers ledger
        ▼
 CommitteeWorkflow  (durable: each step is checkpointed and retried on its own)
   1. triage ........ Clef: one yes/no question per specialist ("does this change need you?")
   2. specialists ... run in parallel, one workflow step each
        │              facts ← deterministic extractors over the diff (+ deps.dev, ClearlyDefined)
        │              verdict ← Rego rules, evaluated by Regorus (WebAssembly)
   3. publish ....... merge → one PR comment (edited in place) → audit log row
        ▲
        │  policies/<version>/bundle.json  ←  R2   (policies/ACTIVE points at the live version)
```

**Why a Rego engine instead of asking a model for a verdict?** A model's answer can change between runs and can be talked
into things by text inside the diff. A rule cannot. Models are used where they are good — routing and classifying — and the
decision is made by code you can read, test and version.

**Why policies live in R2.** Workers cannot compile WebAssembly from bytes at runtime, so a compiled OPA policy could not be
fetched from storage. Instead one engine ([Regorus](https://github.com/microsoft/regorus), a Rego interpreter) ships with
the Worker and policies travel as plain Rego text. Publish a new bundle and running agents pick it up — **no redeploy**.
Every audit row records which policy version made the call.

## The specialists

Honesty label: **REAL** = a real policy engine or a live public registry. **HEURISTIC** = pattern-based extraction of facts
from the diff (then judged by real Rego). Both are fallible; the label tells you where.

| Specialist | Looks for | Authority it cites | Kind |
|---|---|---|---|
| **Privacy** | personal data in logs, trackers not gated by consent, new third-party hosts | GDPR Art. 5(1)(c), 6, 7, 28, 32, 44 · PIPEDA 4.1.3, 4.3, 4.7 · Quebec Law 25 | HEURISTIC |
| **Licensing** | new npm dependencies with strong-copyleft or missing licenses; licenses found in a package's files that it does not declare; missing SPDX headers (REUSE repos only) | SPDX ids · REUSE 3.3 | REAL + HEURISTIC |
| **CASL** | email-sending code without unsubscribe, consent record, or sender identity | CASL s. 6(1)(a), 6(2)(a), 6(2)(c) | HEURISTIC |
| **AI governance** | AI usage with no declarations file; undisclosed user-facing AI; declared facts that fail [GOPAL](https://github.com/Principled-Evolution/gopal)'s EU AI Act, accountability and NIST AI RMF rules | EU AI Act Art. 13, 50 · NIST AI RMF · whatever the GOPAL rule cites | REAL (on declared facts) |
| **Sensitive data** | Luhn-valid card numbers and card fields in logs; health identifiers in logs or fixtures | PCI DSS v4.0 3.3.1, 3.5.1 · PHIPA s. 12 | HEURISTIC |
| **Change control** | CI, infra, auth changes without enough approvals; very large PRs; edits to the committee's own policies without review | SOC 2 CC8.1 | REAL |

Triage can *add* scrutiny but never remove a signal: if a specialist's own check fires, it runs even when Clef said skip.
Change control involves no model, so it always runs.

### Licensing data sources
`deps.dev` is the primary source. [ClearlyDefined](https://clearlydefined.io) enriches it (licenses discovered inside the
package's files). ClearlyDefined can be slow or return errors, so every call has a short timeout and a failure falls back to
deps.dev. If neither answers, the comment says the lookup was unavailable — an outage is never reported as "no license".

### AI governance and the declarations file
GOPAL judges *declared facts about an AI system*, not source code. Keep a `compliance/ai-system.json` in your repository
(see [`docs/examples/ai-system.json`](docs/examples/ai-system.json)). GOPAL's own caveat applies, and the comment repeats it:
**a declared value is still an assertion unless an evaluator backs it.**

## Waivers (four eyes)

Blocking findings show an id. In a PR comment:

```
/waive 9163cc4e vendor sandbox only, no real data      ← needs triage access; a reason is required
/approve 9163cc4e                                      ← must be a DIFFERENT person with write access
/reject 9163cc4e                                       ← anyone with standing; the requester may withdraw
```

A waiver is a durable workflow that waits for the approval; rejection or expiry ends with no waiver. Bots can neither request
nor approve. Quoted text and code fences are ignored, so replying to the bot never triggers a command. Waivers are recorded
with who requested, who approved, and the policy version, and the finding id stays stable across pushes.

## Use it from any agent (MCP)

`POST /mcp` serves a `check_compliance` tool (Streamable HTTP, bearer token) so Hermes, Claude Code, OpenClaw or any MCP
client can pre-check a change before opening a PR. The endpoint does not exist until you set a token:

```bash
npx wrangler secret put MCP_TOKEN
```

```json
{ "mcpServers": { "compliance-committee": {
    "url": "https://<your-worker>.workers.dev/mcp",
    "headers": { "Authorization": "Bearer <your token>" } } } }
```

## Set up the Advanced track

```bash
npm install
npx wrangler r2 bucket create compliance-policies
npm run policies:publish -- --remote        # builds the bundle and points policies/ACTIVE at it
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put GITHUB_TOKEN        # fine-grained PAT: Pull requests (read), Issues (read/write), Contents (read)
npm run deploy
```

Then in your repository: **Settings → Webhooks → Add webhook** — payload URL = your Worker URL, content type
`application/json`, the secret above, events **Pull requests** and **Issue comments**.
Prefer a GitHub App? Set `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` (PKCS#8; see `src/github.ts`) instead of the PAT.

Check it is alive: `curl https://<your-worker>.workers.dev/healthz` returns the active policy version. If no bundle is
published, the committee posts a **blocking "policy engine unavailable"** finding instead of silently passing.

### Develop locally
```bash
npm test                                   # unit tests (extractors, specialists, waivers, engine)
npm run policies:test                      # every Rego test, including the vendored GOPAL suite
npm run policies:publish -- --local
npx wrangler dev --var DRY_RUN:true        # DRY_RUN never writes to GitHub; /__dry-run/state shows verdicts
```

### Change a policy
Edit `policies/committee/*.rego` and its `_test.rego`, run `npm run policies:test`, then
`npm run policies:publish -- --remote`. Editing policy files in a PR to this repository is itself flagged by change control.

## What this does not do (read this)
- **Heuristics read added lines only**, mostly single-line patterns tuned for JavaScript/TypeScript. A determined author can evade them.
- **Licensing covers npm `package.json`** dependencies. The registry's license data can be wrong or missing.
- **Declared facts are assertions.** GOPAL cannot tell whether your `human_oversight.enabled: true` is true.
- **Clef returns probabilities, not certainty.** The `score` question type in particular can be low-confidence; routing uses yes/no probabilities.
- **It reviews a diff.** It is not a SAST scanner, a penetration test, or a legal review.

## Credits and licenses
MIT. Built on the [Cloudflare Agents SDK](https://github.com/cloudflare/agents), [Regorus](https://github.com/microsoft/regorus)
(MIT) and [GOPAL](https://github.com/Principled-Evolution/gopal) (Apache-2.0, vendored unmodified at a pinned commit). See
[`NOTICE`](NOTICE) and [`vendor/regorus/PROVENANCE.md`](vendor/regorus/PROVENANCE.md).
