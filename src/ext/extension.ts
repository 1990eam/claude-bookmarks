import * as vscode from "vscode";
import { countLabel } from "../core/format.ts";
import { listBookmarkDirs } from "../core/paths.ts";
import { registerCommands } from "./commands.ts";
import { showDiagnostics } from "./diagnostics.ts";
import { BookmarkModel, rangeLabel } from "./model.ts";
import { BookmarksTree } from "./tree.ts";
import { watchDirs } from "./watch.ts";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const channel = vscode.window.createOutputChannel("Claude Bookmarks");
  const log = (line: string) => channel.appendLine(`[${new Date().toLocaleTimeString()}] ${line}`);
  const dirs = await listBookmarkDirs(context.globalStorageUri.fsPath);
  const model = new BookmarkModel(context, dirs, log);
  const view = vscode.window.createTreeView("claudeBookmarks.list", { treeDataProvider: new BookmarksTree(model) });

  model.onDidChange(() => {
    view.description = model.state === "ready" ? `${rangeLabel(model.spec)} · ${countLabel(model.entries.length)}` : undefined;
    const state = model.state === "ready" && model.entries.length === 0 ? "empty" : model.state;
    void vscode.commands.executeCommand("setContext", "claudeBookmarks.state", state);
  });

  context.subscriptions.push(
    channel, model, view,
    view.onDidChangeVisibility((e) => model.setVisible(e.visible)),
    watchDirs(dirs, () => model.scheduleRefresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => model.scheduleRefresh()),
    registerCommands(model, view),
    vscode.commands.registerCommand("claudeBookmarks.diagnostics", () => showDiagnostics(context, channel, () => [
      `timeframe: ${model.spec} (${rangeLabel(model.spec)})`,
      `state: ${model.state}, entries: ${model.entries.length}, scope: ${model.scope ?? "(none)"}`,
      `transcript cache: ${model.cache.stats.hits} hits, ${model.cache.stats.scans} scans`,
    ])),
  );
  model.setVisible(view.visible);
}

export function deactivate(): void {}
