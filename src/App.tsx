/**
 * @file src/App.tsx
 * @description Root application controller for CommitPack — task-first Git repository & commit tool
 * with 3 primary task destinations: Review Commit, Browse Repository, and Build Context Pack.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  GitHubCompareResult,
  ContextFileItem,
  ReviewSession,
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
import { AppWorkspace } from './types/navigation';
import { Header } from './components/Header';
import { RepoInput } from './components/RepoInput';
import { ReviewCommitPage } from './components/ReviewCommitPage';
import { BrowseRepositoryPage } from './components/BrowseRepositoryPage';
import { BuildContextPackPage } from './components/BuildContextPackPage';
import { TokenInput } from './components/TokenInput';
import { ReviewSessionsModal } from './components/ReviewSessionsModal';
import { DebugConsole } from './components/DebugConsole';

const LOCAL_STORAGE_PAT_KEY = 'commitpack_github_pat';
const LOCAL_STORAGE_LAST_REPO = 'commitpack_last_repo';
const LOCAL_STORAGE_PER_PAGE = 'commitpack_per_page';
const LOCAL_STORAGE_WORKSPACE = 'commitpack_active_workspace';
const LOCAL_STORAGE_THEME = 'commitpack_theme';

export default function App() {
  // Theme State: Defaults to 'light'
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_THEME);
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_THEME, theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Primary Navigation Task Workspace
  const [activeWorkspace, setActiveWorkspace] = useState<AppWorkspace>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_WORKSPACE) as AppWorkspace;
    if (saved === 'review-commit' || saved === 'browse-repository' || saved === 'build-context-pack') {
      return saved;
    }
    return 'review-commit';
  });

  const handleSelectWorkspace = (workspace: AppWorkspace) => {
    setActiveWorkspace(workspace);
    localStorage.setItem(LOCAL_STORAGE_WORKSPACE, workspace);
  };

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

  // Mode Selection for Review: Single Commit vs Compare Range
  const [reviewMode, setReviewMode] = useState<'single' | 'compare'>('single');
  const [baseSha, setBaseSha] = useState<string>('');
  const [headSha, setHeadSha] = useState<string>('');
  const [compareResult, setCompareResult] = useState<GitHubCompareResult | null>(null);
  const [isLoadingCompare, setIsLoadingCompare] = useState<boolean>(false);

  // Refresh & Latest Commit Detector state
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastCheckedTime, setLastCheckedTime] = useState<Date | null>(null);
  const [newCommitCount, setNewCommitCount] = useState<number>(0);

  // Commits & Single Selection state
  const [commits, setCommits] = useState<GitHubCommitListItem[]>([]);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [commitDetail, setCommitDetail] = useState<GitHubCommitDetail | null>(null);

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

  const handleClearPat = () => {
    handleSavePat(null);
  };

  // Load commit detail
  const loadCommitDetail = useCallback(
    async (owner: string, repo: string, sha: string) => {
      setIsLoadingCommitDetail(true);
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
    [pat, perPage, loadCommitDetail]
  );

  // Initial load on mount
  useEffect(() => {
    const last = localStorage.getItem(LOCAL_STORAGE_LAST_REPO) || 'facebook/react';
    const parts = last.split('/');
    if (parts.length === 2) {
      loadRepository(parts[0], parts[1]);
    }
  }, [loadRepository]);

  // Refresh HEAD commit & Detect new commits
  const handleRefreshHead = useCallback(
    async (silent: boolean = false) => {
      if (!repoInfo || !selectedBranch) return;
      if (!silent) setIsRefreshing(true);

      try {
        const head = await getHeadCommit(repoInfo.owner.login, repoInfo.name, selectedBranch, pat);
        setLastCheckedTime(new Date());

        const latestKnownSha = commits[0]?.sha;
        if (latestKnownSha && head.sha !== latestKnownSha) {
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

  // Compare Range Execution
  const handleRunCompare = useCallback(
    async (base: string, head: string) => {
      if (!repoInfo || !base || !head) return;
      setIsLoadingCompare(true);
      setAppError(null);
      setIsFullyExtracted(false);

      try {
        const result = await compareCommits(repoInfo.owner.login, repoInfo.name, base, head, pat);
        setCompareResult(result);

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

  // Since Last Review trigger
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

  // Form submit from RepoInput
  const handleRepoSubmit = (parsed: ParsedRepoUrl) => {
    setParsedRepo(parsed);
    loadRepository(parsed.owner, parsed.repo, parsed.branch, parsed.commitSha);
  };

  // Context Files handling
  const handleAddContextFile = async (filePath: string) => {
    if (contextFiles.some((cf) => cf.path === filePath)) return;
    const item: ContextFileItem = { path: filePath, isCustom: true };
    setContextFiles((prev) => [...prev, item]);

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

  // Filtered files calculation
  const filteredFilesResult = useMemo(() => {
    const rawFiles = commitDetail?.files || [];
    return applyFileFilters(rawFiles, filterConfig);
  }, [commitDetail?.files, filterConfig]);

  // Extraction Execution Logic
  const handleStartExtraction = async () => {
    if (!commitDetail || !repoInfo) return;

    if (extractionMode === 'patch-only') {
      setIsFullyExtracted(true);
      return;
    }

    const filesToExtract = filteredFilesResult.included.filter(
      (f) => f.status !== 'removed' && (!f.fullContent || f.fullContent.length === 0)
    );

    const deletedFilesToExtract = includePreDeletion
      ? filteredFilesResult.included.filter(
          (f) => f.status === 'removed' && (!f.preDeletionContent || f.preDeletionContent.length === 0)
        )
      : [];

    const totalOperations = filesToExtract.length + deletedFilesToExtract.length;

    if (totalOperations === 0) {
      setIsFullyExtracted(true);
      return;
    }

    setIsExtracting(true);
    extractAbortControllerRef.current = new AbortController();
    const { signal } = extractAbortControllerRef.current;

    setExtractionProgress({
      total: totalOperations,
      current: 0,
      currentFilename: '',
      isComplete: false,
      isCancelled: false,
      errorCount: 0,
    });

    const updatedFiles = [...(commitDetail.files || [])];
    let completedCount = 0;
    let errorsEncountered = 0;

    const commitRef = reviewMode === 'compare' && headSha ? headSha : commitDetail.sha;

    for (const file of filesToExtract) {
      if (signal.aborted) break;

      setExtractionProgress((prev) => ({
        ...prev,
        current: completedCount,
        currentFilename: file.filename,
      }));

      try {
        const res = await getFileContent(
          repoInfo.owner.login,
          repoInfo.name,
          file.filename,
          commitRef,
          pat
        );

        const targetIdx = updatedFiles.findIndex((f) => f.filename === file.filename);
        if (targetIdx !== -1) {
          updatedFiles[targetIdx] = {
            ...updatedFiles[targetIdx],
            fullContent: res.content,
          };
        }
      } catch (err) {
        errorsEncountered++;
      } finally {
        completedCount++;
      }
    }

    if (includePreDeletion && !signal.aborted) {
      const parentSha =
        reviewMode === 'compare' && baseSha
          ? baseSha
          : commitDetail.parents?.[0]?.sha;

      if (parentSha) {
        for (const file of deletedFilesToExtract) {
          if (signal.aborted) break;

          setExtractionProgress((prev) => ({
            ...prev,
            current: completedCount,
            currentFilename: `${file.filename} (pre-deletion)`,
          }));

          try {
            const res = await getPreDeletionFileContent(
              repoInfo.owner.login,
              repoInfo.name,
              file.filename,
              parentSha,
              pat
            );

            const targetIdx = updatedFiles.findIndex((f) => f.filename === file.filename);
            if (targetIdx !== -1) {
              updatedFiles[targetIdx] = {
                ...updatedFiles[targetIdx],
                preDeletionContent: res,
              };
            }
          } catch (err) {
            errorsEncountered++;
          } finally {
            completedCount++;
          }
        }
      }
    }

    setCommitDetail((prev) => (prev ? { ...prev, files: updatedFiles } : prev));
    setIsExtracting(false);
    setIsFullyExtracted(!signal.aborted);
    setExtractionProgress((prev) => ({
      ...prev,
      isComplete: !signal.aborted,
      isCancelled: signal.aborted,
      errorCount: errorsEncountered,
    }));
  };

  const handleCancelExtraction = () => {
    if (extractAbortControllerRef.current) {
      extractAbortControllerRef.current.abort();
    }
  };

  const handleMarkReviewed = () => {
    if (!repoInfo || !selectedBranch || !commitDetail) return;
    const shaToMark = reviewMode === 'compare' && headSha ? headSha : commitDetail.sha;
    saveLastReviewedSha(repoInfo.owner.login, repoInfo.name, selectedBranch, shaToMark);
  };

  const handleLoadSession = (session: ReviewSession) => {
    setRepoUrl(session.repo);
    const parts = session.repo.split('/');
    if (parts.length === 2) {
      loadRepository(parts[0], parts[1], session.branch, session.headSha);
      if (session.taskText) {
        setTaskText(session.taskText);
      }
      if (session.mode) {
        setReviewMode(session.mode);
        if (session.baseSha) setBaseSha(session.baseSha);
        if (session.headSha) setHeadSha(session.headSha);
      }
    }
    setIsSessionsModalOpen(false);
  };

  const errorLogCount = debugLogs.filter((l) => l.status >= 400 || l.status === 0 || !!l.error).length;

  const currentOwner = repoInfo?.owner?.login || parsedRepo?.owner || (repoUrl || '').split('/')[0] || 'facebook';
  const currentRepoName = repoInfo?.name || parsedRepo?.repo || (repoUrl || '').split('/')[1] || 'react';
  const effectiveHeadSha = commits[0]?.sha || headSha || selectedSha || null;

  return (
    <div className="h-screen max-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 antialiased transition-colors selection:bg-indigo-500 selection:text-white overflow-hidden">
      {/* 1. Global Header with 3-Task Navigation & Telemetry */}
      <Header
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        rateLimit={rateLimit}
        pat={pat}
        onOpenPatModal={() => setIsPatModalOpen(true)}
        isDebugOpen={isDebugOpen}
        onToggleDebug={() => setIsDebugOpen((prev) => !prev)}
        onOpenSessionsModal={() => setIsSessionsModalOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSelectTheme={setTheme}
        errorLogCount={errorLogCount}
      />

      {/* 2. Repository Search & Context Bar */}
      <RepoInput
        repoUrl={repoUrl}
        setRepoUrl={setRepoUrl}
        onSubmitRepo={handleRepoSubmit}
        isLoading={isLoadingRepo}
        repoInfo={repoInfo}
        branches={branches}
        selectedBranch={selectedBranch}
        onSelectBranch={handleSelectBranch}
        isRefreshing={isRefreshing}
        onRefreshRepo={() => handleRefreshHead(false)}
        lastCheckedRelative={lastCheckedTime ? 'Just now' : null}
        newCommitCount={newCommitCount}
        onLoadLatestCommits={handleLoadLatestCommits}
        onDismissNewCommits={() => setNewCommitCount(0)}
        activeWorkspace={activeWorkspace}
        headSha={effectiveHeadSha}
      />

      {/* 3. Global Application Error Banner */}
      {appError && (
        <div className="bg-rose-500 text-white px-4 py-2 text-xs font-mono flex items-center justify-between shadow-sm">
          <span>Error: {appError}</span>
          <button
            type="button"
            onClick={() => setAppError(null)}
            className="text-white hover:text-rose-200 font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* 4. Active Primary Workspace */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeWorkspace === 'review-commit' && (
          <ReviewCommitPage
            repoInfo={repoInfo}
            selectedBranch={selectedBranch}
            commits={commits}
            selectedSha={selectedSha}
            onSelectCommit={handleSelectCommit}
            isLoadingCommits={isLoadingCommits}
            commitDetail={commitDetail}
            isLoadingCommitDetail={isLoadingCommitDetail}
            perPage={perPage}
            onSelectPerPage={handleSelectPerPage}
            extractionMode={extractionMode}
            onSelectExtractionMode={setExtractionMode}
            includePreDeletion={includePreDeletion}
            onTogglePreDeletion={setIncludePreDeletion}
            isExtracting={isExtracting}
            extractionProgress={extractionProgress}
            onStartExtraction={handleStartExtraction}
            onCancelExtraction={handleCancelExtraction}
            isFullyExtracted={isFullyExtracted}
            filterConfig={filterConfig}
            onChangeFilterConfig={handleFilterConfigChange}
            filteredFiles={filteredFilesResult}
            contextFiles={contextFiles}
            onAddContextFile={handleAddContextFile}
            onRemoveContextFile={handleRemoveContextFile}
            showExcludedInDiff={showExcludedInDiff}
            onToggleShowExcludedInDiff={setShowExcludedInDiff}
            taskText={taskText}
            onChangeTaskText={handleTaskTextChange}
            onMarkReviewed={handleMarkReviewed}
            lastReviewedSha={lastReviewedSha}
            reviewMode={reviewMode}
            onSelectReviewMode={setReviewMode}
            baseSha={baseSha}
            headSha={headSha}
            onChangeBaseSha={setBaseSha}
            onChangeHeadSha={setHeadSha}
            onRunCompare={handleRunCompare}
            isLoadingCompare={isLoadingCompare}
            compareResult={compareResult}
            onSinceLastReview={handleSinceLastReview}
            pat={pat}
          />
        )}

        {activeWorkspace === 'browse-repository' && (
          <BrowseRepositoryPage
            owner={currentOwner}
            repo={currentRepoName}
            defaultBranch={selectedBranch}
            pat={pat}
          />
        )}

        {activeWorkspace === 'build-context-pack' && (
          <BuildContextPackPage
            owner={currentOwner}
            repo={currentRepoName}
            defaultBranch={selectedBranch}
            pat={pat}
          />
        )}
      </div>

      {/* 5. Modals & Telemetry Drawers */}
      <TokenInput
        isOpen={isPatModalOpen}
        onClose={() => setIsPatModalOpen(false)}
        pat={pat}
        onSavePat={handleSavePat}
        onClearPat={handleClearPat}
      />

      <ReviewSessionsModal
        isOpen={isSessionsModalOpen}
        onClose={() => setIsSessionsModalOpen(false)}
        currentRepo={repoInfo?.full_name || repoUrl}
        currentBranch={selectedBranch}
        currentMode={reviewMode}
        currentBaseSha={baseSha}
        currentHeadSha={effectiveHeadSha || ''}
        currentGithubUrl={commitDetail?.html_url || `https://github.com/${repoInfo?.full_name || repoUrl}`}
        currentTaskText={taskText}
        currentFilters={filterConfig}
        includedCount={filteredFilesResult.included.length}
        excludedCount={filteredFilesResult.excluded.length}
        onRestoreSession={handleLoadSession}
      />

      <DebugConsole
        logs={debugLogs}
        onClearLogs={() => setDebugLogs([])}
        isOpen={isDebugOpen}
        onToggle={() => setIsDebugOpen((prev) => !prev)}
      />
    </div>
  );
}
