import { describe, expect, it } from "vitest";
import {
  countApprovals,
  fetchFileAtRef,
  fetchPrDiff,
  getCollaboratorPermission,
  upsertComment,
  verifyWebhookSignature,
} from "../src/github";

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return "sha256=" + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Req = { url: string; init?: RequestInit };
function fakeFetch(routes: (req: Req) => { status?: number; json?: unknown; text?: string }) {
  const calls: Req[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = routes({ url, init });
    const status = r.status ?? 200;
    return new Response(r.text ?? JSON.stringify(r.json ?? {}), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("verifyWebhookSignature", () => {
  it("accepts a valid signature, rejects invalid or missing ones", async () => {
    const body = '{"a":1}';
    const good = await sign("s3cret", body);
    expect(await verifyWebhookSignature("s3cret", body, good)).toBe(true);
    expect(await verifyWebhookSignature("s3cret", body, good.replace(/.$/, "0"))).toBe(false);
    expect(await verifyWebhookSignature("s3cret", body, null)).toBe(false);
    expect(await verifyWebhookSignature("other", body, good)).toBe(false);
  });

  it("is a no-op only when no secret is configured", async () => {
    expect(await verifyWebhookSignature(undefined, "x", null)).toBe(true);
  });
});

describe("upsertComment (Review Focus 3: no duplicates)", () => {
  const MARK = "<!-- m -->";
  it("PATCHes the existing marker comment", async () => {
    const { f, calls } = fakeFetch(({ url, init }) =>
      !init?.method || init.method === "GET"
        ? { json: [{ id: 1, body: "unrelated" }, { id: 7, body: `${MARK}\nold` }] }
        : { json: { id: 7, html_url: "u" } },
    );
    const r = await upsertComment({ repo: "o/r", issueNumber: 3, body: `${MARK}\nnew`, marker: MARK, token: "t" }, f);
    expect(r.action).toBe("updated");
    const write = calls[calls.length - 1];
    expect(write.init?.method).toBe("PATCH");
    expect(write.url).toContain("/issues/comments/7");
  });

  it("POSTs when no marker comment exists", async () => {
    const { f, calls } = fakeFetch(({ init }) => (!init?.method || init.method === "GET" ? { json: [{ id: 1, body: "x" }] } : { json: { id: 9, html_url: "u" } }));
    const r = await upsertComment({ repo: "o/r", issueNumber: 3, body: `${MARK}\nnew`, marker: MARK, token: "t" }, f);
    expect(r.action).toBe("created");
    expect(calls[calls.length - 1].init?.method).toBe("POST");
    expect(calls[calls.length - 1].url).toContain("/issues/3/comments");
  });

  it("throws with the GitHub error when the write is rejected", async () => {
    const { f } = fakeFetch(({ init }) => (!init?.method || init.method === "GET" ? { json: [] } : { status: 403, text: "forbidden" }));
    await expect(upsertComment({ repo: "o/r", issueNumber: 3, body: MARK, marker: MARK, token: "t" }, f)).rejects.toThrow(/403/);
  });
});

describe("fetch helpers", () => {
  it("fetchPrDiff requests the diff media type and returns the text", async () => {
    const { f, calls } = fakeFetch(() => ({ text: "diff --git a/x b/x" }));
    expect(await fetchPrDiff("o/r", 5, "tok", f)).toBe("diff --git a/x b/x");
    expect((calls[0].init?.headers as Record<string, string>).Accept).toBe("application/vnd.github.v3.diff");
    expect(calls[0].url).toBe("https://api.github.com/repos/o/r/pulls/5");
  });

  it("fetchPrDiff throws on failure", async () => {
    const { f } = fakeFetch(() => ({ status: 404, text: "nope" }));
    await expect(fetchPrDiff("o/r", 5, undefined, f)).rejects.toThrow(/404/);
  });

  it("fetchFileAtRef returns null on 404 and text otherwise", async () => {
    expect(await fetchFileAtRef("o/r", "a.json", "sha", "t", fakeFetch(() => ({ status: 404 })).f)).toBeNull();
    expect(await fetchFileAtRef("o/r", "a.json", "sha", "t", fakeFetch(() => ({ text: '{"a":1}' })).f)).toBe('{"a":1}');
  });

  it("getCollaboratorPermission prefers role_name (maintain/triage) over legacy permission", async () => {
    const { f } = fakeFetch(() => ({ json: { permission: "write", role_name: "maintain" } }));
    expect(await getCollaboratorPermission("o/r", "u", "t", f)).toBe("maintain");
    const legacy = fakeFetch(() => ({ json: { permission: "admin" } })).f;
    expect(await getCollaboratorPermission("o/r", "u", "t", legacy)).toBe("admin");
    expect(await getCollaboratorPermission("o/r", "u", "t", fakeFetch(() => ({ status: 404 })).f)).toBe("none");
  });

  it("countApprovals counts each reviewer's latest state only", async () => {
    const reviews = [
      { user: { login: "a" }, state: "APPROVED", submitted_at: "2026-01-01" },
      { user: { login: "a" }, state: "CHANGES_REQUESTED", submitted_at: "2026-01-02" },
      { user: { login: "b" }, state: "APPROVED", submitted_at: "2026-01-01" },
      { user: { login: "c" }, state: "COMMENTED", submitted_at: "2026-01-01" },
    ];
    expect(await countApprovals("o/r", 1, "t", fakeFetch(() => ({ json: reviews })).f)).toBe(1);
  });
});
