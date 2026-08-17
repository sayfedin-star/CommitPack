/**
 * @file src/App.tsx
 * @description Main application controller for CommitPack — GitHub commit inspector
 * and AI agent packaging workshop with diff viewing, repository tree exploration,
 * full-content extraction, token estimation, and ZIP generation.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  getRepoInfo,
  getRepoBranches,
  getCommitList,
  getCommitDetail,
  getFileContent,
  getPreDeletionFileContent,
  checkRateLimit,
  subscribeToRateLimit,
  subscribeToDebugLogs,
} from './lib/github-api';
import { Header } from './components/Header';
import { TokenInput } from './components/TokenInput';
import { RepoInput } from './components/RepoInput';
import { Timeline } from './components/Timeline';
import { DiffViewer } from './components/DiffViewer';
import { FileExplorer } from './components/FileExplorer';
import { ExtractPanel } from './components/ExtractPanel';
import { ExportPanel } from './components/ExportPanel';
import { DebugConsole } from './components/DebugConsole';

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

  // Commits & Selection state
  const [commits, setCommits] = useState<GitHubCommitListItem[]>([]);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [commitDetail, setCommitDetail] = useState<GitHubCommitDetail | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);

  // Active view tab inside Commit Inspector: 'diff' | 'tree' | 'export'
  const [activeTab, setActiveTab] = useState<'diff' | 'tree' | 'export'>('diff');

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
      setIsFullyExtracted(false);

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

        // 4. Auto-select first commit or specified commit
        const targetCommitSha = commitSha || commitItems[0]?.sha;
        if (targetCommitSha) {
          setSelectedSha(targetCommitSha);
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

  // Handle commit selection from timeline
  const handleSelectCommit = (sha: string) => {
    setSelectedSha(sha);
    if (repoInfo) {
      loadCommitDetail(repoInfo.owner.login, repoInfo.name, sha);
    }
  };

  // Handle branch switch
  const handleSelectBranch = (branch: string) => {
    setSelectedBranch(branch);
    if (repoInfo) {
      setIsLoadingCommits(true);
      getCommitList(repoInfo.owner.login, repoInfo.name, perPage, branch, 1, pat)
        .then((items) => {
          setCommits(items);
          if (items.length > 0) {
            setSelectedSha(items[0].sha);
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

  // Full Content Extraction process
  const startFileExtraction = async () => {
    if (!commitDetail || !repoInfo) return;
    if (extractionMode === 'patch-only') {
      setIsFullyExtracted(true);
      setActiveTab('export');
      return;
    }

    const filesToExtract = commitDetail.files || [];
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

    const updatedFiles: GitHubCommitFile[] = [...filesToExtract];
    let errors = 0;

    for (let i = 0; i < filesToExtract.length; i++) {
      if (controller.signal.aborted) {
        break;
      }

      const file = filesToExtract[i];
      setExtractionProgress((prev) => ({
        ...prev,
        current: i + 1,
        currentFilename: file.filename,
      }));

      try {
        if (file.status === 'removed') {
          // Check if user requested pre-deletion content from parent
          if (includePreDeletion && commitDetail.parents && commitDetail.parents.length > 0) {
            const parentSha = commitDetail.parents[0].sha;
            const preContent = await getPreDeletionFileContent(
              repoInfo.owner.login,
              repoInfo.name,
              file.filename,
              parentSha,
              pat,
              controller.signal
            );
            updatedFiles[i] = {
              ...file,
              preDeletionContent: preContent,
            };
          }
        } else {
          // Fetch added, modified, renamed content
          const result = await getFileContent(
            repoInfo.owner.login,
            repoInfo.name,
            file.filename,
            commitDetail.sha,
            pat,
            controller.signal
          );

          updatedFiles[i] = {
            ...file,
            content: result.content,
            binary: result.binary,
            isTooLarge: result.isTooLarge,
          };
        }
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') {
          break;
        }
        errors++;
        updatedFiles[i] = {
          ...file,
          fetchError: (err as Error).message || 'Failed to extract content',
        };
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

  // Initial load on first render if URL present
  useEffect(() => {
    if (repoUrl.trim()) {
      const parts = repoUrl.trim().split('/');
      if (parts.length === 2) {
        loadRepository(parts[0], parts[1]);
      }
    }
  }, []); // Run once on startup

  return (
    <div id="commitpack-app" className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 antialiased font-sans">
      {/* Top Application Header with live rate limit status */}
      <Header
        rateLimit={rateLimit}
        pat={pat}
        onOpenPatModal={() => setIsPatModalOpen(true)}
        onSelectSampleRepo={handleSelectSampleRepo}
        isDebugOpen={isDebugOpen}
        onToggleDebug={() => setIsDebugOpen((prev) => !prev)}
      />

      {/* PAT Modal */}
      <TokenInput
        isOpen={isPatModalOpen}
        onClose={() => setIsPatModalOpen(false)}
        token={pat}
        onSaveToken={handleSavePat}
      />

      {/* Main Search & Control Bar */}
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
      />

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
              <span className="font-semibold text-xs text-zinc-200">Commit Timeline</span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
              {commits.length} commits
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            <Timeline
              commits={commits}
              selectedSha={selectedSha}
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
                      {commitDetail.sha.substring(0, 7)}
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
                    <span>({commitDetail.files?.length || 0} files)</span>
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
                    <span>Diff Viewer ({commitDetail.files?.length || 0})</span>
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
                    <span>AI Agent Pack & Exports</span>
                  </button>
                </div>
              </div>

              {/* Active Tab Subview */}
              <div className="flex-1 overflow-hidden">
                {activeTab === 'diff' && (
                  <DiffViewer
                    commitDetail={commitDetail}
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
                  />
                )}
              </div>
            </div>
          ) : isLoadingCommitDetail ? (
            <div className="h-full flex items-center justify-center p-8 text-zinc-400 space-y-2">
              <div className="text-center">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400 mx-auto mb-2" />
                <p className="text-xs font-mono">Fetching commit diff and files...</p>
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
                    Inspect any commit from public or private GitHub repositories, view changed files and diffs, and bundle full sources into AI-agent-ready Markdown/JSON packs and ZIP archives.
                  </p>
                </div>
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-left space-y-2 text-xs">
                  <span className="font-semibold text-zinc-300">Quick start tips:</span>
                  <ul className="list-disc pl-4 space-y-1 text-zinc-400 text-[11px]">
                    <li>Enter any repository above (e.g. <code className="text-indigo-300">facebook/react</code>).</li>
                    <li>Add a Personal Access Token to increase quota from 60 to 5,000 requests/hour.</li>
                    <li>Click <strong>Extract Changed Files</strong> to download a clean ZIP or copy formatted Markdown for your AI prompt.</li>
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
