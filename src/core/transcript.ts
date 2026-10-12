import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

const UUID_RE = /"uuid"\s*:\s*"([^"]+)"/g;
// Claude strips these internal tags (not their contents) from response text.
const MEMORY_TAG_RE = /<\/?(?:cc-memory|cc_memory|ccmemory|CC-MEMORY|CC_MEMORY|CCMEMORY)(?=[\s/>])[^>]{0,1024}>/g;

export interface Response {
  text: string;
  branch?: string;
}

export interface Scan {
  cwd?: string;
  slug?: string;
  customTitle?: string;
  aiTitle?: string;
  responses: Map<string, Response>;
}

export function titleOf(scan: Scan): string | undefined {
  return scan.customTitle || scan.aiTitle || scan.slug;
}

/** The text Claude shows for a bookmarked response: its text blocks, minus internal tags. */
export function responseText(content: readonly unknown[]): string {
  const texts = content.flatMap((b) =>
    typeof b === "object" && b !== null && (b as { type?: unknown }).type === "text"
      && typeof (b as { text?: unknown }).text === "string" ? [(b as { text: string }).text] : []);
  return texts.join("\n\n").replace(MEMORY_TAG_RE, "");
}

/** One pass over a transcript; only lines that can matter are parsed. */
export async function scanTranscript(file: string, uuids: ReadonlySet<string>): Promise<Scan> {
  const scan: Scan = { responses: new Map() };
  const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    const wanted = new Set([...line.matchAll(UUID_RE)].map((m) => m[1] ?? "").filter((u) => uuids.has(u)));
    if (!(wanted.size || line.includes("-title") || (scan.cwd === undefined && line.includes('"cwd":')))) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    if (e.type === "custom-title" && typeof e.customTitle === "string") scan.customTitle = e.customTitle;
    else if (e.type === "ai-title" && typeof e.aiTitle === "string") scan.aiTitle = e.aiTitle;
    if (scan.cwd === undefined && typeof e.cwd === "string") scan.cwd = e.cwd;
    if (scan.slug === undefined && typeof e.slug === "string") scan.slug = e.slug;
    const message = e.message;
    const content = typeof message === "object" && message !== null ? (message as { content?: unknown }).content : undefined;
    if (e.type === "assistant" && typeof e.uuid === "string" && wanted.has(e.uuid) && Array.isArray(content)) {
      scan.responses.set(e.uuid, {
        text: responseText(content), ...(typeof e.gitBranch === "string" && { branch: e.gitBranch }),
      });
    }
  }
  return scan;
}

/** Session id → transcript path for every transcript under `projectsDir` (one level of project dirs). */
export async function indexTranscripts(projectsDir: string): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  let projects;
  try {
    projects = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return index;
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const dir = path.join(projectsDir, project.name);
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      const id = name.endsWith(".jsonl") ? name.slice(0, -".jsonl".length) : undefined;
      if (id && !index.has(id)) index.set(id, path.join(dir, name));
    }
  }
  return index;
}

interface Cached {
  mtimeMs: number;
  size: number;
  uuids: Set<string>;
  scan: Scan;
}

/** Scans keyed on (path, mtime, size); a changed file or a newly wanted uuid triggers one full rescan. */
export class TranscriptCache {
  #entries = new Map<string, Cached>();
  readonly stats = { hits: 0, scans: 0 };

  async read(file: string, uuids: ReadonlySet<string>): Promise<Scan> {
    const { mtimeMs, size } = await stat(file);
    const cached = this.#entries.get(file);
    const unchanged = cached !== undefined && cached.mtimeMs === mtimeMs && cached.size === size;
    if (unchanged && [...uuids].every((u) => cached.uuids.has(u))) {
      this.stats.hits++;
      return cached.scan;
    }
    const wanted = new Set([...uuids, ...(unchanged ? cached.uuids : [])]);
    const scan = await scanTranscript(file, wanted);
    this.#entries.set(file, { mtimeMs, size, uuids: wanted, scan });
    this.stats.scans++;
    return scan;
  }

  /** Forgets every transcript not in `files`. */
  retain(files: ReadonlySet<string>): void {
    for (const file of this.#entries.keys()) if (!files.has(file)) this.#entries.delete(file);
  }
}
