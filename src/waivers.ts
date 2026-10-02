/** Waiver commands and the four-eyes rule. Pure functions — the Agent only supplies GitHub permissions. */
import type { Permission } from "./github";

export type Command = { cmd: "waive"; findingId: string; reason: string } | { cmd: "approve" | "reject"; findingId: string };

const LINE = /^\s*\/(waive|approve|reject)\s+([0-9a-fA-F]{8})\b(?:\s+(.*))?$/;
const MAX_REASON = 500;

/** First valid command in a comment. Quoted lines and fenced code are ignored so replies that quote the bot never trigger anything. */
export function parseCommand(body: string): Command | null {
  let fenced = false;
  for (const raw of body.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || /^\s*>/.test(raw)) continue;
    const m = raw.match(LINE);
    if (!m) continue;
    const cmd = m[1].toLowerCase() as "waive" | "approve" | "reject";
    const findingId = m[2].toLowerCase();
    const rest = (m[3] ?? "").trim();
    if (cmd === "waive") {
      if (rest.length < 3) return null; // a waiver without a reason is not auditable
      return { cmd, findingId, reason: rest.slice(0, MAX_REASON) };
    }
    return { cmd, findingId };
  }
  return null;
}

const isBot = (login: string) => /\[bot\]$/i.test(login);

/** Requesting a waiver needs at least triage access; bots may not. */
export function canRequestWaiver(permission: Permission, login: string): boolean {
  return !isBot(login) && ["admin", "maintain", "write", "triage"].includes(permission);
}

export type WaiverStatus = "pending" | "approved" | "rejected" | "expired";

export function decideApproval(req: { requester: string; approver: string; approverPermission: Permission; status: WaiverStatus }): { ok: true } | { ok: false; reason: string } {
  if (req.status !== "pending") return { ok: false, reason: `This waiver request is already ${req.status}.` };
  if (isBot(req.approver)) return { ok: false, reason: "Bot accounts cannot approve waivers." };
  if (req.approver.toLowerCase() === req.requester.toLowerCase()) return { ok: false, reason: "Four-eyes rule: you cannot approve your own waiver request." };
  if (!["admin", "maintain", "write"].includes(req.approverPermission)) return { ok: false, reason: "Approving a waiver needs write access to the repository." };
  return { ok: true };
}
