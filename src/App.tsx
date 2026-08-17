/**
 * @file src/App.tsx
 * @description Main application controller for CommitPack — GitHub commit inspector
 * and AI agent packaging workshop with diff viewing, repository tree exploration,
 * full-content extraction, token estimation, ZIP generation, Compare Range mode,
 * File Filters & Presets, Agent Review prompt generation, and Review Sessions.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Package,
  GitCommit,
  GitPullRequest,
  FileCode2,
  FolderTree,
  Bot,
  Layers,
  Sparkles,
  AlertCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Zap,
  Info,
  Key,
  GitCompare,
  SlidersHorizontal,
  Bookmark,
} from 'lucide-react';
import {
  GitHubRepoInfo,
  GitHubBranch,
  GitHubCommitListItem,
  GitHubCommitDetail,
  RateLimitState,
  DebugLogEntry,
  ExtractionMode,
  ExtractionProgress,
  ParsedRepoUrl,
  GitHubCommitFile,
} from './types/github';
import {
  FileFilterConfig,
  FilterPresetName,
  ReviewSession,
  GitHubCompareResult,
  ContextFileItem,
} from './types/review';
import {
  getRepoInfo,
  getRepoBranches,
  getCommitList,
  getCommitDetail,
  getFileContent,
  getPreDeletionFileContent,
  checkRateLimit,
  subscribeToRateLimit,
  subscribeToDebugLogs,
  getHeadCommit,
  compareCommits,
  getCommitCountBetween,
} from './lib/github-api';
import { applyFileFilters, DEFAULT_FILTER_CONFIG } from './lib/file-filter';
import {
  getSavedFilterConfig,
  saveFilterConfig,
  getSavedTaskDraft,
  saveTaskDraft,
  getLastReviewedSha,
  saveLastReviewedSha,
} from './lib/session-storage';
import { BundleScopeOptions } from './lib/bundle-builder';
import { Header } from './components/Header';
import { TokenInput } from './components/TokenInput';
import { RepoInput } from './components/RepoInput';
import { Timeline } from './components/Timeline';
import { DiffViewer } from './components/DiffViewer';
import { FileExplorer } from './components/FileExplorer';
import { ExtractPanel } from './components/ExtractPanel';
import { ExportPanel } from './components/ExportPanel';
import { DebugConsole } from './components/DebugConsole';
import { FileFiltersPanel } from './components/FileFiltersPanel';
import { CompareRangeSelector } from './components/CompareRangeSelector';
import { ReviewSessionsModal } from './components/ReviewSessionsModal';

const LOCAL_STORAGE_PAT_KEY = 'commitpack_github_pat';
const LOCAL_STORAGE_LAST_REPO = 'commitpack_last_repo';
const LOCAL_STORAGE_PER_PAGE = 'commitpack_per_page';

/**
 * Root CommitPack Single Page Application component.
 */
export default function App() {
  // Authentication & Rate limit state
  const [pat, setPat] = useState<string | null>(() => {
    return localStorage.getItem(LOCAL_STORAGE_PAT_KEY);
  });
  const [rateLimit, setRateLimit] = useState<RateLimitState | null>(null);
  const [isPatModalOpen, setIsPatModalOpen] = useState<boolean>(false);
  const [isSessionsModalOpen, setIsSessionsModalOpen] = useState<boolean>(false);

  // Debug Console state
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);

  // Repository input & metadata state
  const [repoUrl, setRepoUrl] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_LAST_REPO) || 'facebook/react';
  });
  const [parsedRepo, setParsedRepo] = useState<ParsedRepoUrl | null>(null);
  const [repoInfo, setRepoInfo] = useState<GitHubRepoInfo | null>(null);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('main');
  const [perPage, setPerPage] = useState<number>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_PER_PAGE);
    return saved ? parseInt(saved, 10) : 25;
  });
  const [directSha, setDirectSha] = useState<string>('');

  // Mode Selection: Single Commit vs Compare Range
  const [reviewMode, setReviewMode] = useState<'single' | 'compare'>('single');
  const [baseSha, setBaseSha] = useState<string>('');
  const [headSha, setHeadSha] = useState<string>('');
  const [compareResult, setCompareResult] = useState<GitHubCompareResult | null>(null);
  const [isLoadingCompare, setIsLoadingCompare] = useState<boolean>(false);

  // Refresh & Latest Commit Detector state
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastCheckedTime, setLastCheckedTime] = useState<Date | null>(null);
  const [newCommitCount, setNewCommitCount] = useState<number>(0);
  const [autoCheckEnabled, setAutoCheckEnabled] = useState<boolean>(false);

  // Commits & Single Selection state
  const [commits, setCommits] = useState<GitHubCommitListItem[]>([]);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [commitDetail, setCommitDetail] = useState<GitHubCommitDetail | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);

  // Active view tab inside Commit Inspector: 'diff' | 'tree' | 'export'
  const [activeTab, setActiveTab] = useState<'diff' | 'tree' | 'export'>('diff');

  // File Filters state
  const [filterConfig, setFilterConfig] = useState<FileFilterConfig>(DEFAULT_FILTER_CONFIG);
  const [contextFiles, setContextFiles] = useState<ContextFileItem[]>([]);
  const [showExcludedInDiff, setShowExcludedInDiff] = useState<boolean>(false);

  // Review Task / Acceptance criteria state
  const [taskText, setTaskText] = useState<string>('');

  // Extraction state
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>('full');
  const [includePreDeletion, setIncludePreDeletion] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isFullyExtracted, setIsFullyExtracted] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress>({
    total: 0,
    current: 0,
    currentFilename: '',
    isComplete: false,
    isCancelled: false,
    errorCount: 0,
  });

  // Extraction cancellation ref
  const extractAbortControllerRef = useRef<AbortController | null>(null);

  // Global loading and error states
  const [isLoadingRepo, setIsLoadingRepo] = useState<boolean>(false);
  const [isLoadingCommits, setIsLoadingCommits] = useState<boolean>(false);
  const [isLoadingCommitDetail, setIsLoadingCommitDetail] = useState<boolean>(false);
  const [appError, setAppError] = useState<string | null>(null);

  // Last reviewed checkpoint for current repo and branch
  const lastReviewedSha = useMemo(() => {
    if (!repoInfo || !selectedBranch) return null;
    return getLastReviewedSha(repoInfo.owner.login, repoInfo.name, selectedBranch);
  }, [repoInfo, selectedBranch]);

  // Load saved task draft & filter config when repo or branch changes
  useEffect(() => {
    if (repoInfo && selectedBranch) {
      const savedTask = getSavedTaskDraft(repoInfo.owner.login, repoInfo.name, selectedBranch);
      setTaskText(savedTask);
      const savedFilters = getSavedFilterConfig(repoInfo.owner.login, repoInfo.name);
      setFilterConfig(savedFilters);
    }
  }, [repoInfo?.full_name, selectedBranch]);

  // Autosave task draft changes
  const handleTaskTextChange = (text: string) => {
    setTaskText(text);
    if (repoInfo && selectedBranch) {
      saveTaskDraft(repoInfo.owner.login, repoInfo.name, selectedBranch, text);
    }
  };

  // Autosave filter config changes
  const handleFilterConfigChange = (newConfig: FileFilterConfig) => {
    setFilterConfig(newConfig);
    if (repoInfo) {
      saveFilterConfig(repoInfo.owner.login, repoInfo.name, newConfig);
    }
  };

  // Register telemetry & rate limit subscribers on mount
  useEffect(() => {
    const unsubRateLimit = subscribeToRateLimit((state) => setRateLimit(state));
    const unsubDebug = subscribeToDebugLogs((entry) => {
      setDebugLogs((prev) => [entry, ...prev].slice(0, 150));
    });

    // Check initial rate limits
    checkRateLimit(pat).catch(() => {});

    return () => {
      unsubRateLimit();
      unsubDebug();
    };
  }, [pat]);

  // Persist PAT changes in localStorage
  const handleSavePat = (newToken: string | null) => {
    setPat(newToken);
    if (newToken) {
      localStorage.setItem(LOCAL_STORAGE_PAT_KEY, newToken);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_PAT_KEY);
    }
    checkRateLimit(newToken).catch(() => {});
  };

  // Inspect repository action
  const loadRepository = useCallback(
    async (targetOwner: string, targetRepo: string, branchName?: string, commitSha?: string) => {
      setAppError(null);
      setIsLoadingRepo(true);
      setCommitDetail(null);
      setSelectedSha(null);
      setCompareResult(null);
      setIsFullyExtracted(false);
      setNewCommitCount(0);

      try {
        // 1. Fetch repository summary info
        const info = await getRepoInfo(targetOwner, targetRepo, pat);
        setRepoInfo(info);
        localStorage.setItem(LOCAL_STORAGE_LAST_REPO, `${targetOwner}/${targetRepo}`);

        // 2. Fetch branches
        let fetchedBranches: GitHubBranch[] = [];
        try {
          fetchedBranches = await getRepoBranches(targetOwner, targetRepo, pat);
          setBranches(fetchedBranches);
        } catch {
          // If branches fail, fallback to default_branch
          fetchedBranches = [
            {
              name: info.default_branch || 'main',
              commit: { sha: '', url: '' },
              protected: false,
            },
          ];
          setBranches(fetchedBranches);
        }

        const effectiveBranch =
          branchName ||
          (fetchedBranches.some((b) => b.name === info.default_branch)
            ? info.default_branch
            : fetchedBranches[0]?.name || 'main');

        setSelectedBranch(effectiveBranch);

        // 3. Fetch commit timeline
        setIsLoadingCommits(true);
        const commitItems = await getCommitList(
          targetOwner,
          targetRepo,
          perPage,
          commitSha || effectiveBranch,
          1,
          pat
        );
        setCommits(commitItems);
        setLastCheckedTime(new Date());

        // 4. Auto-select first commit or specified commit
        const targetCommitSha = commitSha || commitItems[0]?.sha;
        if (targetCommitSha) {
          setSelectedSha(targetCommitSha);
          setHeadSha(targetCommitSha);
          if (commitItems.length > 1) {
            setBaseSha(commitItems[1].sha);
          }
          loadCommitDetail(targetOwner, targetRepo, targetCommitSha);
        }
      } catch (err: unknown) {
        setAppError((err as Error).message || 'Failed to inspect repository.');
      } finally {
        setIsLoadingRepo(false);
        setIsLoadingCommits(false);
      }
    },
    [pat, perPage]
  );

  // Load detailed commit changes with files[] and patches
  const loadCommitDetail = useCallback(
    async (owner: string, repo: string, sha: string) => {
      setIsLoadingCommitDetail(true);
      setSelectedFileIndex(0);
      setIsFullyExtracted(false);

      try {
        const detail = await getCommitDetail(owner, repo, sha, pat);
        setCommitDetail(detail);
      } catch (err: unknown) {
        setAppError((err as Error).message || `Failed to load commit ${sha.substring(0, 7)}`);
      } finally {
        setIsLoadingCommitDetail(false);
      }
    },
    [pat]
  );

  // Enhancement 1: Refresh HEAD commit & Detect new commits
  const handleRefreshHead = useCallback(
    async (silent: boolean = false) => {
      if (!repoInfo || !selectedBranch) return;
      if (!silent) setIsRefreshing(true);

      try {
        const head = await getHeadCommit(repoInfo.owner.login, repoInfo.name, selectedBranch, pat);
        setLastCheckedTime(new Date());

        const latestKnownSha = commits[0]?.sha;
        if (latestKnownSha && head.sha !== latestKnownSha) {
          // Count commits between latest known and new HEAD
          const count = await getCommitCountBetween(
            repoInfo.owner.login,
            repoInfo.name,
            latestKnownSha,
            head.sha,
            pat
          );
          setNewCommitCount(count);
        } else {
          setNewCommitCount(0);
        }
      } catch (err) {
        if (!silent) {
          console.warn('Failed to check latest HEAD:', err);
        }
      } finally {
        if (!silent) setIsRefreshing(false);
      }
    },
    [repoInfo, selectedBranch, commits, pat]
  );

  // Auto-check every 60 seconds if enabled
  useEffect(() => {
    if (!autoCheckEnabled || !repoInfo) return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        handleRefreshHead(true);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [autoCheckEnabled, repoInfo, handleRefreshHead]);

  // Load latest commits when detector badge clicked
  const handleLoadLatestCommits = () => {
    if (!repoInfo || !selectedBranch) return;
    setIsLoadingCommits(true);
    setNewCommitCount(0);
    getCommitList(repoInfo.owner.login, repoInfo.name, perPage, selectedBranch, 1, pat)
      .then((items) => {
        setCommits(items);
        if (items.length > 0) {
          setSelectedSha(items[0].sha);
          setHeadSha(items[0].sha);
          loadCommitDetail(repoInfo.owner.login, repoInfo.name, items[0].sha);
        }
      })
      .catch((err) => {
        setAppError(err.message || 'Failed to load latest commits');
      })
      .finally(() => setIsLoadingCommits(false));
  };

  // Enhancement 3: Compare Range Execution
  const handleRunCompare = useCallback(
    async (base: string, head: string) => {
      if (!repoInfo || !base || !head) return;
      setIsLoadingCompare(true);
      setAppError(null);
      setIsFullyExtracted(false);
      setSelectedFileIndex(0);

      try {
        const result = await compareCommits(repoInfo.owner.login, repoInfo.name, base, head, pat);
        setCompareResult(result);

        // Synthesize virtual commit detail for unified inspection & extraction
        const synthesizedDetail: GitHubCommitDetail = {
          sha: result.base_commit?.sha ? `${base.substring(0, 7)}...${head.substring(0, 7)}` : head,
          node_id: `compare-${base}-${head}`,
          url: result.url || '',
          html_url: result.html_url || `https://github.com/${repoInfo.full_name}/compare/${base}...${head}`,
          comments_url: '',
          author: null,
          committer: null,
          commit: {
            message: `Compare Range: ${base.substring(0, 7)} to ${head.substring(0, 7)} (${result.total_commits} commits)`,
            author: {
              name: `Range (${result.commits?.length || 0} commits)`,
              email: '',
              date: new Date().toISOString(),
            },
            committer: {
              name: `Range (${result.commits?.length || 0} commits)`,
              email: '',
              date: new Date().toISOString(),
            },
            tree: {
              sha: head,
              url: '',
            },
            comment_count: 0,
          },
          files: result.files || [],
          stats: {
            total: (result.files || []).reduce((acc, f) => acc + f.changes, 0),
            additions: (result.files || []).reduce((acc, f) => acc + f.additions, 0),
            deletions: (result.files || []).reduce((acc, f) => acc + f.deletions, 0),
          },
          parents: result.base_commit ? [{ sha: result.base_commit.sha, url: '', html_url: result.base_commit.html_url || '' }] : [],
        };

        setCommitDetail(synthesizedDetail);
      } catch (err: unknown) {
        setAppError((err as Error).message || 'Failed to compare commit range.');
      } finally {
        setIsLoadingCompare(false);
      }
    },
    [repoInfo, pat]
  );

  // Enhancement 3: Since Last Review trigger
  const handleSinceLastReview = useCallback(() => {
    if (!lastReviewedSha || !commits[0]) return;
    const currentHead = commits[0].sha;
    setBaseSha(lastReviewedSha);
    setHeadSha(currentHead);
    setReviewMode('compare');
    handleRunCompare(lastReviewedSha, currentHead);
  }, [lastReviewedSha, commits, handleRunCompare]);

  // Handle commit selection from timeline
  const handleSelectCommit = (sha: string) => {
    setSelectedSha(sha);
    setHeadSha(sha);
    if (reviewMode === 'compare') {
      // In compare mode, clicking timeline sets Head and re-runs comparison if base present
      if (baseSha && baseSha !== sha) {
        handleRunCompare(baseSha, sha);
      }
    } else if (repoInfo) {
      loadCommitDetail(repoInfo.owner.login, repoInfo.name, sha);
    }
  };

  // Handle branch switch
  const handleSelectBranch = (branch: string) => {
    setSelectedBranch(branch);
    setNewCommitCount(0);
    if (repoInfo) {
      setIsLoadingCommits(true);
      getCommitList(repoInfo.owner.login, repoInfo.name, perPage, branch, 1, pat)
        .then((items) => {
          setCommits(items);
          if (items.length > 0) {
            setSelectedSha(items[0].sha);
            setHeadSha(items[0].sha);
            if (items.length > 1) setBaseSha(items[1].sha);
            loadCommitDetail(repoInfo.owner.login, repoInfo.name, items[0].sha);
          }
        })
        .catch((err) => {
          setAppError(err.message || 'Failed to switch branch commits');
        })
        .finally(() => setIsLoadingCommits(false));
    }
  };

  // Handle Per Page change
  const handleSelectPerPage = (count: number) => {
    setPerPage(count);
    localStorage.setItem(LOCAL_STORAGE_PER_PAGE, String(count));
    if (repoInfo) {
      setIsLoadingCommits(true);
      getCommitList(repoInfo.owner.login, repoInfo.name, count, selectedBranch, 1, pat)
        .then((items) => {
          setCommits(items);
        })
        .catch((err) => {
          setAppError(err.message || 'Failed to reload commits list');
        })
        .finally(() => setIsLoadingCommits(false));
    }
  };

  // Direct SHA lookup
  const handleDirectShaSubmit = (sha: string) => {
    if (repoInfo) {
      setSelectedSha(sha);
      setHeadSha(sha);
      loadCommitDetail(repoInfo.owner.login, repoInfo.name, sha);
    }
  };

  // Form submit from RepoInput
  const handleRepoSubmit = (parsed: ParsedRepoUrl) => {
    setParsedRepo(parsed);
    loadRepository(parsed.owner, parsed.repo, parsed.branch, parsed.commitSha);
  };

  // Sample repo shortcut
  const handleSelectSampleRepo = (sampleName: string) => {
    setRepoUrl(sampleName);
    const parts = sampleName.split('/');
    if (parts.length === 2) {
      loadRepository(parts[0], parts[1]);
    }
  };

  // Context Files handling
  const handleAddContextFile = async (filePath: string) => {
    if (contextFiles.some((cf) => cf.path === filePath)) return;
    const item: ContextFileItem = { path: filePath, isCustom: true };
    setContextFiles((prev) => [...prev, item]);

    // Fetch content at HEAD
    if (repoInfo && selectedBranch) {
      try {
        const res = await getFileContent(repoInfo.owner.login, repoInfo.name, filePath, selectedBranch, pat);
        setContextFiles((prev) =>
          prev.map((cf) => (cf.path === filePath ? { ...cf, content: res.content } : cf))
        );
      } catch (err: unknown) {
        setContextFiles((prev) =>
          prev.map((cf) =>
            cf.path === filePath ? { ...cf, error: (err as Error).message || 'Not found at branch HEAD' } : cf
          )
        );
      }
    }
  };

  const handleRemoveContextFile = (filePath: string) => {
    setContextFiles((prev) => prev.filter((cf) => cf.path !== filePath));
  };

  // Enhancement 4: Compute filtered files and exclusions
  const rawFiles = useMemo(() => commitDetail?.files || [], [commitDetail?.files]);
  const filterResult = useMemo(() => {
    return applyFileFilters(rawFiles, filterConfig);
  }, [rawFiles, filterConfig]);

  // Full Content Extraction process (respects filtered files & Compare Range)
  const startFileExtraction = async () => {
    if (!commitDetail || !repoInfo) return;
    if (extractionMode === 'patch-only') {
      setIsFullyExtracted(true);
      setActiveTab('export');
      return;
    }

    const filesToExtract = filterResult.included;
    if (filesToExtract.length === 0) return;

    setIsExtracting(true);
    setIsFullyExtracted(false);

    const controller = new AbortController();
    extractAbortControllerRef.current = controller;

    setExtractionProgress({
      total: filesToExtract.length,
      current: 0,
      currentFilename: filesToExtract[0].filename,
      isComplete: false,
      isCancelled: false,
      errorCount: 0,
    });

    const targetRef = reviewMode === 'compare' ? headSha : commitDetail.sha;
    const updatedFiles: GitHubCommitFile[] = [...commitDetail.files];
    let errors = 0;

    for (let i = 0; i < filesToExtract.length; i++) {
      if (controller.signal.aborted) break;

      const file = filesToExtract[i];
      const masterIdx = updatedFiles.findIndex((f) => f.filename === file.filename);

      setExtractionProgress((prev) => ({
        ...prev,
        current: i + 1,
        currentFilename: file.filename,
      }));

      try {
        if (file.status === 'removed') {
          // Pre-deletion content from base or parent
          const parentSha = reviewMode === 'compare' ? baseSha : commitDetail.parents?.[0]?.sha;
          if (includePreDeletion && parentSha) {
            const preContent = await getPreDeletionFileContent(
              repoInfo.owner.login,
              repoInfo.name,
              file.filename,
              parentSha,
              pat,
              controller.signal
            );
            if (masterIdx >= 0) {
              updatedFiles[masterIdx] = {
                ...updatedFiles[masterIdx],
                preDeletionContent: preContent,
              };
            }
          }
        } else {
          // Fetch full source content
          const result = await getFileContent(
            repoInfo.owner.login,
            repoInfo.name,
            file.filename,
            targetRef,
            pat,
            controller.signal
          );

          if (masterIdx >= 0) {
            updatedFiles[masterIdx] = {
              ...updatedFiles[masterIdx],
              content: result.content,
              binary: result.binary,
              isTooLarge: result.isTooLarge,
            };
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') break;
        errors++;
        if (masterIdx >= 0) {
          updatedFiles[masterIdx] = {
            ...updatedFiles[masterIdx],
            fetchError: (err as Error).message || 'Failed to extract content',
          };
        }
      }
    }

    if (!controller.signal.aborted) {
      setCommitDetail({
        ...commitDetail,
        files: updatedFiles,
      });
      setIsFullyExtracted(true);
      setActiveTab('export');
      setExtractionProgress((prev) => ({
        ...prev,
        isComplete: true,
        errorCount: errors,
      }));
    }

    setIsExtracting(false);
    extractAbortControllerRef.current = null;
  };

  // Cancel extraction
  const cancelFileExtraction = () => {
    if (extractAbortControllerRef.current) {
      extractAbortControllerRef.current.abort();
      extractAbortControllerRef.current = null;
    }
    setIsExtracting(false);
    setExtractionProgress((prev) => ({
      ...prev,
      isCancelled: true,
    }));
  };

  // Mark current commit/range as reviewed checkpoint
  const handleMarkReviewed = () => {
    if (!repoInfo || !selectedBranch || !headSha) return;
    saveLastReviewedSha(repoInfo.owner.login, repoInfo.name, selectedBranch, headSha);
  };

  // Restore session from ReviewSessionsModal
  const handleRestoreSession = (session: ReviewSession) => {
    const [owner, repo] = session.repo.split('/');
    if (!owner || !repo) return;

    setReviewMode(session.mode);
    if (session.baseSha) setBaseSha(session.baseSha);
    setHeadSha(session.headSha);
    setTaskText(session.taskText || '');

    // Restore filter config if present
    if (session.filtersSnapshot) {
      const snap = session.filtersSnapshot;
      const restoredConfig: FileFilterConfig = {
        preset: (snap.preset as FilterPresetName) || 'custom',
        includePatterns: snap.includePatterns.join(', '),
        excludePatterns: snap.excludePatterns.join(', '),
        extensions: snap.extensions.join(', '),
        maxSizeKb: snap.maxSizeKb,
        statuses: {
          added: snap.statuses.includes('added'),
          modified: snap.statuses.includes('modified'),
          renamed: snap.statuses.includes('renamed'),
          removed: snap.statuses.includes('removed'),
          copied: snap.statuses.includes('copied'),
          changed: snap.statuses.includes('changed'),
          unchanged: snap.statuses.includes('unchanged'),
        },
        codeOnly: snap.codeOnly,
        includeContextFiles: (snap.contextFiles?.length || 0) > 0,
        contextFiles: snap.contextFiles,
      };
      setFilterConfig(restoredConfig);
    }

    // Load repo & execute inspect or compare
    loadRepository(owner, repo, session.branch, session.headSha).then(() => {
      if (session.mode === 'compare' && session.baseSha) {
        handleRunCompare(session.baseSha, session.headSha);
      }
    });
  };

  // Format relative last checked time
  const lastCheckedRelative = useMemo(() => {
    if (!lastCheckedTime) return null;
    const diffSec = Math.floor((Date.now() - lastCheckedTime.getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    return `${diffMin}m ago`;
  }, [lastCheckedTime]);

  // Bundle Scope Options for Export Panel
  const bundleScopeOptions: BundleScopeOptions = useMemo(() => {
    return {
      reviewMode,
      baseSha: reviewMode === 'compare' ? baseSha : undefined,
      headSha,
      compareUrl: compareResult?.html_url,
      totalCommits: compareResult?.total_commits,
      aheadBy: compareResult?.ahead_by,
      contextFiles: filterConfig.includeContextFiles ? contextFiles : [],
    };
  }, [reviewMode, baseSha, headSha, compareResult, filterConfig.includeContextFiles, contextFiles]);

  // Initial load on first render if URL present
  useEffect(() => {
    if (repoUrl.trim()) {
      const parts = repoUrl.trim().split('/');
      if (parts.length === 2) {
        loadRepository(parts[0], parts[1]);
      }
    }
  }, []);

  return (
    <div id="commitpack-app" className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 antialiased font-sans">
      {/* Top Application Header with live rate limit status and Sessions trigger */}
      <Header
        rateLimit={rateLimit}
        pat={pat}
        onOpenPatModal={() => setIsPatModalOpen(true)}
        onSelectSampleRepo={handleSelectSampleRepo}
        isDebugOpen={isDebugOpen}
        onToggleDebug={() => setIsDebugOpen((prev) => !prev)}
        onOpenSessionsModal={() => setIsSessionsModalOpen(true)}
      />

      {/* PAT Modal */}
      <TokenInput
        isOpen={isPatModalOpen}
        onClose={() => setIsPatModalOpen(false)}
        token={pat}
        onSaveToken={handleSavePat}
      />

      {/* Review Sessions Modal */}
      <ReviewSessionsModal
        isOpen={isSessionsModalOpen}
        onClose={() => setIsSessionsModalOpen(false)}
        currentRepo={repoInfo?.full_name || repoUrl}
        currentBranch={selectedBranch}
        currentMode={reviewMode}
        currentBaseSha={baseSha}
        currentHeadSha={headSha || selectedSha || ''}
        currentGithubUrl={commitDetail?.html_url || ''}
        currentTaskText={taskText}
        currentFilters={filterConfig}
        includedCount={filterResult.included.length}
        excludedCount={filterResult.excluded.length}
        onRestoreSession={handleRestoreSession}
      />

      {/* Main Search & Control Bar with Mode Switch, Refresh, & New Commit Detector */}
      <RepoInput
        repoUrl={repoUrl}
        setRepoUrl={setRepoUrl}
        onSubmitRepo={handleRepoSubmit}
        isLoading={isLoadingRepo}
        repoInfo={repoInfo}
        branches={branches}
        selectedBranch={selectedBranch}
        onSelectBranch={handleSelectBranch}
        perPage={perPage}
        onSelectPerPage={handleSelectPerPage}
        directSha={directSha}
        setDirectSha={setDirectSha}
        onDirectShaSubmit={handleDirectShaSubmit}
        reviewMode={reviewMode}
        onSelectReviewMode={(mode) => {
          setReviewMode(mode);
          if (mode === 'compare' && commits.length >= 2 && !baseSha) {
            setBaseSha(commits[1].sha);
            setHeadSha(commits[0].sha);
          }
        }}
        isRefreshing={isRefreshing}
        onRefreshRepo={() => handleRefreshHead(false)}
        lastCheckedRelative={lastCheckedRelative}
        newCommitCount={newCommitCount}
        onLoadLatestCommits={handleLoadLatestCommits}
        onDismissNewCommits={() => setNewCommitCount(0)}
        autoCheckEnabled={autoCheckEnabled}
        onToggleAutoCheck={setAutoCheckEnabled}
      />

      {/* Compare Range Selector Bar (when Compare Range mode active) */}
      {reviewMode === 'compare' && repoInfo && (
        <CompareRangeSelector
          commits={commits}
          baseSha={baseSha}
          headSha={headSha}
          onChangeBaseSha={setBaseSha}
          onChangeHeadSha={setHeadSha}
          onRunCompare={handleRunCompare}
          isLoading={isLoadingCompare}
          compareResult={compareResult}
          lastReviewedSha={lastReviewedSha}
          onSinceLastReview={handleSinceLastReview}
          branch={selectedBranch}
        />
      )}

      {/* Global Error Banner */}
      {appError && (
        <div
          id="app-global-error-banner"
          className="bg-rose-950/60 border-b border-rose-800/80 px-4 py-2.5 text-xs text-rose-200 flex items-center justify-between"
        >
          <div className="flex items-center gap-2 max-w-5xl">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{appError}</span>
          </div>
          <button
            type="button"
            onClick={() => setAppError(null)}
            className="text-rose-400 hover:text-rose-200 text-xs px-2 py-0.5 rounded hover:bg-rose-900/50"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Body Workspace */}
      <main id="main-workspace" className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Column: Vertical Commit Timeline */}
        <aside
          id="timeline-sidebar"
          className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-950 flex flex-col shrink-0 h-64 md:h-[calc(100vh-8.5rem)]"
        >
          <div className="p-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-indigo-400" />
              <span className="font-semibold text-xs text-zinc-200">
                {reviewMode === 'compare' ? 'Timeline (Select Range)' : 'Commit Timeline'}
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
              {commits.length} commits
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            <Timeline
              commits={commits}
              selectedSha={reviewMode === 'compare' ? headSha : selectedSha}
              onSelectCommit={handleSelectCommit}
              isLoading={isLoadingCommits}
            />
          </div>
        </aside>

        {/* Right Column: Commit Inspector & Packaging Workshop */}
        <section
          id="commit-inspector-area"
          className="flex-1 flex flex-col bg-zinc-950 overflow-hidden h-[calc(100vh-8.5rem)]"
        >
          {commitDetail ? (
            <div className="h-full flex flex-col overflow-hidden">
              {/* Commit Header Summary */}
              <div
                id="selected-commit-header"
                className="p-3 md:p-4 border-b border-zinc-800 bg-zinc-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-indigo-600 text-white rounded shadow-sm">
                      {reviewMode === 'compare'
                        ? `${baseSha.substring(0, 7)}...${headSha.substring(0, 7)}`
                        : commitDetail.sha.substring(0, 7)}
                    </span>
                    <h2 className="text-xs md:text-sm font-bold text-zinc-100 truncate">
                      {commitDetail.commit.message?.split('\n')[0] || '(no message)'}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 font-mono">
                    <span className="text-zinc-300">
                      by <strong>{commitDetail.commit.author?.name || 'Unknown'}</strong>
                    </span>
                    <span>•</span>
                    <span className="text-zinc-400">
                      {commitDetail.commit.author?.date
                        ? new Date(commitDetail.commit.author.date).toLocaleString()
                        : ''}
                    </span>
                    <span>•</span>
                    <span className="text-emerald-400">
                      +{commitDetail.stats?.additions || 0}
                    </span>
                    <span className="text-rose-400">
                      −{commitDetail.stats?.deletions || 0}
                    </span>
                    <span>({filterResult.included.length} / {rawFiles.length} files included)</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <a
                    href={commitDetail.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono border border-zinc-700 transition-colors"
                  >
                    <span>GitHub</span>
                    <ExternalLink className="w-3 h-3 text-zinc-400" />
                  </a>
                </div>
              </div>

              {/* Extraction Control Bar */}
              <ExtractPanel
                commitDetail={commitDetail}
                mode={extractionMode}
                onSelectMode={setExtractionMode}
                includePreDeletion={includePreDeletion}
                onTogglePreDeletion={setIncludePreDeletion}
                isExtracting={isExtracting}
                progress={extractionProgress}
                onStartExtraction={startFileExtraction}
                onCancelExtraction={cancelFileExtraction}
                isFullyExtracted={isFullyExtracted}
              />

              {/* File Filters & Presets Collapsible Bar */}
              <FileFiltersPanel
                config={filterConfig}
                onChangeConfig={handleFilterConfigChange}
                totalFilesCount={rawFiles.length}
                includedFilesCount={filterResult.included.length}
                excludedFiles={filterResult.excluded}
                patternErrors={filterResult.patternErrors}
                contextFiles={contextFiles}
                onAddContextFile={handleAddContextFile}
                onRemoveContextFile={handleRemoveContextFile}
                showExcludedInDiff={showExcludedInDiff}
                onToggleShowExcludedInDiff={setShowExcludedInDiff}
              />

              {/* View Switcher Tabs (Diff Viewer vs File Explorer vs Export Hub) */}
              <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg p-1 text-xs">
                  <button
                    id="tab-diff-viewer-btn"
                    type="button"
                    onClick={() => setActiveTab('diff')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
                      activeTab === 'diff'
                        ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-inner'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Diff Viewer ({filterResult.included.length})</span>
                  </button>

                  <button
                    id="tab-file-explorer-btn"
                    type="button"
                    onClick={() => setActiveTab('tree')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
                      activeTab === 'tree'
                        ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-inner'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <FolderTree className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Repo Tree</span>
                  </button>

                  <button
                    id="tab-export-hub-btn"
                    type="button"
                    onClick={() => setActiveTab('export')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
                      activeTab === 'export'
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-indigo-300 hover:text-indigo-200'
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>Agent Review & Export Hub</span>
                  </button>
                </div>
              </div>

              {/* Active Tab Subview */}
              <div className="flex-1 overflow-hidden">
                {activeTab === 'diff' && (
                  <DiffViewer
                    commitDetail={commitDetail}
                    files={filterResult.included}
                    excludedFiles={filterResult.excluded}
                    showExcluded={showExcludedInDiff}
                    selectedFileIndex={selectedFileIndex}
                    onSelectFileIndex={setSelectedFileIndex}
                  />
                )}

                {activeTab === 'tree' && repoInfo && (
                  <FileExplorer
                    owner={repoInfo.owner.login}
                    repo={repoInfo.name}
                    commitDetail={commitDetail}
                    pat={pat}
                  />
                )}

                {activeTab === 'export' && repoInfo && (
                  <ExportPanel
                    repoName={repoInfo.name}
                    repoFullName={repoInfo.full_name}
                    branch={selectedBranch}
                    commitDetail={commitDetail}
                    commitList={commits}
                    mode={extractionMode}
                    includePreDeletion={includePreDeletion}
                    filesOverride={filterResult.included}
                    scopeOptions={bundleScopeOptions}
                    taskText={taskText}
                    onChangeTaskText={handleTaskTextChange}
                    onMarkReviewed={handleMarkReviewed}
                    lastReviewedSha={lastReviewedSha}
                    excludedCount={filterResult.excluded.length}
                  />
                )}
              </div>
            </div>
          ) : isLoadingCommitDetail || isLoadingCompare ? (
            <div className="h-full flex items-center justify-center p-8 text-zinc-400 space-y-2">
              <div className="text-center">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400 mx-auto mb-2" />
                <p className="text-xs font-mono">
                  {isLoadingCompare ? 'Comparing commit range...' : 'Fetching commit diff and files...'}
                </p>
              </div>
            </div>
          ) : (
            /* Welcome / Empty State */
            <div className="h-full flex items-center justify-center p-8 overflow-y-auto">
              <div className="max-w-md text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400 mx-auto">
                  <Package className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-zinc-100">
                    Welcome to CommitPack
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Inspect single commits or compare commit ranges, apply deterministic file filters & presets, write acceptance criteria for AI agent verification prompts, and export AI packs or ZIP archives.
                  </p>
                </div>
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-left space-y-2 text-xs">
                  <span className="font-semibold text-zinc-300">Quick start tips:</span>
                  <ul className="list-disc pl-4 space-y-1 text-zinc-400 text-[11px]">
                    <li>Enter any repository above (e.g. <code className="text-indigo-300">facebook/react</code>).</li>
                    <li>Switch between <strong>Single Commit</strong> and <strong>Compare Range</strong> modes.</li>
                    <li>Use <strong>File Filters</strong> presets (Astro, Next.js, Supabase, Code only) to reduce token count.</li>
                    <li>Enter acceptance criteria in <strong>Agent Review & Export Hub</strong> to copy structured AI prompts.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Collapsible GitHub API Debug Console Drawer */}
      <DebugConsole
        logs={debugLogs}
        onClearLogs={() => setDebugLogs([])}
        isOpen={isDebugOpen}
        onToggle={() => setIsDebugOpen((prev) => !prev)}
      />
    </div>
  );
}
