/**
 * @file src/components/ExportPanel.tsx
 * @description Export Hub for AI Agent Markdown bundles, structured JSON dumps,
 * CSV commit lists, and DEFLATE-compressed ZIP downloads via JSZip.
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
} from 'lucide-react';
import {
  GitHubCommitDetail,
  GitHubCommitListItem,
  ExtractionMode,
} from '../types/github';
import {
  buildMarkdownBundle,
  buildJsonExport,
  buildCommitListCsv,
} from '../lib/bundle-builder';
import { downloadCommitZip } from '../lib/zip-builder';
import {
  estimateTokenCount,
  formatTokenCount,
  checkTokenBudget,
} from '../lib/token-counter';

interface ExportPanelProps {
  repoName: string;
  repoFullName: string;
  branch: string;
  commitDetail: GitHubCommitDetail;
  commitList: GitHubCommitListItem[];
  mode: ExtractionMode;
  includePreDeletion: boolean;
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
}) => {
  const [activeTab, setActiveTab] = useState<'markdown' | 'json' | 'zip' | 'csv'>('markdown');
  const [hasCopiedMarkdown, setHasCopiedMarkdown] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipSuccess, setZipSuccess] = useState<boolean>(false);

  const shortSha = commitDetail.sha.substring(0, 7);

  // Generate Markdown Bundle
  const markdownContent = useMemo(() => {
    return buildMarkdownBundle(repoFullName, branch, commitDetail, mode, includePreDeletion);
  }, [repoFullName, branch, commitDetail, mode, includePreDeletion]);

  // Estimate Tokens
  const estimatedTokens = useMemo(() => {
    return estimateTokenCount(markdownContent);
  }, [markdownContent]);

  const tokenBudget = useMemo(() => {
    return checkTokenBudget(estimatedTokens);
  }, [estimatedTokens]);

  // Generate JSON object
  const jsonContent = useMemo(() => {
    return JSON.stringify(buildJsonExport(repoFullName, branch, commitDetail), null, 2);
  }, [repoFullName, branch, commitDetail]);

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
    a.download = `commitpack-${repoName}-${shortSha}.md`;
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
    a.download = `${ownerName}-${repoName}-${shortSha}.json`;
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
      await downloadCommitZip(repoName, repoFullName, branch, commitDetail, includePreDeletion);
      setZipSuccess(true);
      setTimeout(() => setZipSuccess(false), 3000);
    } catch (err) {
      console.error('ZIP generation error:', err);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div id="export-panel-container" className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* Top Export Tabs */}
      <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1 text-xs">
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
            <Bot className="w-3.5 h-3.5" />
            <span>AI Agent Pack (MD)</span>
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

        {/* Action Controls for Current Tab */}
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
                    <span>Copy for AI</span>
                  </>
                )}
              </button>

              {/* Download MD Button */}
              <button
                id="download-md-btn"
                type="button"
                onClick={handleDownloadMarkdown}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-md transition-colors"
                title="Download .md file"
              >
                <Download className="w-4 h-4" />
              </button>
            </>
          )}

          {activeTab === 'json' && (
            <button
              id="download-json-btn"
              type="button"
              onClick={handleDownloadJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-mono border border-zinc-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download JSON</span>
            </button>
          )}

          {activeTab === 'csv' && (
            <button
              id="download-csv-btn"
              type="button"
              onClick={handleDownloadCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-mono border border-zinc-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV ({commitList.length} rows)</span>
            </button>
          )}
        </div>
      </div>

      {/* Token Over-Budget Warning Banner */}
      {activeTab === 'markdown' && tokenBudget.isOverBudget && (
        <div
          id="token-warning-banner"
          className="px-4 py-2 bg-amber-950/40 border-b border-amber-800/60 text-xs text-amber-300 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{tokenBudget.warning}</span>
        </div>
      )}

      {/* Main Tab Content View */}
      <div className="flex-1 overflow-auto p-4 select-text">
        {activeTab === 'markdown' && (
          <div className="space-y-2">
            <pre className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl font-mono text-xs text-zinc-200 overflow-x-auto leading-relaxed whitespace-pre-wrap">
              <code>{markdownContent}</code>
            </pre>
          </div>
        )}

        {activeTab === 'json' && (
          <div className="space-y-2">
            <pre className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed">
              <code>{jsonContent}</code>
            </pre>
          </div>
        )}

        {activeTab === 'zip' && (
          <div className="max-w-xl mx-auto py-8 space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-950 border border-indigo-800/80 flex items-center justify-center text-indigo-400 mx-auto shadow-xl shadow-indigo-950/50">
              <Archive className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-bold text-zinc-100">
                Download Changed Files as ZIP Archive
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Creates a DEFLATE-compressed ZIP archive containing all{' '}
                <strong className="text-zinc-200">{commitDetail.files?.length || 0}</strong>{' '}
                changed files preserving original repository directory hierarchies, plus a{' '}
                <code className="text-indigo-300 font-mono">COMMIT_INFO.md</code> documentation file at the root.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <button
                id="download-zip-action-btn"
                type="button"
                onClick={handleDownloadZip}
                disabled={isZipping}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
              >
                {isZipping ? (
                  <>
                    <Archive className="w-4 h-4 animate-bounce" />
                    <span>Compressing Files...</span>
                  </>
                ) : zipSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Archive Downloaded!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download {repoName}-{shortSha}-changed-files.zip</span>
                  </>
                )}
              </button>

              <span className="text-[11px] text-zinc-500 font-mono">
                Compressed locally in your browser using JSZip DEFLATE Level 9
              </span>
            </div>
          </div>
        )}

        {activeTab === 'csv' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Commit history table ({commitList.length} commits loaded)</span>
            </div>
            <div className="border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 text-[11px]">
                  <tr>
                    <th className="p-2.5">SHA</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Author</th>
                    <th className="p-2.5">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 bg-zinc-950">
                  {commitList.map((c) => (
                    <tr key={c.sha} className="hover:bg-zinc-900/40 text-zinc-300">
                      <td className="p-2.5 text-indigo-400 font-bold">{c.sha.substring(0, 7)}</td>
                      <td className="p-2.5 text-zinc-400 whitespace-nowrap">
                        {c.commit.author?.date?.substring(0, 10)}
                      </td>
                      <td className="p-2.5 text-zinc-200">{c.commit.author?.name}</td>
                      <td className="p-2.5 text-zinc-300 truncate max-w-xs">{c.commit.message?.split('\n')[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
