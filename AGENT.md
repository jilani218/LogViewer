# AGENT.md

Guidance for AI coding agents (Claude Code, etc.) working in this repo.

## What this is

A standalone Android `logcat` viewer that mimics Android Studio's Logcat panel.
Two pieces:

| File             | Role                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| `logcat.html`    | Self-contained UI. Parses log files, filters, renders, streams.      |
| `adb-bridge.js`  | Optional Node server that exposes `adb` over HTTP/SSE for live mode. |
| `start.sh`       | macOS/Linux launcher: starts the bridge and opens the browser.       |
| `start.cmd`      | Windows launcher: same behaviour from cmd.exe / PowerShell.          |
| `README.md`      | User-facing docs. Rendered by the in-app `📘 Docs` button.           |
| `AGENT.md`       | This file — guidance for AI agents editing the repo.                 |

The HTML works fully offline as a static file viewer. The bridge unlocks
live device streaming.

## Run it

```bash
./start.sh                # macOS/Linux — bridge on :8037, opens http://localhost:8037/
node adb-bridge.js        # bridge only (any OS)
# or just open logcat.html directly for file-only mode
```

```bat
start.cmd                 :: Windows — same as start.sh
start.cmd --port 9000     :: custom port
set ADB=C:\platform-tools\adb.exe && start.cmd
```

Bridge needs Node 18+ and `adb` on PATH (or `ADB=/path/to/adb` on Unix,
`set ADB=C:\path\to\adb.exe` on Windows). If `adb` is missing, both
launchers auto-download Google's official platform-tools zip into
`./platform-tools/` and point `ADB` at it — no admin / package manager
needed. Unix needs `curl` (or `wget`) + `unzip`; Windows uses PowerShell
built-ins. Resolution order inside the launchers is:
`$ADB` → `./platform-tools/adb` → system PATH → auto-install.

## Hard constraints — preserve these

- **Zero runtime dependencies.** No `npm install`, no CDN scripts, no build step.
  `adb-bridge.js` uses only Node built-ins (`http`, `fs`, `child_process`).
  `logcat.html` is plain HTML/CSS/JS — no frameworks, no bundler.
- **Single-file HTML.** Do not split `logcat.html` into separate JS/CSS files.
  The whole point is "drop one file in a browser." If you must add structure,
  keep it inline.
- **Same-origin friendly.** The bridge serves `logcat.html` at `/` so users
  hitting `http://localhost:8037/` avoid `file://` → `localhost` CORS quirks.
  Any new endpoint must keep CORS headers permissive (see `setCors`).
- **Streaming = SSE, not WebSockets.** SSE works without a dependency; WS
  would require either a library or hand-rolled framing. Don't switch.

## Architecture notes

### `logcat.html`

- **Parser** (`parseLine`) auto-detects multiple `adb logcat -v` formats:
  `threadtime`, `time`, `brief`, `tag`, ISO-timestamp threadtime, raw.
  Stack-trace continuation lines (indented, unparseable) are appended to the
  prior entry's `msg`.
- **Entries** carry a unique `id`. The DOM uses `data-id`, and `entryById` maps
  id → entry. This is what lets streaming trim old entries (`MAX_ENTRIES`)
  without breaking row → entry lookups. Don't go back to array-index-based
  row addressing.
- **Filtering** — `tokenizeQuery` parses Android-Studio-style tokens
  (`tag:`, `package:`, `pid:`, `level:`, `min:`, `msg:`, `~:` for regex,
  `-` to negate, `"phrase"`, `/regex/`). `buildMatcher` returns a predicate;
  the cached `currentMatcher` is reused by streaming to avoid re-tokenising
  per line.
- **Rendering** — full re-render on filter change; incremental
  `insertAdjacentHTML` append for streamed lines, batched every ~80 ms
  via `flushPending`. DOM is capped at `MAX_RENDER` (oldest rows trimmed).
- **Bridge detection** — `detectBridge()` pings `/health` on load (and every
  5 s while idle) so plugged-in devices appear automatically.
- **Docs viewer** — the toolbar `📘 Docs` button fetches `/readme.md` from
  the bridge and renders `README.md` in a modal via a small inline markdown
  renderer (headings / fenced code / inline code / lists / tables / bold /
  links). A `Raw` toggle switches to the unrendered source. Falls back to a
  helpful message when the page is opened from `file://` (bridge not
  running). Keep `README.md` user-facing; this file (`AGENT.md`) stays for
  agents only and is deliberately not surfaced in the UI.

### `adb-bridge.js`

- One file. Endpoints: `/`, `/health`, `/devices`, `/stream` (SSE), `/clear`, `/readme.md`.
- `/stream` spawns `adb [-s serial] logcat -v <format> -b <buffer>`. stdout is
  line-split and emitted as SSE `data:` events; embedded newlines are
  escaped as `\n` (the page un-escapes them). 15 s heartbeat keeps the
  connection alive. Child process is killed on `req.close`.
- Listens on `127.0.0.1` only — never expose this externally; it shells out
  to `adb` and trusts query params to flow into args (the args are a fixed
  shape, but treat any change here as security-sensitive).

## Conventions

- No emojis in code unless the user asked. The existing toolbar buttons use
  a few emoji glyphs as icons; don't add more.
- No comments that just narrate what the code does. Existing comments mark
  *why* (e.g., "First-render: switch out of empty state").
- Don't add type annotations / TS / JSDoc-as-types; this is plain JS by choice.
- Don't introduce a build step, package manager lockfile, or framework.

## Common changes & where they live

| Want to…                              | Edit                                                       |
| ------------------------------------- | ---------------------------------------------------------- |
| Support a new logcat format           | `RE` table + `parseLine` in `logcat.html`                  |
| Add a query token (e.g. `uid:`)       | `buildMatcher` switch in `logcat.html`                     |
| Add a column                          | `<colgroup>`, `<thead>`, `rowHtml`, the `body.show-*` CSS  |
| Expose another adb command            | New endpoint in `adb-bridge.js` + button wiring in HTML    |
| Edit user-facing docs (what Docs shows)| `README.md` — served at `/readme.md`, rendered in-app     |
| Tweak how README.md renders in the UI | `renderMd` inside the `#btnDocs` IIFE in `logcat.html`     |
| Change streaming buffer/format        | `bufferSel` / `startStream` in HTML; `/stream` args server |
| Tune memory / DOM caps                | `MAX_ENTRIES`, `MAX_RENDER` in `logcat.html`               |

## Don't

- Don't bundle the HTML's JS into a separate file or convert to a module.
- Don't add `package.json` dependencies. `package.json` itself is fine if
  someone needs `npm start`, but only with `scripts`, no `dependencies`.
- Don't pull in `ws`, `express`, `chokidar`, etc. on the bridge side.
- Don't bind the bridge to `0.0.0.0`.
- Don't replace the SSE stream with polling.
