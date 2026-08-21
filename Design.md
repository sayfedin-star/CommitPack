# CommitPack — Task-First Architecture & Design Specification

CommitPack is a lightweight, high-performance React 18 + TypeScript + Vite Single Page Application (SPA) designed to solve three distinct developer tasks without visual or conceptual clutter:

1. **Review Commit**: Review changes in a commit or compare range, inspect diffs, and build structured AI review bundles with acceptance criteria.
2. **Browse Repository**: Explore repository source trees at branch HEAD, inspect code, and copy single files with one click.
3. **Build Context Pack**: Select multiple source files from branch HEAD with real-time LLM token budget tracking (20% reservation safeguard) and generate AI coding agent packs.

---

## 1. Information Architecture & Navigation

### 1.1 Primary 3-Destination Navigation
The top navigation bar exposes exactly three primary task destinations with high-contrast active states:

| Task Destination | Primary Responsibility | Primary Action | Target Persona / Job to be Done |
|---|---|---|---|
| **1. Review Commit** | Review one commit / range & build an AI review bundle | `[Build Review Pack]` | Code reviewer wanting to inspect a diff and copy a structured prompt for Claude / Gemini / ChatGPT. |
| **2. Browse Repository** | Explore source hierarchy at HEAD & copy code snippets | `[Copy file]` / Inline Row Copy | Developer wanting to quickly browse a repo on GitHub without cloning, previewing code and copying code fences. |
| **3. Build Context Pack** | Bundle multiple repo files for LLM agents with budget meters | `[Copy Markdown]` / `[Copy JSON]` | AI engineer bundling whole modules or files to feed into an AI coding workspace with token budget limits. |

### 1.2 Top Header & Actions
- **Left**: CommitPack brand + 3 primary destination tabs (`Review Commit`, `Browse Repository`, `Build Context Pack`).
- **Right**:
  - **Rate Limit Pill**: Shows remaining/total quota (`5000/5000` or `60/60`), reset countdown, and refresh icon.
  - **Sessions Modal Trigger**: Open saved review sessions.
  - **PAT Modal Trigger**: Add or manage GitHub Personal Access Token.
  - **Logs Drawer Trigger**: Open slide-over API debug console with error counter badge.
  - **Theme Toggle**: Switch between Light (default) and Dark theme.

### 1.3 Repository Input Bar
- Universal search input accepting `owner/repo` or GitHub URLs.
- `[Inspect]` button + `[Refresh]` HEAD commit button.
- Branch dropdown selector.
- Source indicator: `{selectedBranch} @ {shortSha}` displayed clearly on Browse and Context Pack views.
- New commits detector alert banner when branch HEAD advances.

---

## 2. Screen Specifications & Progressive Disclosure

### 2.1 Page 1: Review Commit
**Layout**: Two-column responsive desktop layout.

- **Left Column (Commit Timeline)**:
  - Sticky search bar filtering by message, author, or SHA.
  - Conventional commit badges (`feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `chore`).
  - SHA copy action and relative date timestamps.
  - Pagination selector (`10`, `25`, `50`, `100` commits).
- **Right Main Column**:
  - **Commit Summary Card**: SHA badge, author avatar, date, +additions / −deletions, file count, and GitHub link.
  - **Extraction & Prompt Builder Bar**:
    - Mode selector: Compact dropdown (`Full content (Recommended)` vs `Patch only`).
    - Primary Action: `[Build Review Pack]` (initiates extraction and switches to AI review prompt view).
    - Review Task & Acceptance criteria textarea with quick presets (`General Review`, `Security`, `Tests`).
  - **`[Advanced options]` (Progressive Disclosure)**:
    - Hidden by default; expands smoothly on click.
    - **Review Mode Selector**: Single Commit vs Compare Range (Base SHA vs Head SHA, Swap, Since Last Review).
    - **File Filters & Presets**: Preset filters (All, Code Only, Astro, Next.js, Supabase), glob patterns, and status toggles.
    - **Inspect Excluded Files in Diff**: Toggle to view excluded files in diff viewer.
    - **Extra Export Formats**: Copy raw Markdown bundle, Download ZIP archive.
  - **Results Area**:
    - Tab 1: **Diff Viewer**: File list with status badges (A/M/D/R) and high-fidelity colored diff viewer.
    - Tab 2: **AI Review Pack & Exports**: Structured prompt preview, estimated token count, `[Copy Review Prompt]`, and `[Mark as Reviewed]`.

### 2.2 Page 2: Browse Repository
**Layout**: Fast, distraction-free code browser.

- **Left Column (Tree Pane)**:
  - Source indicator: `{branch} @ {headSha}`.
  - Search filter input with match counting.
  - Directory tree with folder expand/collapse and language-specific file icons.
  - File size and line counts.
  - **Inline Fast Copy Action**: Copy icon on each row copies markdown code fence (`### File: path \n \`\`\`lang ... \`\`\``) immediately.
- **Right Column (File Preview Pane)**:
  - Header: Selected file path breadcrumb, line count, language badge, `[Copy file]` action, and `[View on GitHub]`.
  - Content: Clean code display with line numbers and full scrolling.
  - Empty state: Clean guidance when no file is selected.
- **Exclusion of Clutter**: No commit timeline, no checkboxes, no context budget meters, no extraction dropdowns.

### 2.3 Page 3: Build Context Pack
**Layout**: Dedicated workspace for multi-file LLM context generation.

- **Top Sticky Context Budget Meter**:
  - Target Context Selector: `32K`, `64K`, `128K`, `200K`, `1M`, or `Custom`.
  - **20% Model Reservation**: 80% usable file budget, 20% reserved for instructions and LLM output.
  - Real-time color-coded progress bar:
    - 0–49%: Emerald (`#10b981`)
    - 50–69%: Amber (`#f59e0b`)
    - 70–84%: Orange (`#f97316`) + Warning banner
    - 85%+: Rose (`#ef4444`) + Safeguard confirmation modal before copying/downloading
- **Left Column (Virtualized Tree Pane)**:
  - Powered by `@tanstack/react-virtual` for fast rendering of 7,000+ files.
  - Tri-state folder checkboxes (empty, partial, checked).
  - Search bar with match auto-expansion.
- **Right Column (Selected File Pack Panel)**:
  - Count of selected files and estimated tokens.
  - Removable chips/list items and `[Clear All]` action.
  - **Primary Actions**:
    - `[Preview Pack]`: Modal showing full Markdown/JSON preview.
    - `[Copy Markdown]`: Structured AI-ready Markdown bundle with tree manifest and context budget metadata.
    - `[Copy JSON]`: Structured JSON bundle.
    - `[Download MD]` / `[Download JSON]`.
- **Secondary / Advanced Menu**:
  - Full tree manifest generator (`Flat Paths`, `Compact Tree`, `ASCII Tree`).
  - Custom token target configuration.

---

## 3. GitHub API Debug Console Drawer
- **Non-Obtrusive Design**: Removed permanent 32px pinned bar. The drawer is now a slide-over/bottom modal triggered via `Logs` in the top header.
- **Features**:
  - Live log feed of all API calls with HTTP method, status codes, latency in ms, and remaining rate limit quota.
  - Filters: `All` vs `Errors`.
  - Request inspector displaying payload parameters, curl equivalent, and error diagnostics.
  - Clear logs button.
  - Consumes `0px` screen height when closed.

---

## 4. Storage Key Hierarchy

| Key Pattern | Description |
|---|---|
| `commitpack_github_pat` | GitHub Personal Access Token |
| `commitpack_last_repo` | Last inspected repository string |
| `commitpack_per_page` | Commits per page preference (10/25/50/100) |
| `commitpack_active_workspace` | Current active workspace (`review-commit`, `browse-repository`, `build-context-pack`) |
| `commitpack_theme` | Active theme (`light` or `dark`) |
| `commitpack:v1:context-budget:{owner}/{repo}` | Context budget target configuration |
| `commitpack:v1:last-reviewed:{owner}/{repo}:{branch}` | Latest reviewed commit SHA checkpoint |
| `commitpack:v1:task:{owner}/{repo}:{branch}` | Draft acceptance criteria / review task text |
| `commitpack:v1:filters:{owner}/{repo}` | Filter configuration and preset state |

---

## 5. Verification & Accessibility

- **Responsive**: Adapts from mobile (vertical stacked panes) to large desktop (multi-column virtualized panes).
- **Keyboard Navigation**: Focus outlines and accessible labels across all tabs and interactive controls.
- **Contrast**: Passes WCAG AA in both Light and Dark themes.
