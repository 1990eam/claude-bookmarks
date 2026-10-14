# Claude Bookmarks

A sidebar view of every Claude Code bookmark from **the project open in this window**, across all of its
sessions. Claude's own bookmark panel shows only the current session.

- Bookmarks are grouped by day. Hover one for a preview, click it to resume the session in the Claude panel.
  The row's buttons show the full response as a markdown preview, open the session, rename the bookmark, or
  copy a resume command for a terminal.
- A bookmark is labeled with its session's title until you rename it (pencil button or F2). Then the session title
  moves next to the time. An empty name goes back to the session title.
- Claude opens a session at its end and offers no way to scroll to a message from outside. To reach the response,
  use **Show in conversation** in Claude's own Bookmarks panel.
- The search button finds words in names, titles, branches and full response text. Pick a result to open its
  session.
- The calendar button picks the timeframe: today, yesterday, last 7 or 30 days, all time, a start date,
  or a range.
- The list updates as you bookmark. It is read-only: it never writes to Claude's storage or transcripts. Names
  are kept by this extension, per machine and VS Code profile.

The scope is the window's first workspace folder, which is the same project Claude's session list uses.

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
```

The extension reads Claude's undocumented bookmark files
(`<User>/globalStorage/anthropic.claude-code/session-bookmarks/`, in every profile) and transcripts
(`~/.claude/projects`). `<User>` is `~/.config/Code/User` on Linux and
`~/Library/Application Support/Code/User` on macOS. **Claude Bookmarks: Diagnostics** reports what it resolved.
