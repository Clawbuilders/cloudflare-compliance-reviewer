/**
 * GitHub helpers: token resolution (GitHub App or PAT), webhook signature check, and the few REST calls the
 * committee needs. Every network function takes an optional `f` (fetch) so tests can stub it.
 * App-auth code is adapted from Clawbuilders/cloudflare-code-reviewer (MIT).
 */

export interface GitHubAppEnv {
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
}

const UA = "ClawBuilders-Compliance-Committee";
const API = "https://api.github.com";

function baseHeaders(token?: string | null, accept = "application/vnd.github+json"): Record<string, string> {
  const h: Record<string, string> = { "User-Agent": UA, Accept: accept };
  if (token) h.Authorization = `token ${token}`;
  return h;
}

async function ensureOk(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new Error(`GitHub ${what} failed: ${res.status} ${res.statusText} ${(await res.text()).slice(0, 300)}`.trim());
  return res;
}

// ---------- GitHub App authentication ----------

function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// GitHub generates PKCS#1 keys ("BEGIN RSA PRIVATE KEY"); Web Crypto needs PKCS#8. Convert once:
//   openssl pkcs8 -topk8 -nocrypt -in downloaded-key.pem -out pkcs8-key.pem
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  if (pem.includes("BEGIN RSA PRIVATE KEY")) {
    throw new Error('GITHUB_APP_PRIVATE_KEY is PKCS#1 ("BEGIN RSA PRIVATE KEY") — convert it: openssl pkcs8 -topk8 -nocrypt -in key.pem -out pkcs8-key.pem');
  }
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function createAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64UrlEncode(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId }))}`;
  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

async function getInstallationToken(appJwt: string, installationId: number, f: typeof fetch): Promise<string> {
  const res = await f(`${API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { ...baseHeaders(null), Authorization: `Bearer ${appJwt}` },
  });
  await ensureOk(res, "installation token");
  return ((await res.json()) as { token: string }).token;
}

export function hasAppCredentials(env: GitHubAppEnv): boolean {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
}

/** App installation token when configured (needs the webhook's installation.id), otherwise null → caller falls back to a PAT. */
export async function resolveGitHubToken(env: GitHubAppEnv, installationId: number | undefined, f: typeof fetch = fetch): Promise<string | null> {
  if (!hasAppCredentials(env) || !installationId) return null;
  return getInstallationToken(await createAppJwt(env.GITHUB_APP_ID!, env.GITHUB_APP_PRIVATE_KEY!), installationId, f);
}

/** Constant-time check of GitHub's X-Hub-Signature-256 over the raw body. No secret configured → returns true (callers decide whether that is allowed). */
export async function verifyWebhookSignature(secret: string | undefined, rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!secret) return true;
  if (!signatureHeader) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = "sha256=" + [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signatureHeader.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  return mismatch === 0;
}

// ---------- REST helpers ----------

/** The documented way to get a PR diff: GET the PR with the diff media type (the github.com .diff web route 404s for App tokens on private repos). */
export async function fetchPrDiff(repo: string, number: number, token?: string | null, f: typeof fetch = fetch): Promise<string> {
  const res = await f(`${API}/repos/${repo}/pulls/${number}`, { headers: baseHeaders(token, "application/vnd.github.v3.diff") });
  await ensureOk(res, `PR diff for ${repo}#${number}`);
  return res.text();
}

export interface UpsertArgs {
  repo: string;
  issueNumber: number;
  body: string;
  marker: string;
  token?: string | null;
}

/** Update the comment carrying `marker` if one exists, otherwise create it — a re-run edits in place instead of piling up comments. */
export async function upsertComment(a: UpsertArgs, f: typeof fetch = fetch): Promise<{ id: number; url: string; action: "created" | "updated" }> {
  let existing: number | null = null;
  for (let page = 1; page <= 5 && existing === null; page++) {
    const res = await f(`${API}/repos/${a.repo}/issues/${a.issueNumber}/comments?per_page=100&page=${page}`, { headers: baseHeaders(a.token) });
    await ensureOk(res, "list comments");
    const comments = (await res.json()) as { id: number; body?: string }[];
    existing = comments.find((c) => c.body?.includes(a.marker))?.id ?? null;
    if (comments.length < 100) break;
  }
  const headers = { ...baseHeaders(a.token), "Content-Type": "application/json" };
  const res =
    existing !== null
      ? await f(`${API}/repos/${a.repo}/issues/comments/${existing}`, { method: "PATCH", headers, body: JSON.stringify({ body: a.body }) })
      : await f(`${API}/repos/${a.repo}/issues/${a.issueNumber}/comments`, { method: "POST", headers, body: JSON.stringify({ body: a.body }) });
  await ensureOk(res, existing !== null ? "update comment" : "create comment");
  const data = (await res.json()) as { id: number; html_url?: string };
  return { id: data.id, url: data.html_url ?? "", action: existing !== null ? "updated" : "created" };
}
