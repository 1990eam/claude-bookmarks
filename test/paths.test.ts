import { tempDir } from "./helpers.ts";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  claudeBookmarkDir, defaultProjectsDir, isSafeSessionId, listBookmarkDirs, profileBookmarkDirs, sameFolder, userDirOf,
  vscodeUserDirs,
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

test("profileBookmarkDirs lists the default profile first", async () => {
  const user = path.join(await tempDir(), "User");
  await mkdir(path.join(user, "profiles/builtin/agents"), { recursive: true });
  assert.deepEqual(await profileBookmarkDirs(user), [
    claudeBookmarkDir(path.join(user, "globalStorage")),
    claudeBookmarkDir(path.join(user, "profiles/builtin/agents/globalStorage")),
  ]);
  assert.deepEqual(await profileBookmarkDirs(path.join(user, "missing")),
    [claudeBookmarkDir(path.join(user, "missing/globalStorage"))]);
});

test("vscodeUserDirs uses each platform's config location", () => {
  assert.equal(vscodeUserDirs("linux", {}, "/home/u")[0], "/home/u/.config/Code/User");
  assert.deepEqual(vscodeUserDirs("linux", { XDG_CONFIG_HOME: "/xdg" }, "/home/u"),
    ["/xdg/Code/User", "/xdg/Code - Insiders/User", "/xdg/VSCodium/User", "/xdg/Cursor/User"]);
  assert.equal(vscodeUserDirs("darwin", {}, "/Users/u")[0], "/Users/u/Library/Application Support/Code/User");
  assert.equal(vscodeUserDirs("win32", { APPDATA: "D:\\Roaming" }, "C:\\Users\\u")[0], "D:\\Roaming\\Code\\User");
  assert.equal(vscodeUserDirs("win32", {}, "C:\\Users\\u")[0], "C:\\Users\\u\\AppData\\Roaming\\Code\\User");
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
