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

## Development

```sh
npm install
npm run check          # type-check + unit tests (Node's test runner, on the TS sources)
npm run package        # builds claude-bookmarks.vsix
npm run install-local  # installs it into VS Code
node scripts/parity.ts --since all   # same text output as `claude-bookmarks`, for diffing
```

The extension reads Claude's undocumented bookmark files
(`<User>/globalStorage/anthropic.claude-code/session-bookmarks/`, in every profile) and transcripts
(`~/.claude/projects`). **Claude Bookmarks: Diagnostics** reports what it resolved.
