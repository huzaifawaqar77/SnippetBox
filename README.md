# SnippetBox

**Save the solutions you never want to search for twice.**

SnippetBox is a local-first developer knowledge base for Linux. It keeps the code, commands,
configurations and notes you find while working — so the next time you hit the same problem you
find the answer in seconds instead of re-searching the internet.

There is no account, no sync and no server. Everything lives on your machine and works offline.

---

## What it does

**Capture → organise → search → understand → copy.** Everything else supports that loop.

- **Three-pane workspace** — sidebar, snippet list, detail view. The sidebar collapses to icons.
- **Instant full-text search** across titles, descriptions, code, notes, tags, collections and
  source URLs, backed by SQLite FTS5 with ranked results (title beats code).
- **Search operators** — `tag:docker language:bash collection:backend is:favorite before:2026-01-01`
  combine with free text, and every operator appears as a removable chip.
- **Code viewer and editor** built on CodeMirror 6 — syntax highlighting for 30+ languages, line
  numbers, word wrap, code folding, bracket matching, multiple selections, find-in-code, font size
  control and an expandable code area. Light and dark palettes are designed separately.
- **Autosaving editor** with a `Saving… / Saved` indicator. A version snapshot of the *previous*
  content is captured the first time you change something (throttled, so history never floods).
- **Copy is first class** — `Ctrl+Shift+C` for code, plus Copy as Markdown and copy-everything.
  Copy counts feed "Most Used".
- **Tags and nested collections** — create, rename, recolour, merge; free-form, never mandatory.
- **Favorites, Recently Added/Updated/Viewed, Most Used, Trash** with restore and empty-trash.
- **Markdown notes** rendered safely (sanitised) alongside the code.
- **Backups** — one-click full archives (database + attachments) as ZIP, with optional daily or
  weekly automatic backups taken at startup. Restores write a safety backup first.
- **Import / export** — JSON, Markdown folders and ZIP archives, plus plain `.sh`/`.py`/`.ts` files.
- **Quick capture** (`Ctrl+Shift+N`, or a global `Ctrl+Alt+S` when enabled) and a **global search
  launcher** (`Ctrl+Alt+Space`).
- **Command palette** (`Ctrl+P`) with fuzzy matching.
- **Dragging a code file onto the window** pre-fills the editor; dropping several files or an
  archive opens the import preview.
- **Duplicate detection** that warns without ever blocking you.
- **Themes** — light, dark, or follow the system (updates live when the OS switches).
- **Zoom** — the interface starts at 18px and zooms from 12 to 30px. One number scales
  everything (text, spacing, panels, icons and the code editor stay in proportion), and the
  level is saved, so it survives restarts.

---

## Requirements

- Linux (developed and tested on Ubuntu)
- Node.js 22 or newer and npm 10+

## Getting started

```bash
npm install      # installs dependencies
npm run dev      # launches the app with hot reload
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Development mode with HMR |
| `npm run build` | Bundles main, preload and renderer into `out/` |
| `npm start` | Runs the last build (`electron .`) |
| `npm test` | Vitest unit and integration suites |
| `npm run test:e2e` | Playwright end-to-end suite (needs `npm run build` first) |
| `npm run typecheck` | Strict TypeScript check for both processes |
| `npm run dist` | Builds an AppImage and a `.deb` into `dist/` |
| `npm run icon` | Regenerates `build/icons/*` plus `build/icon-preview.png` |

### Branding assets

The app icon is generated from `Firefly.png` (project root) by `scripts/generate-icon.mjs`, which
has no image dependency. That artwork is a dark-ink technical sketch on white paper, so the script
removes the paper and redraws the ink as white line art on the app's indigo plate — as-is it would
be a glaring white tile in a dark dock. Each of the eight sizes (16–512px) is resampled straight
from the source with an area filter, and `build/icon-preview.png` is a legibility sheet showing
real sizes alongside magnified 16/32/64px for review.

A drawing this detailed inevitably loses definition below ~32px — that is inherent to using a
sketch as an icon. If that ever becomes a problem, replacing the mark is a one-file change.

The first-run illustration is `src/renderer/src/assets/firefly.png` (a downscaled copy of the same
artwork). It is dark ink on white, so it is composited rather than framed: `mix-blend-multiply` on
the light theme drops the paper away, and the dark theme inverts it and uses `mix-blend-screen`.
Either way there is no visible square against the panel.

### Code colours

The CodeMirror palette is not chosen by eye. Every syntax token is checked against the code
surface with WCAG relative-luminance contrast, and the values in `global.css` all clear the
4.5:1 AA floor — comments and brackets are deliberately near it so they stay quiet without
becoming unreadable. If you change a `--cm-*` token, measure it.

### Installing

```bash
npm run dist
sudo dpkg -i dist/snippetbox_1.0.0_amd64.deb   # installs to /opt, adds a desktop entry
```

Installing the `.deb` is the recommended route on Linux: its post-install step sets the correct
ownership and mode on Chromium's `chrome-sandbox`, so the app runs with its sandbox intact.

`dist/*.AppImage` also works and needs no installation, but an AppImage cannot set that permission
bit, so it needs `./SnippetBox-1.0.0.AppImage --no-sandbox` unless your system has user namespaces
enabled.

### Publishing to the Snap Store

Ubuntu's App Center (and Ubuntu Software before it) is a front end for the **Snap Store**, so
publishing a snap is how a third-party app appears in Ubuntu's store. A `.deb` cannot be submitted
to the Ubuntu archive without going through Debian/Ubuntu packaging and sponsorship, so the Snap
Store is the practical route.

```bash
npm run dist:snap        # -> dist/snippetbox_1.0.0_amd64.snap
```

This target is deliberately kept out of `npm run dist`: it downloads the Electron snap template,
and a normal build should not depend on it.

**Confinement is `classic`, on purpose.** Under the default `strict` confinement a snap can only
see its own private directories, so a library already sitting at `~/.local/share/snippetbox` would
be invisible and the app would look empty to anyone moving across from the `.deb` or AppImage.
Classic gives exactly the same behaviour and file layout as the `.deb`. The cost is that classic
snaps need manual review by the Snap Store team before the first release can go live.

**Base.** electron-builder builds this snap from its prebuilt template, which targets `core20`
(Ubuntu 20.04, past its standard support window). It works today and needs no extra tooling. For a
long-lived listing, the modern route is a native `snapcraft.yaml` against a current base — swap the
`snap:` block in `electron-builder.yml` for:

```yaml
snapcraft:
  core24:
    confinement: classic
```

That requires the snapcraft CLI (`sudo snap install snapcraft --classic`) plus LXD, a VM, or
`--destructive-mode` to build.

**Publishing** needs a free Ubuntu One / Snapcraft account — that part is yours to do:

```bash
snapcraft login                                    # opens a browser
snapcraft register snippetbox                      # claim the name, once
snapcraft upload --release=stable dist/snippetbox_1.0.0_amd64.snap
```

- Check that `snippetbox` is still unclaimed before relying on the name.
- Only `amd64` is built here; add `arm64` with `snapcraft --remote-build` or a build on that
  architecture.

### Two environment quirks worth knowing

1. **Install scripts.** This machine's npm ships an install-script approval guard. Approve the
   packages that need to build or download binaries once:

   ```bash
   npm install-scripts approve --all
   npm install --include=dev
   node node_modules/electron/install.js   # downloads the Electron binary
   ```

2. **`NODE_ENV=production` in the shell** makes npm skip devDependencies. Use
   `npm install --include=dev` if `vite`, `electron` or `vitest` go missing.

`better-sqlite3` v13 is built with Node-API and ships per-platform prebuilds, so the same binary
loads in Node (for tests) and Electron (for the app). Nothing needs rebuilding — `scripts/ensure-native.mjs`
simply verifies that before starting.

### Running without a sandbox

Chromium's SUID sandbox helper must be root-owned with mode `4755`. Packaged builds get that
automatically. When running from a checkout on a machine where it is not configured:

```bash
node node_modules/electron/cli.js --no-sandbox .
```

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New snippet |
| `Ctrl+Shift+N` | Quick capture window |
| `Ctrl+K` | Search snippets |
| `Ctrl+P` | Command palette |
| `Ctrl+F` | Focus search |
| `Ctrl+S` | Save now (edits also autosave) |
| `Ctrl+E` | Edit selected snippet |
| `Ctrl+Shift+F` | Toggle favorite |
| `Ctrl+Shift+C` | Copy code |
| `Ctrl+Shift+M` | Copy as Markdown |
| `Ctrl+D` | Duplicate snippet |
| `Delete` | Move to Trash |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+=` / `Ctrl++` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+0` | Reset zoom to 100% |
| `Ctrl+Shift+L` | Cycle light / dark / system |
| `Ctrl+Shift+I` / `Ctrl+Shift+E` | Import / export |
| `Ctrl+,` | Settings |
| `Ctrl+/` | Keyboard shortcuts |
| `Ctrl+1` / `Ctrl+2` | Focus search / detail |
| `Esc` | Close dialog or cancel editing |

Commands that must work while the code editor has focus are bound in the native application menu,
so they behave identically everywhere.

---

## Interface size and zoom

The interface defaults to **18px** and can be zoomed from **12px to 30px** (≈67%–167%).

Zoom is a single stored number — the interface font size — and it works because the whole design
system is expressed in `rem`: Tailwind's spacing scale already was, and the type scale was moved to
`rem` alongside it. So one value scales text, gaps, control sizes, icon sizes, panel widths and the
code font together, and nothing drifts out of proportion.

Change it from any of these:

- the **zoom control** in the sidebar footer (`−` / percentage / `+`; click the percentage to reset)
- **Settings → Appearance → Zoom**
- `Ctrl+=`, `Ctrl+-`, `Ctrl+0`
- **View → Zoom In / Zoom Out / Reset Zoom**

The panel widths you drag are stored at 100% and multiplied by the zoom ratio, so your layout is
preserved at every level. `Settings → Editor → Code font size` is likewise expressed at 100% zoom
and scales with it. Because the value lives in `settings.json`, zoom survives restarts like any
other setting.

---

## Search operators

```
docker network                  free text (both terms must match, prefix-matched)
"port in use"                   exact phrase
tag:docker                      tag name (prefix match)
language:python                 language id, label or alias
collection:backend              collection name (prefix match)
is:favorite  is:recent          flags
after:2026-01-01                created on or after
before:2026-01-01               created before
```

Results are ranked with bm25 weights in this order: **title → tags → description → code → notes**,
with a small boost for favorites.

---

## Where your data lives

```
~/.local/share/snippetbox/          # data (movable from Settings)
├── database.sqlite
├── attachments/
├── backups/
└── exports/

~/.config/snippetbox/               # configuration
├── settings.json
├── session.json                    # window geometry and last location
└── logs/
```

Settings are kept **outside** the data folder on purpose: you can move your library to another
disk without losing the pointer to it.

## Import and export formats

- **JSON** — a single file with every field, including notes, source and usage counters.
- **ZIP** — `snippets/*.md`, `metadata.json`, `index.md` and optionally `attachments/`.
- **Markdown folder** — one `.md` per snippet plus `metadata.json` and an index.
- **Import** also accepts loose code files (`.sh`, `.py`, `.ts`, `.yaml`, …) and folders of them.

Markdown exports round-trip: `snippetToMarkdown` → `parseMarkdownSnippet` reproduces the snippet,
including notes that contain their own `##` headings.

---

## Architecture

```
src/
├── main/                 # Electron main process — owns everything privileged
│   ├── db/               # SQLite connection, migrations, repositories, seed data
│   ├── ipc/              # every renderer call: validated, error-wrapped, change-broadcast
│   ├── services/         # settings, backups, ZIP, import/export, attachments, storage
│   ├── windows.ts        # window management and security hardening
│   ├── menu.ts           # native application menu (the shortcut source of truth)
│   └── tray.ts, shortcuts.ts
├── preload/              # the only bridge: an explicit, typed API
├── renderer/             # React UI (no Node.js access whatsoever)
│   └── src/
│       ├── components/   # UI primitives, layout, CodeMirror and Markdown surfaces
│       ├── features/     # snippets, search, settings, transfer, capture, launcher, onboarding
│       ├── stores/       # Zustand stores: library, settings, ui, toasts
│       ├── hooks/        # commands, virtual list, appearance, clipboard
│       └── styles/       # design tokens and the CodeMirror theme
└── shared/               # types, Zod schemas, IPC contract, search parser, language catalogue
```

Business logic lives in `src/main` and `src/shared`; React components only render state and call
the API. That is what makes the database, search, import/export and backup layers testable without
a browser or an Electron instance.

### Security model

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- The renderer can only reach the explicit list of methods in the preload bridge.
- Every IPC request is validated with Zod before it touches the database, and rejected unless it
  comes from a window this process created.
- A strict Content-Security-Policy is applied to every response; nothing remote is ever loaded.
- Markdown notes are sanitised with `rehype-sanitize`, so a note cannot inject script.
- Links open in your default browser; the app never navigates away from its own bundle.
- **Stored code is never executed.** There is no "Run" button, no shell execution, and imported
  files are only ever read. A snippet containing `rm -rf /` is characters on a screen.

### Database

SQLite with **WAL** journaling and foreign keys enabled. Schema changes are applied through the
migration runner in `src/main/db/migrations/` — never by editing the schema in place:

| Migration | Contents |
| --- | --- |
| `001_initial_schema` | snippets, tags, snippet_tags |
| `002_add_collections` | collections, `snippets.collection_id` |
| `003_add_versions` | snippet_versions |
| `004_add_attachments` | attachments |
| `005_add_relations_and_search` | snippet_related, materialised preview/search columns |
| `006_full_text_search` | FTS5 index and the triggers that keep it in sync |

The full-text index is an **external-content** FTS5 table: the indexed text is not duplicated on
disk, and triggers keep it consistent for every write path — including import and backup restore.
`code_preview` and `line_count` are materialised so listing thousands of snippets never loads a
single code blob into the renderer.

---

## Testing

```bash
npm test          # 84 unit + integration tests (Vitest)
npm run typecheck # strict TypeScript, both processes
npm run build     # production bundle
npm run test:e2e  # Playwright: create → search → copy → favorite → edit → trash → restore,
                  # plus backup, export, settings layout, zoom and menu wiring (12 tests)
```

The suites cover migrations, CRUD, the trash lifecycle, tag/collection behaviour, version history,
duplicate detection, search parsing and ranking, the ZIP writer/reader (including the streaming
path for large entries), import/export round-trips, language detection and the settings store.

The end-to-end suite drives the real packaged app and asserts the library's own reported size at
each step, so a regression that silently dropped data would fail the run. It runs with the sandbox
enabled by default; pass `SNIPPETBOX_E2E_ARGS=--no-sandbox` on machines where Chromium's sandbox
helper is not configured, and `SNIPPETBOX_E2E_KEEP=1` to keep the test data directory for
inspection.

---

## Deliberately not implemented

Nothing in this app is a mocked-up button. Features that exist work; these do not exist yet:

- **Cloud sync, accounts, telemetry endpoints** — intentionally absent.
- **AI features** (describe, tag, explain, semantic search) — future work, and optional by design.
- **Browser and VS Code extensions, GitHub Gist import** — future work.
- **A full side-by-side version diff** — version history previews an old revision and restores it,
  but does not render a line diff.
- **Clipboard monitoring** — the clipboard is read only when you explicitly ask (Paste, or the
  opt-in quick-capture prefill). SnippetBox never watches it in the background.
- **Start on login and global shortcuts** depend on your desktop environment; if the OS refuses,
  the app reports it and carries on.

## License

MIT.
