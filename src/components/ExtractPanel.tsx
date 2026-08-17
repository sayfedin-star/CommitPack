/**
 * @file src/components/ExtractPanel.tsx
 * @description Extraction control center offering Full Content vs Patch-Only modes,
 * pre-deletion inclusion toggle, live progress bar with cancellation, and per-file fetch status.
 */

import React from 'react';
import {
  FileCheck2,
  FileCode2,
  Zap,
  Sparkles,
  StopCircle,
  RefreshCw,
  Trash2,
  AlertTriangle,
  GitMerge,
  Info,
  CheckCircle2,
} from 'lucide-react';
import {
  ExtractionMode,
  ExtractionProgress,
  GitHubCommitDetail,
} from '../types/github';

interface ExtractPanelProps {
  commitDetail: GitHubCommitDetail;
  mode: ExtractionMode;
  onSelectMode: (mode: ExtractionMode) => void;
  includePreDeletion: boolean;
  onTogglePreDeletion: (include: boolean) => void;
  isExtracting: boolean;
  progress: ExtractionProgress;
  onStartExtraction: () => void;
  onCancelExtraction: () => void;
  isFullyExtracted: boolean;
}

/**
 * Extraction settings and execution panel.
 */
export const ExtractPanel: React.FC<ExtractPanelProps> = ({
  commitDetail,
  mode,
  onSelectMode,
  includePreDeletion,
  onTogglePreDeletion,
  isExtracting,
  progress,
  onStartExtraction,
  onCancelExtraction,
  isFullyExtracted,
}) => {
  const files = commitDetail.files || [];
  const removedFilesCount = files.filter((f) => f.status === 'removed').length;
  const isMergeCommit = commitDetail.parents && commitDetail.parents.length > 1;
  const isRootCommit = commitDetail.parents && commitDetail.parents.length === 0;

  const percentComplete =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div id="extract-panel-container" className="p-4 bg-zinc-900/40 border-b border-zinc-800 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Mode Selector Cards */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Full Content Mode Card */}
          <button
            id="mode-full-content-btn"
            type="button"
            onClick={() => onSelectMode('full')}
            disabled={isExtracting}
            className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 relative ${
              mode === 'full'
                ? 'bg-indigo-950/40 border-indigo-500/80 ring-1 ring-indigo-500/40'
                : 'bg-zinc-900/60 hover:bg-zinc-800/60 border-zinc-800 text-zinc-400'
            }`}
          >
            <div
              className={`p-2 rounded-lg ${
                mode === 'full'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              <FileCheck2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-bold ${mode === 'full' ? 'text-zinc-100' : 'text-zinc-300'}`}>
                  Full Content Mode
                </span>
                <span className="text-[10px] font-mono uppercase bg-indigo-900/80 text-indigo-300 px-1 py-0.2 rounded border border-indigo-700/50">
                  Default
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                Fetches complete file sources at commit ref for deep AI inspection.
              </p>
            </div>
          </button>

          {/* Patch Only Mode Card */}
          <button
            id="mode-patch-only-btn"
            type="button"
            onClick={() => onSelectMode('patch-only')}
            disabled={isExtracting}
            className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
              mode === 'patch-only'
                ? 'bg-indigo-950/40 border-indigo-500/80 ring-1 ring-indigo-500/40'
                : 'bg-zinc-900/60 hover:bg-zinc-800/60 border-zinc-800 text-zinc-400'
            }`}
          >
            <div
              className={`p-2 rounded-lg ${
                mode === 'patch-only'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <span className={`text-xs font-bold ${mode === 'patch-only' ? 'text-zinc-100' : 'text-zinc-300'}`}>
                Patch-Only Mode
              </span>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                Fast & lightweight. Packages only diff snippets without extra API calls.
              </p>
            </div>
          </button>
        </div>

        {/* Action Trigger Button */}
        <div className="flex items-center gap-3 self-end lg:self-center">
          {isExtracting ? (
            <button
              id="cancel-extraction-btn"
              type="button"
              onClick={onCancelExtraction}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 shadow-md shadow-rose-600/20 transition-colors"
            >
              <StopCircle className="w-4 h-4" />
              <span>Cancel ({progress.current}/{progress.total})</span>
            </button>
          ) : (
            <button
              id="start-extraction-btn"
              type="button"
              onClick={onStartExtraction}
              disabled={mode === 'patch-only' && isFullyExtracted}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-all transform active:scale-95"
            >
              {isFullyExtracted ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Re-Extract Files</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Extract Changed Files ({files.length})</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar & Status (when extracting) */}
      {isExtracting && (
        <div id="extraction-progress-box" className="p-3 bg-zinc-950 border border-indigo-900/60 rounded-xl space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 text-indigo-300">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>
                Fetching file <strong>{progress.current}</strong> of{' '}
                <strong>{progress.total}</strong>:
              </span>
              <span className="text-zinc-200 truncate max-w-xs font-semibold">
                {progress.currentFilename || 'Initializing...'}
              </span>
            </div>
            <span className="font-bold text-indigo-400">{percentComplete}%</span>
          </div>

          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-500 h-2 transition-all duration-200 rounded-full"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>
      )}

      {/* Success banner once fully extracted */}
      {isFullyExtracted && !isExtracting && (
        <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-xs text-emerald-300 flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Successfully extracted <strong>{files.length}</strong> changed files at commit ref. AI bundle and ZIP are ready for export below.
          </span>
        </div>
      )}

      {/* Options & Informational Notes */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400 pt-1">
        {/* Pre-deletion toggle for removed files */}
        {removedFilesCount > 0 && mode === 'full' && (
          <label className="flex items-center gap-2 cursor-pointer hover:text-zinc-200 select-none">
            <input
              id="include-predeletion-toggle"
              type="checkbox"
              checked={includePreDeletion}
              onChange={(e) => onTogglePreDeletion(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0 focus:ring-offset-0"
            />
            <span className="text-[11px]">
              Include pre-deletion versions for <strong>{removedFilesCount}</strong> deleted {removedFilesCount === 1 ? 'file' : 'files'} (fetched from parent SHA)
            </span>
          </label>
        )}

        {/* Merge or Root Commit notices */}
        {isMergeCommit && (
          <div className="flex items-center gap-1.5 text-[11px] text-purple-300 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800/50">
            <GitMerge className="w-3 h-3 text-purple-400" />
            <span>Merge commit: Git diffs may be combined; Full Content mode recommended.</span>
          </div>
        )}

        {isRootCommit && (
          <div className="flex items-center gap-1.5 text-[11px] text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-800/50">
            <Info className="w-3 h-3 text-blue-400" />
            <span>Root commit: Initial repository creation — all files treated as added.</span>
          </div>
        )}
      </div>
    </div>
  );
};
