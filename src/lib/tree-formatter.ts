/**
 * @file src/lib/tree-formatter.ts
 * @description Pure formatting utilities for Full Tree Copy (Flat Paths, Compact Tree, ASCII Tree)
 * and Selected File Pack (Markdown, JSON) with code fence language inference.
 */

import { isBinaryFile } from './github-api';

export interface TreeHeaderOptions {
  repo: string;
  branch: string;
  ref: string;
  count: number;
}

export interface SelectedFileItem {
  path: string;
  content: string;
  language?: string;
}

export interface SkippedFileItem {
  path: string;
  reason: string;
}

export interface FailedFileItem {
  path: string;
  error: string;
}

export interface ContextBudgetMetadata {
  targetTokens: number;
  reservedTokens: number;
  usableFileTokens: number;
  estimatedSelectedTokens: number;
  usagePercent: number;
}

export interface SelectedFilePackOptions {
  repo: string;
  branch: string;
  ref: string;
  generatedAt?: string;
  files: SelectedFileItem[];
  skipped?: SkippedFileItem[];
  failed?: FailedFileItem[];
  contextBudget?: ContextBudgetMetadata;
}

/**
 * Derives markdown code fence language from file path extension.
 */
export function getCodeFenceLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
    jsx: 'jsx',
    mjs: 'js',
    cjs: 'js',
    json: 'json',
    md: 'md',
    markdown: 'md',
    mdx: 'mdx',
    sql: 'sql',
    sh: 'sh',
    bash: 'sh',
    zsh: 'sh',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    astro: 'astro',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    txt: 'text',
    py: 'py',
    rb: 'rb',
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
    vue: 'vue',
    svelte: 'svelte',
    xml: 'xml',
    svg: 'xml',
    graphql: 'graphql',
    dockerfile: 'dockerfile',
    env: 'sh',
  };

  return langMap[ext] || ext || 'text';
}

/**
 * Generates Flat Paths manifest string.
 * Example:
 * # Repository File Manifest
 * # Repo: owner/repo
 * # Branch: main
 * # Ref: abc1234
 * # Files: 742
 *
 * src/pages/index.tsx
 * ...
 */
export function buildFlatPathsManifest(
  paths: string[],
  options: TreeHeaderOptions
): string {
  const sortedPaths = [...paths].sort((a, b) => a.localeCompare(b));
  const shortSha = options.ref.length > 7 ? options.ref.substring(0, 7) : options.ref;

  const header = [
    '# Repository File Manifest',
    `# Repo: ${options.repo}`,
    `# Branch: ${options.branch}`,
    `# Ref: ${shortSha}`,
    `# Files: ${options.count}`,
    '',
  ].join('\n');

  return header + sortedPaths.join('\n');
}

interface DirTreeNode {
  subdirs: Map<string, DirTreeNode>;
  files: string[];
}

function buildHierarchyFromPaths(paths: string[]): DirTreeNode {
  const root: DirTreeNode = {
    subdirs: new Map(),
    files: [],
  };

  const sorted = [...paths].sort((a, b) => a.localeCompare(b));

  for (const path of sorted) {
    const parts = path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.files.push(part);
      } else {
        if (!current.subdirs.has(part)) {
          current.subdirs.set(part, {
            subdirs: new Map(),
            files: [],
          });
        }
        current = current.subdirs.get(part)!;
      }
    }
  }

  return root;
}

/**
 * Generates Compact Tree format string.
 * Example:
 * # Repository Structure
 * # Repo: owner/repo | Branch: main | Ref: abc1234 | Files: 742
 *
 * src/
 *   server/
 *     services/
 *       competitors-service.ts
 */
export function buildCompactTree(
  paths: string[],
  options: TreeHeaderOptions
): string {
  const root = buildHierarchyFromPaths(paths);
  const shortSha = options.ref.length > 7 ? options.ref.substring(0, 7) : options.ref;

  const header = `# Repository Structure\n# Repo: ${options.repo} | Branch: ${options.branch} | Ref: ${shortSha} | Files: ${options.count}\n\n`;

  const lines: string[] = [];

  function traverse(node: DirTreeNode, depth: number) {
    const indent = '  '.repeat(depth);

    // Sorted subdirectories first
    const sortedSubdirs = Array.from(node.subdirs.keys()).sort((a, b) => a.localeCompare(b));
    for (const dirname of sortedSubdirs) {
      lines.push(`${indent}${dirname}/`);
      traverse(node.subdirs.get(dirname)!, depth + 1);
    }

    // Sorted files
    const sortedFiles = [...node.files].sort((a, b) => a.localeCompare(b));
    for (const filename of sortedFiles) {
      lines.push(`${indent}${filename}`);
    }
  }

  traverse(root, 0);

  return header + lines.join('\n');
}

/**
 * Generates ASCII Tree format string using box-drawing characters.
 * Example:
 * # Repository Tree
 * # Repo: owner/repo | Branch: main | Ref: abc1234 | Files: 742
 *
 * .
 * ├── src
 * │   └── index.ts
 * └── package.json
 */
export function buildAsciiTree(
  paths: string[],
  options: TreeHeaderOptions
): string {
  const root = buildHierarchyFromPaths(paths);
  const shortSha = options.ref.length > 7 ? options.ref.substring(0, 7) : options.ref;

  const header = `# Repository Tree\n# Repo: ${options.repo} | Branch: ${options.branch} | Ref: ${shortSha} | Files: ${options.count}\n\n.\n`;

  const lines: string[] = [];

  function renderAscii(node: DirTreeNode, prefix: string) {
    type Entry = { name: string; isDir: boolean; node?: DirTreeNode };

    const sortedSubdirs = Array.from(node.subdirs.keys()).sort((a, b) => a.localeCompare(b));
    const sortedFiles = [...node.files].sort((a, b) => a.localeCompare(b));

    const entries: Entry[] = [
      ...sortedSubdirs.map((name) => ({ name, isDir: true, node: node.subdirs.get(name)! })),
      ...sortedFiles.map((name) => ({ name, isDir: false })),
    ];

    entries.forEach((entry, idx) => {
      const isLast = idx === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = prefix + (isLast ? '    ' : '│   ');

      lines.push(`${prefix}${connector}${entry.name}`);

      if (entry.isDir && entry.node) {
        renderAscii(entry.node, childPrefix);
      }
    });
  }

  renderAscii(root, '');

  return header + lines.join('\n');
}

/**
 * Generates Markdown format bundle for Selected File Pack.
 */
export function generateSelectedFilesMarkdown(options: SelectedFilePackOptions): string {
  const shortSha = options.ref.length > 7 ? options.ref.substring(0, 7) : options.ref;
  const isoTime = options.generatedAt || new Date().toISOString();

  const sortedFiles = [...options.files].sort((a, b) => a.path.localeCompare(b.path));

  let md = '# Selected File Pack\n\n';
  md += `- Repository: ${options.repo}\n`;
  md += `- Branch: ${options.branch}\n`;
  md += `- Ref: ${shortSha}\n`;
  md += `- Selected text files: ${sortedFiles.length}\n`;
  if (options.contextBudget) {
    md += `- Context target: ${options.contextBudget.targetTokens.toLocaleString()} tokens\n`;
    md += `- Usable context budget: ${options.contextBudget.usableFileTokens.toLocaleString()} tokens (20% reserved)\n`;
    md += `- Estimated selected tokens: ${options.contextBudget.estimatedSelectedTokens.toLocaleString()} (${options.contextBudget.usagePercent}% usable budget)\n`;
  }
  md += `- Generated at: ${isoTime}\n\n`;

  md += '## File List\n';
  if (sortedFiles.length === 0) {
    md += '*(No text files selected)*\n';
  } else {
    sortedFiles.forEach((f) => {
      md += `- ${f.path}\n`;
    });
  }

  md += '\n---\n\n';

  sortedFiles.forEach((file) => {
    const lang = file.language || getCodeFenceLanguage(file.path);
    md += `## File: ${file.path}\n\n`;
    md += `\`\`\`${lang}\n`;
    md += `${file.content}\n`;
    md += '```\n\n';
  });

  const skipped = options.skipped || [];
  const failed = options.failed || [];

  if (skipped.length > 0 || failed.length > 0) {
    md += '## Skipped / Failed Files\n';
    skipped.forEach((s) => {
      md += `- ${s.path} — ${s.reason}\n`;
    });
    failed.forEach((f) => {
      md += `- ${f.path} — fetch failed (${f.error})\n`;
    });
    md += '\n';
  }

  return md;
}

/**
 * Generates JSON format object/string for Selected File Pack.
 */
export function generateSelectedFilesJson(options: SelectedFilePackOptions): string {
  const shortSha = options.ref.length > 7 ? options.ref.substring(0, 7) : options.ref;
  const isoTime = options.generatedAt || new Date().toISOString();

  const sortedFiles = [...options.files].sort((a, b) => a.path.localeCompare(b.path));

  const jsonObject = {
    repo: options.repo,
    branch: options.branch,
    ref: shortSha,
    generatedAt: isoTime,
    selectedCount: sortedFiles.length,
    ...(options.contextBudget ? { contextBudget: options.contextBudget } : {}),
    files: sortedFiles.map((f) => ({
      path: f.path,
      language: f.language || getCodeFenceLanguage(f.path),
      content: f.content,
    })),
    skipped: (options.skipped || []).map((s) => ({
      path: s.path,
      reason: s.reason,
    })),
    failed: (options.failed || []).map((f) => ({
      path: f.path,
      error: f.error,
    })),
  };

  return JSON.stringify(jsonObject, null, 2);
}

/**
 * Triggers a client-side file download via Blob.
 */
export function downloadTextFile(filename: string, content: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
