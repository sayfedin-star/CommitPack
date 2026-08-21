/**
 * @file src/components/CompareRangeSelector.tsx
 * @description Range comparison control allowing selection of Base and Head commits,
 * custom SHA pasting, timeline order validation, and one-click 'Since Last Review' comparison.
 */

import React, { useState } from 'react';
import {
  GitCompare,
  ArrowRight,
  Clock,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  History,
  CheckCircle2,
  RefreshCw,
  Hash,
} from 'lucide-react';
import { GitHubCommitListItem } from '../types/github';
import { GitHubCompareResult } from '../types/review';

interface CompareRangeSelectorProps {
  commits: GitHubCommitListItem[];
  baseSha: string;
  headSha: string;
  onChangeBaseSha: (sha: string) => void;
  onChangeHeadSha: (sha: string) => void;
  onRunCompare: (base: string, head: string) => void;
  isLoading: boolean;
  compareResult: GitHubCompareResult | null;
  lastReviewedSha: string | null;
  onSinceLastReview: () => void;
  branch: string;
}

export const CompareRangeSelector: React.FC<CompareRangeSelectorProps> = ({
  commits,
  baseSha,
  headSha,
  onChangeBaseSha,
  onChangeHeadSha,
  onRunCompare,
  isLoading,
  compareResult,
  lastReviewedSha,
  onSinceLastReview,
  branch,
}) => {
  const [customBase, setCustomBase] = useState(false);
  const [customHead, setCustomHead] = useState(false);
  const [noReviewNotice, setNoReviewNotice] = useState(false);

  // Validation
  const safeBase = (baseSha || '').trim();
  const safeHead = (headSha || '').trim();
  const isIdentical = Boolean(safeBase && safeHead && safeBase === safeHead);
  const canCompare = Boolean(safeBase && safeHead && !isIdentical && !isLoading);

  // Timeline ordering detection (index 0 is newest commit)
  const baseIndex = safeBase ? commits.findIndex((c) => c.sha.startsWith(safeBase) || safeBase.startsWith(c.sha)) : -1;
  const headIndex = safeHead ? commits.findIndex((c) => c.sha.startsWith(safeHead) || safeHead.startsWith(c.sha)) : -1;
  const isOrderingInverted = baseIndex >= 0 && headIndex >= 0 && baseIndex < headIndex;

  const handleSinceReviewClick = () => {
    if (!lastReviewedSha) {
      setNoReviewNotice(true);
      setTimeout(() => setNoReviewNotice(false), 5000);
      return;
    }
    onSinceLastReview();
  };

  const handleSwap = () => {
    const temp = baseSha;
    onChangeBaseSha(headSha);
    onChangeHeadSha(temp);
  };

  return (
    <div id="compare-range-selector" className="p-4 bg-slate-50/80 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800 space-y-4 transition-colors">
      {/* Top Bar: Headline & Quick Since Last Review action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
            <GitCompare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
              <span>Compare Range</span>
              <span className="text-[10px] font-mono font-normal bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-200 dark:border-indigo-800/60">
                Base...Head
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Inspect all changes between two commits or check updates since last review.
            </p>
          </div>
        </div>

        {/* Since Last Review Trigger */}
        <div className="flex items-center gap-2">
          <button
            id="since-last-review-btn"
            type="button"
            onClick={handleSinceReviewClick}
            disabled={isLoading}
            className="px-3 py-1.5 bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200 text-xs font-mono rounded-lg border border-indigo-200 dark:border-indigo-900/80 hover:border-indigo-300 dark:hover:border-indigo-700 flex items-center gap-1.5 transition-all shadow-xs"
            title={
              lastReviewedSha
                ? `Compare from checkpoint (${lastReviewedSha.substring(0, 7)}) to branch HEAD`
                : 'No review checkpoint saved for this branch'
            }
          >
            <History className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Since Last Review</span>
            {lastReviewedSha && (
              <span className="text-[10px] text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-950 px-1.5 py-0.2 rounded border border-slate-200 dark:border-zinc-800 font-mono">
                {lastReviewedSha.substring(0, 7)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* No Review Checkpoint Notice */}
      {noReviewNotice && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 font-mono animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
          <span>
            No prior review checkpoint for this repository and branch. Select a Base commit manually, then mark a review completed.
          </span>
        </div>
      )}

      {/* Commit Selector Controls: Base -> Head */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Base Commit Picker */}
        <div className="md:col-span-5 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              <span>Base Commit (Older)</span>
            </label>
            <button
              type="button"
              onClick={() => setCustomBase(!customBase)}
              className="text-[10px] font-mono text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              {customBase ? 'Select from list' : 'Paste SHA'}
            </button>
          </div>

          {customBase ? (
            <input
              id="custom-base-sha-input"
              type="text"
              value={baseSha}
              onChange={(e) => onChangeBaseSha(e.target.value.trim())}
              placeholder="Paste Base commit SHA or tag..."
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700/80 rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <select
              id="base-commit-selector"
              value={baseSha}
              onChange={(e) => onChangeBaseSha(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700/80 rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 truncate"
            >
              <option value="" className="bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300">-- Select Base Commit --</option>
              {commits.map((c) => {
                const short = c.sha.substring(0, 7);
                const msg = (c.commit.message || '').split('\n')[0];
                return (
                  <option key={c.sha} value={c.sha} className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-200">
                    {short} - {msg.substring(0, 45)}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        {/* Swap / Arrow Button */}
        <div className="md:col-span-2 flex justify-center">
          <button
            id="swap-range-commits-btn"
            type="button"
            onClick={handleSwap}
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 rounded-lg border border-slate-200 dark:border-zinc-700/80 transition-colors"
            title="Swap Base and Head"
          >
            <ArrowRight className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </button>
        </div>

        {/* Head Commit Picker */}
        <div className="md:col-span-5 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span>Head Commit (Newer / Target)</span>
            </label>
            <button
              type="button"
              onClick={() => setCustomHead(!customHead)}
              className="text-[10px] font-mono text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              {customHead ? 'Select from list' : 'Paste SHA'}
            </button>
          </div>

          {customHead ? (
            <input
              id="custom-head-sha-input"
              type="text"
              value={headSha}
              onChange={(e) => onChangeHeadSha(e.target.value.trim())}
              placeholder="Paste Head commit SHA or branch..."
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700/80 rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <select
              id="head-commit-selector"
              value={headSha}
              onChange={(e) => onChangeHeadSha(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700/80 rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 truncate"
            >
              <option value="" className="bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300">-- Select Head Commit --</option>
              {commits.map((c) => {
                const short = c.sha.substring(0, 7);
                const msg = (c.commit.message || '').split('\n')[0];
                return (
                  <option key={c.sha} value={c.sha} className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-200">
                    {short} - {msg.substring(0, 45)}
                  </option>
                );
              })}
            </select>
          )}
        </div>
      </div>

      {/* Warnings & Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="space-y-1">
          {isIdentical && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-mono">
              Base and Head commits cannot be identical.
            </p>
          )}
          {isOrderingInverted && (
            <p className="text-xs text-amber-700 dark:text-amber-400 font-mono flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Base appears newer than Head in timeline. Use Swap if you intend to compare older to newer.</span>
            </p>
          )}
        </div>

        <button
          id="compare-range-submit-btn"
          type="button"
          onClick={() => onRunCompare(baseSha, headSha)}
          disabled={!canCompare}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold font-mono flex items-center gap-2 shadow-sm transition-all ml-auto"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Comparing...</span>
            </>
          ) : (
            <>
              <GitCompare className="w-3.5 h-3.5" />
              <span>Compare Range</span>
            </>
          )}
        </button>
      </div>

      {/* Comparison Results Meta Card */}
      {compareResult && (
        <div
          id="compare-range-result-summary"
          className="p-3 bg-white dark:bg-zinc-950 border border-indigo-200 dark:border-indigo-900/60 rounded-xl space-y-2 text-xs font-mono animate-in fade-in shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-bold">
                Comparison: {compareResult.total_commits} {compareResult.total_commits === 1 ? 'commit' : 'commits'} in range
              </span>
              {compareResult.ahead_by > 0 && (
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  (Ahead by {compareResult.ahead_by}
                  {compareResult.behind_by > 0 ? `, Behind by ${compareResult.behind_by}` : ''})
                </span>
              )}
            </div>

            {compareResult.html_url && (
              <a
                href={compareResult.html_url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-slate-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-300 flex items-center gap-1"
              >
                <span>View Compare on GitHub</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-zinc-400">
            <span>
              Base: <strong className="text-slate-800 dark:text-zinc-200 font-mono">{(baseSha || '').substring(0, 7)}</strong>
            </span>
            <span>
              Head: <strong className="text-slate-800 dark:text-zinc-200 font-mono">{(headSha || '').substring(0, 7)}</strong>
            </span>
            <span>
              Files: <strong className="text-slate-800 dark:text-zinc-200">{compareResult.files?.length || 0}</strong>
            </span>
          </div>

          {/* Large comparison warning if applicable */}
          {(compareResult.files?.length || 0) >= 250 && (
            <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              <span>
                GitHub may limit or paginate changed files for large comparisons. Narrow the range or verify completeness before exporting.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
