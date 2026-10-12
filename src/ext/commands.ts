import * as vscode from "vscode";
import {
  contextSnippet, countLabel, groupByDay, matchesTerms, resumeCommand, responseMarkdown, searchTerms, shortId,
} from "../core/format.ts";
import type { Entry } from "../core/model.ts";
import { CLAUDE_EXTENSION_ID, isSafeSessionId } from "../core/paths.ts";
import { dayLabel, parseTimeRange, timeLabel } from "../core/range.ts";
import { PRESETS, rangeLabel, type BookmarkModel } from "./model.ts";
import type { ItemNode } from "./tree.ts";

const CLAUDE_OPEN_COMMAND = "claude-vscode.primaryEditor.open";
const RESPONSE_SCHEME = "claude-bookmark";
const COPY = "Copy Resume Command";

async function copyResume(entry: Entry): Promise<void> {
  await vscode.env.clipboard.writeText(resumeCommand(entry));
  vscode.window.setStatusBarMessage("$(check) Resume command copied", 2500);
}

async function offerCopy(message: string, entry: Entry): Promise<void> {
  if (await vscode.window.showErrorMessage(message, COPY) === COPY) await copyResume(entry);
}

/** Resumes a bookmarked session in this window's Claude panel. */
export class SessionOpener implements vscode.Disposable {
  #pending: Entry | undefined;
  readonly #trust: vscode.Disposable;

  constructor() {
    this.#trust = vscode.workspace.onDidGrantWorkspaceTrust(() => {
      const entry = this.#pending;
      this.#pending = undefined;
      if (entry) void this.open(entry);
    });
  }

  async open(entry: Entry): Promise<void> {
    const id = entry.bookmark.sessionId;
    if (entry.problem === "transcript not found") {
      await offerCopy("This session's transcript no longer exists, so Claude can't resume it.", entry);
      return;
    }
    if (!isSafeSessionId(id)) {
      await offerCopy(`Not a valid session id: ${id}`, entry);
      return;
    }
    if (!vscode.workspace.isTrusted) {
      this.#pending = entry; // opened once trust is granted
      const manage = "Manage Workspace Trust";
      if (await vscode.window.showWarningMessage("Claude Code only runs in a trusted workspace.", manage) === manage) {
        await vscode.commands.executeCommand("workbench.trust.manage");
      }
      return;
    }
    if (!vscode.extensions.getExtension(CLAUDE_EXTENSION_ID)) {
      await offerCopy("Claude Code for VS Code isn't installed or is disabled.", entry);
      return;
    }
    try {
      await vscode.commands.executeCommand(CLAUDE_OPEN_COMMAND, id);
    } catch (e) {
      await offerCopy(`Claude couldn't open the session: ${(e as Error).message}`, entry);
    }
  }

  dispose(): void {
    this.#trust.dispose();
  }
}

/** Serves `claude-bookmark:/<sessionId>/<uuid>/<title>.md` as the bookmarked response's markdown. */
class ResponseDocuments implements vscode.TextDocumentContentProvider {
  readonly #model: BookmarkModel;

  constructor(model: BookmarkModel) {
    this.#model = model;
  }

  static uri(entry: Entry): vscode.Uri {
    const name = (entry.title ?? "response").replace(/[\\/:*?"<>|#%]+/g, " ").trim().slice(0, 60) || "response";
    return vscode.Uri.from({ scheme: RESPONSE_SCHEME, path: `/${entry.bookmark.sessionId}/${entry.bookmark.uuid}/${name}.md` });
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const [, sessionId = "", uuid = ""] = uri.path.split("/");
    const entry = this.#model.find(sessionId, uuid);
    return entry ? responseMarkdown(entry) : "_This bookmark is not in the current list. Refresh and try again._\n";
  }
}

async function showResponse(entry: Entry): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(ResponseDocuments.uri(entry));
  await vscode.commands.executeCommand("markdown.showPreview", doc.uri);
}

interface ResultItem extends vscode.QuickPickItem {
  entry: Entry;
}

/** Searches titles, branches and full response text; picking a result opens its session. */
async function searchBookmarks(model: BookmarkModel, opener: SessionOpener): Promise<void> {
  await model.refresh();
  if (model.state !== "ready" || !model.entries.length) {
    void vscode.window.showInformationMessage("No bookmarks to search in this project and timeframe.");
    return;
  }
  const preview = { iconPath: new vscode.ThemeIcon("open-preview"), tooltip: "Show Full Response" };
  const newestFirst = groupByDay(model.entries).flatMap((g) => g.entries);
  const results = (query: string): ResultItem[] => {
    const terms = searchTerms(query);
    return newestFirst.filter((e) => matchesTerms(e, terms)).map((entry) => ({
      entry, alwaysShow: true, // already filtered on the full text, which VS Code's matcher never sees
      label: entry.title ?? shortId(entry),
      description: [dayLabel(entry.bookmark.addedAt), timeLabel(entry.bookmark.addedAt), entry.branch]
        .filter(Boolean).join(" · "),
      detail: entry.problem ? `(${entry.problem})` : contextSnippet(entry.text ?? "", terms),
      ...(entry.text && !entry.problem && { buttons: [preview] }),
    }));
  };

  const pick = vscode.window.createQuickPick<ResultItem>();
  pick.title = `Search Bookmarks · ${rangeLabel(model.spec)} · ${countLabel(model.entries.length)}`;
  pick.placeholder = "Words to find in titles, branches and response text";
  pick.matchOnDescription = false;
  pick.matchOnDetail = false;
  pick.items = results("");
  pick.onDidChangeValue((value) => (pick.items = results(value)));
  pick.onDidTriggerItemButton((e) => void showResponse(e.item.entry));
  pick.onDidAccept(() => {
    const chosen = pick.selectedItems[0];
    pick.hide();
    if (chosen) void opener.open(chosen.entry);
  });
  pick.onDidHide(() => pick.dispose());
  pick.show();
}

async function pickTimeframe(model: BookmarkModel): Promise<void> {
  const current = model.spec;
  const custom = { label: "Custom…", spec: "", description: "a date (since that day) or a range" };
  const items = [...PRESETS.map((p) => ({ label: p.label, spec: p.spec as string,
    description: p.spec === current ? "current" : undefined })), custom];
  const pick = await vscode.window.showQuickPick(items, { title: "Claude Bookmarks: Timeframe" });
  if (!pick) return;
  let spec = pick.spec;
  if (pick === custom) {
    const isPreset = PRESETS.some((p) => p.spec === current);
    const input = await vscode.window.showInputBox({
      title: "Claude Bookmarks: Custom Timeframe",
      prompt: "YYYY-MM-DD shows bookmarks since that day; YYYY-MM-DD..YYYY-MM-DD shows that range. Nd = last N days.",
      value: isPreset ? "" : current,
      validateInput: (v) => {
        try {
          parseTimeRange(v.trim());
          return undefined;
        } catch (e) {
          return (e as Error).message;
        }
      },
    });
    if (input === undefined) return;
    spec = input.trim();
  }
  await model.setSpec(spec);
}

export function registerCommands(model: BookmarkModel): vscode.Disposable {
  const opener = new SessionOpener();
  return vscode.Disposable.from(
    opener,
    vscode.workspace.registerTextDocumentContentProvider(RESPONSE_SCHEME, new ResponseDocuments(model)),
    vscode.commands.registerCommand("claudeBookmarks.refresh", () => model.refresh()),
    vscode.commands.registerCommand("claudeBookmarks.pickTimeframe", () => pickTimeframe(model)),
    vscode.commands.registerCommand("claudeBookmarks.openSession", (node: ItemNode) => opener.open(node.entry)),
    vscode.commands.registerCommand("claudeBookmarks.copyResume", (node: ItemNode) => copyResume(node.entry)),
    vscode.commands.registerCommand("claudeBookmarks.showResponse", (node: ItemNode) => showResponse(node.entry)),
    vscode.commands.registerCommand("claudeBookmarks.search", () => searchBookmarks(model, opener)),
  );
}
