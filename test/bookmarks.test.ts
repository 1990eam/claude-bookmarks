import { ms, OTHER_SESSION, SESSION, tempDir, writeJson } from "./helpers.ts";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { loadBookmarks } from "../src/core/bookmarks.ts";

test("reads session files", async () => {
  const dir = await tempDir();
  await writeJson(path.join(dir, `${SESSION}.json`), {
    updatedAt: ms(2026, 10, 12), projects: "/p",
    bookmarks: [{ uuid: "u1", addedAt: ms(2026, 10, 12, 12, 58), writtenAt: ms(2026, 10, 12, 12, 36) }],
  });
  const { bookmarks, warnings } = await loadBookmarks([dir]);
  assert.deepEqual(warnings, []);
  assert.deepEqual(bookmarks, [{
    sessionId: SESSION, uuid: "u1", addedAt: ms(2026, 10, 12, 12, 58), writtenAt: ms(2026, 10, 12, 12, 36),
    projectsDir: "/p",
  }]);
});

test("skips invalid and duplicate entries like the extension", async () => {
  const dir = await tempDir();
  await writeJson(path.join(dir, `${SESSION}.json`), {
    updatedAt: 1, bookmarks: [
      { uuid: "u1", addedAt: ms(2026, 10, 1) }, { uuid: "u1", addedAt: ms(2026, 10, 2) },
      { uuid: "", addedAt: 5 }, { uuid: 7, addedAt: 5 }, { uuid: "u2" }, { uuid: "u3", addedAt: "yesterday" },
      { uuid: "u4", addedAt: 5, writtenAt: null }, "junk"],
  });
  const { bookmarks } = await loadBookmarks([dir]);
  assert.deepEqual(bookmarks, [{ sessionId: SESSION, uuid: "u1", addedAt: ms(2026, 10, 1) }]);
});

test("warns about unreadable files and keeps going", async () => {
  const dir = await tempDir();
  await writeFile(path.join(dir, "broken.json"), "{not json");
  await writeJson(path.join(dir, "wrong-shape.json"), { updatedAt: 1, bookmarks: {} });
  await writeJson(path.join(dir, "bad-projects.json"), { updatedAt: 1, projects: 3, bookmarks: [] });
  await writeFile(path.join(dir, "empty.json"), "");
  await writeFile(path.join(dir, "notes.txt"), "ignored");
  await writeJson(path.join(dir, `${SESSION}.json`), { updatedAt: 1, bookmarks: [{ uuid: "u1", addedAt: 5 }] });
  const { bookmarks, warnings } = await loadBookmarks([dir]);
  assert.deepEqual(bookmarks.map((b) => b.uuid), ["u1"]);
  assert.equal(warnings.length, 3);
  for (const name of ["broken.json", "wrong-shape.json", "bad-projects.json"]) {
    assert.ok(warnings.some((w) => w.includes(name)), name);
  }
});

test("merges dirs without duplicates and reports missing ones", async () => {
  const [a, b] = [await tempDir(), await tempDir()];
  const entry = { updatedAt: 1, bookmarks: [{ uuid: "u1", addedAt: 5 }] };
  await writeJson(path.join(a, `${SESSION}.json`), entry);
  await writeJson(path.join(b, `${SESSION}.json`), entry);
  await writeJson(path.join(b, `${OTHER_SESSION}.json`), entry);
  const missing = path.join(a, "nope");
  const result = await loadBookmarks([a, b, missing]);
  assert.deepEqual(result.bookmarks.map((x) => x.sessionId).sort(), [SESSION, OTHER_SESSION].sort());
  assert.deepEqual(result.missingDirs, [missing]);
});
