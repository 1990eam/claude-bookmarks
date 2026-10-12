// Fixed zone (UTC-3, no DST) so local-day logic is deterministic; import this first in every test file.
process.env.TZ = "America/Argentina/Buenos_Aires";

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const SESSION = "0a1b2c3d-1111-4222-8333-444455556666";
export const OTHER_SESSION = "9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff";

export function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "claude-bookmarks-"));
}

export async function writeJson(file: string, data: unknown): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
  return file;
}

export async function writeJsonl(file: string, entries: unknown[]): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, entries.map((e) => (typeof e === "string" ? e : JSON.stringify(e)) + "\n").join(""));
  return file;
}

/** Epoch ms for a local wall-clock time. */
export function ms(year: number, month: number, day: number, hour = 12, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}
