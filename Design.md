# CommitPack — Architecture & Feature Specification

## Overview
**CommitPack** is a client-side Single Page Application (SPA) built with React 18, TypeScript, Vite, and Tailwind CSS. It empowers developers and AI practitioners to inspect GitHub commits, extract changed files, and package them into AI-agent-ready Markdown/JSON bundles and structured ZIP archives.

---

## Key Features

### 1. Robust URL & Shorthand Parsing
- Supports multiple formats:
  - `https://github.com/owner/repo`
  - `owner/repo` (e.g., `facebook/react`)
  - `https://github.com/owner/repo/tree/branch-name`
  - `https://github.com/owner/repo/commit/sha`
  - `https://github.com/owner/repo/pull/123/commits/sha`
- Normalizes and validates input with real-time feedback and clear error states.

### 2. GitHub PAT & Live Rate Limit Tracking
- Client-side only storage in `localStorage` for security.
- Never transmitted anywhere except `https://api.github.com` via the `Authorization: Bearer <token>` header.
- Displays live badge: `60 req/hr (anonymous)` vs `5000 req/hr (authenticated)`.
- Updates `X-RateLimit-Remaining` and `X-RateLimit-Reset` countdown automatically after every API response.

### 3. Interactive Commit Timeline & Branch Switcher
- Fetches repo metadata and all branches.
- Selectable pagination ($N = 10, 25, 50, 100$).
- Clean vertical timeline with short SHA, commit message, author avatar, relative date, and change statistics.

### 4. Commit Inspector & Line-by-Line Diff Viewer
- Fetches detailed commit data including `files[]` and git patches.
- **Left Panel**: Searchable list of changed files with color-coded status badges:
  - `A` Added (Emerald)
  - `M` Modified (Amber)
  - `D` Removed/Deleted (Rose)
  - `R` Renamed (Blue)
- **Right Panel**: Side-by-side or unified patch diff viewer with colored line additions/deletions, line numbering, and placeholder for large/binary files.

### 5. Full Repository File Explorer
- Fetches repository tree at the selected commit SHA (`/git/trees/{sha}?recursive=1`).
- Collapsible folder tree with file type icons.
- Highlights files that were modified in the active commit.
- In-place file content viewer using GitHub Contents API (`ref={sha}`).

### 6. File Extraction Engine
- **Full Content Mode** (Default):
  - Files $\le 1$ MB: Decodes Base64 from contents endpoint.
  - Files $1$–$100$ MB: Retries with `Accept: application/vnd.github.raw`.
  - Files $> 100$ MB: Safely excluded with user warning.
  - Removed files: Summarized in header; optional "Include pre-deletion version" toggle fetches at parent SHA.
  - Binary files: Automatically detected and routed exclusively to ZIP export.
  - Merge and root commits gracefully supported.
  - Multi-file batch fetching with live progress indicator (`Fetching file 3/14`) and `AbortController` cancellation.
- **Patch-Only Mode**: Instant bundle creation utilizing existing commit patches without extra network calls.

### 7. AI-Ready Packaging & Exports
- **A. AI Agent Markdown Bundle**:
  - Standardized Markdown header with commit metadata, author, date, and URL.
  - Changed files summary table.
  - Indented ASCII directory tree of changed files.
  - Full file contents inside code blocks with language detection.
  - Live token estimation ($\approx \text{chars}/4$) and $>100\text{k}$ token warning.
  - One-click copy to clipboard with toast notification and `.md` file download.
- **B. JSON Export**: Structured `{ repo, commit, branch, files: [{ path, status, additions, deletions, patch, content }] }`.
- **C. CSV Export**: Commit history summary list (`sha, date, author, message, files_changed`).
- **D. ZIP Archive**: Client-side generated via JSZip (DEFLATE compression), preserving relative directory structure and bundling a root `COMMIT_INFO.md`.

### 8. Developer Observability & Debug Console
- Live log of every GitHub API request with timestamp, HTTP method, endpoint, status code, latency, and rate-limit headers.
- Filterable and exportable logs for network debugging.
