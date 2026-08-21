/**
 * @file src/components/RepoInput.tsx
 * @description Streamlined repository control bar with repo URL/shorthand parser,
 * branch selector, refresh button, HEAD commit detector, and workspace helper subtitle.
 */

import React, { useState } from 'react';
import {
  Search,
  GitBranch,
  ArrowRight,
  RefreshCw,
  Clock,
  Sparkles,
  X,
  FolderGit2,
  GitCommit,
  Boxes,
} from 'lucide-react';
import { GitHubRepoInfo, GitHubBranch, ParsedRepoUrl } from '../types/github';
import { parseGitHubUrl } from '../lib/url-parser';
import { AppWorkspace, WORKSPACES } from '../types/navigation';

interface RepoInputProps {
  repoUrl: string;
  setRepoUrl: (url: string) => void;
  onSubmitRepo: (parsed: ParsedRepoUrl) => void;
  isLoading: boolean;
  repoInfo: GitHubRepoInfo | null;
  branches: GitHubBranch[];
  selectedBranch: string;
  onSelectBranch: (branch: string) => void;
  isRefreshing: boolean;
  onRefreshRepo: () => void;
  lastCheckedRelative: string | null;
  newCommitCount: number;
  onLoadLatestCommits: () => void;
  onDismissNewCommits: () => void;
  activeWorkspace: AppWorkspace;
  headSha?: string | null;
}

/**
 * Clean repository input and status bar component.
 */
export const RepoInput: React.FC<RepoInputProps> = ({
  repoUrl,
  setRepoUrl,
  onSubmitRepo,
  isLoading,
  repoInfo,
  branches,
  selectedBranch,
  onSelectBranch,
  isRefreshing,
  onRefreshRepo,
  lastCheckedRelative,
  newCommitCount,
  onLoadLatestCommits,
  onDismissNewCommits,
  activeWorkspace,
  headSha,
}) => {
  const [validationError, setValidationError] = useState<string | null>(null);

  const currentWorkspaceInfo = WORKSPACES.find((w) => w.id === activeWorkspace) || WORKSPACES[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed.isValid) {
      setValidationError(parsed.error || 'Invalid repository format');
      return;
    }

    onSubmitRepo(parsed);
  };

  const shortHead = headSha ? headSha.substring(0, 7) : '';

  return (
    <section id="repo-input-section" className="bg-white/80 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800 px-3 sm:px-4 py-2.5 transition-colors">
      <div className="max-w-7xl mx-auto space-y-2.5">
        {/* Row 1: Workspace Title / Helper & Search Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
          {/* Workspace Title & Description */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                {activeWorkspace === 'review-commit' && <GitCommit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                {activeWorkspace === 'browse-repository' && <FolderGit2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                {activeWorkspace === 'build-context-pack' && <Boxes className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                <span>{currentWorkspaceInfo.title}</span>
              </h1>
              {headSha && (
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                  {selectedBranch} @ {shortHead}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 truncate max-w-2xl mt-0.5">
              {currentWorkspaceInfo.description}
            </p>
          </div>

          {/* Repo Input Search Form */}
          <div className="flex items-center gap-2 shrink-0">
            <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-80">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 dark:text-zinc-500">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <input
                  id="github-repo-url-input"
                  type="text"
                  value={repoUrl}
                  onChange={(e) => {
                    setRepoUrl(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="e.g. facebook/react or owner/repo"
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                />
              </div>

              <button
                id="inspect-repo-submit-btn"
                type="submit"
                disabled={isLoading || !repoUrl || !repoUrl.trim()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs disabled:opacity-50 transition-all shrink-0"
              >
                <span>{isLoading ? 'Loading...' : 'Inspect'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              {/* Refresh Button */}
              {repoInfo && (
                <button
                  id="refresh-repo-btn"
                  type="button"
                  onClick={onRefreshRepo}
                  disabled={isRefreshing || isLoading}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 rounded-lg text-xs font-mono border border-slate-200 dark:border-zinc-700 flex items-center gap-1 transition-all shrink-0 disabled:opacity-50"
                  title="Check HEAD commit on GitHub"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              )}
            </form>

            {/* Branch Selector */}
            {repoInfo && branches.length > 0 && (
              <div className="relative shrink-0">
                <div className="flex items-center gap-1 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-xs font-mono text-slate-700 dark:text-zinc-300">
                  <GitBranch className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
                  <select
                    id="branch-select-dropdown"
                    value={selectedBranch}
                    onChange={(e) => onSelectBranch(e.target.value)}
                    className="bg-transparent text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none cursor-pointer pr-1"
                  >
                    {branches.map((b) => (
                      <option key={b.name} value={b.name} className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100">
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Validation Error Banner */}
        {validationError && (
          <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800/60">
            {validationError}
          </div>
        )}

        {/* New Commits Detector Banner */}
        {newCommitCount > 0 && (
          <div
            id="new-commit-alert-banner"
            className="flex items-center justify-between gap-2 p-2 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 rounded-lg text-xs"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 animate-pulse" />
              <span className="text-slate-800 dark:text-zinc-200">
                <strong>{newCommitCount} new commit{newCommitCount > 1 ? 's' : ''}</strong> available on{' '}
                <code>{selectedBranch}</code>.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onLoadLatestCommits}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
              >
                Load Latest
              </button>
              <button
                type="button"
                onClick={onDismissNewCommits}
                className="text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
