// Dev check: prints the core's view of all projects in the Python CLI's text format, so the two can be diffed:
//   diff <(claude-bookmarks --since all) <(node scripts/parity.ts --since all)
import os from "node:os";
import { parseArgs } from "node:util";
import { countLabel, groupByDay, heading, resumeCommand, snippet } from "../src/core/format.ts";
import type { Entry } from "../src/core/model.ts";
import { defaultProjectsDir, profileBookmarkDirs, vscodeUserDirs } from "../src/core/paths.ts";
import { describeRange, parseTimeRange, timeLabel } from "../src/core/range.ts";
import { loadEntries } from "../src/core/resolve.ts";
import { TranscriptCache } from "../src/core/transcript.ts";

function renderText(entries: Entry[], label: string): string {
  if (!entries.length) return `No bookmarks · ${label}\n`;
  const indent = " ".repeat(9);
  const lines = [`${countLabel(entries.length)} · ${label}`];
  for (const group of groupByDay(entries)) {
    lines.push("", group.label);
    for (const e of group.entries) {
      lines.push(`  ${timeLabel(e.bookmark.addedAt)}  ${heading(e)}${e.branch ? ` (${e.branch})` : ""}`);
      lines.push(indent + (e.problem ? `(${e.problem})` : snippet(e.text ?? "")));
      lines.push(indent + resumeCommand(e));
    }
  }
  return lines.join("\n") + "\n";
}

const { values } = parseArgs({
  options: { since: { type: "string", default: "week" }, until: { type: "string" }, "storage-dir": { type: "string" } },
});
const range = parseTimeRange(values.since, values.until);
const userDirs = vscodeUserDirs(process.platform, process.env, os.homedir());
const dirs = values["storage-dir"]
  ? [values["storage-dir"]]
  : (await Promise.all(userDirs.map(profileBookmarkDirs))).flat();
const { entries } = await loadEntries({
  dirs, defaultProjectsDir: defaultProjectsDir(process.env, os.homedir()), range, cache: new TranscriptCache(),
});
process.stdout.write(renderText(entries, describeRange(range)));
