/**
 * @file src/components/DiffViewer.tsx
 * @description Changed files list with status badges (A/M/D/R), filter integration,
 * exclusion reasons display, and high-fidelity line-by-line colored diff viewer.
 */

import React, { useState, useMemo } from 'react';
import {
  FileCode,
  Search,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
  Filter,
  EyeOff,
} from 'lucide-react';
import { GitHubCommitFile, GitHubCommitDetail } from '../types/github';
import { ExcludedFileInfo } from '../types/review';

interface DiffViewerProps {
  commitDetail: GitHubCommitDetail;
  files: GitHubCommitFile[]; // Active files (filtered or raw)
  excludedFiles?: ExcludedFileInfo[];
  showExcluded?: boolean;
  selectedFileIndex: number;
  onSelectFileIndex: (index: number) => void;
}

interface ParsedDiffLine {
  type: 'add' | 'del' | 'context' | 'header';
  oldLine?: number;
  newLine?: number;
  content: string;
}

/**
 * Parses a standard git unified patch string into structured lines with line numbering.
 * 
 * @param patch - Raw unified git patch text
 * @returns Array of ParsedDiffLine objects
 */
function parsePatch(patch: string): ParsedDiffLine[] {
  if (!patch) return [];

  const lines = patch.split('\n');
  const result: ParsedDiffLine[] = [];
  let oldLineCounter = 0;
  let newLineCounter = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Chunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineCounter = parseInt(match[1], 10);
        newLineCounter = parseInt(match[2], 10);
      }
      result.push({
        type: 'header',
        content: line,
      });
    } else if (line.startsWith('+')) {
      result.push({
        type: 'add',
        newLine: newLineCounter++,
        content: line.substring(1),
      });
    } else if (line.startsWith('-')) {
      result.push({
        type: 'del',
        oldLine: oldLineCounter++,
        content: line.substring(1),
      });
    } else {
      // Context line or empty
      result.push({
        type: 'context',
        oldLine: oldLineCounter++,
        newLine: newLineCounter++,
        content: line.startsWith(' ') ? line.substring(1) : line,
      });
    }
  }

  return result;
}

/**
 * Returns color-coded badge info for a file status.
 */
function getStatusBadge(status: string) {
  switch (status) {
    case 'added':
      return {
        label: 'A',
        bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
        title: 'Added',
      };
    case 'modified':
      return {
        label: 'M',
        bg: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
        title: 'Modified',
      };
    case 'removed':
      return {
        label: 'D',
        bg: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
        title: 'Deleted',
      };
    case 'renamed':
      return {
        label: 'R',
        bg: 'bg-blue-950/80 text-blue-300 border-blue-800/80',
        title: 'Renamed',
      };
    default:
      return {
        label: '•',
        bg: 'bg-zinc-800 text-zinc-300 border-zinc-700',
        title: status,
      };
  }
}

/**
 * Diff inspector component featuring file list navigation and unified line diffing.
 */
export const DiffViewer: React.FC<DiffViewerProps> = ({
  commitDetail,
  files,
  excludedFiles = [],
  showExcluded = false,
  selectedFileIndex,
  onSelectFileIndex,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'diff' | 'content'>('diff');
  const [hasCopied, setHasCopied] = useState(false);

  // Combine files with excluded if showExcluded is enabled
  const combinedList = useMemo(() => {
    if (!showExcluded || excludedFiles.length === 0) {
      return files.map((f) => ({ file: f, isExcluded: false, reason: '' }));
    }
    const includedItems = files.map((f) => ({ file: f, isExcluded: false, reason: '' }));
    const excludedItems = excludedFiles.map((ef) => ({
      file: ef.file,
      isExcluded: true,
      reason: ef.details || ef.reason,
    }));
    return [...includedItems, ...excludedItems];
  }, [files, excludedFiles, showExcluded]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return combinedList;
    const query = searchQuery.toLowerCase();
    return combinedList.filter(
      (item) =>
        item.file.filename.toLowerCase().includes(query) ||
        (item.file.previous_filename && item.file.previous_filename.toLowerCase().includes(query))
    );
  }, [combinedList, searchQuery]);

  const safeIndex = Math.min(Math.max(0, selectedFileIndex), Math.max(0, filteredItems.length - 1));
  const activeItem = filteredItems[safeIndex] || filteredItems[0];
  const activeFile = activeItem?.file;

  const parsedDiff = useMemo(() => {
    return activeFile?.patch ? parsePatch(activeFile.patch) : [];
  }, [activeFile?.patch]);

  const handleCopy = () => {
    if (!activeFile) return;
    const textToCopy =
      viewMode === 'content' && activeFile.content
        ? activeFile.content
        : activeFile.patch || activeFile.content || '';

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  if (combinedList.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center text-zinc-500 text-xs">
        <div>
          <FileCode className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No changed files match current filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div id="diff-viewer-container" className="h-full flex flex-col md:flex-row bg-zinc-950 overflow-hidden">
      {/* Left Sidebar: Changed Files List */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-zinc-800/80 flex flex-col shrink-0 bg-zinc-900/30">
        {/* Search & File count header */}
        <div className="p-3 border-b border-zinc-800/80 space-y-2 bg-zinc-950/50">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-300">Changed Files</span>
            <span className="font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded text-[11px]">
              {files.length} included
              {excludedFiles.length > 0 && ` (${excludedFiles.length} excl)`}
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            <input
              id="diff-file-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter files..."
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-md text-xs font-mono text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Scrollable File List */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
          {filteredItems.map((item, idx) => {
            const file = item.file;
            const isSelected = idx === safeIndex;
            const badge = getStatusBadge(file.status);

            return (
              <button
                key={`${file.filename}-${idx}`}
                id={`diff-file-${idx}`}
                type="button"
                onClick={() => onSelectFileIndex(idx)}
                className={`w-full text-left p-2.5 transition-colors flex items-start gap-2.5 text-xs ${
                  isSelected
                    ? 'bg-indigo-950/50 text-indigo-200 border-l-2 border-indigo-500 pl-2'
                    : item.isExcluded
                    ? 'opacity-60 hover:opacity-100 hover:bg-zinc-800/40 text-zinc-400 border-l-2 border-transparent'
                    : 'hover:bg-zinc-800/60 text-zinc-300 border-l-2 border-transparent'
                }`}
              >
                {/* Status Badge */}
                <span
                  title={badge.title}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 border ${badge.bg}`}
                >
                  {badge.label}
                </span>

                {/* File Path & Diff Stat */}
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[11px] truncate leading-tight flex items-center gap-1.5">
                    <span>{file.filename}</span>
                    {item.isExcluded && (
                      <span className="text-[9px] font-sans px-1 rounded bg-amber-950 text-amber-300 border border-amber-900 shrink-0">
                        Excluded
                      </span>
                    )}
                  </div>
                  {file.previous_filename && (
                    <div className="text-[10px] text-zinc-500 truncate font-mono">
                      from {file.previous_filename}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[10px] font-mono">
                    <span className="text-emerald-400">+{file.additions}</span>
                    <span className="text-rose-400">−{file.deletions}</span>
                    {file.content !== undefined && (
                      <span className="text-zinc-500 ml-auto">✓ loaded</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Area: Unified Diff Viewer or Full Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
        {activeFile ? (
          <>
            {/* Exclusion Notice Banner if active file is excluded */}
            {activeItem?.isExcluded && (
              <div className="px-3 py-2 bg-amber-950/40 border-b border-amber-800/60 text-xs text-amber-300 flex items-center justify-between font-mono">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Excluded file:</strong> {activeItem.reason || 'Filtered out by active rules'} (will not be included in exported bundles).
                  </span>
                </div>
              </div>
            )}

            {/* File Diff Header Toolbar */}
            <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="font-mono text-xs font-semibold text-zinc-200 truncate">
                  {activeFile.filename}
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                    getStatusBadge(activeFile.status).bg
                  }`}
                >
                  {activeFile.status.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Toggle View Mode if content is available */}
                {activeFile.content !== undefined && activeFile.patch && (
                  <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-md p-0.5 text-xs">
                    <button
                      id="view-diff-toggle-btn"
                      type="button"
                      onClick={() => setViewMode('diff')}
                      className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                        viewMode === 'diff'
                          ? 'bg-zinc-800 text-zinc-100 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Patch Diff
                    </button>
                    <button
                      id="view-content-toggle-btn"
                      type="button"
                      onClick={() => setViewMode('content')}
                      className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                        viewMode === 'content'
                          ? 'bg-zinc-800 text-zinc-100 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Full File
                    </button>
                  </div>
                )}

                {/* Copy Button */}
                <button
                  id="copy-diff-btn"
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono border border-zinc-700/80 transition-colors"
                  title="Copy patch to clipboard"
                >
                  {hasCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Copy {viewMode === 'content' ? 'File' : 'Patch'}</span>
                    </>
                  )}
                </button>

                {/* View on GitHub */}
                {activeFile.blob_url && (
                  <a
                    href={activeFile.blob_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                    title="View on GitHub"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Diff Body Content */}
            <div className="flex-1 overflow-auto font-mono text-xs p-2 select-text">
              {viewMode === 'content' && activeFile.content !== undefined ? (
                /* Full Content Viewer */
                <pre className="p-3 text-zinc-200 bg-zinc-900/40 rounded-lg overflow-x-auto leading-relaxed">
                  <code>{activeFile.content}</code>
                </pre>
              ) : activeFile.patch ? (
                /* Patch Diff Lines Viewer */
                <table className="w-full border-collapse">
                  <tbody>
                    {parsedDiff.map((line, idx) => {
                      if (line.type === 'header') {
                        return (
                          <tr
                            key={idx}
                            className="bg-indigo-950/30 text-indigo-300 border-y border-indigo-900/40 select-none"
                          >
                            <td className="w-12 px-2 py-0.5 text-right text-indigo-400/60 font-mono text-[11px]">
                              ...
                            </td>
                            <td className="w-12 px-2 py-0.5 text-right text-indigo-400/60 font-mono text-[11px]">
                              ...
                            </td>
                            <td className="px-3 py-0.5 text-indigo-300 font-semibold font-mono text-[11px]">
                              {line.content}
                            </td>
                          </tr>
                        );
                      }

                      const isAdd = line.type === 'add';
                      const isDel = line.type === 'del';

                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-zinc-800/40 transition-colors ${
                            isAdd
                              ? 'bg-emerald-950/25 text-emerald-200'
                              : isDel
                              ? 'bg-rose-950/25 text-rose-200'
                              : 'text-zinc-300'
                          }`}
                        >
                          {/* Old line number */}
                          <td className="w-12 px-2 py-0.5 text-right text-zinc-600 select-none font-mono text-[11px] border-r border-zinc-800/50">
                            {line.oldLine || ''}
                          </td>
                          {/* New line number */}
                          <td className="w-12 px-2 py-0.5 text-right text-zinc-600 select-none font-mono text-[11px] border-r border-zinc-800/50">
                            {line.newLine || ''}
                          </td>
                          {/* Line content */}
                          <td className="px-3 py-0.5 font-mono whitespace-pre-wrap break-all leading-snug">
                            <span className="select-none font-bold inline-block w-4 text-zinc-500">
                              {isAdd ? '+' : isDel ? '−' : ' '}
                            </span>
                            <span>{line.content}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                /* No patch available (binary or too large) */
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-zinc-400 space-y-3">
                  <div className="w-10 h-10 rounded-full bg-amber-950/60 border border-amber-800 flex items-center justify-center text-amber-400">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-zinc-200 text-sm">
                      Binary or Large File — No diff available
                    </h4>
                    <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                      GitHub does not generate text diff patches for binary assets or files exceeding size thresholds.
                    </p>
                  </div>
                  {activeFile.blob_url && (
                    <a
                      href={activeFile.blob_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono flex items-center gap-1.5 border border-zinc-700"
                    >
                      <span>View File on GitHub</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
            Select a changed file on the left to inspect its diff
          </div>
        )}
      </div>
    </div>
  );
};
