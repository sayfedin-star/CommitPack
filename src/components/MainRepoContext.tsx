/**
 * @file src/components/MainRepoContext.tsx
 * @description Main Repository Context workspace with Full Tree Copy from branch `main`
 * (Flat Paths, Compact Tree, ASCII Tree) and Selected File Pack (virtualized tree,
 * per-file quick copy, tri-state selection, Context Budget Meter with 20% reserve,
 * instant search highlighting, token estimates, and Markdown/JSON export).
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  RefreshCw,
  Eye,
  AlertTriangle,
  Download,
  Trash2,
  X,
  FileCheck,
  CheckSquare,
  Square,
  MinusSquare,
  Layers,
  Code2,
  ListFilter,
  Sparkles,
  Info,
  Sliders,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import { GitHubTreeItem, GitHubCommitListItem } from '../types/github';
import {
  MainTreeNode,
  TreeCopyFormat,
  FilePackFormat,
  FolderCheckboxState,
  FilePackFetchProgress,
  CachedMainTree,
} from '../types/repo-context';
import {
  getHeadCommit,
  getRepoTree,
  getFileContent,
  isBinaryFile,
} from '../lib/github-api';
import {
  buildFlatPathsManifest,
  buildCompactTree,
  buildAsciiTree,
  generateSelectedFilesMarkdown,
  generateSelectedFilesJson,
  downloadTextFile,
  getCodeFenceLanguage,
  ContextBudgetMetadata,
} from '../lib/tree-formatter';
import {
  getCachedMainTree,
  setCachedMainTree,
} from '../lib/main-tree-cache';
import {
  getPersistedRepoContext,
  savePersistedRepoContext,
  getSavedContextBudget,
  saveContextBudget,
  ContextBudgetConfig,
} from '../lib/session-storage';

interface MainRepoContextProps {
  owner: string;
  repo: string;
  defaultBranch?: string;
  pat: string | null;
}

interface FetchedFileState {
  content: string;
  language?: string;
  isTooLarge?: boolean;
  binary?: boolean;
  error?: string;
}

interface FlatVirtualRow {
  id: string;
  name: string;
  path: string;
  depth: number;
  isFolder: boolean;
  isExpanded: boolean;
  isBinary: boolean;
  size?: number;
  node: MainTreeNode;
}

const BUDGET_PRESETS: Array<{ label: string; tokens: number }> = [
  { label: '32K', tokens: 32000 },
  { label: '64K', tokens: 64000 },
  { label: '128K', tokens: 128000 },
  { label: '200K', tokens: 200000 },
  { label: '1M', tokens: 1000000 },
];

/**
 * Derives appropriate file icon based on path extension.
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
 * Builds nested hierarchy and pre-computes descendant paths for efficient tri-state checks.
 */
function buildMainTreeStructure(items: GitHubTreeItem[]): MainTreeNode {
  const root: MainTreeNode = {
    name: 'root',
    path: '',
    type: 'tree',
    sha: '',
    isBinary: false,
    children: new Map(),
    descendantTextPaths: [],
    descendantBinaryPaths: [],
  };

  const blobItems = items.filter((it) => it.type === 'blob');

  blobItems.forEach((item) => {
    const parts = item.path.split('/');
    let current = root;
    const isBinary = isBinaryFile(item.path);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: currentPath,
          type: isLast ? 'blob' : 'tree',
          sha: isLast ? item.sha : '',
          size: isLast ? item.size : undefined,
          isBinary: isLast ? isBinary : false,
          children: new Map(),
          descendantTextPaths: [],
          descendantBinaryPaths: [],
        });
      }

      const child = current.children.get(part)!;

      if (isBinary) {
        if (!current.descendantBinaryPaths.includes(item.path)) {
          current.descendantBinaryPaths.push(item.path);
        }
      } else {
        if (!current.descendantTextPaths.includes(item.path)) {
          current.descendantTextPaths.push(item.path);
        }
      }

      current = child;
    }
  });

  return root;
}

/**
 * Recursively flattens visible hierarchy nodes for virtualized tree rendering.
 */
function flattenTreeNodes(
  node: MainTreeNode,
  depth: number,
  effectiveExpandedFolders: Set<string>,
  searchQuery: string,
  out: FlatVirtualRow[]
) {
  const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
    const aIsDir = a.type === 'tree' || a.children.size > 0;
    const bIsDir = b.type === 'tree' || b.children.size > 0;
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.name.localeCompare(b.name);
  });

  const q = (searchQuery || '').toLowerCase().trim();

  for (const child of sortedChildren) {
    const isFolder = child.type === 'tree' || child.children.size > 0;

    if (q) {
      const isSelfMatch =
        child.path.toLowerCase().includes(q) || child.name.toLowerCase().includes(q);
      const hasMatchingDescendant =
        child.descendantTextPaths.some((p) => p.toLowerCase().includes(q)) ||
        child.descendantBinaryPaths.some((p) => p.toLowerCase().includes(q));

      if (!isSelfMatch && !hasMatchingDescendant) {
        continue;
      }
    }

    const isExpanded = effectiveExpandedFolders.has(child.path);

    out.push({
      id: child.path,
      name: child.name,
      path: child.path,
      depth,
      isFolder,
      isExpanded,
      isBinary: child.isBinary,
      size: child.size,
      node: child,
    });

    if (isFolder && isExpanded) {
      flattenTreeNodes(child, depth + 1, effectiveExpandedFolders, searchQuery, out);
    }
  }
}

export interface DiagnosticErrorInfo {
  stage: 'Resolving main HEAD' | 'Fetching tree' | 'Rendering tree';
  message: string;
  targetBranch: string;
  resolvedSha?: string;
  timestamp: string;
}

export const MainRepoContext: React.FC<MainRepoContextProps> = ({
  owner,
  repo,
  defaultBranch = 'main',
  pat,
}) => {
  // Tree state
  const [cachedTree, setCachedTreeState] = useState<CachedMainTree | null>(null);
  const [isLoadingTree, setIsLoadingTree] = useState<boolean>(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<DiagnosticErrorInfo | null>(null);

  // Branch fallback confirmation dialog state
  const [showFallbackDialog, setShowFallbackDialog] = useState<boolean>(false);
  const [candidateFallbackBranch, setCandidateFallbackBranch] = useState<string>(defaultBranch);

  // Search and Tree UI state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [userExpandedFolders, setUserExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Per-file copy inline loading state
  const [copyingFilePath, setCopyingFilePath] = useState<string | null>(null);

  // Mobile local tab switcher: 'tree' | 'selected'
  const [mobileTab, setMobileTab] = useState<'tree' | 'selected'>('tree');

  // Selected file filter within the right panel
  const [selectedFilterQuery, setSelectedFilterQuery] = useState<string>('');

  // Selected file preview modal / drawer
  const [isPreviewPackOpen, setIsPreviewPackOpen] = useState<boolean>(false);
  const [previewPackFormat, setPreviewPackFormat] = useState<FilePackFormat>('markdown');
  const [previewPackContent, setPreviewPackContent] = useState<string>('');
  const [isPreviewPackLoading, setIsPreviewPackLoading] = useState<boolean>(false);

  // Full Tree Copy confirmation for >500 files
  const [confirmCountThreshold, setConfirmCountThreshold] = useState<number | null>(null);
  const [pendingCopyFormat, setPendingCopyFormat] = useState<TreeCopyFormat | null>(null);

  // Full Tree Preview Modal
  const [isPreviewFullTreeOpen, setIsPreviewFullTreeOpen] = useState<boolean>(false);
  const [fullTreePreviewFormat, setFullTreePreviewFormat] = useState<TreeCopyFormat>('compact');

  // Active / focused breadcrumb path
  const [activeBreadcrumbPath, setActiveBreadcrumbPath] = useState<string>('');

  // Fetching & Export Progress
  const [fetchProgress, setFetchProgress] = useState<FilePackFetchProgress | null>(null);
  const [fetchedContentMap, setFetchedContentMap] = useState<Map<string, FetchedFileState>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  // Context Budget state & target selector
  const [contextBudgetConfig, setContextBudgetConfig] = useState<ContextBudgetConfig>(() => {
    return getSavedContextBudget(owner, repo);
  });
  const [isCustomBudgetModalOpen, setIsCustomBudgetModalOpen] = useState<boolean>(false);
  const [customBudgetInput, setCustomBudgetInput] = useState<string>('');
  const [budgetHighWarningConfirm, setBudgetHighWarningConfirm] = useState<{
    action: () => void;
    percent: number;
  } | null>(null);

  // Virtualizer DOM ref for left tree container
  const treeContainerRef = useRef<HTMLDivElement>(null);

  // Toast / feedback message
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  const showToast = useCallback((msg: string, isError: boolean = false) => {
    if (isError) {
      setToastError(msg);
      setTimeout(() => setToastError(null), 5000);
    } else {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3500);
    }
  }, []);

  // Copy diagnostic info to clipboard
  const handleCopyDiagnostics = useCallback(() => {
    if (!diagnosticError) return;
    const diagData = {
      repository: `${owner}/${repo}`,
      targetBranch: diagnosticError.targetBranch,
      resolvedSha: diagnosticError.resolvedSha || 'unresolved',
      failedStage: diagnosticError.stage,
      errorMessage: diagnosticError.message,
      timestamp: diagnosticError.timestamp,
      hasToken: Boolean(pat),
    };
    navigator.clipboard.writeText(JSON.stringify(diagData, null, 2));
    showToast('Diagnostics copied to clipboard.');
  }, [diagnosticError, owner, repo, pat, showToast]);

  // Restore persisted state on repo change
  useEffect(() => {
    const saved = getPersistedRepoContext(owner, repo);
    if (saved.selectedPaths && saved.selectedPaths.length > 0) {
      setSelectedPaths(new Set(saved.selectedPaths));
    } else {
      setSelectedPaths(new Set());
    }
    setContextBudgetConfig(getSavedContextBudget(owner, repo));
  }, [owner, repo]);

  // Persist selected paths when updated
  const updateSelectedPaths = useCallback((newSet: Set<string>) => {
    setSelectedPaths(newSet);
    const currentPersisted = getPersistedRepoContext(owner, repo);
    savePersistedRepoContext(owner, repo, {
      ...currentPersisted,
      activeMode: 'main-context',
      selectedPaths: Array.from<string>(newSet),
    });
  }, [owner, repo]);

  // Handle target budget change
  const handleSelectBudgetPreset = (tokens: number, isCustom: boolean = false) => {
    const newConfig: ContextBudgetConfig = { targetTokens: tokens, isCustom };
    setContextBudgetConfig(newConfig);
    saveContextBudget(owner, repo, newConfig);
    showToast(`Context target set to ${tokens.toLocaleString()} tokens`);
  };

  const handleApplyCustomBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(customBudgetInput.replace(/[^0-9]/g, ''), 10);
    if (val && val >= 1000 && val <= 10000000) {
      handleSelectBudgetPreset(val, true);
      setIsCustomBudgetModalOpen(false);
      setCustomBudgetInput('');
    } else {
      showToast('Please enter a valid token count between 1,000 and 10,000,000.', true);
    }
  };

  // Fetch or retrieve cached main tree
  const loadMainTree = useCallback(
    async (forceRefresh: boolean = false, approvedBranchOverride?: string) => {
      const persisted = getPersistedRepoContext(owner, repo);
      const approvedBranch = approvedBranchOverride || persisted.approvedFallbackBranch;

      if (!forceRefresh) {
        const cached = getCachedMainTree(owner, repo);
        if (cached) {
          setCachedTreeState(cached);
          const topFolders = new Set<string>();
          cached.items.forEach((item) => {
            if (item.type === 'tree') {
              const firstSeg = item.path.split('/')[0];
              topFolders.add(firstSeg);
            }
          });
          setUserExpandedFolders((prev) => (prev.size === 0 ? topFolders : prev));
          setIsLoadingTree(false);
          setTreeError(null);
          setDiagnosticError(null);
          return;
        }
      }

      setIsLoadingTree(true);
      setTreeError(null);
      setDiagnosticError(null);
      setShowFallbackDialog(false);

      let currentStage: 'Resolving main HEAD' | 'Fetching tree' | 'Rendering tree' = 'Resolving main HEAD';
      let branchToUse = approvedBranch || defaultBranch || 'main';
      let isFallback = false;
      let resolvedHeadSha = '';

      try {
        currentStage = 'Resolving main HEAD';
        if (approvedBranch && approvedBranch !== 'main') {
          branchToUse = approvedBranch;
          isFallback = true;
        }

        let headCommit: GitHubCommitListItem | null = null;
        try {
          headCommit = await getHeadCommit(owner, repo, branchToUse, pat);
        } catch {
          // If trying main failed, and default branch is different (e.g. master), try default branch
          if (branchToUse === 'main' && defaultBranch && defaultBranch !== 'main') {
            try {
              branchToUse = defaultBranch;
              isFallback = true;
              headCommit = await getHeadCommit(owner, repo, branchToUse, pat);
            } catch {
              // will trigger candidate dialog or error below
            }
          }
        }

        if (!headCommit && branchToUse === 'main') {
          setCandidateFallbackBranch(defaultBranch || 'master');
          setShowFallbackDialog(true);
          setIsLoadingTree(false);
          return;
        }

        if (!headCommit) {
          throw new Error(`Failed to resolve commit HEAD for branch '${branchToUse}' on ${owner}/${repo}.`);
        }

        resolvedHeadSha = headCommit.sha;

        // Stage 2: Fetching tree
        currentStage = 'Fetching tree';
        const treeData = await getRepoTree(owner, repo, resolvedHeadSha, pat);

        // Stage 3: Rendering & Caching tree
        currentStage = 'Rendering tree';
        const items = treeData.tree || [];

        const newCachedTree: CachedMainTree = {
          owner,
          repo,
          branch: branchToUse,
          sha: resolvedHeadSha,
          isFallback,
          truncated: Boolean(treeData.truncated),
          items,
          fetchedAt: Date.now(),
        };

        setCachedMainTree(owner, repo, newCachedTree);
        setCachedTreeState(newCachedTree);

        // Auto-expand top level folders
        const topFolders = new Set<string>();
        items.forEach((item) => {
          if (item.type === 'tree') {
            const firstSeg = item.path.split('/')[0];
            topFolders.add(firstSeg);
          }
        });
        setUserExpandedFolders(topFolders);
        setIsLoadingTree(false);
      } catch (err: unknown) {
        const errorMsg = (err as Error).message || 'Failed to inspect main repository context';
        setTreeError(errorMsg);
        setDiagnosticError({
          stage: currentStage,
          message: errorMsg,
          targetBranch: branchToUse,
          resolvedSha: resolvedHeadSha,
          timestamp: new Date().toISOString(),
        });
        setIsLoadingTree(false);
      }
    },
    [owner, repo, defaultBranch, pat]
  );

  // Initial load
  useEffect(() => {
    if (owner && repo) {
      loadMainTree(false);
    }
  }, [owner, repo, loadMainTree]);

  // Handle fallback branch acceptance
  const handleApproveFallbackBranch = (branch: string) => {
    setShowFallbackDialog(false);
    const currentPersisted = getPersistedRepoContext(owner, repo);
    savePersistedRepoContext(owner, repo, {
      ...currentPersisted,
      approvedFallbackBranch: branch,
    });
    loadMainTree(true, branch);
  };

  // Build tree node hierarchy from cached items
  const treeRoot = useMemo(() => {
    if (!cachedTree || !cachedTree.items) {
      return {
        name: 'root',
        path: '',
        type: 'tree',
        sha: '',
        isBinary: false,
        children: new Map(),
        descendantTextPaths: [],
        descendantBinaryPaths: [],
      } as MainTreeNode;
    }
    return buildMainTreeStructure(cachedTree.items);
  }, [cachedTree]);

  // Map of file paths to raw byte sizes
  const pathSizeMap = useMemo(() => {
    const map = new Map<string, number>();
    if (cachedTree?.items) {
      cachedTree.items.forEach((it) => {
        if (it.size) map.set(it.path, it.size);
      });
    }
    return map;
  }, [cachedTree]);

  // Flattened list of all file blob paths in the main tree
  const allBlobPaths = useMemo(() => {
    if (!cachedTree) return [];
    return cachedTree.items
      .filter((i) => i.type === 'blob')
      .map((i) => i.path)
      .sort((a, b) => a.localeCompare(b));
  }, [cachedTree]);

  // All text blob paths in the main tree
  const allTextBlobPaths = useMemo(() => {
    return allBlobPaths.filter((p) => !isBinaryFile(p));
  }, [allBlobPaths]);

  // Search matching paths and auto-expanded branches
  const { matchingPaths, searchExpandedFolders } = useMemo(() => {
    const safeQ = (searchQuery || '').trim();
    if (!safeQ) {
      return { matchingPaths: new Set<string>(), searchExpandedFolders: new Set<string>() };
    }

    const q = safeQ.toLowerCase();
    const matched = new Set<string>();
    const expanded = new Set<string>();

    allBlobPaths.forEach((path) => {
      const lower = path.toLowerCase();
      const fileName = path.split('/').pop()?.toLowerCase() || '';

      if (lower.includes(q) || fileName.includes(q)) {
        matched.add(path);

        const parts = path.split('/');
        let acc = '';
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc ? `${acc}/${parts[i]}` : parts[i];
          expanded.add(acc);
        }
      }
    });

    return { matchingPaths: matched, searchExpandedFolders: expanded };
  }, [searchQuery, allBlobPaths]);

  // Effective expanded folders
  const effectiveExpandedFolders = useMemo(() => {
    if (searchQuery && searchQuery.trim()) {
      return new Set([...userExpandedFolders, ...searchExpandedFolders]);
    }
    return userExpandedFolders;
  }, [userExpandedFolders, searchExpandedFolders, searchQuery]);

  const toggleFolder = useCallback((folderPath: string) => {
    setUserExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);

  const handleCollapseAllFolders = useCallback(() => {
    setUserExpandedFolders(new Set());
    if (searchQuery) {
      setSearchQuery('');
    }
    showToast('Collapsed all folders');
  }, [searchQuery, showToast]);

  const handleExpandAllFolders = useCallback(() => {
    if (!cachedTree?.items) return;
    const allFolders = new Set<string>();
    cachedTree.items.forEach((item) => {
      if (item.type === 'tree') {
        allFolders.add(item.path);
      } else {
        const parts = item.path.split('/');
        for (let i = 1; i < parts.length; i++) {
          allFolders.add(parts.slice(0, i).join('/'));
        }
      }
    });
    setUserExpandedFolders(allFolders);
    showToast('Expanded all folders');
  }, [cachedTree, showToast]);

  // -------------------------------------------------------------
  // VIRTUALIZED TREE ROWS DERIVATION
  // -------------------------------------------------------------

  const visibleTreeRows = useMemo(() => {
    const rows: FlatVirtualRow[] = [];
    flattenTreeNodes(treeRoot, 0, effectiveExpandedFolders, searchQuery, rows);
    return rows;
  }, [treeRoot, effectiveExpandedFolders, searchQuery]);

  const rowVirtualizer = useVirtualizer({
    count: visibleTreeRows.length,
    getScrollElement: () => treeContainerRef.current,
    estimateSize: () => 28,
    overscan: 20,
  });

  // -------------------------------------------------------------
  // SELECTION & TRI-STATE LOGIC
  // -------------------------------------------------------------

  const getFolderCheckboxState = useCallback(
    (node: MainTreeNode): FolderCheckboxState => {
      if (node.descendantTextPaths.length === 0) {
        return 'unchecked';
      }

      let selectedCount = 0;
      for (const p of node.descendantTextPaths) {
        if (selectedPaths.has(p)) {
          selectedCount++;
        }
      }

      if (selectedCount === 0) return 'unchecked';
      if (selectedCount === node.descendantTextPaths.length) return 'checked';
      return 'indeterminate';
    },
    [selectedPaths]
  );

  const handleToggleFolderCheckbox = useCallback(
    (node: MainTreeNode, e: React.MouseEvent) => {
      e.stopPropagation();
      const currentState = getFolderCheckboxState(node);
      const nextSet = new Set(selectedPaths);

      if (currentState === 'checked') {
        node.descendantTextPaths.forEach((p) => nextSet.delete(p));
      } else {
        node.descendantTextPaths.forEach((p) => nextSet.add(p));
      }

      updateSelectedPaths(nextSet);
    },
    [getFolderCheckboxState, selectedPaths, updateSelectedPaths]
  );

  const handleToggleFileCheckbox = useCallback(
    (path: string, isBinary: boolean, e: React.MouseEvent) => {
      e.stopPropagation();
      if (isBinary) return;

      const nextSet = new Set(selectedPaths);
      if (nextSet.has(path)) {
        nextSet.delete(path);
      } else {
        nextSet.add(path);
      }
      updateSelectedPaths(nextSet);
    },
    [selectedPaths, updateSelectedPaths]
  );

  const handleRemoveSelectedFile = (path: string) => {
    const nextSet = new Set(selectedPaths);
    nextSet.delete(path);
    updateSelectedPaths(nextSet);
  };

  const handleClearSelection = () => {
    updateSelectedPaths(new Set());
  };

  const handleSelectAllTextFiles = () => {
    updateSelectedPaths(new Set(allTextBlobPaths));
  };

  const selectedTextCount = selectedPaths.size;

  // Selected files array sorted deterministically
  const sortedSelectedList = useMemo(() => {
    return Array.from<string>(selectedPaths).sort((a, b) => a.localeCompare(b));
  }, [selectedPaths]);

  // Filtered selected files for the right panel search
  const filteredSelectedList = useMemo(() => {
    const safeQ = (selectedFilterQuery || '').trim();
    if (!safeQ) return sortedSelectedList;
    const q = safeQ.toLowerCase();
    return sortedSelectedList.filter((p) => p.toLowerCase().includes(q));
  }, [sortedSelectedList, selectedFilterQuery]);

  // Estimated total bytes and tokens for selected files
  const { totalEstimatedBytes, estimatedTokenCount } = useMemo(() => {
    let bytes = 0;
    selectedPaths.forEach((p) => {
      bytes += pathSizeMap.get(p) || 1024;
    });
    const tokens = Math.round(bytes / 4);
    return { totalEstimatedBytes: bytes, estimatedTokenCount: tokens };
  }, [selectedPaths, pathSizeMap]);

  // -------------------------------------------------------------
  // CONTEXT BUDGET CALCULATIONS (20% RESERVATION)
  // -------------------------------------------------------------

  const targetTokens = contextBudgetConfig.targetTokens || 128000;
  const usableFileTokens = Math.round(targetTokens * 0.8);
  const reservedTokens = targetTokens - usableFileTokens;
  const estimatedSelectedTokens = estimatedTokenCount;
  const usagePercent = usableFileTokens > 0 ? Math.round((estimatedSelectedTokens / usableFileTokens) * 100) : 0;

  // Context budget metadata for export formats
  const contextBudgetMetadata: ContextBudgetMetadata = useMemo(() => ({
    targetTokens,
    reservedTokens,
    usableFileTokens,
    estimatedSelectedTokens,
    usagePercent,
  }), [targetTokens, reservedTokens, usableFileTokens, estimatedSelectedTokens, usagePercent]);

  // Color logic for Context Budget meter
  const budgetColorClass = useMemo(() => {
    if (usagePercent < 50) {
      return {
        text: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-500',
        badge: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
      };
    }
    if (usagePercent < 70) {
      return {
        text: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500',
        badge: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
      };
    }
    if (usagePercent < 85) {
      return {
        text: 'text-orange-600 dark:text-orange-400',
        bg: 'bg-orange-500',
        badge: 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/60',
      };
    }
    return {
      text: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-500',
      badge: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
    };
  }, [usagePercent]);

  // -------------------------------------------------------------
  // FEATURE: FAST SINGLE-FILE COPY ACTION
  // -------------------------------------------------------------

  const handleCopySingleFile = async (filePath: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!cachedTree) return;
    setCopyingFilePath(filePath);
    try {
      const branch = cachedTree.branch;
      const res = await getFileContent(owner, repo, filePath, branch, pat);
      const shortSha = cachedTree.sha.length > 7 ? cachedTree.sha.substring(0, 7) : cachedTree.sha;
      const lang = getCodeFenceLanguage(filePath);
      const content = res.content || '';
      const md = `# Repository File\n\n- Repository: ${owner}/${repo}\n- Branch: ${branch}\n- Ref: ${shortSha}\n- Path: ${filePath}\n\n\`\`\`${lang}\n${content}\n\`\`\`\n`;
      await navigator.clipboard.writeText(md);
      showToast(`Copied file: ${filePath}`);
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to fetch file content';
      showToast(`Failed to copy file '${filePath}': ${msg}`, true);
    } finally {
      setCopyingFilePath(null);
    }
  };

  // -------------------------------------------------------------
  // FEATURE SET A: FULL TREE COPY
  // -------------------------------------------------------------

  const executeFullTreeCopy = async (format: TreeCopyFormat) => {
    if (!cachedTree || allBlobPaths.length === 0) {
      showToast('No repository tree data available.', true);
      return;
    }

    const headerOptions = {
      repo: `${owner}/${repo}`,
      branch: cachedTree.branch,
      ref: cachedTree.sha,
      count: allBlobPaths.length,
    };

    let textOutput = '';
    if (format === 'flat') {
      textOutput = buildFlatPathsManifest(allBlobPaths, headerOptions);
    } else if (format === 'compact') {
      textOutput = buildCompactTree(allBlobPaths, headerOptions);
    } else if (format === 'ascii') {
      textOutput = buildAsciiTree(allBlobPaths, headerOptions);
    }

    try {
      await navigator.clipboard.writeText(textOutput);
      setCopiedFormat(format);
      showToast(`Copied full tree (${format}) — ${allBlobPaths.length} files`);
      setTimeout(() => setCopiedFormat(null), 2500);
    } catch (err: unknown) {
      showToast(`Clipboard copy failed: ${(err as Error).message}. Try the preview action.`, true);
    }
  };

  const handleFullTreeCopyClick = (format: TreeCopyFormat) => {
    if (allBlobPaths.length > 500) {
      setConfirmCountThreshold(allBlobPaths.length);
      setPendingCopyFormat(format);
      return;
    }
    executeFullTreeCopy(format);
  };

  const handleConfirmLargeTreeCopy = () => {
    if (pendingCopyFormat) {
      executeFullTreeCopy(pendingCopyFormat);
    }
    setConfirmCountThreshold(null);
    setPendingCopyFormat(null);
  };

  // Generate full tree preview text
  const fullTreePreviewText = useMemo(() => {
    if (!cachedTree || allBlobPaths.length === 0) return '';
    const headerOptions = {
      repo: `${owner}/${repo}`,
      branch: cachedTree.branch,
      ref: cachedTree.sha,
      count: allBlobPaths.length,
    };
    if (fullTreePreviewFormat === 'flat') {
      return buildFlatPathsManifest(allBlobPaths, headerOptions);
    }
    if (fullTreePreviewFormat === 'compact') {
      return buildCompactTree(allBlobPaths, headerOptions);
    }
    return buildAsciiTree(allBlobPaths, headerOptions);
  }, [cachedTree, allBlobPaths, owner, repo, fullTreePreviewFormat]);

  // -------------------------------------------------------------
  // FEATURE SET B: SELECTED FILE PACK & CONTENT FETCHING
  // -------------------------------------------------------------

  const fetchSelectedContents = async (
    targetPaths: string[]
  ): Promise<{
    files: Array<{ path: string; content: string; language: string }>;
    skipped: Array<{ path: string; reason: string }>;
    failed: Array<{ path: string; error: string }>;
  }> => {
    if (!cachedTree) {
      throw new Error('Repository tree is not initialized.');
    }

    const branch = cachedTree.branch;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const files: Array<{ path: string; content: string; language: string }> = [];
    const skipped: Array<{ path: string; reason: string }> = [];
    const failed: Array<{ path: string; error: string }> = [];

    const newMap = new Map<string, FetchedFileState>(fetchedContentMap);

    const sortedPaths = [...targetPaths].sort((a, b) => a.localeCompare(b));

    for (let i = 0; i < sortedPaths.length; i++) {
      if (controller.signal.aborted) {
        throw new Error('Fetch operation was cancelled by user.');
      }

      const filePath = sortedPaths[i];

      setFetchProgress({
        total: sortedPaths.length,
        current: i + 1,
        currentPath: filePath,
        isFetching: true,
      });

      if (newMap.has(filePath)) {
        const item = newMap.get(filePath)!;
        if (item.error) {
          failed.push({ path: filePath, error: item.error });
        } else if (item.binary) {
          skipped.push({ path: filePath, reason: 'binary file' });
        } else {
          files.push({
            path: filePath,
            content: item.content,
            language: item.language || getCodeFenceLanguage(filePath),
          });
        }
        continue;
      }

      if (isBinaryFile(filePath)) {
        skipped.push({ path: filePath, reason: 'binary file' });
        newMap.set(filePath, { content: '', binary: true });
        continue;
      }

      try {
        const res = await getFileContent(owner, repo, filePath, branch, pat, controller.signal);
        if (res.binary) {
          skipped.push({ path: filePath, reason: 'binary file' });
          newMap.set(filePath, { content: '', binary: true });
        } else if (res.isTooLarge) {
          skipped.push({ path: filePath, reason: 'file exceeds 100MB' });
          newMap.set(filePath, { content: res.content, isTooLarge: true });
        } else {
          const lang = getCodeFenceLanguage(filePath);
          files.push({ path: filePath, content: res.content, language: lang });
          newMap.set(filePath, { content: res.content, language: lang });
        }
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') {
          throw err;
        }
        const errorMsg = (err as Error).message || '404 or network failure';
        failed.push({ path: filePath, error: errorMsg });
        newMap.set(filePath, { content: '', error: errorMsg });
      }
    }

    setFetchedContentMap(newMap);
    setFetchProgress(null);
    abortControllerRef.current = null;

    return { files, skipped, failed };
  };

  const handleCancelFetch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setFetchProgress(null);
    showToast('Fetch operation cancelled.');
  };

  const performExportSelected = async (format: FilePackFormat, isDownload: boolean = false) => {
    if (selectedPaths.size === 0) {
      showToast('No text files selected. Select files or folders first.', true);
      return;
    }

    try {
      const { files, skipped, failed } = await fetchSelectedContents(Array.from<string>(selectedPaths));

      if (!cachedTree) return;

      const packOptions = {
        repo: `${owner}/${repo}`,
        branch: cachedTree.branch,
        ref: cachedTree.sha,
        files,
        skipped,
        failed,
        contextBudget: contextBudgetMetadata,
      };

      if (format === 'markdown') {
        const md = generateSelectedFilesMarkdown(packOptions);
        if (isDownload) {
          const filename = `${repo}-${cachedTree.branch}-selected-files.md`;
          downloadTextFile(filename, md, 'text/markdown');
          showToast(`Downloaded ${files.length} selected files as Markdown`);
        } else {
          await navigator.clipboard.writeText(md);
          showToast(`Copied selected files as Markdown (${files.length} files)`);
        }
      } else {
        const json = generateSelectedFilesJson(packOptions);
        if (isDownload) {
          const filename = `${repo}-${cachedTree.branch}-selected-files.json`;
          downloadTextFile(filename, json, 'application/json');
          showToast(`Downloaded ${files.length} selected files as JSON`);
        } else {
          await navigator.clipboard.writeText(json);
          showToast(`Copied selected files as JSON (${files.length} files)`);
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        showToast(`Failed to export selected pack: ${(err as Error).message}`, true);
      }
    }
  };

  // Safe wrapper checking the 85% budget confirmation threshold
  const handleExportSelected = (format: FilePackFormat, isDownload: boolean = false) => {
    if (usagePercent >= 85) {
      setBudgetHighWarningConfirm({
        action: () => performExportSelected(format, isDownload),
        percent: usagePercent,
      });
      return;
    }
    performExportSelected(format, isDownload);
  };

  // Handle opening preview pack modal
  const performOpenPackPreview = async (format: FilePackFormat) => {
    if (selectedPaths.size === 0) {
      showToast('No text files selected.', true);
      return;
    }
    setPreviewPackFormat(format);
    setIsPreviewPackOpen(true);
    setIsPreviewPackLoading(true);
    try {
      const { files, skipped, failed } = await fetchSelectedContents(Array.from<string>(selectedPaths));
      if (!cachedTree) return;
      const packOptions = {
        repo: `${owner}/${repo}`,
        branch: cachedTree.branch,
        ref: cachedTree.sha,
        files,
        skipped,
        failed,
        contextBudget: contextBudgetMetadata,
      };
      if (format === 'markdown') {
        setPreviewPackContent(generateSelectedFilesMarkdown(packOptions));
      } else {
        setPreviewPackContent(generateSelectedFilesJson(packOptions));
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        setPreviewPackContent(`Error generating preview: ${(err as Error).message}`);
      }
    } finally {
      setIsPreviewPackLoading(false);
    }
  };

  const handleOpenPackPreview = (format: FilePackFormat) => {
    if (usagePercent >= 85) {
      setBudgetHighWarningConfirm({
        action: () => performOpenPackPreview(format),
        percent: usagePercent,
      });
      return;
    }
    performOpenPackPreview(format);
  };

  // Helper to render matched search text
  const highlightMatch = (text: string) => {
    if (!text) return '';
    const safeQ = (searchQuery || '').trim();
    if (!safeQ) return text;
    const q = safeQ.toLowerCase();
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;

    return (
      <>
        {text.substring(0, idx)}
        <mark className="bg-amber-200 dark:bg-amber-400/30 text-amber-900 dark:text-amber-200 rounded px-0.5 font-bold">
          {text.substring(idx, idx + q.length)}
        </mark>
        {text.substring(idx + q.length)}
      </>
    );
  };

  return (
    <div
      id="main-repo-context-root"
      className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 font-sans select-none overflow-hidden"
    >
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          id="repo-context-toast"
          className="fixed top-16 right-4 z-50 bg-slate-900 dark:bg-zinc-800 text-white border border-slate-700 dark:border-zinc-700 px-4 py-2 rounded-lg shadow-xl text-xs font-mono flex items-center gap-2 animate-in fade-in slide-in-from-top-2"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {toastError && (
        <div
          id="repo-context-error-toast"
          className="fixed top-16 right-4 z-50 bg-rose-900 text-rose-100 border border-rose-700 px-4 py-2.5 rounded-lg shadow-xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-2 max-w-md"
        >
          <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
          <span className="flex-1">{toastError}</span>
          <button
            type="button"
            onClick={() => setToastError(null)}
            className="text-rose-300 hover:text-white p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION 1: TOP SUMMARY BAR & FULL TREE COPY TOOLBAR */}
      {/* ========================================================= */}
      <div
        id="main-repo-context-header"
        className="px-3 sm:px-4 py-2.5 border-b border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3 shrink-0"
      >
        {/* Left: Branch & Ref metadata */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="font-bold text-slate-900 dark:text-zinc-100">
              {owner}/{repo}
            </span>
            <span className="text-slate-400 dark:text-zinc-500">@</span>
            <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 font-semibold">
              {cachedTree?.branch || defaultBranch || 'main'}
            </span>
            {cachedTree?.sha && (
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 hidden sm:inline">
                ({cachedTree.sha.substring(0, 7)})
              </span>
            )}
            {cachedTree?.isFallback && (
              <span
                title="Branch 'main' was not found; automatically fell back to default branch."
                className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 font-sans"
              >
                default branch
              </span>
            )}
          </div>

          {cachedTree && (
            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-700/60">
              {allBlobPaths.length} files ({allTextBlobPaths.length} text)
            </span>
          )}

          {cachedTree?.truncated && (
            <span
              title="GitHub API truncated large tree result (>100k items)"
              className="text-[10px] px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-mono"
            >
              truncated
            </span>
          )}
        </div>

        {/* Right: Full Tree Copy Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-mono text-slate-500 dark:text-zinc-400 hidden md:inline mr-1">
            Full Tree:
          </span>

          <button
            id="full-tree-copy-flat-btn"
            type="button"
            onClick={() => handleFullTreeCopyClick('flat')}
            disabled={isLoadingTree || !cachedTree}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded bg-white hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 transition-colors disabled:opacity-40 min-h-[32px] shadow-2xs"
            title="Copy all file paths as a flat list manifest"
          >
            {copiedFormat === 'flat' ? (
              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3 text-slate-400 dark:text-zinc-400" />
            )}
            <span>Flat</span>
          </button>

          <button
            id="full-tree-copy-compact-btn"
            type="button"
            onClick={() => handleFullTreeCopyClick('compact')}
            disabled={isLoadingTree || !cachedTree}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded bg-white hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 transition-colors disabled:opacity-40 min-h-[32px] shadow-2xs"
            title="Copy indented compact structure format"
          >
            {copiedFormat === 'compact' ? (
              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Layers className="w-3 h-3 text-slate-400 dark:text-zinc-400" />
            )}
            <span>Compact</span>
          </button>

          <button
            id="full-tree-copy-ascii-btn"
            type="button"
            onClick={() => handleFullTreeCopyClick('ascii')}
            disabled={isLoadingTree || !cachedTree}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded bg-white hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 transition-colors disabled:opacity-40 min-h-[32px] shadow-2xs"
            title="Copy directory tree with Unicode box-drawing characters"
          >
            {copiedFormat === 'ascii' ? (
              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Code2 className="w-3 h-3 text-slate-400 dark:text-zinc-400" />
            )}
            <span>ASCII</span>
          </button>

          <button
            id="full-tree-preview-btn"
            type="button"
            onClick={() => setIsPreviewFullTreeOpen(true)}
            disabled={isLoadingTree || !cachedTree}
            className="p-1.5 rounded bg-white hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 transition-colors disabled:opacity-40 min-h-[32px] min-w-[32px] flex items-center justify-center shadow-2xs"
            title="Preview formatted full tree before copying"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
          </button>

          <button
            id="refresh-main-tree-btn"
            type="button"
            onClick={() => loadMainTree(true)}
            disabled={isLoadingTree}
            className="p-1.5 rounded bg-white hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 transition-colors disabled:opacity-40 min-h-[32px] min-w-[32px] flex items-center justify-center shadow-2xs"
            title="Fetch fresh repository tree from GitHub"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTree ? 'animate-spin text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-zinc-400'}`} />
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SECTION 2: MOBILE TABS (FOR NARROW VIEWPORTS) */}
      {/* ========================================================= */}
      <div className="sm:hidden flex border-b border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('tree')}
          className={`flex-1 py-2 text-xs font-mono font-semibold text-center border-b-2 transition-colors ${
            mobileTab === 'tree'
              ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300 bg-white dark:bg-zinc-950'
              : 'border-transparent text-slate-600 dark:text-zinc-400'
          }`}
        >
          Repository Tree ({visibleTreeRows.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('selected')}
          className={`flex-1 py-2 text-xs font-mono font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            mobileTab === 'selected'
              ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300 bg-white dark:bg-zinc-950'
              : 'border-transparent text-slate-600 dark:text-zinc-400'
          }`}
        >
          <span>Selected Pack</span>
          <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px]">
            {selectedTextCount}
          </span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* SECTION 3: DUAL-COLUMN WORKSPACE */}
      {/* ========================================================= */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* ========================================================= */}
        {/* LEFT COLUMN: REPOSITORY TREE & QUICK FILE COPY */}
        {/* ========================================================= */}
        <section
          id="left-repo-tree-column"
          className={`w-full sm:w-[48%] lg:w-[45%] flex flex-col border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 min-w-0 ${
            mobileTab === 'selected' ? 'hidden sm:flex' : 'flex'
          }`}
        >
          {/* Tree Search and Filter Controls */}
          <div className="p-2 sm:p-2.5 border-b border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/40 flex items-center gap-1.5 shrink-0">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="main-tree-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter files (e.g. src/ or .tsx)..."
                className="w-full pl-8 pr-7 py-1 bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                  title="Clear filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              id="collapse-all-folders-btn"
              type="button"
              onClick={handleCollapseAllFolders}
              disabled={isLoadingTree}
              className="px-2 py-1 text-[11px] font-mono rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 transition-colors shrink-0 disabled:opacity-40 min-h-[30px] flex items-center gap-1 cursor-pointer"
              title="Collapse all folders"
            >
              <ChevronsDownUp className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
              <span className="hidden sm:inline">Collapse All</span>
            </button>

            <button
              id="expand-all-folders-btn"
              type="button"
              onClick={handleExpandAllFolders}
              disabled={isLoadingTree}
              className="px-2 py-1 text-[11px] font-mono rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 transition-colors shrink-0 disabled:opacity-40 min-h-[30px] flex items-center gap-1 cursor-pointer"
              title="Expand all folders"
            >
              <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
              <span className="hidden sm:inline">Expand All</span>
            </button>

            <button
              id="select-all-text-files-btn"
              type="button"
              onClick={handleSelectAllTextFiles}
              disabled={isLoadingTree || allTextBlobPaths.length === 0}
              className="px-2 py-1 text-[11px] font-mono rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 transition-colors shrink-0 disabled:opacity-40 min-h-[30px] cursor-pointer"
              title="Select all text files in repository"
            >
              All Text
            </button>
          </div>

          {/* Breadcrumb Path Banner */}
          {activeBreadcrumbPath && (
            <div
              id="active-tree-breadcrumb"
              className="px-3 py-1 bg-slate-100/90 dark:bg-zinc-900/80 border-b border-slate-200 dark:border-zinc-800/80 text-[10px] font-mono text-slate-600 dark:text-zinc-400 truncate shrink-0"
              title={activeBreadcrumbPath}
            >
              <span className="text-slate-400 dark:text-zinc-500">Path: </span>
              <span className="text-slate-800 dark:text-zinc-200 font-semibold">{activeBreadcrumbPath}</span>
            </div>
          )}

          {/* Tree View Container with Virtualization */}
          <div
            ref={treeContainerRef}
            id="virtual-tree-container"
            className="flex-1 overflow-y-auto p-1.5 focus:outline-none"
            tabIndex={0}
          >
            {isLoadingTree ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center space-y-3 p-6 text-slate-500 dark:text-zinc-400">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-mono">Fetching full tree from branch HEAD...</span>
              </div>
            ) : treeError ? (
              <div className="p-4 m-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-rose-800 dark:text-rose-200">Failed to load repository tree</h4>
                    <p className="text-xs font-mono text-rose-700 dark:text-rose-300 break-words">{treeError}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-rose-200 dark:border-rose-800/50">
                  <button
                    type="button"
                    onClick={() => loadMainTree(true)}
                    className="px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/60 dark:hover:bg-rose-900 text-rose-800 dark:text-rose-100 text-xs font-mono transition-colors"
                  >
                    Retry
                  </button>
                  {diagnosticError && (
                    <button
                      type="button"
                      onClick={handleCopyDiagnostics}
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-mono border border-slate-300 dark:border-zinc-700 transition-colors"
                    >
                      Copy Diagnostics
                    </button>
                  )}
                </div>
              </div>
            ) : visibleTreeRows.length === 0 ? (
              <div className="h-full min-h-[180px] flex flex-col items-center justify-center p-6 text-center space-y-2 text-slate-500 dark:text-zinc-500">
                <Search className="w-5 h-5 text-slate-400 dark:text-zinc-600" />
                <span className="text-xs font-mono">No matching files found for &quot;{searchQuery}&quot;</span>
              </div>
            ) : (
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = visibleTreeRows[virtualRow.index];
                  if (!item) return null;

                  if (item.isFolder) {
                    const checkboxState = getFolderCheckboxState(item.node);
                    const binaryCount = item.node.descendantBinaryPaths.length;

                    return (
                      <div
                        key={item.path}
                        id={`main-tree-folder-${item.path.replace(/[^a-zA-Z0-9]/g, '_')}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div
                          style={{ paddingLeft: `${item.depth * 14 + 4}px` }}
                          onMouseEnter={() => setActiveBreadcrumbPath(item.path)}
                          onClick={() => toggleFolder(item.path)}
                          className="h-full px-1.5 rounded flex items-center justify-between gap-1.5 hover:bg-slate-200/70 dark:hover:bg-zinc-900/80 cursor-pointer transition-colors group text-xs font-mono"
                        >
                          <div className="flex items-center gap-1 truncate min-w-0 flex-1">
                            <span className="text-slate-400 dark:text-zinc-500 p-0.5">
                              {item.isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </span>

                            <button
                              type="button"
                              aria-label={`Select folder ${item.name}`}
                              disabled={item.node.descendantTextPaths.length === 0}
                              onClick={(e) => handleToggleFolderCheckbox(item.node, e)}
                              className="text-slate-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors p-0.5 disabled:opacity-20 shrink-0 min-w-[20px] min-h-[20px] flex items-center justify-center"
                            >
                              {checkboxState === 'checked' ? (
                                <CheckSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 fill-indigo-100 dark:fill-indigo-950" />
                              ) : checkboxState === 'indeterminate' ? (
                                <MinusSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                              ) : (
                                <Square className="w-3.5 h-3.5 text-slate-300 dark:text-zinc-600 hover:text-slate-500 dark:hover:text-zinc-400" />
                              )}
                            </button>

                            {item.isExpanded ? (
                              <FolderOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            ) : (
                              <Folder className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 shrink-0" />
                            )}

                            <span
                              className="truncate text-slate-800 dark:text-zinc-200 font-medium"
                              title={item.path}
                            >
                              {highlightMatch(item.name)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400 dark:text-zinc-500 shrink-0 pr-1">
                            <span>{item.node.descendantTextPaths.length}</span>
                            {binaryCount > 0 && (
                              <span className="text-slate-400 dark:text-zinc-600">({binaryCount}b)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // File Item Row
                  const isSelected = selectedPaths.has(item.path);

                  return (
                    <div
                      key={item.path}
                      id={`main-tree-file-${item.path.replace(/[^a-zA-Z0-9]/g, '_')}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div
                        style={{ paddingLeft: `${item.depth * 14 + 18}px` }}
                        onMouseEnter={() => setActiveBreadcrumbPath(item.path)}
                        onClick={(e) => handleToggleFileCheckbox(item.path, item.isBinary, e)}
                        className={`h-full px-1.5 rounded flex items-center justify-between gap-1.5 transition-colors group cursor-pointer text-xs font-mono ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200'
                            : 'hover:bg-slate-200/70 dark:hover:bg-zinc-900/60 text-slate-700 dark:text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate min-w-0 flex-1">
                          <button
                            type="button"
                            aria-label={`Select file ${item.name}`}
                            disabled={item.isBinary}
                            aria-checked={isSelected}
                            onClick={(e) => handleToggleFileCheckbox(item.path, item.isBinary, e)}
                            className="text-slate-400 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors p-0.5 disabled:opacity-20 disabled:cursor-not-allowed shrink-0 min-w-[20px] min-h-[20px] flex items-center justify-center"
                          >
                            {item.isBinary ? (
                              <Square className="w-3.5 h-3.5 text-slate-300 dark:text-zinc-700" />
                            ) : isSelected ? (
                              <CheckSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 fill-indigo-100 dark:fill-indigo-950" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-slate-300 dark:text-zinc-600 hover:text-slate-500 dark:hover:text-zinc-400" />
                            )}
                          </button>

                          {getFileIcon(item.path, item.isBinary)}
                          <span
                            className="truncate"
                            title={item.path}
                          >
                            {highlightMatch(item.name)}
                          </span>
                        </div>

                        {/* Right side: Per-file copy button + size/binary badge */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!item.isBinary && (
                            <button
                              type="button"
                              onClick={(e) => handleCopySingleFile(item.path, e)}
                              disabled={copyingFilePath === item.path}
                              aria-label={`Copy ${item.path} as Markdown`}
                              title="Copy this file as Markdown"
                              className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus:opacity-100 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition-all flex items-center gap-1 shadow-2xs min-h-[22px]"
                            >
                              {copyingFilePath === item.path ? (
                                <>
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                                  <span className="text-[9px]">Copying...</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5 text-slate-400 dark:text-zinc-400" />
                                  <span className="text-[9px] hidden lg:inline">Copy file</span>
                                </>
                              )}
                            </button>
                          )}

                          {item.isBinary ? (
                            <span
                              title="Binary file — excluded from text Selected File Pack"
                              className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-900 text-slate-500 dark:text-zinc-500 border border-slate-200 dark:border-zinc-800 shrink-0"
                            >
                              Binary
                            </span>
                          ) : item.size ? (
                            <span className="text-[10px] text-slate-400 dark:text-zinc-500 shrink-0 font-mono">
                              {(item.size / 1024).toFixed(1)} KB
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: SELECTED FILE PACK & CONTEXT BUDGET METER */}
        {/* ========================================================= */}
        <section
          id="right-selected-files-column"
          className={`flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-950 relative ${
            mobileTab === 'tree' ? 'hidden sm:flex' : 'flex'
          }`}
        >
          {/* Panel Header with Context Target Selector & Budget Display */}
          <div className="p-3 sm:px-4 border-b border-slate-200 dark:border-zinc-800/80 bg-slate-50/80 dark:bg-zinc-900/40 flex flex-col gap-2.5 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Selected File Pack</span>
                </span>

                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700/80">
                  <strong className="text-indigo-600 dark:text-indigo-400">{selectedTextCount}</strong> files selected
                </span>

                {selectedTextCount > 0 && (
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800">
                    ~{(totalEstimatedBytes / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>

              {/* Context Budget Target Selector */}
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-slate-500 dark:text-zinc-400 hidden lg:inline">Target:</span>
                <div className="flex items-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded p-0.5 shadow-2xs">
                  {BUDGET_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleSelectBudgetPreset(preset.tokens, false)}
                      className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                        !contextBudgetConfig.isCustom && targetTokens === preset.tokens
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setCustomBudgetInput(String(targetTokens));
                      setIsCustomBudgetModalOpen(true);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                      contextBudgetConfig.isCustom
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                    title="Set custom context token target"
                  >
                    {contextBudgetConfig.isCustom ? `${Math.round(targetTokens / 1000)}k*` : 'Custom…'}
                  </button>
                </div>
              </div>
            </div>

            {/* Context Budget Progress Bar & Details */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between text-xs font-mono flex-wrap gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Estimated tokens:</span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200 text-[11px]">
                    <strong>{estimatedSelectedTokens.toLocaleString()}</strong> / {usableFileTokens.toLocaleString()} usable tokens
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded border font-bold ${budgetColorClass.badge}`}>
                    {usagePercent}%
                  </span>
                </div>

                <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                  (20% reserved: {reservedTokens.toLocaleString()} tokens)
                </span>
              </div>

              {/* Progress track */}
              <div className="w-full h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${budgetColorClass.bg} transition-all duration-300`}
                  style={{ width: `${Math.min(100, usagePercent)}%` }}
                />
              </div>
            </div>

            {/* 70%+ Budget Warning Banner */}
            {usagePercent >= 70 && selectedTextCount > 0 && (
              <div
                id="context-budget-warning"
                className="px-2.5 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Large context pack ({usagePercent}% usable budget). Consider removing unrelated files.</span>
                </div>
                <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400">
                  Target: {targetTokens.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Filter Selected Files (if selection has multiple files) */}
          {selectedTextCount > 6 && (
            <div className="px-3 py-1.5 border-b border-slate-200 dark:border-zinc-800/60 bg-slate-50 dark:bg-zinc-950 flex items-center gap-2 shrink-0">
              <ListFilter className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
              <input
                type="text"
                value={selectedFilterQuery}
                onChange={(e) => setSelectedFilterQuery(e.target.value)}
                placeholder="Filter selected files list..."
                className="w-full bg-transparent text-xs font-mono text-slate-900 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none"
              />
              {selectedFilterQuery && (
                <button
                  type="button"
                  onClick={() => setSelectedFilterQuery('')}
                  className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Scrollable Selected File List */}
          <div
            className="flex-1 overflow-y-auto p-3 space-y-1"
          >
            {selectedTextCount === 0 ? (
              <div
                id="selected-files-empty-state"
                className="h-full min-h-[260px] flex flex-col items-center justify-center p-6 text-center space-y-3"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-slate-400 dark:text-zinc-500">
                  <CheckSquare className="w-6 h-6 text-slate-400 dark:text-zinc-600" />
                </div>
                <div className="max-w-sm space-y-1">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-zinc-300">No files selected yet</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-500 leading-relaxed">
                    Select files or folders from the repository tree on the left. Only text files from{' '}
                    <code className="text-slate-700 dark:text-zinc-400">{cachedTree?.branch || 'main'}</code> can be included.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSelectAllTextFiles}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-indigo-700 dark:text-indigo-400 text-xs font-mono rounded border border-indigo-200 dark:border-zinc-800 transition-colors min-h-[36px]"
                >
                  Select all {allTextBlobPaths.length} text files
                </button>
              </div>
            ) : filteredSelectedList.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-slate-400 dark:text-zinc-500">
                No selected files matching &quot;{selectedFilterQuery}&quot;
              </div>
            ) : (
              filteredSelectedList.map((filePath) => {
                const size = pathSizeMap.get(filePath);
                return (
                  <div
                    key={filePath}
                    className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-zinc-900/60 dark:hover:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 flex items-center justify-between gap-3 text-xs font-mono transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getFileIcon(filePath, false)}
                      <span
                        className="text-slate-800 dark:text-zinc-200 truncate font-medium"
                        title={filePath}
                      >
                        {filePath}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {size && (
                        <span className="text-[10px] text-slate-500 dark:text-zinc-500 hidden sm:inline">
                          {(size / 1024).toFixed(1)} KB
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveSelectedFile(filePath)}
                        title={`Remove ${filePath} from selection`}
                        className="text-slate-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 transition-colors p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 min-w-[28px] min-h-[28px] flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* ========================================================= */}
      {/* SECTION 4: STICKY FOOTER SELECTED-FILES ACTION BAR */}
      {/* ========================================================= */}
      {selectedTextCount > 0 && (
        <footer
          id="sticky-selection-action-bar"
          style={{
            marginBottom: 'var(--debug-console-height, 0px)',
          }}
          className="shrink-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-slate-200 dark:border-zinc-800 px-4 py-2.5 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg z-30 transition-all duration-200"
        >
          {/* Progress info or summary */}
          <div className="flex items-center gap-2 text-xs font-mono w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="font-semibold text-slate-800 dark:text-zinc-200">
                Selected: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{selectedTextCount}</strong> {selectedTextCount === 1 ? 'file' : 'files'}
              </span>
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-[11px] text-slate-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-300 underline ml-2 transition-colors cursor-pointer"
                title="Clear selection"
              >
                Clear
              </button>
            </div>

            {fetchProgress && (
              <div className="flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/80 px-2.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                <RefreshCw className="w-3 h-3 animate-spin text-amber-600 dark:text-amber-400" />
                <span>
                  Fetching {fetchProgress.current}/{fetchProgress.total}...
                </span>
                <button
                  type="button"
                  onClick={handleCancelFetch}
                  className="text-rose-600 dark:text-rose-300 hover:underline ml-1 font-bold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <button
              id="preview-selected-pack-btn"
              type="button"
              onClick={() => handleOpenPackPreview('markdown')}
              disabled={selectedTextCount === 0 || !!fetchProgress}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-mono border border-slate-300 dark:border-zinc-700 transition-colors disabled:opacity-40 min-h-[36px] cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
              <span>Preview Pack</span>
            </button>

            <button
              id="copy-selected-markdown-btn"
              type="button"
              onClick={() => handleExportSelected('markdown', false)}
              disabled={selectedTextCount === 0 || !!fetchProgress}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-40 min-h-[36px] cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Markdown</span>
            </button>

            <button
              id="copy-selected-json-btn"
              type="button"
              onClick={() => handleExportSelected('json', false)}
              disabled={selectedTextCount === 0 || !!fetchProgress}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-semibold border border-slate-300 dark:border-zinc-700 transition-all disabled:opacity-40 min-h-[36px] cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
              <span>Copy JSON</span>
            </button>

            <button
              id="download-selected-md-btn"
              type="button"
              onClick={() => handleExportSelected('markdown', true)}
              disabled={selectedTextCount === 0 || !!fetchProgress}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 border border-slate-300 dark:border-zinc-700 transition-colors disabled:opacity-40 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              title="Download selected files as Markdown (.md)"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </footer>
      )}

      {/* ========================================================= */}
      {/* MODALS & DIALOGS */}
      {/* ========================================================= */}

      {/* Modal: Custom Context Target Modal */}
      {isCustomBudgetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Set Custom Context Target</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCustomBudgetModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyCustomBudget} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-600 dark:text-zinc-400 font-mono">
                  Context Window Target (tokens):
                </label>
                <input
                  type="number"
                  min="1000"
                  max="10000000"
                  step="1000"
                  value={customBudgetInput}
                  onChange={(e) => setCustomBudgetInput(e.target.value)}
                  placeholder="e.g. 500000"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg text-sm font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                />
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  20% is reserved for agent instructions &amp; model answers.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsCustomBudgetModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-mono rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded transition-colors"
                >
                  Set Budget
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: 85%+ Context Budget Safeguard Confirmation */}
      {budgetHighWarningConfirm && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-rose-300 dark:border-rose-800 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950 border border-rose-300 dark:border-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                  High Context Budget Warning
                </h3>
                <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
                  This pack uses <strong>{budgetHighWarningConfirm.percent}%</strong> of the usable context budget ({usableFileTokens.toLocaleString()} usable tokens).
                  Providing excessive context can degrade model accuracy and increase prompt costs. Continue anyway?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setBudgetHighWarningConfirm(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-mono rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const act = budgetHighWarningConfirm.action;
                  setBudgetHighWarningConfirm(null);
                  act();
                }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded transition-colors"
              >
                Continue anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: >500 Files Safeguard Warning */}
      {confirmCountThreshold !== null && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Large Repository Manifest</h3>
                <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
                  This repository contains <strong>{confirmCountThreshold}</strong> files. Copying the full tree may generate a large clipboard payload.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setConfirmCountThreshold(null);
                  setPendingCopyFormat(null);
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-mono rounded transition-colors"
              >
                Cancel
              </button>
              <button
                id="confirm-large-copy-btn"
                type="button"
                onClick={handleConfirmLargeTreeCopy}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded transition-colors"
              >
                Copy {confirmCountThreshold} files anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Full Tree Output Preview */}
      {isPreviewFullTreeOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl max-w-3xl w-full h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-zinc-950/70">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="font-bold text-xs text-slate-800 dark:text-zinc-200">
                  Full Tree Preview ({allBlobPaths.length} files)
                </span>
              </div>

              {/* Format Switcher */}
              <div className="flex items-center gap-1 bg-slate-200 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded p-0.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setFullTreePreviewFormat('flat')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    fullTreePreviewFormat === 'flat' ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 shadow-2xs font-bold' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  Flat
                </button>
                <button
                  type="button"
                  onClick={() => setFullTreePreviewFormat('compact')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    fullTreePreviewFormat === 'compact' ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 shadow-2xs font-bold' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  Compact
                </button>
                <button
                  type="button"
                  onClick={() => setFullTreePreviewFormat('ascii')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    fullTreePreviewFormat === 'ascii' ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 shadow-2xs font-bold' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  ASCII
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => executeFullTreeCopy(fullTreePreviewFormat)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-mono transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPreviewFullTreeOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 rounded hover:bg-slate-100 dark:hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-slate-900 font-mono text-xs text-zinc-100 select-text">
              <pre className="whitespace-pre">{fullTreePreviewText}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Selected File Pack Preview */}
      {isPreviewPackOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl max-w-4xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-zinc-950/70">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="font-bold text-xs text-slate-800 dark:text-zinc-200">
                  Selected File Pack Preview ({selectedTextCount} files)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-200 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded p-0.5 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => performOpenPackPreview('markdown')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      previewPackFormat === 'markdown' ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 shadow-2xs font-bold' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => performOpenPackPreview('json')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      previewPackFormat === 'json' ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 shadow-2xs font-bold' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    JSON
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(previewPackContent);
                    showToast(`Copied ${previewPackFormat} pack to clipboard`);
                  }}
                  disabled={isPreviewPackLoading || !previewPackContent}
                  className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-mono transition-colors disabled:opacity-50"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPreviewPackOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 rounded hover:bg-slate-100 dark:hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-slate-900 font-mono text-xs text-zinc-100 select-text">
              {isPreviewPackLoading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-2 text-zinc-400">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                  <span>Fetching file contents &amp; generating {previewPackFormat}...</span>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap">{previewPackContent}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Fallback Branch Confirmation Dialog */}
      {showFallbackDialog && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 flex items-center justify-center shrink-0">
                <Info className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Branch &apos;main&apos; Not Found</h3>
                <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
                  Repository <strong>{owner}/{repo}</strong> does not have a branch named <code>main</code>.
                  Would you like to inspect branch <strong>{candidateFallbackBranch}</strong> instead?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowFallbackDialog(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-mono rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApproveFallbackBranch(candidateFallbackBranch)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded transition-colors"
              >
                Use branch &apos;{candidateFallbackBranch}&apos;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
