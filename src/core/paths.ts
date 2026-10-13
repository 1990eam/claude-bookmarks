import { readdir } from "node:fs/promises";
import path from "node:path";

export const CLAUDE_EXTENSION_ID = "anthropic.claude-code";
const BOOKMARKS_DIR = "session-bookmarks";
const SESSION_ID_MAX = 200; // Claude's own bound for ids accepted by its open handler

/** Claude's bookmark directory inside one profile's globalStorage root. */
export function claudeBookmarkDir(storageRoot: string): string {
  return path.join(storageRoot, CLAUDE_EXTENSION_ID, BOOKMARKS_DIR);
}

/**
 * The VS Code `User` directory above an extension's globalStorage path, in any profile:
 * <User>/globalStorage/<id> or <User>/profiles/<location>/globalStorage/<id>.
 */
export function userDirOf(ownStorage: string): string {
  const storageRoot = path.dirname(ownStorage);
  for (let dir = path.dirname(storageRoot); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (path.basename(dir) === "User") return dir;
  }
  return path.dirname(storageRoot);
}

async function subdirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/** Claude's bookmark directory in every profile of a VS Code `User` dir, the default profile first. */
export async function profileBookmarkDirs(user: string): Promise<string[]> {
  const profileDirs: string[] = [];
  for (const dir of await subdirs(path.join(user, "profiles"))) {
    profileDirs.push(...(path.basename(dir) === "builtin" ? await subdirs(dir) : [dir]));
  }
  const roots = [path.join(user, "globalStorage"), ...profileDirs.sort().map((d) => path.join(d, "globalStorage"))];
  return roots.map(claudeBookmarkDir);
}

/**
 * Claude's bookmark directory in every profile, the current profile first. Directories that don't exist
 * yet are included, so callers can watch for the first bookmark.
 */
export async function listBookmarkDirs(ownStorage: string): Promise<string[]> {
  const own = claudeBookmarkDir(path.dirname(ownStorage));
  return [...new Set([own, ...await profileBookmarkDirs(userDirOf(ownStorage))])];
}

export function defaultProjectsDir(env: Record<string, string | undefined>, home: string): string {
  return path.join(env.CLAUDE_CONFIG_DIR || path.join(home, ".claude"), "projects");
}

/** Whether two already-resolved folder paths name the same folder on `platform`. */
export function sameFolder(a: string, b: string, platform: string = process.platform): boolean {
  const norm = (p: string) => {
    const trimmed = p.normalize("NFC").replace(/[\\/]+$/, "");
    return platform === "win32" || platform === "darwin" ? trimmed.toLowerCase() : trimmed;
  };
  return norm(a) === norm(b);
}

/** Claude's rule for session ids it will open: no path separators, no "..", no NUL. */
export function isSafeSessionId(id: string): boolean {
  return id.length > 0 && id.length <= SESSION_ID_MAX
    && !id.includes("/") && !id.includes("\\") && !id.includes("..") && !id.includes("\0");
}
