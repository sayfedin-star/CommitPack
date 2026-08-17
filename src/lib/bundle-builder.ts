/**
 * @file src/lib/bundle-builder.ts
 * @description Generates AI-agent-ready Markdown packs, JSON export objects,
 * and CSV commit history tables according to exact specifications.
 */

import { GitHubCommitDetail, GitHubCommitListItem, GitHubCommitFile } from '../types/github';

/**
 * Derives markdown code block syntax language identifier from a file path.
 * 
 * @param filename - Name or relative path of the file
 * @returns Code block syntax string (e.g. 'ts', 'tsx', 'json', 'py')
 */
export function getLanguageForFile(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    md: 'markdown',
    mdx: 'mdx',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    svg: 'xml',
    sql: 'sql',
    dockerfile: 'dockerfile',
    graphql: 'graphql',
    proto: 'protobuf',
  };

  const basename = filename.split('/').pop()?.toLowerCase() || '';
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';
  if (basename === 'gemfile') return 'ruby';

  return langMap[ext] || ext || 'text';
}

/**
 * Builds an ASCII indented directory tree from an array of file paths.
 * 
 * @param paths - Array of relative file path strings
 * @returns Multi-line indented ASCII tree string
 */
export function buildIndentedTree(paths: string[]): string {
  if (paths.length === 0) return '(no files)';

  interface TreeNode {
    [key: string]: TreeNode;
  }

  const root: TreeNode = {};

  paths.forEach((p) => {
    const parts = p.split('/').filter(Boolean);
    let current = root;
    parts.forEach((part) => {
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    });
  });

  const lines: string[] = [];

  function printNode(node: TreeNode, prefix: string = '', isRoot: boolean = true) {
    const keys = Object.keys(node).sort((a, b) => {
      const aIsDir = Object.keys(node[a]).length > 0;
      const bIsDir = Object.keys(node[b]).length > 0;
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.localeCompare(b);
    });

    keys.forEach((key, index) => {
      const isLast = index === keys.length - 1;
      const child = node[key];
      const isDir = Object.keys(child).length > 0;
      const connector = isLast ? '└── ' : '├── ';
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');

      lines.push(`${prefix}${connector}${key}${isDir ? '/' : ''}`);
      if (isDir) {
        printNode(child, nextPrefix, false);
      }
    });
  }

  printNode(root);
  return lines.join('\n');
}

/**
 * Generates the AI Agent Markdown bundle according to the exact specification:
 * ---
 * # Commit Pack
 * - Repo: owner/repo | Commit: {full sha} | Branch: {branch}
 * - Message: {full message} | Author: {name} <{email}> | Date: {ISO}
 * - URL: {html_url}
 * ## Changed Files Summary
 * | File | Status | +/− |
 * ## Directory Structure (changed files only)
 * {indented tree of changed file paths}
 * ## Files
 * ### File: path/to/file.ts (modified, +12/−3)
 * ```ts
 * {content}
 * ```
 * 
 * @param repoFullName - 'owner/repo'
 * @param branch - Current branch name
 * @param commit - Full commit detail object
 * @param mode - 'full' or 'patch-only'
 * @param includePreDeletion - Whether pre-deletion contents are included for removed files
 * @returns Formatted Markdown bundle string
 */
export function buildMarkdownBundle(
  repoFullName: string,
  branch: string,
  commit: GitHubCommitDetail,
  mode: 'full' | 'patch-only' = 'full',
  includePreDeletion: boolean = false
): string {
  const authorName = commit.commit.author?.name || 'Unknown Author';
  const authorEmail = commit.commit.author?.email || 'unknown@noreply.github.com';
  const isoDate = commit.commit.author?.date || new Date().toISOString();
  const commitMessage = commit.commit.message || '(no commit message)';
  const htmlUrl = commit.html_url || `https://github.com/${repoFullName}/commit/${commit.sha}`;

  const files = commit.files || [];
  const filePaths = files.map((f) => f.filename);

  const sections: string[] = [];

  // Metadata Header
  sections.push('---');
  sections.push('# Commit Pack');
  sections.push(`- Repo: ${repoFullName} | Commit: ${commit.sha} | Branch: ${branch}`);
  sections.push(`- Message: ${commitMessage.replace(/\n/g, ' ')} | Author: ${authorName} <${authorEmail}> | Date: ${isoDate}`);
  sections.push(`- URL: ${htmlUrl}`);
  sections.push('');

  // Changed Files Summary Table
  sections.push('## Changed Files Summary');
  sections.push('| File | Status | +/− |');
  sections.push('| --- | --- | --- |');
  files.forEach((file) => {
    const statusLabel = file.status.toUpperCase();
    const plusMinus = `+${file.additions}/-${file.deletions}`;
    const filenameDisplay = file.previous_filename ? `${file.previous_filename} → ${file.filename}` : file.filename;
    sections.push(`| \`${filenameDisplay}\` | ${statusLabel} | ${plusMinus} |`);
  });
  sections.push('');

  // Directory Structure
  sections.push('## Directory Structure (changed files only)');
  sections.push('```text');
  sections.push(buildIndentedTree(filePaths));
  sections.push('```');
  sections.push('');

  // Files Content / Patches
  sections.push('## Files');

  files.forEach((file) => {
    const statusDesc = file.status;
    const diffStat = `+${file.additions}/−${file.deletions}`;
    const lang = getLanguageForFile(file.filename);

    sections.push(`### File: ${file.filename} (${statusDesc}, ${diffStat})`);

    if (mode === 'patch-only') {
      if (file.patch) {
        sections.push('```diff');
        sections.push(file.patch);
        sections.push('```');
      } else {
        sections.push('> *Binary or large file — patch diff not provided by GitHub.*');
      }
    } else {
      // Full content mode
      if (file.status === 'removed') {
        if (includePreDeletion && file.preDeletionContent) {
          sections.push('> *File was deleted in this commit. Showing pre-deletion version:*');
          sections.push(`\`\`\`${lang}`);
          sections.push(file.preDeletionContent);
          sections.push('\`\`\`');
        } else {
          sections.push('> *File deleted in this commit (no post-commit content).*');
        }
      } else if (file.binary) {
        sections.push('> *Binary file content omitted from text bundle. Included in ZIP archive download.*');
      } else if (file.isTooLarge) {
        sections.push('> *File exceeds 100MB and was excluded from content extraction.*');
      } else if (file.fetchError) {
        sections.push(`> *Error fetching file content: ${file.fetchError}*`);
      } else if (file.content !== undefined) {
        sections.push(`\`\`\`${lang}`);
        sections.push(file.content);
        sections.push('```');
      } else if (file.patch) {
        // Fallback to patch if content is not yet extracted
        sections.push('```diff');
        sections.push(file.patch);
        sections.push('```');
      } else {
        sections.push('> *Content not loaded.*');
      }
    }

    sections.push('');
  });

  return sections.join('\n');
}

/**
 * Builds a structured JSON export object representing the commit and its files.
 * 
 * @param repoFullName - 'owner/repo'
 * @param branch - Current branch name
 * @param commit - Full commit detail object
 * @returns JSON-serializable structured object
 */
export function buildJsonExport(
  repoFullName: string,
  branch: string,
  commit: GitHubCommitDetail
): object {
  return {
    repo: repoFullName,
    commit: commit.sha,
    branch,
    author: {
      name: commit.commit.author?.name,
      email: commit.commit.author?.email,
      date: commit.commit.author?.date,
      avatar_url: commit.author?.avatar_url,
    },
    message: commit.commit.message,
    html_url: commit.html_url,
    stats: commit.stats,
    files: (commit.files || []).map((f) => ({
      path: f.filename,
      previous_path: f.previous_filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      binary: f.binary || false,
      patch: f.patch || null,
      content: f.content ?? null,
      preDeletionContent: f.preDeletionContent ?? null,
    })),
  };
}

/**
 * Builds a CSV string of the commit list history for export.
 * Headers: sha, date, author, message, files_changed
 * 
 * @param commits - Array of commit list items
 * @returns CSV formatted string
 */
export function buildCommitListCsv(commits: GitHubCommitListItem[]): string {
  const headers = ['sha', 'date', 'author', 'message', 'files_changed'];
  const rows: string[][] = [headers];

  commits.forEach((c) => {
    const sha = c.sha;
    const date = c.commit.author?.date || '';
    const author = `${c.commit.author?.name || ''} <${c.commit.author?.email || ''}>`;
    const message = (c.commit.message || '').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    const filesChanged = c.stats?.total !== undefined ? String(c.stats.total) : '';

    rows.push([sha, date, `"${author}"`, `"${message}"`, filesChanged]);
  });

  return rows.map((r) => r.join(',')).join('\n');
}
