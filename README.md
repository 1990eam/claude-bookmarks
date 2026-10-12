# Claude Bookmarks

A sidebar view of every Claude Code bookmark from **the project open in this window**, across all of its
sessions. Claude's own bookmark panel shows only the current session.

- Bookmarks are grouped by day. Hover one for a preview, click it to resume the session in the Claude panel.
  Use **Show Full Response** to see the whole response as a markdown preview, or **Copy Resume Command** for a
  terminal.
- The search button finds words in titles, branches and full response text. Pick a result to open its session.
- The calendar button picks the timeframe: today, yesterday, last 7 or 30 days, all time, a start date,
  or a range.
- The list updates as you bookmark. It is read-only: it never writes to Claude's storage or transcripts.

The scope is the window's first workspace folder, which is the same project Claude's session list uses.
For bookmarks across all projects, use the `claude-bookmarks` CLI or the `/bookmarks` skill.

## Setup

Needs VS Code 1.125+ with the Claude Code extension, and Node 22.18+ to build (`brew install node` on macOS).

```sh
git clone https://github.com/1990eam/claude-bookmarks && cd claude-bookmarks
npm install
npm run package        # runs the checks, then builds claude-bookmarks.vsix
npm run install-local  # code --install-extension
```

On macOS the `code` command isn't on the PATH by default: run **Shell Command: Install 'code' command in PATH**
from the Command Palette once, or skip `install-local` and use **Install from VSIX…** in the Extensions view's
`⋯` menu. The `.vsix` is platform-independent, so one built on Linux installs on a Mac as is.

## Development

```sh
npm run check   # type-check + unit tests (Node's test runner, on the TS sources)
node scripts/parity.ts --since all   # same text output as `claude-bookmarks`, for diffing
```

The extension reads Claude's undocumented bookmark files
(`<User>/globalStorage/anthropic.claude-code/session-bookmarks/`, in every profile) and transcripts
(`~/.claude/projects`). `<User>` is `~/.config/Code/User` on Linux and
`~/Library/Application Support/Code/User` on macOS. **Claude Bookmarks: Diagnostics** reports what it resolved.
