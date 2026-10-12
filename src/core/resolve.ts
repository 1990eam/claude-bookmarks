import { loadBookmarks } from "./bookmarks.ts";
import type { Bookmark, Entry, Problem, TimeRange } from "./model.ts";
import { sameFolder } from "./paths.ts";
import { inRange } from "./range.ts";
import { indexTranscripts, titleOf, type Scan, type TranscriptCache } from "./transcript.ts";

/** Attaches transcript details to each bookmark, reading each transcript at most once. */
export async function resolve(bookmarks: readonly Bookmark[], defaultProjectsDir: string, cache: TranscriptCache,
  warn: (message: string) => void): Promise<Entry[]> {
  const projectsOf = (b: Bookmark) => b.projectsDir ?? defaultProjectsDir;
  const indexes = new Map<string, Map<string, string>>();
  for (const dir of new Set(bookmarks.map(projectsOf))) indexes.set(dir, await indexTranscripts(dir));

  const sessions = new Map<string, { file?: string; uuids: Set<string>; scan?: Scan }>();
  for (const b of bookmarks) {
    const key = `${projectsOf(b)}\0${b.sessionId}`;
    const session = sessions.get(key) ?? { file: indexes.get(projectsOf(b))?.get(b.sessionId), uuids: new Set() };
    session.uuids.add(b.uuid);
    sessions.set(key, session);
  }
  for (const session of sessions.values()) {
    if (session.file === undefined) continue;
    try {
      session.scan = await cache.read(session.file, session.uuids);
    } catch (e) {
      warn(`cannot read ${session.file}: ${(e as Error).message}`);
    }
  }
  cache.retain(new Set([...sessions.values()].flatMap((s) => (s.scan && s.file ? [s.file] : []))));

  return bookmarks.map((bookmark): Entry => {
    const scan = sessions.get(`${projectsOf(bookmark)}\0${bookmark.sessionId}`)?.scan;
    if (!scan) return { bookmark, problem: "transcript not found" };
    const response = scan.responses.get(bookmark.uuid);
    const problem: Problem | undefined = response === undefined ? "response text unavailable"
      : !response.text.trim() ? "response has no text" : undefined;
    const title = titleOf(scan);
    return {
      bookmark, ...(scan.cwd !== undefined && { cwd: scan.cwd }), ...(response?.branch && { branch: response.branch }),
      ...(title && { title }), ...(response && { text: response.text }), ...(problem && { problem }),
    };
  });
}

export interface LoadOptions {
  dirs: readonly string[];
  defaultProjectsDir: string;
  range: TimeRange;
  cache: TranscriptCache;
  /** A resolved folder path; only sessions run in it are kept. Unset keeps every project. */
  scope?: string;
  platform?: string;
}

export interface LoadedEntries {
  entries: Entry[];
  warnings: string[];
  missingDirs: string[];
}

export async function loadEntries(o: LoadOptions): Promise<LoadedEntries> {
  const { bookmarks, warnings, missingDirs } = await loadBookmarks(o.dirs);
  const entries = await resolve(inRange(bookmarks, o.range), o.defaultProjectsDir, o.cache, (m) => warnings.push(m));
  const scope = o.scope;
  return {
    entries: scope === undefined ? entries
      : entries.filter((e) => e.cwd !== undefined && sameFolder(e.cwd, scope, o.platform)),
    warnings, missingDirs,
  };
}
