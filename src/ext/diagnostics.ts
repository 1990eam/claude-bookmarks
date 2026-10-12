import { readdir, realpath } from "node:fs/promises";
import * as vscode from "vscode";
import { CLAUDE_EXTENSION_ID, listBookmarkDirs } from "../core/paths.ts";

async function describeDir(dir: string): Promise<string> {
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    return `${dir} (${files.length} files)`;
  } catch {
    return `${dir} (missing)`;
  }
}

/** Writes what the extension resolved about this window to `channel` and shows it. */
export async function showDiagnostics(context: vscode.ExtensionContext, channel: vscode.OutputChannel,
  extra: () => string[] = () => []): Promise<void> {
  const own = context.globalStorageUri.fsPath;
  const folder = vscode.workspace.workspaceFolders?.[0];
  const folderReal = folder && await realpath(folder.uri.fsPath).catch(() => "(unresolvable)");
  const claude = vscode.extensions.getExtension(CLAUDE_EXTENSION_ID);
  const lines = [
    `globalStorageUri: ${own}`,
    "bookmark dirs:",
    ...(await Promise.all((await listBookmarkDirs(own)).map(describeDir))).map((d) => `  ${d}`),
    `scope folder: ${folder ? `${folder.uri.fsPath} -> ${folderReal}` : "(none)"}`,
    `workspace trusted: ${vscode.workspace.isTrusted}`,
    `remote: ${vscode.env.remoteName ?? "(local)"}`,
    `claude extension: ${claude ? `${claude.packageJSON.version}, active=${claude.isActive}` : "(not installed)"}`,
    ...extra(),
  ];
  channel.appendLine(`--- Diagnostics ${new Date().toLocaleString()}`);
  for (const line of lines) channel.appendLine(line);
  channel.show(true);
}
