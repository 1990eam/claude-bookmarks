export type Problem = "transcript not found" | "response text unavailable" | "response has no text";

export interface Bookmark {
  sessionId: string;
  uuid: string;
  addedAt: number; // epoch ms
  writtenAt?: number;
  projectsDir?: string;
}

export interface Entry {
  bookmark: Bookmark;
  cwd?: string;
  branch?: string;
  title?: string;
  alias?: string; // the user's own name for the bookmark
  text?: string;
  problem?: Problem;
}

/** A local-time window [since, until); either bound may be absent. */
export interface TimeRange {
  since?: Date;
  until?: Date;
}
