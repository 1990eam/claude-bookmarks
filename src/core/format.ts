import type { Entry } from "./model.ts";
import { dayKey, dayLabel, timeLabel } from "./range.ts";

export const SNIPPET_CHARS = 200;
export const TOOLTIP_CHARS = 1500;
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;
const MARKDOWN_MARK_RE = /\*\*|`|^[ \t]{0,3}(?:#{1,6}|>)[ \t]*/gm;
const SHELL_UNSAFE_RE = /[^\w@%+=:,./-]/; // shlex.quote's rule
const WINDOWS_PATH_RE = /^(?:[A-Za-z]:[\\/]|\\\\)/;

export function projectName(cwd?: string): string | undefined {
  return cwd?.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || undefined;
}

export function shortId(e: Entry): string {
  return `session ${e.bookmark.sessionId.slice(0, 8)}`;
}

/** The bookmark's own name, else its session's title, else the short session id. */
export function displayName(e: Entry): string {
  return e.alias ?? e.title ?? shortId(e);
}

/** The session a named bookmark belongs to; an unnamed one already shows its session as its name. */
export function sessionLabel(e: Entry): string | undefined {
  return e.alias === undefined ? undefined : e.title ?? shortId(e);
}

/** The dimmed text of a bookmark's row: "HH:MM · session · branch". */
export function itemDescription(e: Entry): string {
  return [timeLabel(e.bookmark.addedAt), sessionLabel(e), e.branch].filter(Boolean).join(" · ");
}

/** A one-line plain-text preview of a markdown response, at most `max` code points. */
export function snippet(text: string, max = SNIPPET_CHARS): string {
  const plain = text.replace(MARKDOWN_LINK_RE, "$1").replace(MARKDOWN_MARK_RE, "");
  const flat = plain.split(/\s+/).filter(Boolean).join(" ");
  const chars = Array.from(flat);
  return chars.length <= max ? flat : chars.slice(0, max - 1).join("").trimEnd() + "…";
}

export function shellQuote(s: string): string {
  if (!s) return "''";
  return SHELL_UNSAFE_RE.test(s) ? `'${s.replaceAll("'", `'"'"'`)}'` : s;
}

export function resumeCommand(e: Entry): string {
  const resume = `claude --resume ${e.bookmark.sessionId}`;
  if (!e.cwd) return resume;
  return WINDOWS_PATH_RE.test(e.cwd) ? `cd "${e.cwd}"; ${resume}` : `cd ${shellQuote(e.cwd)} && ${resume}`;
}

export function countLabel(n: number): string {
  return `${n} bookmark${n === 1 ? "" : "s"}`;
}

export interface DayGroup {
  key: string;
  label: string;
  entries: Entry[];
}

/** Newest first, grouped by local day. */
export function groupByDay(entries: readonly Entry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const e of [...entries].sort((a, b) => b.bookmark.addedAt - a.bookmark.addedAt)) {
    const key = dayKey(e.bookmark.addedAt);
    const last = groups.at(-1);
    if (last?.key === key) last.entries.push(e);
    else groups.push({ key, label: dayLabel(e.bookmark.addedAt), entries: [e] });
  }
  return groups;
}

/** Markdown cut to about `max` characters at a line break, with an open code fence closed. */
export function truncateMarkdown(text: string, max: number): string {
  if (text.length <= max) return text;
  const breakAt = text.lastIndexOf("\n", max);
  let cut = text.slice(0, breakAt > max / 2 ? breakAt : max).trimEnd();
  if ((cut.match(/^[ \t]*```/gm) ?? []).length % 2 === 1) cut += "\n```";
  return `${cut}\n\n…`;
}

function meta(e: Entry): string {
  const when = `${dayLabel(e.bookmark.addedAt)} ${timeLabel(e.bookmark.addedAt)}`;
  return [projectName(e.cwd), sessionLabel(e), when, e.branch].filter(Boolean).join(" · ");
}

export function tooltipMarkdown(e: Entry, max = TOOLTIP_CHARS): string {
  const body = e.problem ? `_${e.problem}_` : truncateMarkdown(e.text ?? "", max);
  return `**${displayName(e)}**\n\n_${meta(e)}_\n\n---\n\n${body}`;
}

export function responseMarkdown(e: Entry): string {
  return `# ${displayName(e)}\n\n_${meta(e)}_\n\n---\n\n${e.problem ? `_${e.problem}_` : e.text ?? ""}\n`;
}

/** Lower-cased words of a search query. */
export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Whether every term occurs in the entry's name, title, branch or response text. */
export function matchesTerms(e: Entry, terms: readonly string[]): boolean {
  const haystack = [e.alias, e.title, e.branch, e.text].filter(Boolean).join("\n").toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/** A plain-text snippet of `text` starting shortly before the first term found, at most `max` code points. */
export function contextSnippet(text: string, terms: readonly string[], max = SNIPPET_CHARS): string {
  const flat = snippet(text, Number.POSITIVE_INFINITY);
  const lower = flat.toLowerCase();
  const hits = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
  if (!hits.length) return snippet(text, max);
  const chars = Array.from(flat);
  const start = Math.max(0, Array.from(flat.slice(0, Math.min(...hits))).length - 40);
  const end = Math.min(chars.length, start + max);
  return (start > 0 ? "…" : "") + chars.slice(start, end).join("").trim() + (end < chars.length ? "…" : "");
}
