/**
 * @file src/components/ReviewCommitPage.tsx
 * @description Dedicated task-first page for reviewing a commit and building
 * structured AI review bundles with progressive disclosure for advanced options.
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  GitCommit,
  Bot,
  FileCode2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  Archive,
  FileSpreadsheet,
  FileJson,
  GitCompare,
  Layers,
  AlertCircle,
  Clock,
} from 'lucide-react';
import {
  GitHubCommitListItem,
  GitHubCommitDetail,
  GitHubCommitFile,
  ExtractionMode,
  ExtractionProgress,
  GitHubRepoInfo,
} from '../types/github';
import {
  FileFilterConfig,
  ContextFileItem,
  GitHubCompareResult,
} from '../types/review';
import { BundleScopeOptions, buildMarkdownBundle, buildJsonExport, buildCommitListCsv } from '../lib/bundle-builder';
import { downloadCommitZip } from '../lib/zip-builder';
import { Timeline } from './Timeline';
import { DiffViewer } from './DiffViewer';
import { FileFiltersPanel } from './FileFiltersPanel';
import { AgentReviewPanel } from './AgentReviewPanel';
import { CompareRangeSelector } from './CompareRangeSelector';
import { estimateTokenCount, formatTokenCount } from '../lib/token-counter';

interface ReviewCommitPageProps {
  repoInfo: GitHubRepoInfo | null;
  selectedBranch: string;
  commits: GitHubCommitListItem[];
  selectedSha: string | null;
  onSelectCommit: (sha: string) => void;
  isLoadingCommits: boolean;
  commitDetail: GitHubCommitDetail | null;
  isLoadingCommitDetail: boolean;
  perPage: number;
  onSelectPerPage: (count: number) => void;
  // Extraction
  extractionMode: ExtractionMode;
  onSelectExtractionMode: (mode: ExtractionMode) => void;
  includePreDeletion: boolean;
  onTogglePreDeletion: (val: boolean) => void;
  isExtracting: boolean;
  extractionProgress: ExtractionProgress;
  onStartExtraction: () => void;
  onCancelExtraction: () => void;
  isFullyExtracted: boolean;
  // Filter state
  filterConfig: FileFilterConfig;
  onChangeFilterConfig: (config: FileFilterConfig) => void;
  filteredFiles: {
    included: GitHubCommitFile[];
    excluded: any[];
    patternErrors: string[];
  };
  contextFiles: ContextFileItem[];
  onAddContextFile: (path: string) => void;
  onRemoveContextFile: (path: string) => void;
  showExcludedInDiff: boolean;
  onToggleShowExcludedInDiff: (val: boolean) => void;
  // Task & Checkpoints
  taskText: string;
  onChangeTaskText: (text: string) => void;
  onMarkReviewed: () => void;
  lastReviewedSha: string | null;
  // Compare Range
  reviewMode: 'single' | 'compare';
  onSelectReviewMode: (mode: 'single' | 'compare') => void;
  baseSha: string;
  headSha: string;
  onChangeBaseSha: (sha: string) => void;
  onChangeHeadSha: (sha: string) => void;
  onRunCompare: (base: string, head: string) => void;
  isLoadingCompare: boolean;
  compareResult: GitHubCompareResult | null;
  onSinceLastReview: () => void;
  pat: string | null;
}

export const ReviewCommitPage: React.FC<ReviewCommitPageProps> = ({
  repoInfo,
  selectedBranch,
  commits,
  selectedSha,
  onSelectCommit,
  isLoadingCommits,
  commitDetail,
  isLoadingCommitDetail,
  perPage,
  onSelectPerPage,
  extractionMode,
  onSelectExtractionMode,
  includePreDeletion,
  onTogglePreDeletion,
  isExtracting,
  extractionProgress,
  onStartExtraction,
  onCancelExtraction,
  isFullyExtracted,
  filterConfig,
  onChangeFilterConfig,
  filteredFiles,
  contextFiles,
  onAddContextFile,
  onRemoveContextFile,
  showExcludedInDiff,
  onToggleShowExcludedInDiff,
  taskText,
  onChangeTaskText,
  onMarkReviewed,
  lastReviewedSha,
  reviewMode,
  onSelectReviewMode,
  baseSha,
  headSha,
  onChangeBaseSha,
  onChangeHeadSha,
  onRunCompare,
  isLoadingCompare,
  compareResult,
  onSinceLastReview,
  pat,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'diff' | 'review_prompt'>('diff');
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipSuccess, setZipSuccess] = useState<boolean>(false);
  const [hasCopiedBundle, setHasCopiedBundle] = useState<boolean>(false);

  const rawFiles = commitDetail?.files || [];
  const includedCount = filteredFiles.included.length;
  const excludedCount = filteredFiles.excluded.length;

  const bundleScopeOptions: BundleScopeOptions = useMemo(() => {
    return {
      reviewMode,
      baseSha: reviewMode === 'compare' ? baseSha : undefined,
      headSha: reviewMode === 'compare' ? headSha : commitDetail?.sha,
      compareUrl: compareResult?.html_url,
      totalCommits: compareResult?.total_commits,
      aheadBy: compareResult?.ahead_by,
      contextFiles: filterConfig.includeContextFiles ? contextFiles : [],
    };
  }, [reviewMode, baseSha, headSha, commitDetail?.sha, compareResult, filterConfig.includeContextFiles, contextFiles]);

  const handleBuildPackClick = () => {
    onStartExtraction();
    setActiveSubTab('review_prompt');
  };

  const handleDownloadZip = async () => {
    if (!commitDetail || !repoInfo) return;
    setIsZipping(true);
    try {
      await downloadCommitZip(
        repoInfo.name,
        commitDetail.sha,
        filteredFiles.included,
        extractionMode,
        includePreDeletion,
        pat
      );
      setZipSuccess(true);
      setTimeout(() => setZipSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to download ZIP:', err);
    } finally {
      setIsZipping(false);
    }
  };

  const commitPackMarkdown = useMemo(() => {
    if (!commitDetail || !repoInfo) return '';
    return buildMarkdownBundle(
      repoInfo.full_name,
      selectedBranch,
      commitDetail,
      extractionMode,
      includePreDeletion,
      filteredFiles.included,
      bundleScopeOptions
    );
  }, [
    commitDetail,
    repoInfo,
    selectedBranch,
    extractionMode,
    includePreDeletion,
    filteredFiles.included,
    bundleScopeOptions,
  ]);

  const handleCopyMarkdownBundle = () => {
    if (!commitPackMarkdown) return;
    navigator.clipboard.writeText(commitPackMarkdown);
    setHasCopiedBundle(true);
    setTimeout(() => setHasCopiedBundle(false), 2000);
  };

  return (
    <div id="review-commit-page" className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* Left Column: Vertical Commit Timeline */}
      <aside
        id="review-timeline-sidebar"
        className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col shrink-0 h-64 md:h-[calc(100vh-7.5rem)] transition-colors"
      >
        {/* Timeline Header & Per-Page Picker */}
        <div className="p-3 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="font-semibold text-xs text-slate-800 dark:text-zinc-200">
              {reviewMode === 'compare' ? 'Timeline (Range)' : 'Commit History'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              {commits.length} commits
            </span>
            <select
              value={perPage}
              onChange={(e) => onSelectPerPage(Number(e.target.value))}
              aria-label="Commits per page"
              className="text-[11px] font-mono bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 rounded px-1.5 py-0.5 cursor-pointer focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Timeline List */}
        <div className="flex-1 overflow-y-auto">
          <Timeline
            commits={commits}
            selectedSha={reviewMode === 'compare' ? headSha : selectedSha}
            onSelectCommit={onSelectCommit}
            isLoading={isLoadingCommits}
          />
        </div>
      </aside>

      {/* Right Column: Commit Review & Packaging Workshop */}
      <main
        id="review-main-area"
        className="flex-1 flex flex-col bg-slate-50/50 dark:bg-zinc-950 overflow-hidden min-h-0 md:h-[calc(100vh-7.5rem)] transition-colors"
      >
        {commitDetail ? (
          <div className="h-full flex flex-col min-h-0 overflow-hidden">
            {/* 1. Selected Commit Summary Header */}
            <div
              id="selected-commit-summary-card"
              className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0"
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 bg-indigo-600 text-white rounded shadow-xs">
                    {reviewMode === 'compare'
                      ? `${(baseSha || '').substring(0, 7)}...${(headSha || '').substring(0, 7)}`
                      : (commitDetail.sha || '').substring(0, 7)}
                  </span>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 truncate">
                    {commitDetail.commit.message?.split('\n')[0] || '(no commit message)'}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                  <span>
                    by <strong className="text-slate-800 dark:text-zinc-200">{commitDetail.commit.author?.name || 'Unknown'}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    {commitDetail.commit.author?.date
                      ? new Date(commitDetail.commit.author.date).toLocaleString()
                      : ''}
                  </span>
                  <span>•</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    +{commitDetail.stats?.additions || 0}
                  </span>
                  <span className="text-rose-600 dark:text-rose-400 font-semibold">
                    −{commitDetail.stats?.deletions || 0}
                  </span>
                  <span>•</span>
                  <span className="text-slate-700 dark:text-zinc-300 font-semibold">
                    {includedCount} {includedCount === 1 ? 'file' : 'files'} changed
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <a
                  href={commitDetail.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-mono border border-slate-200 dark:border-zinc-700 transition-colors"
                >
                  <span>GitHub</span>
                  <ExternalLink className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                </a>
              </div>
            </div>

            {/* 2. Review Task & Primary Action Bar */}
            <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/40 space-y-3 shrink-0">
              {/* Task Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="review-task-input" className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Review Task & Acceptance Criteria</span>
                    <span className="text-[11px] font-normal text-slate-400 dark:text-zinc-500">(included in AI Prompt)</span>
                  </label>

                  {/* Quick Presets */}
                  <div className="hidden sm:flex items-center gap-1 text-[10px]">
                    <span className="text-slate-400 dark:text-zinc-500">Presets:</span>
                    <button
                      type="button"
                      onClick={() => onChangeTaskText('Perform a rigorous code review focusing on correctness, edge cases, performance, and security.')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded text-slate-600 dark:text-zinc-300"
                    >
                      General Review
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeTaskText('Verify security implications, input sanitization, authentication/authorization checks, and safe dependency usage.')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded text-slate-600 dark:text-zinc-300"
                    >
                      Security
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeTaskText('Analyze test coverage, verify regression risks, and check if all edge cases are tested.')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded text-slate-600 dark:text-zinc-300"
                    >
                      Tests
                    </button>
                  </div>
                </div>

                <textarea
                  id="review-task-input"
                  rows={2}
                  value={taskText}
                  onChange={(e) => onChangeTaskText(e.target.value)}
                  placeholder="e.g. Verify that error handling is robust, no memory leaks occur, and breaking changes are flagged..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-none transition-colors"
                />
              </div>

              {/* Action Controls Row */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Extraction Mode Dropdown */}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-500 dark:text-zinc-400 font-medium">Mode:</span>
                    <select
                      id="extraction-mode-select"
                      value={extractionMode}
                      onChange={(e) => onSelectExtractionMode(e.target.value as ExtractionMode)}
                      className="bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 text-xs rounded-md px-2.5 py-1.5 font-medium cursor-pointer focus:outline-none"
                    >
                      <option value="full">Full Content (Recommended)</option>
                      <option value="patch-only">Patch Only</option>
                    </select>
                  </div>

                  {/* Pre-deletion toggle */}
                  {extractionMode === 'full' && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includePreDeletion}
                        onChange={(e) => onTogglePreDeletion(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-zinc-700"
                      />
                      <span>Include deleted file history</span>
                    </label>
                  )}
                </div>

                {/* Primary Action Button */}
                <div className="flex items-center gap-2">
                  <button
                    id="build-review-pack-primary-btn"
                    type="button"
                    onClick={handleBuildPackClick}
                    disabled={isExtracting}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isExtracting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Extracting ({extractionProgress.current}/{extractionProgress.total})...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Build Review Pack</span>
                      </>
                    )}
                  </button>

                  {/* Advanced Options Toggle */}
                  <button
                    id="toggle-advanced-review-options-btn"
                    type="button"
                    onClick={() => setShowAdvanced((prev) => !prev)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      showAdvanced || excludedCount > 0 || reviewMode === 'compare'
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Advanced</span>
                    {excludedCount > 0 && (
                      <span className="px-1 py-0.2 rounded text-[10px] font-mono bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                        {excludedCount} excluded
                      </span>
                    )}
                    {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Extraction Progress Bar if Extracting */}
              {isExtracting && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                    <span className="truncate max-w-xs">{extractionProgress.currentFilename}</span>
                    <span>{Math.round((extractionProgress.current / Math.max(1, extractionProgress.total)) * 100)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-150"
                      style={{ width: `${(extractionProgress.current / Math.max(1, extractionProgress.total)) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Advanced Options Drawer (Progressive Disclosure) */}
            {showAdvanced && (
              <div
                id="advanced-review-options-panel"
                className="p-3 sm:p-4 bg-slate-100/90 dark:bg-zinc-900/90 border-b border-slate-200 dark:border-zinc-800 space-y-3 shrink-0 transition-all"
              >
                {/* Compare Range Mode Toggle */}
                <div className="flex items-center justify-between p-2.5 bg-white dark:bg-zinc-950 rounded-lg border border-slate-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <GitCompare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">Review Mode:</span>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        Switch between reviewing a single commit vs comparing a range of commits.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-lg text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => onSelectReviewMode('single')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        reviewMode === 'single'
                          ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      Single Commit
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectReviewMode('compare')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        reviewMode === 'compare'
                          ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      Compare Range
                    </button>
                  </div>
                </div>

                {/* Compare Range Bar if active */}
                {reviewMode === 'compare' && repoInfo && (
                  <CompareRangeSelector
                    commits={commits}
                    baseSha={baseSha}
                    headSha={headSha}
                    onChangeBaseSha={onChangeBaseSha}
                    onChangeHeadSha={onChangeHeadSha}
                    onRunCompare={onRunCompare}
                    isLoading={isLoadingCompare}
                    compareResult={compareResult}
                    lastReviewedSha={lastReviewedSha}
                    onSinceLastReview={onSinceLastReview}
                    branch={selectedBranch}
                  />
                )}

                {/* File Filters & Presets Panel */}
                <FileFiltersPanel
                  config={filterConfig}
                  onChangeConfig={onChangeFilterConfig}
                  totalFilesCount={rawFiles.length}
                  includedFilesCount={includedCount}
                  excludedFiles={filteredFiles.excluded}
                  patternErrors={filteredFiles.patternErrors}
                  contextFiles={contextFiles}
                  onAddContextFile={onAddContextFile}
                  onRemoveContextFile={onRemoveContextFile}
                  showExcludedInDiff={showExcludedInDiff}
                  onToggleShowExcludedInDiff={onToggleShowExcludedInDiff}
                />

                {/* Extra Export Formats (ZIP, CSV, Raw Markdown) */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-white dark:bg-zinc-950 rounded-lg border border-slate-200 dark:border-zinc-800 text-xs">
                  <span className="font-semibold text-slate-700 dark:text-zinc-300">
                    Additional Export Tools:
                  </span>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleCopyMarkdownBundle}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-medium transition-colors"
                    >
                      {hasCopiedBundle ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>Copy Raw Markdown Bundle</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadZip}
                      disabled={isZipping}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-medium transition-colors"
                    >
                      {zipSuccess ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Archive className="w-3 h-3 text-amber-500" />
                      )}
                      <span>{isZipping ? 'Zipping...' : 'Download ZIP'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Sub-Navigation Tabs: Diff Viewer vs AI Review Pack */}
            <div className="px-3 sm:px-4 py-2 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg p-1 text-xs">
                <button
                  id="subtab-diff-viewer-btn"
                  type="button"
                  onClick={() => setActiveSubTab('diff')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
                    activeSubTab === 'diff'
                      ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <FileCode2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Diff Viewer ({includedCount})</span>
                </button>

                <button
                  id="subtab-review-prompt-btn"
                  type="button"
                  onClick={() => setActiveSubTab('review_prompt')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
                    activeSubTab === 'review_prompt'
                      ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>AI Review Pack & Exports</span>
                </button>
              </div>

              {lastReviewedSha && (
                <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Last reviewed: {lastReviewedSha.substring(0, 7)}</span>
                </div>
              )}
            </div>

            {/* 5. Sub-Views: Diff Viewer vs Agent Review & Export */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {activeSubTab === 'diff' ? (
                <DiffViewer
                  commitDetail={commitDetail}
                  files={filteredFiles.included}
                  excludedFiles={filteredFiles.excluded}
                  showExcluded={showExcludedInDiff}
                  selectedFileIndex={selectedFileIndex}
                  onSelectFileIndex={setSelectedFileIndex}
                />
              ) : (
                <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full">
                  <AgentReviewPanel
                    owner={repoInfo?.owner?.login || repoInfo?.full_name?.split('/')[0] || ''}
                    repo={repoInfo?.name || repoInfo?.full_name?.split('/')[1] || ''}
                    branch={selectedBranch}
                    mode={reviewMode}
                    baseSha={reviewMode === 'compare' ? baseSha : undefined}
                    headSha={reviewMode === 'compare' && headSha ? headSha : commitDetail.sha}
                    githubUrl={commitDetail.html_url || `https://github.com/${repoInfo?.full_name}/commit/${commitDetail.sha}`}
                    includedFileCount={includedCount}
                    excludedFileCount={excludedCount}
                    taskText={taskText || ''}
                    onChangeTaskText={onChangeTaskText}
                    commitPackMarkdown={commitPackMarkdown}
                    onMarkReviewed={onMarkReviewed}
                    lastReviewedSha={lastReviewedSha}
                  />
                </div>
              )}
            </div>
          </div>
        ) : isLoadingCommitDetail || isLoadingCompare ? (
          <div className="h-full flex items-center justify-center p-8 text-slate-500 dark:text-zinc-400">
            <div className="text-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto" />
              <p className="text-xs font-mono">
                {isLoadingCompare ? 'Comparing commit range...' : 'Loading commit details & diffs...'}
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-8 text-slate-400 dark:text-zinc-500">
            <div className="text-center space-y-2 max-w-sm">
              <GitCommit className="w-8 h-8 mx-auto opacity-40 text-slate-400" />
              <p className="text-xs font-medium">Select a commit from the timeline on the left to start review.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
