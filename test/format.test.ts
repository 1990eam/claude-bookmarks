import { SESSION } from "./helpers.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contextSnippet, countLabel, displayName, groupByDay, itemDescription, matchesTerms, responseMarkdown, resumeCommand,
  searchTerms, SNIPPET_CHARS, sessionLabel, shellQuote, snippet, tooltipMarkdown, truncateMarkdown,
} from "../src/core/format.ts";
import type { Entry } from "../src/core/model.ts";

function entry(o: Partial<Entry> & { day?: number; uuid?: string } = {}): Entry {
  const { day = 12, uuid = "a1", ...rest } = o;
  return { bookmark: { sessionId: SESSION, uuid, addedAt: new Date(2026, 9, day, 12).getTime() },
    cwd: "/home/u/my code", branch: "main", title: "POC-1", text: "Hello there", ...rest };
}

test("groups by day, newest first", () => {
  const groups = groupByDay([entry({ day: 10, uuid: "old" }), entry({ day: 12, uuid: "new" })]);
  assert.deepEqual(groups.map((g) => g.label), ["Mon 12 Oct 2026", "Sat 10 Oct 2026"]);
});

test("display name and resume command", () => {
  assert.equal(displayName(entry()), "POC-1");
  assert.equal(resumeCommand(entry()), `cd '/home/u/my code' && claude --resume ${SESSION}`);
  assert.equal(resumeCommand(entry({ cwd: "/home/u/proj" })), `cd /home/u/proj && claude --resume ${SESSION}`);
  assert.equal(resumeCommand(entry({ cwd: "C:\\Users\\u\\my code" })),
    `cd "C:\\Users\\u\\my code"; claude --resume ${SESSION}`);
});

test("problems without a transcript still give a display name and resume command", () => {
  const gone: Entry = { bookmark: entry().bookmark, problem: "transcript not found" };
  assert.equal(displayName(gone), "session 0a1b2c3d");
  assert.equal(resumeCommand(gone), `claude --resume ${SESSION}`);
});

test("a bookmark's own name replaces the session title, which moves next to it", () => {
  const named = entry({ alias: "Retry design" });
  assert.equal(displayName(named), "Retry design");
  assert.equal(sessionLabel(named), "POC-1");
  assert.equal(sessionLabel(entry()), undefined);
  assert.equal(itemDescription(entry()), "12:00 · main");
  assert.equal(itemDescription(named), "12:00 · POC-1 · main");
  const bare: Entry = { bookmark: entry().bookmark, alias: "Retry design" };
  assert.equal(itemDescription(bare), "12:00 · session 0a1b2c3d");
});

test("tooltip and response page name the session only for named bookmarks", () => {
  assert.match(tooltipMarkdown(entry()), /^\*\*POC-1\*\*\n\n_my code · Mon 12 Oct 2026 12:00 · main_/);
  const named = entry({ alias: "Retry design" });
  assert.match(tooltipMarkdown(named), /^\*\*Retry design\*\*\n\n_my code · POC-1 · Mon 12 Oct 2026 12:00 · main_/);
  assert.match(responseMarkdown(named), /^# Retry design\n\n_my code · POC-1 · Mon 12 Oct 2026 12:00 · main_/);
});

test("shellQuote matches shlex.quote", () => {
  assert.equal(shellQuote(""), "''");
  assert.equal(shellQuote("/a/b-c_d.e"), "/a/b-c_d.e");
  assert.equal(shellQuote("it's"), `'it'"'"'s'`);
  assert.equal(shellQuote("ñ"), "'ñ'");
});

test("snippets flatten, drop inline markdown and truncate by code point", () => {
  assert.equal(snippet("line one\n\n  line two"), "line one line two");
  assert.equal(snippet("## Plan\n\n**Keep** the `table`, see [docs](http://x) > ok\n> quoted\n- `__init__` stays"),
    "Plan Keep the table, see docs > ok quoted - __init__ stays");
  const long = snippet("word ".repeat(100));
  assert.ok(Array.from(long).length <= SNIPPET_CHARS && long.endsWith("…"));
  assert.equal(snippet("😀".repeat(SNIPPET_CHARS)), "😀".repeat(SNIPPET_CHARS));
});

test("truncated markdown cuts at a line break and closes an open fence", () => {
  const text = "Intro\n```ts\n" + "const x = 1;\n".repeat(50) + "```\nOutro";
  const cut = truncateMarkdown(text, 100);
  assert.ok(cut.length < 130);
  assert.equal((cut.match(/^```/gm) ?? []).length % 2, 0);
  assert.ok(cut.endsWith("…"));
  assert.equal(truncateMarkdown("short", 100), "short");
});

test("tooltip shows the problem instead of text", () => {
  assert.match(tooltipMarkdown(entry({ problem: "response text unavailable" })), /_response text unavailable_$/);
  assert.equal(countLabel(1), "1 bookmark");
  assert.equal(countLabel(2), "2 bookmarks");
});

test("search matches every term across title, branch and full text", () => {
  const e = entry({ title: "POC-1 planning", branch: "poc", text: "Keep the separate table.\n\nIn **Rails** a one-to-many…" });
  assert.deepEqual(searchTerms("  Rails  TABLE "), ["rails", "table"]);
  assert.ok(matchesTerms(e, searchTerms("rails table")));
  assert.ok(matchesTerms(e, searchTerms("planning poc")));
  assert.ok(!matchesTerms(e, searchTerms("rails django")));
  assert.ok(matchesTerms({ ...e, alias: "Retry design" }, searchTerms("retry rails")));
  assert.ok(matchesTerms(e, []));
});

test("context snippets start near the first match", () => {
  const text = "intro ".repeat(40) + "the **needle** sits here " + "outro ".repeat(80);
  const s = contextSnippet(text, ["needle"]);
  assert.ok(s.startsWith("…") && s.endsWith("…"), s);
  assert.ok(s.includes("the needle sits here"), s);
  assert.ok(Array.from(s).length <= SNIPPET_CHARS + 2);
  assert.equal(contextSnippet("short text", ["absent"]), "short text");
  assert.equal(contextSnippet("needle first", ["needle"]), "needle first");
});
