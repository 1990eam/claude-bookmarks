import * as vscode from "vscode";
import { countLabel, displayName, groupByDay, itemDescription, tooltipMarkdown, type DayGroup } from "../core/format.ts";
import type { Entry } from "../core/model.ts";
import type { BookmarkModel } from "./model.ts";

export type DayNode = { kind: "day"; group: DayGroup };
export type ItemNode = { kind: "item"; entry: Entry };
export type Node = DayNode | ItemNode;

export class BookmarksTree implements vscode.TreeDataProvider<Node> {
  readonly onDidChangeTreeData: vscode.Event<void>;
  readonly #model: BookmarkModel;

  constructor(model: BookmarkModel) {
    this.#model = model;
    this.onDidChangeTreeData = model.onDidChange;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      return this.#model.state === "ready" ? groupByDay(this.#model.entries).map((group) => ({ kind: "day", group })) : [];
    }
    return node.kind === "day" ? node.group.entries.map((entry) => ({ kind: "item", entry })) : [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "day") {
      const item = new vscode.TreeItem(node.group.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `day:${node.group.key}`;
      item.description = countLabel(node.group.entries.length);
      return item;
    }
    const { entry } = node;
    const item = new vscode.TreeItem(displayName(entry), vscode.TreeItemCollapsibleState.None);
    item.id = `bm:${entry.bookmark.sessionId}:${entry.bookmark.uuid}`;
    item.description = itemDescription(entry);
    item.iconPath = new vscode.ThemeIcon(entry.problem ? "warning" : "bookmark");
    item.contextValue = entry.text && !entry.problem ? "bookmark hasText" : "bookmark";
    item.command = { command: "claudeBookmarks.openSession", title: "Open Session", arguments: [node] };
    return item;
  }

  resolveTreeItem(item: vscode.TreeItem, node: Node): vscode.TreeItem {
    if (node.kind === "item") item.tooltip = new vscode.MarkdownString(tooltipMarkdown(node.entry));
    return item;
  }
}
