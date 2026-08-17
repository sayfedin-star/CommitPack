/**
 * @file src/components/FileFiltersPanel.tsx
 * @description Collapsible file filters panel with presets (Code only, Astro, Next.js, Supabase),
 * include/exclude globs, extension and size limits, status filters, and context file configuration.
 */

import React, { useState } from 'react';
import {
  Filter,
  ChevronDown,
  ChevronUp,
  FileCode2,
  Sparkles,
  SlidersHorizontal,
  X,
  Plus,
  AlertCircle,
  Eye,
  EyeOff,
  Check,
  FileText,
  Info,
} from 'lucide-react';
import { FileFilterConfig, FilterPresetName, ExcludedFileInfo, ContextFileItem } from '../types/review';
import { FILTER_PRESETS } from '../lib/file-filter';
import { FileStatus } from '../types/github';

interface FileFiltersPanelProps {
  config: FileFilterConfig;
  onChangeConfig: (newConfig: FileFilterConfig) => void;
  totalFilesCount: number;
  includedFilesCount: number;
  excludedFiles: ExcludedFileInfo[];
  patternErrors: string[];
  contextFiles: ContextFileItem[];
  onAddContextFile: (path: string) => void;
  onRemoveContextFile: (path: string) => void;
  showExcludedInDiff: boolean;
  onToggleShowExcludedInDiff: (show: boolean) => void;
}

const COMMON_CONTEXT_SUGGESTIONS = [
  'package.json',
  'tsconfig.json',
  'astro.config.mjs',
  'next.config.js',
  'supabase/config.toml',
  'vite.config.ts',
];

export const FileFiltersPanel: React.FC<FileFiltersPanelProps> = ({
  config,
  onChangeConfig,
  totalFilesCount,
  includedFilesCount,
  excludedFiles,
  patternErrors,
  contextFiles,
  onAddContextFile,
  onRemoveContextFile,
  showExcludedInDiff,
  onToggleShowExcludedInDiff,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showExcludedModal, setShowExcludedModal] = useState(false);
  const [newContextPath, setNewContextPath] = useState('');

  const handleSelectPreset = (presetKey: FilterPresetName) => {
    if (presetKey === 'custom') {
      onChangeConfig({ ...config, preset: 'custom' });
      return;
    }
    const preset = FILTER_PRESETS[presetKey];
    onChangeConfig({
      ...config,
      ...preset.config,
      preset: presetKey,
    });
  };

  const handleToggleStatus = (status: FileStatus) => {
    const updated = {
      ...config.statuses,
      [status]: !config.statuses[status],
    };
    onChangeConfig({
      ...config,
      preset: 'custom',
      statuses: updated,
    });
  };

  const handleAddContext = (e: React.FormEvent) => {
    e.preventDefault();
    if (newContextPath.trim()) {
      onAddContextFile(newContextPath.trim());
      setNewContextPath('');
    }
  };

  const isCustomized = config.preset === 'custom';

  return (
    <div id="file-filters-panel" className="bg-zinc-900/50 border-b border-zinc-800/80">
      {/* Header bar: Summary & Toggle */}
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            id="toggle-filters-panel-btn"
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 font-semibold text-zinc-200 hover:text-indigo-400 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
            <span>File Filters</span>
            {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
          </button>

          {/* Active Preset Tag */}
          <span className="bg-indigo-950/60 text-indigo-300 border border-indigo-800/50 px-2 py-0.5 rounded font-mono text-[11px]">
            {FILTER_PRESETS[config.preset]?.label || 'Custom'}
          </span>

          {/* Counts pill */}
          <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[11px]">
            <span>
              Showing <strong className="text-zinc-100">{includedFilesCount}</strong> of{' '}
              <strong className="text-zinc-300">{totalFilesCount}</strong> changed files
            </span>
            {excludedFiles.length > 0 && (
              <button
                id="view-excluded-files-btn"
                type="button"
                onClick={() => setShowExcludedModal(!showExcludedModal)}
                className="ml-1 text-[10px] text-amber-400 hover:text-amber-300 underline font-medium"
              >
                ({excludedFiles.length} excluded)
              </button>
            )}
          </div>
        </div>

        {/* Quick toggles */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-200 select-none">
            <input
              id="show-excluded-diff-toggle"
              type="checkbox"
              checked={showExcludedInDiff}
              onChange={(e) => onToggleShowExcludedInDiff(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0"
            />
            <span>Inspect excluded in diff</span>
          </label>
        </div>
      </div>

      {/* Collapsible Panel Body */}
      {isOpen && (
        <div id="file-filters-body" className="p-4 bg-zinc-950/60 border-t border-zinc-800/60 space-y-4 animate-in fade-in">
          {/* Preset Buttons */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
              Filter Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FILTER_PRESETS) as FilterPresetName[]).map((key) => {
                const p = FILTER_PRESETS[key];
                const isSelected = config.preset === key;
                return (
                  <button
                    key={key}
                    id={`filter-preset-${key}`}
                    type="button"
                    onClick={() => handleSelectPreset(key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all flex items-center gap-1.5 border ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-500 font-semibold shadow-sm'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700/80'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pattern inputs & extensions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {/* Include Globs */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                Include Glob Patterns (comma-separated)
              </label>
              <input
                id="filter-include-globs"
                type="text"
                value={config.includePatterns}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    preset: 'custom',
                    includePatterns: e.target.value,
                  })
                }
                placeholder="e.g. src/**/*.ts, app/**/*.tsx"
                className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-md font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Exclude Globs */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                Exclude Glob Patterns (comma-separated)
              </label>
              <input
                id="filter-exclude-globs"
                type="text"
                value={config.excludePatterns}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    preset: 'custom',
                    excludePatterns: e.target.value,
                  })
                }
                placeholder="e.g. *.lock, dist/**, *.md"
                className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-md font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Extensions & Max Size */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  Extensions
                </label>
                <input
                  id="filter-extensions-input"
                  type="text"
                  value={config.extensions}
                  onChange={(e) =>
                    onChangeConfig({
                      ...config,
                      preset: 'custom',
                      extensions: e.target.value,
                    })
                  }
                  placeholder=".ts, .tsx, .astro"
                  className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-md font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  Max Size (KB)
                </label>
                <input
                  id="filter-max-size-input"
                  type="number"
                  min="1"
                  value={config.maxSizeKb || ''}
                  onChange={(e) =>
                    onChangeConfig({
                      ...config,
                      preset: 'custom',
                      maxSizeKb: e.target.value ? parseInt(e.target.value, 10) : undefined,
                    })
                  }
                  placeholder="e.g. 500"
                  className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-md font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Status Chips & Flags */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            {/* Status Toggles */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-medium text-zinc-400 mr-1">Status:</span>
              {(['added', 'modified', 'renamed', 'removed'] as FileStatus[]).map((status) => {
                const isOn = config.statuses[status];
                return (
                  <button
                    key={status}
                    id={`filter-status-${status}-btn`}
                    type="button"
                    onClick={() => handleToggleStatus(status)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono capitalize transition-colors border ${
                      isOn
                        ? 'bg-zinc-800 text-zinc-100 border-indigo-500/60 font-semibold'
                        : 'bg-zinc-950 text-zinc-600 border-zinc-800 line-through'
                    }`}
                  >
                    {status}
                  </button>
                );
              })}
            </div>

            {/* Checkboxes */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-300 hover:text-zinc-100 select-none">
                <input
                  id="filter-code-only-checkbox"
                  type="checkbox"
                  checked={config.codeOnly}
                  onChange={(e) =>
                    onChangeConfig({
                      ...config,
                      preset: 'custom',
                      codeOnly: e.target.checked,
                    })
                  }
                  className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0"
                />
                <span>Code files only</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-300 hover:text-zinc-100 select-none">
                <input
                  id="filter-include-context-checkbox"
                  type="checkbox"
                  checked={config.includeContextFiles}
                  onChange={(e) =>
                    onChangeConfig({
                      ...config,
                      includeContextFiles: e.target.checked,
                    })
                  }
                  className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0"
                />
                <span>Include context files (unchanged)</span>
              </label>
            </div>
          </div>

          {/* Context Files Adder (when enabled) */}
          {config.includeContextFiles && (
            <div id="context-files-section" className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  Context Files (Fetched from repository HEAD)
                </span>
                <span className="text-[11px] text-zinc-400">
                  {contextFiles.length} configured
                </span>
              </div>

              {/* Tags of added context files */}
              <div className="flex flex-wrap gap-1.5">
                {contextFiles.map((cf) => (
                  <span
                    key={cf.path}
                    className="inline-flex items-center gap-1 bg-zinc-950 border border-zinc-700 px-2 py-0.5 rounded text-[11px] font-mono text-zinc-200"
                  >
                    <span>{cf.path}</span>
                    {cf.error && <span className="text-rose-400 text-[10px]">({cf.error})</span>}
                    <button
                      type="button"
                      onClick={() => onRemoveContextFile(cf.path)}
                      className="text-zinc-500 hover:text-rose-400 ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add form & quick suggestions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <form onSubmit={handleAddContext} className="flex-1 flex items-center gap-1.5">
                  <input
                    id="add-context-file-input"
                    type="text"
                    value={newContextPath}
                    onChange={(e) => setNewContextPath(e.target.value)}
                    placeholder="Enter file path in repo (e.g. package.json, supabase/config.toml)"
                    className="flex-1 px-2.5 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    id="add-context-file-btn"
                    type="submit"
                    disabled={!newContextPath.trim()}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-mono flex items-center gap-1 disabled:opacity-40"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </form>

                {/* Quick suggestions */}
                <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono overflow-x-auto py-0.5">
                  <span>Suggestions:</span>
                  {COMMON_CONTEXT_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => onAddContextFile(sug)}
                      className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    >
                      +{sug}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Pattern Validation Errors */}
          {patternErrors.length > 0 && (
            <div className="p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-start gap-2 font-mono">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Pattern warning:</span>
                <ul className="list-disc pl-4 mt-0.5 space-y-0.5 text-[11px]">
                  {patternErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Excluded Files Modal / Drawer */}
      {showExcludedModal && (
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">
              Excluded Files Breakdown ({excludedFiles.length})
            </span>
            <button
              type="button"
              onClick={() => setShowExcludedModal(false)}
              className="text-zinc-500 hover:text-zinc-300 text-xs"
            >
              Close
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-zinc-800/60 border border-zinc-800 rounded-lg">
            {excludedFiles.map((item, idx) => (
              <div key={idx} className="p-2 flex items-center justify-between text-[11px] font-mono">
                <span className="text-zinc-300 truncate max-w-sm">{item.file.filename}</span>
                <span className="text-amber-400/90 text-[10px] bg-amber-950/40 border border-amber-900/60 px-1.5 py-0.5 rounded">
                  {item.details || item.reason}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
