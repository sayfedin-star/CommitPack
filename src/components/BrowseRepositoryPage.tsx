/**
 * @file src/components/BrowseRepositoryPage.tsx
 * @description Dedicated task-first page for exploring repository source files at branch HEAD,
 * previewing file contents, and copying single files with fast one-click actions.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  Image,
  ChevronRight,
  ChevronDown,
  Search,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  FolderGit2,
  X,
} from 'lucide-react';
import { GitHubTreeItem } from '../types/github';
import { getHeadCommit, getRepoTree, getFileContent, isBinaryFile } from '../lib/github-api';
import { getCachedMainTree, setCachedMainTree } from '../lib/main-tree-cache';
import { getCodeFenceLanguage } from '../lib/tree-formatter';

interface BrowseRepositoryPageProps {
  owner: string;
  repo: string;
  defaultBranch?: string;
  pat: string | null;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  isBinary: boolean;
  children: Map<string, TreeNode>;
}

/**
 * Returns an appropriate file icon based on file extension.
 */
function getFileIcon(path: string, isBinary: boolean) {
  if (isBinary) {
    return <Image className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />;
  }
  const ext = path.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext || '')) {
    return <Image className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0" />;
  }
  if (['json', 'yaml', 'yml', 'toml'].includes(ext || '')) {
    return <FileJson className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />;
  }
  if (['md', 'txt', 'rtf', 'pdf'].includes(ext || '')) {
    return <FileText className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />;
  }
  if (['csv', 'tsv', 'xlsx'].includes(ext || '')) {
    return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />;
  }
  return <FileCode className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />;
}

/**
 * Formats bytes into human-readable string.
 */
function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Builds nested tree structure from flat recursive GitHub tree items.
 */
function buildTreeStructure(items: GitHubTreeItem[]): TreeNode {
  const root: TreeNode = {
    name: 'root',
    path: '',
    type: 'tree',
    sha: '',
    isBinary: false,
    children: new Map(),
  };

  items.forEach((item) => {
    const parts = item.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(part)) {
        const isBin = item.type === 'blob' && isBinaryFile(item.path);
        current.children.set(part, {
          name: part,
          path: currentPath,
          type: isLast ? (item.type as 'blob' | 'tree') : 'tree',
          sha: isLast ? item.sha : '',
          size: isLast ? item.size : undefined,
          isBinary: isBin,
          children: new Map(),
        });
      }

      current = current.children.get(part)!;
    }
  });

  return root;
}

export const BrowseRepositoryPage: React.FC<BrowseRepositoryPageProps> = ({
  owner,
  repo,
  defaultBranch = 'main',
  pat,
}) => {
  const [treeItems, setTreeItems] = useState<GitHubTreeItem[]>([]);
  const [headSha, setHeadSha] = useState<string>('');
  const [isLoadingTree, setIsLoadingTree] = useState<boolean>(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  // Search & Navigation
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  // File Preview state
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [copiedFile, setCopiedFile] = useState<boolean>(false);
  const [copyingRowPath, setCopyingRowPath] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load Tree on mount or repo change
  useEffect(() => {
    if (!owner || !repo) return;

    let isMounted = true;
    const fetchTree = async () => {
      setIsLoadingTree(true);
      setTreeError(null);
      setSelectedFilePath(null);
      setPreviewContent(null);

      try {
        // 1. Check in-memory cache
        const cached = getCachedMainTree(owner, repo);
        if (cached && cached.branch === defaultBranch) {
          if (isMounted) {
            setTreeItems(cached.items);
            setHeadSha(cached.sha);
            setIsLoadingTree(false);
          }
          return;
        }

        // 2. Fetch HEAD commit
        const head = await getHeadCommit(owner, repo, defaultBranch, pat);
        if (!isMounted) return;
        setHeadSha(head.sha);

        // 3. Fetch recursive tree
        const result = await getRepoTree(owner, repo, head.sha, pat);
        if (!isMounted) return;
        setTreeItems(result.tree);
        setCachedMainTree(owner, repo, {
          owner,
          repo,
          branch: defaultBranch,
          sha: head.sha,
          isFallback: false,
          truncated: result.truncated || false,
          items: result.tree,
          fetchedAt: Date.now(),
        });
      } catch (err: unknown) {
        if (isMounted) {
          setTreeError((err as Error).message || 'Failed to load repository tree.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingTree(false);
        }
      }
    };

    fetchTree();
    return () => {
      isMounted = false;
    };
  }, [owner, repo, defaultBranch, pat]);

  // Build tree node hierarchy
  const treeRoot = useMemo(() => {
    return buildTreeStructure(treeItems);
  }, [treeItems]);

  // Auto-expand folders when searching
  useEffect(() => {
    const safeQ = (searchQuery || '').trim();
    if (!safeQ) return;
    const q = safeQ.toLowerCase();
    const newExpanded = new Set<string>();

    treeItems.forEach((item) => {
      if (item.path.toLowerCase().includes(q)) {
        const parts = item.path.split('/');
        for (let i = 1; i < parts.length; i++) {
          newExpanded.add(parts.slice(0, i).join('/'));
        }
      }
    });

    setExpandedFolders((prev) => new Set([...prev, ...newExpanded]));
  }, [searchQuery, treeItems]);

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  // Select file and fetch preview content
  const handleSelectFile = async (path: string, sha: string, isBinary: boolean) => {
    setSelectedFilePath(path);
    setFileError(null);
    setPreviewContent(null);

    if (isBinary) {
      setPreviewContent('(Binary file cannot be previewed as text)');
      return;
    }

    setIsLoadingFile(true);
    try {
      const res = await getFileContent(owner, repo, path, headSha || defaultBranch, pat);
      setPreviewContent(res.content);
    } catch (err: unknown) {
      setFileError((err as Error).message || 'Failed to load file content.');
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Fast single file copy
  const handleQuickCopyFile = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCopyingRowPath(path);

    try {
      const res = await getFileContent(owner, repo, path, headSha || defaultBranch, pat);
      const lang = getCodeFenceLanguage(path);
      const formatted = `### File: \`${path}\`\n\`\`\`${lang}\n${res.content}\n\`\`\`\n`;
      await navigator.clipboard.writeText(formatted);
      setToastMessage(`Copied file: ${path}`);
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err) {
      console.error('Failed to copy file:', err);
    } finally {
      setCopyingRowPath(null);
    }
  };

  // Render tree node recursively
  const renderTreeNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
    const q = (searchQuery || '').toLowerCase().trim();
    const childrenArray = Array.from(node.children.values());

    // Sort folders first, then files alphabetically
    childrenArray.sort((a, b) => {
      if (a.type === 'tree' && b.type !== 'tree') return -1;
      if (a.type !== 'tree' && b.type === 'tree') return 1;
      return a.name.localeCompare(b.name);
    });

    return (
      <div key={node.path || 'root'} className="space-y-0.5">
        {childrenArray.map((child) => {
          const isFolder = child.type === 'tree';
          const isExpanded = expandedFolders.has(child.path);
          const isSelected = selectedFilePath === child.path;
          const isRowCopying = copyingRowPath === child.path;

          // Filter check
          if (q) {
            const matchesDirectly = child.path.toLowerCase().includes(q);
            const hasMatchingDescendant = treeItems.some(
              (item) => item.path.startsWith(child.path + '/') && item.path.toLowerCase().includes(q)
            );
            if (!matchesDirectly && !hasMatchingDescendant) {
              return null;
            }
          }

          return (
            <div key={child.path}>
              <div
                onClick={() => {
                  if (isFolder) {
                    toggleFolder(child.path);
                  } else {
                    handleSelectFile(child.path, child.sha, child.isBinary);
                  }
                }}
                style={{ paddingLeft: `${depth * 14 + 10}px` }}
                className={`group flex items-center justify-between pr-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors select-none ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 font-semibold'
                    : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900'
                }`}
              >
                {/* Node icon & Name */}
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {isFolder ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFolder(child.path);
                      }}
                      className="p-0.5 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ) : (
                    <span className="w-3.5" />
                  )}

                  {isFolder ? (
                    isExpanded ? (
                      <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    ) : (
                      <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )
                  ) : (
                    getFileIcon(child.path, child.isBinary)
                  )}

                  <span className="truncate font-mono">{child.name}</span>
                </div>

                {/* Right metadata and quick copy */}
                <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100">
                  {child.size !== undefined && (
                    <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                      {formatBytes(child.size)}
                    </span>
                  )}

                  {!isFolder && !child.isBinary && (
                    <button
                      type="button"
                      onClick={(e) => handleQuickCopyFile(child.path, e)}
                      disabled={isRowCopying}
                      title="Quick Copy file as Markdown"
                      className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:text-zinc-500 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
                    >
                      {isRowCopying ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Recursive Children */}
              {isFolder && isExpanded && renderTreeNode(child, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div id="browse-repository-page" className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 rounded-lg text-xs font-mono shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Left Column: Repository Tree */}
      <aside
        id="browse-tree-sidebar"
        className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col shrink-0 h-72 md:h-[calc(100vh-7.5rem)] transition-colors"
      >
        {/* Search & Stats Bar */}
        <div className="p-2.5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 space-y-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 dark:text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search repository files..."
              className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-md text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-zinc-400 px-1">
            <span>{treeItems.filter((i) => i.type === 'blob').length} files at HEAD</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const allFolders = new Set<string>();
                  treeItems.forEach((i) => {
                    const parts = i.path.split('/');
                    for (let d = 1; d < parts.length; d++) {
                      allFolders.add(parts.slice(0, d).join('/'));
                    }
                  });
                  setExpandedFolders(allFolders);
                }}
                className="hover:text-slate-800 dark:hover:text-zinc-200"
              >
                Expand all
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => setExpandedFolders(new Set())}
                className="hover:text-slate-800 dark:hover:text-zinc-200"
              >
                Collapse
              </button>
            </div>
          </div>
        </div>

        {/* Tree Container */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoadingTree ? (
            <div className="p-6 text-center text-slate-400 dark:text-zinc-500 space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto" />
              <p className="text-xs font-mono">Loading repository tree...</p>
            </div>
          ) : treeError ? (
            <div className="p-4 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-800/60">
              {treeError}
            </div>
          ) : (
            renderTreeNode(treeRoot)
          )}
        </div>
      </aside>

      {/* Right Column: Clean File Preview */}
      <main
        id="browse-preview-area"
        className="flex-1 flex flex-col bg-slate-50/50 dark:bg-zinc-950 overflow-hidden min-h-0 md:h-[calc(100vh-7.5rem)] transition-colors"
      >
        {selectedFilePath ? (
          <div className="h-full flex flex-col min-h-0 overflow-hidden">
            {/* File Header Bar */}
            <div className="p-3 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(selectedFilePath, false)}
                <span className="font-mono text-xs font-semibold text-slate-900 dark:text-zinc-100 truncate">
                  {selectedFilePath}
                </span>
                {previewContent && (
                  <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 hidden sm:inline">
                    ({previewContent.split('\n').length} lines)
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (previewContent) {
                      const lang = getCodeFenceLanguage(selectedFilePath);
                      const formatted = `### File: \`${selectedFilePath}\`\n\`\`\`${lang}\n${previewContent}\n\`\`\`\n`;
                      navigator.clipboard.writeText(formatted);
                      setCopiedFile(true);
                      setTimeout(() => setCopiedFile(false), 2000);
                    }
                  }}
                  disabled={!previewContent || isLoadingFile}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                >
                  {copiedFile ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedFile ? 'Copied Markdown' : 'Copy file'}</span>
                </button>

                <a
                  href={`https://github.com/${owner}/${repo}/blob/${headSha || defaultBranch}/${selectedFilePath}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg border border-slate-200 dark:border-zinc-700 transition-colors"
                  title="Open file on GitHub"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* File Body */}
            <div className="flex-1 overflow-auto bg-white dark:bg-zinc-950 p-4">
              {isLoadingFile ? (
                <div className="h-full flex items-center justify-center p-8 text-slate-500 dark:text-zinc-400">
                  <div className="text-center space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
                    <p className="text-xs font-mono">Fetching file content from GitHub...</p>
                  </div>
                </div>
              ) : fileError ? (
                <div className="p-4 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-800/60">
                  {fileError}
                </div>
              ) : previewContent !== null ? (
                <pre className="font-mono text-xs text-slate-800 dark:text-zinc-200 leading-relaxed whitespace-pre font-normal">
                  {previewContent}
                </pre>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-8 text-slate-400 dark:text-zinc-500">
            <div className="text-center space-y-2 max-w-sm">
              <FolderGit2 className="w-8 h-8 mx-auto opacity-40 text-slate-400" />
              <p className="text-xs font-medium">
                Select a file from the repository tree to inspect its code, or click the copy icon on any file to copy it instantly.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
