import { tempDir } from "./helpers.ts";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  claudeBookmarkDir, defaultProjectsDir, isSafeSessionId, listBookmarkDirs, sameFolder, userDirOf,
} from "../src/core/paths.ts";

const OWN = "elian.claude-bookmarks";

test("userDirOf finds the User dir from any profile's storage", () => {
  const user = "/home/u/.config/Code/User";
  assert.equal(userDirOf(`${user}/globalStorage/${OWN}`), user);
  assert.equal(userDirOf(`${user}/profiles/-6a5b4c/globalStorage/${OWN}`), user);
  assert.equal(userDirOf(`${user}/profiles/builtin/agents/globalStorage/${OWN}`), user);
  assert.equal(userDirOf(`/home/u/.vscode-server/data/User/globalStorage/${OWN}`), "/home/u/.vscode-server/data/User");
});

test("listBookmarkDirs covers every profile, current profile first", async () => {
  const user = path.join(await tempDir(), "User");
  for (const p of ["profiles/-6a5b4c", "profiles/builtin/agents", "globalStorage"]) {
    await mkdir(path.join(user, p), { recursive: true });
  }
  const own = path.join(user, "profiles/builtin/agents/globalStorage", OWN);
  assert.deepEqual(await listBookmarkDirs(own), [
    claudeBookmarkDir(path.join(user, "profiles/builtin/agents/globalStorage")),
    claudeBookmarkDir(path.join(user, "globalStorage")),
    claudeBookmarkDir(path.join(user, "profiles/-6a5b4c/globalStorage")),
  ]);
});

test("listBookmarkDirs without profiles is just the current store", async () => {
  const user = path.join(await tempDir(), "User");
  const own = path.join(user, "globalStorage", OWN);
  assert.deepEqual(await listBookmarkDirs(own), [claudeBookmarkDir(path.join(user, "globalStorage"))]);
});

test("defaultProjectsDir honors CLAUDE_CONFIG_DIR", () => {
  assert.equal(defaultProjectsDir({}, "/home/u"), "/home/u/.claude/projects");
  assert.equal(defaultProjectsDir({ CLAUDE_CONFIG_DIR: "/cfg" }, "/home/u"), "/cfg/projects");
});

test("sameFolder folds case only where the file system does", () => {
  assert.ok(sameFolder("/home/u/Code/app", "/home/u/Code/app/", "linux"));
  assert.ok(!sameFolder("/home/u/Code/app", "/home/u/code/app", "linux"));
  assert.ok(sameFolder("/Users/u/Code/app", "/users/u/code/app", "darwin"));
  assert.ok(sameFolder("C:\\Code\\App", "c:\\code\\app\\", "win32"));
});

test("isSafeSessionId mirrors Claude's open-handler rule", () => {
  assert.ok(isSafeSessionId("0a1b2c3d-1111-4222-8333-444455556666"));
  for (const bad of ["", "a/b", "a\\b", "..", "a\0b", "x".repeat(201)]) assert.ok(!isSafeSessionId(bad), bad);
});
