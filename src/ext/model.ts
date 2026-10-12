import { realpath } from "node:fs/promises";
import os from "node:os";
import * as vscode from "vscode";
import type { Entry } from "../core/model.ts";
import { defaultProjectsDir } from "../core/paths.ts";
import { describeRange, msUntilNextMidnight, parseTimeRange } from "../core/range.ts";
import { loadEntries } from "../core/resolve.ts";
import { TranscriptCache } from "../core/transcript.ts";

export const PRESETS = [
  { spec: "today", label: "Today" },
  { spec: "yesterday", label: "Yesterday" },
  { spec: "week", label: "Last 7 days" },
  { spec: "month", label: "Last 30 days" },
  { spec: "all", label: "All time" },
] as const;

const SPEC_KEY = "timeframe";
const DEFAULT_SPEC = "week";
const DEBOUNCE_MS = 300;

export type ModelState = "loading" | "noFolder" | "noStore" | "ready";

export function rangeLabel(spec: string): string {
  const preset = PRESETS.find((p) => p.spec === spec);
  if (preset) return preset.label;
  const text = describeRange(parseTimeRange(spec));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The scoped bookmark list for this window: the sessions run in its first workspace folder. */
export class BookmarkModel implements vscode.Disposable {
  readonly #changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.#changed.event;
  readonly cache = new TranscriptCache();
  state: ModelState = "loading";
  entries: Entry[] = [];
  scope: string | undefined;

  readonly #context: vscode.ExtensionContext;
  readonly #dirs: readonly string[];
  readonly #log: (line: string) => void;
  #running: Promise<void> | undefined;
  #again = false;
  #visible = false;
  #dirty = true;
  #debounce: ReturnType<typeof setTimeout> | undefined;
  #midnight: ReturnType<typeof setTimeout> | undefined;
  #warned = new Set<string>();

  constructor(context: vscode.ExtensionContext, dirs: readonly string[], log: (line: string) => void) {
    this.#context = context;
    this.#dirs = dirs;
    this.#log = log;
    this.#scheduleMidnight();
  }

  get spec(): string {
    const stored = this.#context.globalState.get<string>(SPEC_KEY, DEFAULT_SPEC);
    try {
      parseTimeRange(stored);
      return stored;
    } catch {
      return DEFAULT_SPEC;
    }
  }

  async setSpec(spec: string): Promise<void> {
    parseTimeRange(spec); // throws on invalid input before anything is stored
    await this.#context.globalState.update(SPEC_KEY, spec);
    await this.refresh();
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    if (visible && this.#dirty) void this.refresh();
  }

  /** Coalesces bursts (Claude writes via temp file + rename) and defers work while the view is hidden. */
  scheduleRefresh(): void {
    if (!this.#visible) {
      this.#dirty = true;
      return;
    }
    clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => void this.refresh(), DEBOUNCE_MS);
  }

  /** Reloads now; a call during a load makes that load run once more instead of overlapping it. */
  refresh(): Promise<void> {
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#running = (async () => {
      do {
        this.#again = false;
        await this.#load();
      } while (this.#again);
    })().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  find(sessionId: string, uuid: string): Entry | undefined {
    return this.entries.find((e) => e.bookmark.sessionId === sessionId && e.bookmark.uuid === uuid);
  }

  async #load(): Promise<void> {
    this.#dirty = false;
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      this.#set("noFolder", [], undefined);
      return;
    }
    const scope = await realpath(folder.uri.fsPath).catch(() => folder.uri.fsPath);
    try {
      const result = await loadEntries({
        dirs: this.#dirs, defaultProjectsDir: defaultProjectsDir(process.env, os.homedir()),
        range: parseTimeRange(this.spec), cache: this.cache, scope,
      });
      for (const w of result.warnings) {
        if (!this.#warned.has(w)) this.#log(`warning: ${w}`);
        this.#warned.add(w);
      }
      this.#set(result.missingDirs.length === this.#dirs.length ? "noStore" : "ready", result.entries, scope);
    } catch (e) {
      this.#log(`error: loading bookmarks failed: ${(e as Error).stack ?? e}`);
      this.#set("ready", [], scope);
    }
  }

  #set(state: ModelState, entries: Entry[], scope: string | undefined): void {
    this.state = state;
    this.entries = entries;
    this.scope = scope;
    this.#changed.fire();
  }

  #scheduleMidnight(): void {
    this.#midnight = setTimeout(() => {
      this.scheduleRefresh();
      this.#scheduleMidnight();
    }, msUntilNextMidnight() + 1000);
  }

  dispose(): void {
    clearTimeout(this.#debounce);
    clearTimeout(this.#midnight);
    this.#changed.dispose();
  }
}
