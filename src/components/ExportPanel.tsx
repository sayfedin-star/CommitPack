/**
 * @file src/components/ExportPanel.tsx
 * @description Export Hub for AI Agent Markdown bundles, Agent Review Prompts,
 * structured JSON dumps, CSV commit lists, and DEFLATE-compressed ZIP downloads via JSZip.
 * Fully supports Single Commit and Compare Range modes with active file filtering and context files.
 */

import React, { useState, useMemo } from 'react';
import {
  Copy,
  Check,
  Download,
  FileJson,
  FileSpreadsheet,
  Archive,
  Sparkles,
  AlertTriangle,
  Bot,
  FileText,
  CheckCircle2,
  GitCompare,
  SlidersHorizontal,
} from 'lucide-react';
import {
  GitHubCommitDetail,
  GitHubCommitListItem,
  GitHubCommitFile,
  ExtractionMode,
} from '../types/github';
import {
  buildMarkdownBundle,
  buildJsonExport,
  buildCommitListCsv,
  BundleScopeOptions,
} from '../lib/bundle-builder';
import { downloadCommitZip } from '../lib/zip-builder';
import {
  estimateTokenCount,
  formatTokenCount,
  checkTokenBudget,
} from '../lib/token-counter';
import { AgentReviewPanel } from './AgentReviewPanel';
import { ContextFileItem } from '../types/review';

interface ExportPanelProps {
  repoName: string;
  repoFullName: string;
  branch: string;
  commitDetail: GitHubCommitDetail;
  commitList: GitHubCommitListItem[];
  mode: ExtractionMode;
  includePreDeletion: boolean;
  filesOverride?: GitHubCommitFile[];
  scopeOptions?: BundleScopeOptions;
  // Enhancement 2: Review Task & Prompt
  taskText: string;
  onChangeTaskText: (text: string) => void;
  onMarkReviewed?: () => void;
  lastReviewedSha?: string | null;
  excludedCount?: number;
}

/**
 * Output format rendering and download manager component.
 */
export const ExportPanel: React.FC<ExportPanelProps> = ({
  repoName,
  repoFullName,
  branch,
  commitDetail,
  commitList,
  mode,
  includePreDeletion,
  filesOverride,
  scopeOptions,
  taskText,
  onChangeTaskText,
  onMarkReviewed,
  lastReviewedSha,
  excludedCount = 0,
}) => {
  const [activeTab, setActiveTab] = useState<'review_prompt' | 'markdown' | 'json' | 'zip' | 'csv'>('review_prompt');
  const [hasCopiedMarkdown, setHasCopiedMarkdown] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipSuccess, setZipSuccess] = useState<boolean>(false);

  const isCompare = scopeOptions?.reviewMode === 'compare';
  const shortSha = commitDetail.sha.substring(0, 7);
  const baseSha = scopeOptions?.baseSha;
  const shortBase = baseSha ? baseSha.substring(0, 7) : 'base';
  const headSha = scopeOptions?.headSha || commitDetail.sha;
  const shortHead = headSha.substring(0, 7);

  // Generate Markdown Bundle with scope options and filtered files
  const markdownContent = useMemo(() => {
    return buildMarkdownBundle(
      repoFullName,
      branch,
      commitDetail,
      mode,
      includePreDeletion,
      filesOverride,
      scopeOptions
    );
  }, [repoFullName, branch, commitDetail, mode, includePreDeletion, filesOverride, scopeOptions]);

  // Estimate Tokens
  const estimatedTokens = useMemo(() => {
    return estimateTokenCount(markdownContent);
  }, [markdownContent]);

  const tokenBudget = useMemo(() => {
    return checkTokenBudget(estimatedTokens);
  }, [estimatedTokens]);

  // Generate JSON object
  const jsonContent = useMemo(() => {
    return JSON.stringify(buildJsonExport(repoFullName, branch, commitDetail, filesOverride), null, 2);
  }, [repoFullName, branch, commitDetail, filesOverride]);

  // Handle Markdown Copy
  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(markdownContent);
    setHasCopiedMarkdown(true);
    setTimeout(() => setHasCopiedMarkdown(false), 2500);
  };

  // Handle Markdown File Download
  const handleDownloadMarkdown = () => {
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isCompare
      ? `commitpack-${repoName}-${shortBase}-to-${shortHead}.md`
      : `commitpack-${repoName}-${shortSha}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle JSON File Download
  const handleDownloadJson = () => {
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ownerName = repoFullName.split('/')[0] || 'github';
    a.href = url;
    a.download = isCompare
      ? `${ownerName}-${repoName}-${shortBase}-to-${shortHead}.json`
      : `${ownerName}-${repoName}-${shortSha}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle CSV Download
  const handleDownloadCsv = () => {
    const csvData = buildCommitListCsv(commitList);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ownerName = repoFullName.split('/')[0] || 'github';
    a.href = url;
    a.download = `${ownerName}-${repoName}-commits.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle ZIP Generation & Download via JSZip
  const handleDownloadZip = async () => {
    setIsZipping(true);
    setZipSuccess(false);
    try {
      await downloadCommitZip(
        repoName,
        repoFullName,
        branch,
        commitDetail,
        includePreDeletion,
        filesOverride,
        scopeOptions
      );
      setZipSuccess(true);
      setTimeout(() => setZipSuccess(false), 3000);
    } catch (err) {
      console.error('ZIP generation error:', err);
    } finally {
      setIsZipping(false);
    }
  };

  const [ownerPart] = repoFullName.split('/');
  const effectiveFiles = filesOverride || commitDetail.files || [];

  return (
    <div id="export-panel-container" className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* Top Export Tabs */}
      <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1 text-xs">
          <button
            id="tab-review-prompt-btn"
            type="button"
            onClick={() => setActiveTab('review_prompt')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'review_prompt'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-indigo-300" />
            <span>Agent Review Prompt</span>
          </button>

          <button
            id="tab-markdown-btn"
            type="button"
            onClick={() => setActiveTab('markdown')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'markdown'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>AI Pack (MD)</span>
          </button>

          <button
            id="tab-json-btn"
            type="button"
            onClick={() => setActiveTab('json')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'json'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>JSON Object</span>
          </button>

          <button
            id="tab-zip-btn"
            type="button"
            onClick={() => setActiveTab('zip')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'zip'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>ZIP Archive</span>
          </button>

          <button
            id="tab-csv-btn"
            type="button"
            onClick={() => setActiveTab('csv')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'csv'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV Commits</span>
          </button>
        </div>

        {/* Action Controls for Active Tab */}
        <div className="flex items-center gap-2">
          {activeTab === 'markdown' && (
            <>
              {/* Token Counter Badge */}
              <div
                id="token-counter-badge"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border ${
                  tokenBudget.isOverBudget
                    ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                }`}
                title={`Estimated tokens: ~${estimatedTokens.toLocaleString()}`}
              >
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>
                  ~<strong>{formatTokenCount(estimatedTokens)}</strong> tokens
                </span>
              </div>

              {/* Copy Markdown Button */}
              <button
                id="copy-markdown-bundle-btn"
                type="button"
                onClick={handleCopyMarkdown}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
              >
                {hasCopiedMarkdown ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Pack</span>
                  </>
                )}
              </button>

              {/* Download Markdown Button */}
              <button
                id="download-markdown-bundle-btn"
                type="button"
                onClick={handleDownloadMarkdown}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono border border-zinc-700 transition-colors"
                title="Download as .md file"
              >
                <Download className="w-3.5 h-3.5" />
                <span>.md</span>
              </button>
            </>
          )}

          {activeTab === 'json' && (
            <button
              id="download-json-export-btn"
              type="button"
              onClick={handleDownloadJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download JSON</span>
            </button>
          )}

          {activeTab === 'csv' && (
            <button
              id="download-csv-export-btn"
              type="button"
              onClick={handleDownloadCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Content Display */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* TAB 1: Agent Review Task & Prompt */}
        {activeTab === 'review_prompt' && (
          <AgentReviewPanel
            owner={ownerPart || 'repo'}
            repo={repoName}
            branch={branch}
            mode={isCompare ? 'compare' : 'single'}
            baseSha={baseSha}
            headSha={headSha}
            githubUrl={scopeOptions?.compareUrl || commitDetail.html_url}
            includedFileCount={effectiveFiles.length}
            excludedFileCount={excludedCount}
            taskText={taskText}
            onChangeTaskText={onChangeTaskText}
            commitPackMarkdown={markdownContent}
            onMarkReviewed={onMarkReviewed}
            lastReviewedSha={lastReviewedSha}
          />
        )}

        {/* TAB 2: AI Agent Markdown Bundle Preview */}
        {activeTab === 'markdown' && (
          <div className="space-y-3">
            {/* Token Budget Warning Banner */}
            {tokenBudget.isOverBudget && (
              <div
                id="token-budget-warning-banner"
                className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-xl text-xs text-amber-300 flex items-start gap-2.5 font-mono"
              >
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Token Warning:</span> This bundle contains ~
                  {estimatedTokens.toLocaleString()} tokens, exceeding the suggested{' '}
                  {tokenBudget.modelSuggestion} budget. Consider switching to Patch-Only mode or using File Filters to reduce token volume.
                </div>
              </div>
            )}

            <div className="relative">
              <pre
                id="markdown-preview-output"
                className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-200 overflow-x-auto whitespace-pre-wrap leading-relaxed select-text max-h-[600px]"
              >
                <code>{markdownContent}</code>
              </pre>
            </div>
          </div>
        )}

        {/* TAB 3: JSON Object Export */}
        {activeTab === 'json' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
              <span>Structured JSON representation of commit metadata and modified files</span>
              <span>{effectiveFiles.length} files included</span>
            </div>
            <pre
              id="json-preview-output"
              className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-200 overflow-x-auto whitespace-pre-wrap leading-relaxed select-text max-h-[600px]"
            >
              <code>{jsonContent}</code>
            </pre>
          </div>
        )}

        {/* TAB 4: ZIP Archive Download Hub */}
        {activeTab === 'zip' && (
          <div id="zip-export-container" className="max-w-xl mx-auto py-8 space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto shadow-inner">
              <Archive className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-bold text-zinc-100">
                Download ZIP Archive of Changed Files
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Creates a clean directory archive with all modified files preserving their repository paths,
                plus a <code className="text-zinc-200 font-mono">COMMIT_INFO.md</code> summary file at root.
              </p>
            </div>

            {/* ZIP Info summary */}
            <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-300 max-w-md mx-auto text-left space-y-2">
              <div className="flex justify-between">
                <span className="text-zinc-500">Archive format:</span>
                <span>DEFLATE Level 9 (.zip)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Mode:</span>
                <span className="text-indigo-300 capitalize">{isCompare ? 'Compare Range' : 'Single Commit'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Included files:</span>
                <span>{effectiveFiles.length} files</span>
              </div>
              {scopeOptions?.contextFiles && scopeOptions.contextFiles.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Context files:</span>
                  <span>{scopeOptions.contextFiles.length} files (in _context_files/)</span>
                </div>
              )}
            </div>

            {/* ZIP Action Button */}
            <div>
              <button
                id="generate-and-download-zip-btn"
                type="button"
                onClick={handleDownloadZip}
                disabled={isZipping}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-600/30 flex items-center gap-2 mx-auto transition-all active:scale-95"
              >
                {isZipping ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Compressing Files...</span>
                  </>
                ) : zipSuccess ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                    <span>Downloaded!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>
                      Download {isCompare ? `${shortBase}-to-${shortHead}` : shortSha}.zip
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: CSV Commits Export */}
        {activeTab === 'csv' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
              <span>CSV dump of all loaded timeline commits ({commitList.length} total)</span>
              <span>Spreadsheet ready</span>
            </div>
            <pre
              id="csv-preview-output"
              className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-200 overflow-x-auto whitespace-pre-wrap leading-relaxed select-text max-h-[600px]"
            >
              <code>{buildCommitListCsv(commitList)}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
