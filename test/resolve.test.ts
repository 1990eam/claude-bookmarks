import { OTHER_SESSION, SESSION, tempDir, writeJson, writeJsonl } from "./helpers.ts";
import assert from "node:assert/strict";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { Bookmark } from "../src/core/model.ts";
import { loadEntries, resolve } from "../src/core/resolve.ts";
import { projectName } from "../src/core/format.ts";
import { TranscriptCache } from "../src/core/transcript.ts";

function assistant(uuid: string, blocks: unknown[], o: { cwd?: string; branch?: string; slug?: string } = {}) {
  return { type: "assistant", uuid, cwd: o.cwd ?? "/home/u/code/proj", gitBranch: o.branch ?? "main",
    slug: o.slug ?? "some-slug", sessionId: SESSION, message: { role: "assistant", content: blocks } };
}
const text = (t: string) => ({ type: "text", text: t });

async function fixture() {
  const projects = await tempDir();
  const transcript = path.join(projects, "-home-u-code-proj", `${SESSION}.jsonl`);
  const mark = (uuid: string, session = SESSION, projectsDir: string | undefined = projects): Bookmark =>
    ({ sessionId: session, uuid, addedAt: new Date(2026, 9, 12, 12).getTime(), ...(projectsDir && { projectsDir }) });
  const run = (marks: Bookmark[], defaultProjects = "/nonexistent") =>
    resolve(marks, defaultProjects, new TranscriptCache(), () => {});
  return { projects, transcript, mark, run };
}

test("collects text, title and location", async () => {
  const { transcript, mark, run } = await fixture();
  await writeJsonl(transcript, [
    { type: "user", uuid: "q", cwd: "/home/u/code/proj", message: { content: "hi" } },
    { type: "ai-title", aiTitle: "Generated", sessionId: SESSION },
    "{truncated line",
    assistant("a1", [{ type: "thinking", thinking: "hmm" }, text("First."), { type: "tool_use", name: "Bash" },
      text('<cc-memory id="x">Second.</cc-memory>')], { cwd: "/home/u/code/proj/sub", branch: "feature" }),
    { type: "custom-title", customTitle: "Mine", sessionId: SESSION },
  ]);
  const [entry] = await run([mark("a1")]);
  assert.equal(entry?.text, "First.\n\nSecond.");
  assert.equal(entry?.title, "Mine");
  assert.equal(entry?.cwd, "/home/u/code/proj");
  assert.equal(projectName(entry?.cwd), "proj");
  assert.equal(entry?.branch, "feature");
  assert.equal(entry?.problem, undefined);
});

test("title falls back to the last ai-title, then the slug", async () => {
  const { transcript, mark, run } = await fixture();
  await writeJsonl(transcript, [{ type: "ai-title", aiTitle: "Old" }, { type: "ai-title", aiTitle: "New" },
    assistant("a1", [text("x")])]);
  assert.equal((await run([mark("a1")]))[0]?.title, "New");
  await writeJsonl(transcript, [assistant("a1", [text("x")], { slug: "pasted-slug" })]);
  assert.equal((await run([mark("a1")]))[0]?.title, "pasted-slug");
});

test("reports a missing transcript, a missing response and an empty one", async () => {
  const { transcript, mark, run } = await fixture();
  await writeJsonl(transcript, [
    { type: "user", uuid: "q", cwd: "/home/u/code/proj", message: { content: "hi" } },
    assistant("a1", [text("x")]), assistant("a2", [{ type: "tool_use", name: "Bash" }])]);
  const [gone, notAssistant, unknown, empty] = await run(
    [mark("a1", OTHER_SESSION), mark("q"), mark("zzz"), mark("a2")]);
  assert.equal(gone?.problem, "transcript not found");
  assert.equal(gone?.cwd, undefined);
  assert.equal(notAssistant?.problem, "response text unavailable");
  assert.equal(unknown?.problem, "response text unavailable");
  assert.equal(projectName(unknown?.cwd), "proj");
  assert.equal(empty?.problem, "response has no text");
});

test("falls back to the default projects dir and keeps bookmark order", async () => {
  const { projects, transcript, mark, run } = await fixture();
  await writeJsonl(transcript, [assistant("a1", [text("one")]), assistant("a2", [text("two")])]);
  const entries = await run([mark("a2", SESSION, undefined), mark("a1", SESSION, undefined)], projects);
  assert.deepEqual(entries.map((e) => e.text), ["two", "one"]);
});

test("loadEntries scopes to one project folder", async () => {
  const { projects, transcript } = await fixture();
  await writeJsonl(transcript, [assistant("a1", [text("mine")])]);
  await writeJsonl(path.join(projects, "-home-u-code-other", `${OTHER_SESSION}.jsonl`),
    [assistant("b1", [text("theirs")], { cwd: "/home/u/code/other" })]);
  const storage = await tempDir();
  const now = Date.now();
  await writeJson(path.join(storage, `${SESSION}.json`), { updatedAt: 1, projects, bookmarks: [{ uuid: "a1", addedAt: now }] });
  await writeJson(path.join(storage, `${OTHER_SESSION}.json`), { updatedAt: 1, projects, bookmarks: [{ uuid: "b1", addedAt: now }] });
  await writeJson(path.join(storage, "gone-session.json"), { updatedAt: 1, projects, bookmarks: [{ uuid: "c1", addedAt: now }] });
  const load = (scope?: string) => loadEntries({
    dirs: [storage], defaultProjectsDir: projects, range: {}, cache: new TranscriptCache(),
    ...(scope && { scope }), platform: "linux" });
  assert.deepEqual((await load("/home/u/code/proj/")).entries.map((e) => e.text), ["mine"]);
  assert.equal((await load()).entries.length, 3);
});

test("the cache rescans only when the file or the wanted uuids change", async () => {
  const { transcript } = await fixture();
  await writeJsonl(transcript, [assistant("a1", [text("one")]), assistant("a2", [text("two")])]);
  const cache = new TranscriptCache();
  await cache.read(transcript, new Set(["a1"]));
  await cache.read(transcript, new Set(["a1"]));
  assert.deepEqual(cache.stats, { hits: 1, scans: 1 });
  const both = await cache.read(transcript, new Set(["a2"]));
  assert.deepEqual([...both.responses.keys()].sort(), ["a1", "a2"]);
  assert.deepEqual(cache.stats, { hits: 1, scans: 2 });
  await appendFile(transcript, JSON.stringify({ type: "custom-title", customTitle: "Renamed" }) + "\n");
  assert.equal((await cache.read(transcript, new Set(["a1"]))).customTitle, "Renamed");
  assert.deepEqual(cache.stats, { hits: 1, scans: 3 });
});
