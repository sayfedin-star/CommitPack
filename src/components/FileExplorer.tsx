/**
 * @file src/components/FileExplorer.tsx
 * @description Repository-wide file tree explorer at selected commit SHA with recursive tree
 * hierarchy, folder toggling, changed-file highlights, and in-place content preview.
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
  Download,
  Copy,
  Check,
  RefreshCw,
  Eye,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import {
  GitHubTreeItem,
  GitHubCommitDetail,
  GitHubCommitFile,
} from '../types/github';
import { getRepoTree, getFileContent } from '../lib/github-api';

interface FileExplorerProps {
  owner: string;
  repo: string;
  commitDetail: GitHubCommitDetail;
  pat: string | null;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  children: Map<string, TreeNode>;
}

/**
 * Derives appropriate Lucide icon for file based on extension.
 */
function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext || '')) {
    return <Image className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
  }
  if (['json', 'yaml', 'yml', 'toml'].includes(ext || '')) {
    return <FileJson className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  }
  if (['md', 'txt', 'rtf', 'pdf'].includes(ext || '')) {
    return <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
  }
  if (['csv', 'tsv', 'xlsx'].includes(ext || '')) {
    return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  }
  return <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
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
        current.children.set(part, {
          name: part,
          path: currentPath,
          type: isLast ? (item.type as 'blob' | 'tree') : 'tree',
          sha: isLast ? item.sha : '',
          size: isLast ? item.size : undefined,
          children: new Map(),
        });
      }

      current = current.children.get(part)!;
    }
  });

  return root;
}

/**
 * Full repository explorer at selected commit ref.
 */
export const FileExplorer: React.FC<FileExplorerProps> = ({
  owner,
  repo,
  commitDetail,
  pat,
}) => {
  const [treeItems, setTreeItems] = useState<GitHubTreeItem[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState<boolean>(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected file preview
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState<boolean>(false);

  // Set of paths that were changed in this commit
  const changedFileMap = useMemo(() => {
    const map = new Map<string, GitHubCommitFile>();
    (commitDetail.files || []).forEach((f) => map.set(f.filename, f));
    return map;
  }, [commitDetail.files]);

  // Load tree whenever commit changes
  useEffect(() => {
    let isCancelled = false;
    const controller = new AbortController();

    const fetchTree = async () => {
      setIsLoadingTree(true);
      setTreeError(null);
      try {
        const data = await getRepoTree(owner, repo, commitDetail.sha, pat, controller.signal);
        if (!isCancelled) {
          setTreeItems(data.tree || []);

          // Auto-expand root level folders and folders containing changed files
          const initialExpanded = new Set<string>();
          (commitDetail.files || []).forEach((file) => {
            const parts = file.filename.split('/');
            let accumulated = '';
            for (let i = 0; i < parts.length - 1; i++) {
              accumulated = accumulated ? `${accumulated}/${parts[i]}` : parts[i];
              initialExpanded.add(accumulated);
            }
          });
          setExpandedFolders(initialExpanded);
        }
      } catch (err: unknown) {
        if (!isCancelled && (err as Error).name !== 'AbortError') {
          setTreeError((err as Error).message || 'Failed to load repository tree.');
        }
      } finally {
        if (!isCancelled) setIsLoadingTree(false);
      }
    };

    fetchTree();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [owner, repo, commitDetail.sha, pat, commitDetail.files]);

  const treeRoot = useMemo(() => {
    return buildTreeStructure(treeItems);
  }, [treeItems]);

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

  const handleSelectFile = async (filePath: string) => {
    setPreviewPath(filePath);
    setPreviewContent(null);
    setPreviewError(null);
    setIsLoadingPreview(true);

    try {
      const res = await getFileContent(owner, repo, filePath, commitDetail.sha, pat);
      setPreviewContent(res.content);
    } catch (err: unknown) {
      setPreviewError((err as Error).message || 'Could not load file content.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleCopyPreview = () => {
    if (previewContent) {
      navigator.clipboard.writeText(previewContent);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  // Render a directory node recursively
  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isFolder = node.type === 'tree' || node.children.size > 0;
    const isExpanded = expandedFolders.has(node.path);
    const changedFile = changedFileMap.get(node.path);
    const isSelected = previewPath === node.path;

    // Filter check
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hasMatchingChild = Array.from(node.children.values()).some((c) =>
        c.path.toLowerCase().includes(q)
      );
      const isSelfMatching = node.path.toLowerCase().includes(q);
      if (!isSelfMatching && !hasMatchingChild) {
        return null;
      }
    }

    if (isFolder) {
      return (
        <div key={node.path} className="select-none">
          <button
            type="button"
            onClick={() => toggleFolder(node.path)}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            className="w-full py-1 px-2 text-left hover:bg-zinc-800/60 rounded flex items-center gap-1.5 text-xs text-zinc-300 transition-colors group"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            )}
            <span className="font-mono truncate">{node.name}</span>
          </button>

          {isExpanded && (
            <div>
              {Array.from<TreeNode>(node.children.values())
                .sort((a: TreeNode, b: TreeNode) => {
                  const aIsDir = a.type === 'tree' || a.children.size > 0;
                  const bIsDir = b.type === 'tree' || b.children.size > 0;
                  if (aIsDir && !bIsDir) return -1;
                  if (!aIsDir && bIsDir) return 1;
                  return a.name.localeCompare(b.name);
                })
                .map((child: TreeNode) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // File Node
    return (
      <button
        key={node.path}
        id={`tree-file-${node.path.replace(/[^a-zA-Z0-9]/g, '_')}`}
        type="button"
        onClick={() => handleSelectFile(node.path)}
        style={{ paddingLeft: `${depth * 14 + 18}px` }}
        className={`w-full py-1 px-2 text-left rounded flex items-center justify-between gap-2 text-xs transition-colors group font-mono ${
          isSelected
            ? 'bg-indigo-950/60 text-indigo-200 border-l-2 border-indigo-500'
            : 'hover:bg-zinc-800/60 text-zinc-300'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate min-w-0">
          {getFileIcon(node.path)}
          <span className="truncate">{node.name}</span>
        </div>

        {changedFile && (
          <span
            title={`Changed in this commit: ${changedFile.status}`}
            className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 shrink-0"
          >
            {changedFile.status.toUpperCase()}
          </span>
        )}
      </button>
    );
  };

  return (
    <div id="file-explorer-container" className="h-full flex flex-col md:flex-row bg-zinc-950 overflow-hidden">
      {/* Left Tree Explorer */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-zinc-800/80 flex flex-col shrink-0 bg-zinc-900/30">
        {/* Tree Search Header */}
        <div className="p-3 border-b border-zinc-800/80 space-y-2 bg-zinc-950/50">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-300">Tree at {commitDetail.sha.substring(0, 7)}</span>
            <span className="font-mono text-zinc-500 text-[11px]">
              {treeItems.length} items
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            <input
              id="tree-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search repo tree..."
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-md text-xs font-mono text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Tree Item List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {isLoadingTree ? (
            <div className="p-4 space-y-2 animate-pulse">
              <div className="h-3 bg-zinc-800 rounded w-1/2" />
              <div className="h-3 bg-zinc-800 rounded w-3/4" />
              <div className="h-3 bg-zinc-800 rounded w-2/3" />
            </div>
          ) : treeError ? (
            <div className="p-4 text-xs text-rose-400">{treeError}</div>
          ) : (
            Array.from<TreeNode>(treeRoot.children.values())
              .sort((a: TreeNode, b: TreeNode) => {
                const aIsDir = a.type === 'tree' || a.children.size > 0;
                const bIsDir = b.type === 'tree' || b.children.size > 0;
                if (aIsDir && !bIsDir) return -1;
                if (!aIsDir && bIsDir) return 1;
                return a.name.localeCompare(b.name);
              })
              .map((child: TreeNode) => renderNode(child, 0))
          )}
        </div>
      </div>

      {/* Right File Previewer */}
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
        {previewPath ? (
          <>
            {/* Header */}
            <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(previewPath)}
                <span className="font-mono text-xs font-semibold text-zinc-200 truncate">
                  {previewPath}
                </span>
                {changedFileMap.has(previewPath) && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded">
                    Modified in commit
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="copy-tree-file-btn"
                  type="button"
                  onClick={handleCopyPreview}
                  disabled={!previewContent}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono border border-zinc-700/80 transition-colors disabled:opacity-40"
                >
                  {hasCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Content view */}
            <div className="flex-1 overflow-auto p-3 font-mono text-xs select-text">
              {isLoadingPreview ? (
                <div className="flex items-center justify-center h-48 text-zinc-500 gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Loading content at {commitDetail.sha.substring(0, 7)}...</span>
                </div>
              ) : previewError ? (
                <div className="p-4 bg-rose-950/30 border border-rose-800/50 rounded-lg text-rose-300 text-xs">
                  {previewError}
                </div>
              ) : previewContent !== null ? (
                <pre className="p-3 text-zinc-200 bg-zinc-900/40 rounded-lg overflow-x-auto leading-relaxed">
                  <code>{previewContent}</code>
                </pre>
              ) : (
                <div className="text-zinc-500">No content</div>
              )}
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center p-8 text-center text-zinc-500 text-xs">
            <div>
              <Eye className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Click any file from the repository tree to preview its content at this commit.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
