/**
 * @file src/components/RepoInput.tsx
 * @description Input bar for GitHub repository URL/shorthand parsing, branch selector,
 * pagination (10, 25, 50, 100 per page), direct SHA lookup, and repository summary badge.
 */

import React, { useState } from 'react';
import {
  Search,
  GitBranch,
  Star,
  GitFork,
  Layers,
  ArrowRight,
  AlertCircle,
  ExternalLink,
  Lock,
  Globe,
  Hash,
} from 'lucide-react';
import { GitHubRepoInfo, GitHubBranch, ParsedRepoUrl } from '../types/github';
import { parseGitHubUrl } from '../lib/url-parser';

interface RepoInputProps {
  repoUrl: string;
  setRepoUrl: (url: string) => void;
  onSubmitRepo: (parsed: ParsedRepoUrl) => void;
  isLoading: boolean;
  repoInfo: GitHubRepoInfo | null;
  branches: GitHubBranch[];
  selectedBranch: string;
  onSelectBranch: (branch: string) => void;
  perPage: number;
  onSelectPerPage: (n: number) => void;
  directSha: string;
  setDirectSha: (sha: string) => void;
  onDirectShaSubmit: (sha: string) => void;
}

/**
 * Top control bar for repository search and branch configuration.
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
  perPage,
  onSelectPerPage,
  directSha,
  setDirectSha,
  onDirectShaSubmit,
}) => {
  const [validationError, setValidationError] = useState<string | null>(null);

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

  const handleShaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (directSha.trim()) {
      onDirectShaSubmit(directSha.trim());
    }
  };

  return (
    <section id="repo-input-section" className="bg-zinc-900/60 border-b border-zinc-800/80 px-4 py-4">
      <div className="max-w-7xl mx-auto space-y-3">
        {/* Main Search Row */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* URL / Shorthand Input Form */}
          <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                <Search className="w-4 h-4" />
              </div>
              <input
                id="github-repo-url-input"
                type="text"
                value={repoUrl}
                onChange={(e) => {
                  setRepoUrl(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder="Paste GitHub URL or owner/repo (e.g. facebook/react or https://github.com/owner/repo/tree/main)"
                className="w-full pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-700/80 rounded-lg text-xs md:text-sm font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner"
              />
            </div>

            <button
              id="inspect-repo-submit-btn"
              type="submit"
              disabled={isLoading || !repoUrl.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs md:text-sm font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all shrink-0"
            >
              <span>{isLoading ? 'Inspecting...' : 'Inspect'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Secondary Controls (Branch & Commits per page & Direct SHA) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Branch Selector */}
            {branches.length > 0 && (
              <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs">
                <GitBranch className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <select
                  id="branch-selector"
                  value={selectedBranch}
                  onChange={(e) => onSelectBranch(e.target.value)}
                  className="bg-transparent text-zinc-200 text-xs font-mono focus:outline-none cursor-pointer pr-1 max-w-[140px] truncate"
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name} className="bg-zinc-900 text-zinc-200">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Commits Per Page Selector */}
            <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
              <Layers className="w-3.5 h-3.5 text-zinc-500 ml-1" />
              <span className="text-zinc-500 text-[11px]">Show:</span>
              {[10, 25, 50, 100].map((count) => (
                <button
                  key={count}
                  id={`per-page-${count}-btn`}
                  type="button"
                  onClick={() => onSelectPerPage(count)}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                    perPage === count
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>

            {/* Direct Commit SHA Quick Jump */}
            {repoInfo && (
              <form onSubmit={handleShaSubmit} className="flex items-center gap-1">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none text-zinc-500">
                    <Hash className="w-3 h-3" />
                  </div>
                  <input
                    id="direct-sha-input"
                    type="text"
                    value={directSha}
                    onChange={(e) => setDirectSha(e.target.value)}
                    placeholder="Jump to SHA..."
                    className="w-28 pl-6 pr-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <button
                  id="direct-sha-submit-btn"
                  type="submit"
                  disabled={!directSha.trim()}
                  className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono rounded-lg border border-zinc-700 disabled:opacity-40"
                  title="Load specific commit SHA"
                >
                  Go
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Validation Error Message */}
        {validationError && (
          <div
            id="url-validation-error"
            className="p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-center gap-2 animate-in fade-in"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Loaded Repo Summary Meta Card */}
        {repoInfo && (
          <div
            id="repo-meta-summary"
            className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-3.5 py-2 text-xs"
          >
            <div className="flex items-center gap-2.5">
              <img
                src={repoInfo.owner.avatar_url}
                alt={repoInfo.owner.login}
                className="w-5 h-5 rounded-full border border-zinc-700 object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="flex items-center gap-1.5">
                <a
                  href={repoInfo.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-zinc-100 hover:text-indigo-400 flex items-center gap-1"
                >
                  <span>{repoInfo.full_name}</span>
                  <ExternalLink className="w-3 h-3 text-zinc-500" />
                </a>
                {repoInfo.private ? (
                  <span className="flex items-center gap-0.5 text-[10px] text-amber-300 bg-amber-950/50 border border-amber-800/60 px-1.5 py-0.2 rounded font-mono">
                    <Lock className="w-2.5 h-2.5" /> Private
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-[10px] text-zinc-400 bg-zinc-800/50 border border-zinc-700/50 px-1.5 py-0.2 rounded font-mono">
                    <Globe className="w-2.5 h-2.5" /> Public
                  </span>
                )}
              </div>
              {repoInfo.description && (
                <span className="text-zinc-400 text-xs hidden md:inline truncate max-w-md">
                  — {repoInfo.description}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-zinc-400 font-mono text-[11px]">
              {repoInfo.language && (
                <span className="text-indigo-300 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-900/60">
                  {repoInfo.language}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-400" />
                {repoInfo.stargazers_count.toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <GitFork className="w-3.5 h-3.5 text-zinc-400" />
                {repoInfo.forks_count.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
