import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Bookmark } from "./model.ts";

const UUID_MAX = 128; // Claude's schema bound

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Parses one session's bookmark file the way Claude validates it: a bad file is an error, a bad entry is
 * skipped, and the first entry for a uuid wins.
 */
export function parseBookmarkFile(sessionId: string, raw: string): Bookmark[] | "empty" | { error: string } {
  if (!raw.trim()) return "empty"; // Claude sweeps empty files; nothing to report
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!isObject(data) || !isNumber(data.updatedAt) || !Array.isArray(data.bookmarks)
    || ("projects" in data && typeof data.projects !== "string")) {
    return { error: "not a session bookmark file" };
  }
  const projectsDir = typeof data.projects === "string" && data.projects ? data.projects : undefined;
  const seen = new Set<string>();
  const result: Bookmark[] = [];
  for (const item of data.bookmarks) {
    if (!isObject(item) || typeof item.uuid !== "string" || item.uuid.length < 1 || item.uuid.length > UUID_MAX
      || !isNumber(item.addedAt) || ("writtenAt" in item && !isNumber(item.writtenAt)) || seen.has(item.uuid)) {
      continue;
    }
    seen.add(item.uuid);
    result.push({
      sessionId, uuid: item.uuid, addedAt: item.addedAt,
      ...(isNumber(item.writtenAt) && { writtenAt: item.writtenAt }),
      ...(projectsDir && { projectsDir }),
    });
  }
  return result;
}

export interface LoadResult {
  bookmarks: Bookmark[];
  warnings: string[];
  missingDirs: string[];
}

/** Reads every session file in `dirs`; the first copy of a (session, uuid) pair wins. */
export async function loadBookmarks(dirs: readonly string[]): Promise<LoadResult> {
  const found = new Map<string, Bookmark>();
  const warnings: string[] = [];
  const missingDirs: string[] = [];
  for (const dir of dirs) {
    let names: string[];
    try {
      names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") missingDirs.push(dir);
      else warnings.push(`cannot read ${dir}: ${(e as Error).message}`);
      continue;
    }
    for (const name of names) {
      const file = path.join(dir, name);
      let parsed: ReturnType<typeof parseBookmarkFile>;
      try {
        parsed = parseBookmarkFile(name.slice(0, -".json".length), await readFile(file, "utf8"));
      } catch (e) {
        parsed = { error: (e as Error).message };
      }
      if (parsed === "empty") continue;
      if ("error" in parsed) {
        warnings.push(`skipping ${file}: ${parsed.error}`);
        continue;
      }
      for (const b of parsed) {
        const key = `${b.sessionId}\0${b.uuid}`;
        if (!found.has(key)) found.set(key, b);
      }
    }
  }
  return { bookmarks: [...found.values()], warnings, missingDirs };
}
