/** Unified-diff parsing and filtering — pure functions, no I/O. */

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  added: string[];
  removed: string[];
  additions: number;
  deletions: number;
  binary: boolean;
}

export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  let inHunk = false;

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      cur = { path: m ? m[2] : line.slice("diff --git ".length), status: "modified", added: [], removed: [], additions: 0, deletions: 0, binary: false };
      files.push(cur);
      inHunk = false;
      continue;
    }
    if (!cur) continue;

    if (!inHunk) {
      if (line.startsWith("new file mode")) cur.status = "added";
      else if (line.startsWith("deleted file mode")) cur.status = "deleted";
      else if (line.startsWith("rename to ")) {
        cur.status = "renamed";
        cur.path = line.slice("rename to ".length);
      } else if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) cur.binary = true;
      else if (line.startsWith("@@")) inHunk = true;
      continue;
    }

    if (line.startsWith("@@")) continue;
    if (line.startsWith("+")) {
      cur.added.push(line.slice(1));
      cur.additions++;
    } else if (line.startsWith("-")) {
      cur.removed.push(line.slice(1));
      cur.deletions++;
    }
  }
  return files;
}

const SKIP: RegExp[] = [
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|go\.sum|composer\.lock|Gemfile\.lock)$/,
  /(^|\/)(dist|build|vendor|node_modules)\//,
  /\.min\.(js|css)$/,
  /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|wasm)$/i,
];

/** Drop lockfiles, build output, vendored code, minified bundles and binaries before spending model tokens. */
export function reviewable(files: DiffFile[]): DiffFile[] {
  return files.filter((f) => !f.binary && !SKIP.some((re) => re.test(f.path)));
}

const NOTICE = "\n[truncated: output cut to fit the model budget]";

/** Render files as compact text for a model, never exceeding `maxChars`. */
export function truncateForModel(files: DiffFile[], maxChars: number): string {
  const blocks = files.map((f) => {
    const body = [...f.removed.map((l) => `-${l}`), ...f.added.map((l) => `+${l}`)].join("\n");
    return `### ${f.path} (+${f.additions}/-${f.deletions})\n${body}\n`;
  });
  const full = blocks.join("");
  if (full.length <= maxChars) return full;
  const room = Math.max(0, maxChars - NOTICE.length);
  const cut = full.slice(0, room);
  const lastNewline = cut.lastIndexOf("\n");
  return (lastNewline > 0 ? cut.slice(0, lastNewline) : cut) + NOTICE;
}
