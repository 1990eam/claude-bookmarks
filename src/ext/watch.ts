import * as vscode from "vscode";

/** Calls `onChange` for any bookmark-file change in `dirs`, including dirs created later. */
export function watchDirs(dirs: readonly string[], onChange: () => void): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];
  for (const dir of dirs) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(dir), "*.json"));
    disposables.push(watcher, watcher.onDidCreate(onChange), watcher.onDidChange(onChange), watcher.onDidDelete(onChange));
  }
  return vscode.Disposable.from(...disposables);
}
