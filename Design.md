# CommitPack — Architecture & Enhancement Specification

CommitPack is a client-side React 18 + TypeScript + Vite Single Page Application (SPA) that inspects GitHub commits and compare ranges, applies deterministic file filtering and presets, generates structured AI agent review prompts, and packages changed files into Markdown/JSON bundles and ZIP archives.

---

## 1. Five Core Enhancements

### Enhancement 1: Refresh + Latest Commit Detector
- **Purpose**: Allows users to check for newly pushed commits on the selected branch without reloading the webpage or losing active review state.
- **API Calls**:
  - `GET /repos/{owner}/{repo}/commits/{branch}` (via `getHeadCommit`)
  - `GET /repos/{owner}/{repo}/compare/{latestKnownSha}...{headSha}` (via `getCommitCountBetween`)
- **Telemetry**: All network requests logged to the in-app debug console with timing and status.
- **UI & UX**:
  - **Refresh button** positioned next to Inspect in `RepoInput`.
  - **Relative timestamp**: Displays "Checked just now", "Checked 2m ago", etc.
  - **Prominent notification banner**: Appears when `newCommitCount > 0`, displaying *"{N} new commit(s) detected on branch `{branch}`"* with **Load latest** and **Dismiss** actions.
  - **Opt-in Auto-check**: Periodic 60-second polling toggle with Page Visibility detection (`document.visibilityState === 'visible'`) to prevent background rate limit consumption.

---

### Enhancement 2: Review Task Textarea + Copy Review Prompt
- **Purpose**: Enables engineers to input task acceptance criteria and instantly export an AI-agent-ready review prompt formatted in Markdown.
- **Storage Keys**:
  - `commitpack:v1:task:{owner}/{repo}:{branch}`: Auto-saves task text drafts per repository and branch.
- **Prompt Structure**:
  1. Header with Repository, Branch, Mode (Single vs. Compare), Base SHA, Head SHA, and GitHub URL.
  2. Scope metrics: Included changed files count, Excluded files count.
  3. Acceptance Criteria / Review Task block.
  4. Core Prompt instructions directing the AI agent to verify implementation against requirements, highlight bugs, check edge cases, and inspect exclusions.
  5. Complete CommitPack bundle (metadata + patches/sources).
- **UI & Controls**:
  - Located in the **Agent Review Prompt** tab of the Export hub.
  - Character counter, clear button, token estimate badge (~4 chars/token).
  - Validation: Requires non-empty acceptance criteria before copying.
  - Interactive **Preview Prompt** toggle.
  - One-click **Copy Review Prompt** button with feedback states.
  - **Mark Reviewed / Checkpoint**: Saves the current commit as verified.

---

### Enhancement 3: Compare Range + Since Last Review
- **Purpose**: Supports inspecting all accumulated changes across two arbitrary commits or comparing from a saved review checkpoint up to current branch HEAD.
- **API Calls**:
  - `GET /repos/{owner}/{repo}/compare/{base}...{head}` (via `compareCommits`)
- **Storage Keys**:
  - `commitpack:v1:last-reviewed:{owner}/{repo}:{branch}`: Records the latest reviewed commit SHA checkpoint.
- **UI & User Flow**:
  - Top-level Mode Switcher: **Single Commit** vs. **Compare Range**.
  - **Base & Head Commit Selectors**: Dropdown selection from loaded timeline or direct SHA/tag input.
  - **Swap Button**: Inverts Base and Head commits.
  - **Timeline Ordering Validation**: Warns if Base is newer than Head in the timeline.
  - **Identical Commit Validation**: Disables comparison if Base === Head.
  - **Since Last Review Button**: Automatically sets Base to last reviewed checkpoint and Head to branch HEAD, executing the comparison. If no checkpoint exists, shows a helpful setup prompt.
  - Comparison summary card with commit count, ahead/behind telemetry, and GitHub Compare URL.
  - Range ZIP archive download filename: `{repo}-{shortBase}-to-{shortHead}-changed-files.zip`.

---

### Enhancement 4: File Filters + Presets
- **Purpose**: Deterministically filters changed files to keep AI prompts concise, relevant, and within model token budgets.
- **Storage Keys**:
  - `commitpack:v1:filters:{owner}/{repo}`: Persists filter configurations per repository.
- **Filter Capabilities**:
  - **Presets**:
    - *All changed files* (default)
    - *Code only* (filters out markdown, docs, config, assets)
    - *Astro + TS* (`src/**/*.astro`, `src/**/*.ts`, `src/**/*.tsx`)
    - *Next.js + TS* (`app/**/*`, `pages/**/*`, `components/**/*`, `lib/**/*`, `.ts`, `.tsx`)
    - *Supabase / SQL* (`supabase/**/*`, `**/*.sql`, `**/*.ts`)
    - *Custom*
  - **Include & Exclude Globs**: Comma-separated deterministic glob matching supporting `*`, `**`, `?`, and extension wildcards.
  - **Extension matching**: Comma-separated list (e.g. `.ts, .tsx, .astro`).
  - **Status toggles**: Individual toggles for *Added*, *Modified*, *Renamed*, *Deleted*.
  - **Max File Size**: Filters out files exceeding specified threshold in KB.
  - **Context Files (Unchanged)**: Option to fetch and include reference files (e.g., `package.json`, `tsconfig.json`) from branch HEAD into prompts and ZIP archives (in `_context_files/`).
  - **Exclusion Transparency**: Tracks and displays exact reasons for exclusion (`status_unselected`, `glob_exclude`, `glob_include_miss`, `extension_mismatch`, `max_size_exceeded`, `code_only_miss`).
  - **Diff Inspection of Excluded Files**: Toggle to inspect excluded files in DiffViewer with an exclusion notice banner.

---

### Enhancement 5: Review Sessions
- **Purpose**: Local-only workspace persistence enabling engineers to track review status across repos, save drafts, reopen previous sessions, and export/import review histories.
- **Storage Keys**:
  - `commitpack:v1:sessions`: Stores array of `ReviewSession` objects.
- **Session Object Schema**:
  - `id`: Unique session ID.
  - `repo`: Full repository name (`owner/repo`).
  - `branch`: Branch name.
  - `mode`: `'single' | 'compare'`.
  - `baseSha` & `headSha`: Commit references.
  - `commitOrCompareUrl`: GitHub reference URL.
  - `taskText`: Acceptance criteria string.
  - `status`: `'pending' | 'passed' | 'needs_fixes'`.
  - `notes`: Optional engineer notes.
  - `filtersSnapshot`: Snapshot of active filter configuration.
  - `includedFileCount` & `excludedFileCount`: File count telemetry.
  - `createdAt`, `updatedAt`, `reviewedAt`: Timestamps.
- **Actions**:
  - **Save Current Session**: Bookmarks active state.
  - **Reopen Session**: Restores repository, branch, mode, SHAs, filters, and task draft.
  - **Status Management**: Quick status toggle dropdowns (Pending, Passed, Needs Fixes). Marking "Passed" automatically updates the `last-reviewed` checkpoint.
  - **JSON Export / Import**: Download all sessions to JSON or import from file with schema validation.

---

## 2. Storage Key Hierarchy

| Key Pattern | Description |
|---|---|
| `commitpack_github_pat` | GitHub Personal Access Token |
| `commitpack_last_repo` | Last inspected repository string |
| `commitpack_per_page` | Commits per page preference (10/25/50/100) |
| `commitpack:v1:last-reviewed:{owner}/{repo}:{branch}` | Latest reviewed commit SHA for repository branch |
| `commitpack:v1:task:{owner}/{repo}:{branch}` | Draft acceptance criteria / review task text |
| `commitpack:v1:filters:{owner}/{repo}` | Filter configuration and preset state |
| `commitpack:v1:sessions` | Array of saved ReviewSession records |

---

## 3. Architecture & Modularity

- **Client-Side SPA**: Zero server dependencies; 100% executable inside modern browsers.
- **Component Breakdown**:
  - `src/components/Header.tsx`: Navigation, PAT status, Rate limit monitor, Sessions trigger.
  - `src/components/RepoInput.tsx`: Repository URL parser, branch picker, Mode switcher, Refresh trigger, New commit detector.
  - `src/components/CompareRangeSelector.tsx`: Base/Head commit pickers, Swap, Since Last Review, and Range summary.
  - `src/components/FileFiltersPanel.tsx`: Filter presets, include/exclude globs, status toggles, context files adder, exclusion breakdowns.
  - `src/components/AgentReviewPanel.tsx`: Acceptance criteria textarea, prompt preview, token metrics, and Copy Review Prompt action.
  - `src/components/ReviewSessionsModal.tsx`: Saved sessions manager, reopen, status editor, and JSON export/import.
  - `src/components/Timeline.tsx`: Vertical commit stream.
  - `src/components/DiffViewer.tsx`: File list with status badges and syntax-highlighted unified line diffs.
  - `src/components/FileExplorer.tsx`: Interactive tree browser at commit ref.
  - `src/components/ExtractPanel.tsx`: Full Content vs Patch-Only extraction controls and progress bar.
  - `src/components/ExportPanel.tsx`: AI Agent Prompt & Markdown, JSON, ZIP (JSZip DEFLATE), and CSV downloads.
  - `src/components/DebugConsole.tsx`: Real-time GitHub API request audit logger.
