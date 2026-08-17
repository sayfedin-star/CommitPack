/**
 * @file src/components/AgentReviewPanel.tsx
 * @description Agent Review workspace allowing engineers to write acceptance criteria,
 * preview structured Markdown prompts, copy AI-ready review bundles, and manage review checkpoints.
 */

import React, { useState, useMemo } from 'react';
import {
  Bot,
  Copy,
  Check,
  Eye,
  EyeOff,
  Trash2,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  FileCheck,
  Layers,
} from 'lucide-react';
import { buildReviewPrompt } from '../lib/prompt-builder';
import { countTokensFast } from '../lib/token-counter';

interface AgentReviewPanelProps {
  owner: string;
  repo: string;
  branch: string;
  mode: 'single' | 'compare';
  baseSha?: string;
  headSha: string;
  githubUrl: string;
  includedFileCount: number;
  excludedFileCount: number;
  taskText: string;
  onChangeTaskText: (text: string) => void;
  commitPackMarkdown: string;
  onMarkReviewed?: () => void;
  lastReviewedSha?: string | null;
}

export const AgentReviewPanel: React.FC<AgentReviewPanelProps> = ({
  owner,
  repo,
  branch,
  mode,
  baseSha,
  headSha,
  githubUrl,
  includedFileCount,
  excludedFileCount,
  taskText,
  onChangeTaskText,
  commitPackMarkdown,
  onMarkReviewed,
  lastReviewedSha,
}) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [justMarked, setJustMarked] = useState(false);

  const fullPromptMarkdown = useMemo(() => {
    return buildReviewPrompt({
      owner,
      repo,
      branch,
      mode,
      baseSha,
      headSha,
      githubUrl,
      includedFileCount,
      excludedFileCount,
      taskText,
      commitPackMarkdown,
    });
  }, [
    owner,
    repo,
    branch,
    mode,
    baseSha,
    headSha,
    githubUrl,
    includedFileCount,
    excludedFileCount,
    taskText,
    commitPackMarkdown,
  ]);

  const promptTokens = useMemo(() => countTokensFast(fullPromptMarkdown), [fullPromptMarkdown]);
  const hasTask = Boolean(taskText.trim());

  const handleCopy = async () => {
    if (!hasTask) return;
    try {
      await navigator.clipboard.writeText(fullPromptMarkdown);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy prompt to clipboard:', err);
    }
  };

  const handleMarkReviewed = () => {
    if (onMarkReviewed) {
      onMarkReviewed();
      setJustMarked(true);
      setTimeout(() => setJustMarked(false), 3000);
    }
  };

  const isCurrentHeadReviewed = lastReviewedSha === headSha;

  return (
    <div id="agent-review-panel" className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-3.5">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
              <span>Agent Review Task & Prompt</span>
              <span className="text-[10px] font-mono font-normal bg-indigo-950 text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-800/60">
                AI Verification
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400">
              Provide acceptance criteria to generate a structured AI agent code review prompt.
            </p>
          </div>
        </div>

        {/* Checkpoint Badge / Action */}
        <div className="flex items-center gap-2">
          {onMarkReviewed && (
            <button
              id="mark-reviewed-btn"
              type="button"
              onClick={handleMarkReviewed}
              className={`px-2.5 py-1 text-xs font-mono rounded-lg border flex items-center gap-1.5 transition-all ${
                isCurrentHeadReviewed || justMarked
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
              }`}
              title="Save current commit as latest reviewed checkpoint for 'Since Last Review'"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isCurrentHeadReviewed || justMarked ? 'Checkpoint Saved' : 'Mark Reviewed'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Review Task Textarea */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="review-task-textarea" className="font-semibold text-zinc-300 flex items-center gap-1">
            <span>Review task / acceptance criteria</span>
            <span className="text-rose-400 font-bold">*</span>
          </label>
          <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
            <span>{taskText.length} characters</span>
            {hasTask && (
              <button
                type="button"
                onClick={() => onChangeTaskText('')}
                className="text-zinc-500 hover:text-rose-400 flex items-center gap-0.5"
                title="Clear task"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>

        <textarea
          id="review-task-textarea"
          value={taskText}
          onChange={(e) => onChangeTaskText(e.target.value)}
          placeholder={`Describe what the implementation was expected to do. Example:\nVerify that the new Boards Count aggregate is implemented correctly,\nhandles missing Pinterest data, and does not regress existing analytics.`}
          rows={4}
          className="w-full p-3 bg-zinc-950 border border-zinc-700/80 rounded-lg text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed shadow-inner"
        />
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Token and scope metrics */}
        <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
          <span className="flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            Prompt: ~<strong>{promptTokens.toLocaleString()}</strong> tokens ({fullPromptMarkdown.length.toLocaleString()} chars)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Preview Toggle */}
          <button
            id="toggle-preview-prompt-btn"
            type="button"
            onClick={() => setIsPreviewOpen(!isPreviewOpen)}
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono rounded-lg border border-zinc-700/80 flex items-center gap-1.5 transition-colors"
          >
            {isPreviewOpen ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                <span>Hide Preview</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-zinc-400" />
                <span>Preview Prompt</span>
              </>
            )}
          </button>

          {/* Copy Review Prompt Action */}
          <button
            id="copy-review-prompt-btn"
            type="button"
            onClick={handleCopy}
            disabled={!hasTask}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 shadow-md transition-all ${
              hasTask
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-indigo-600/25 active:scale-95'
                : 'bg-zinc-800 text-zinc-500 border border-zinc-700/60 cursor-not-allowed'
            }`}
            title={!hasTask ? 'Enter acceptance criteria above to enable prompt copy' : 'Copy structured prompt with pack to clipboard'}
          >
            {hasCopied ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span className="text-emerald-200">Copied Prompt!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Review Prompt</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Validation notice if textarea is empty */}
      {!hasTask && (
        <div className="p-2 bg-amber-950/30 border border-amber-800/40 rounded-lg text-[11px] text-amber-300 flex items-center gap-1.5 font-mono">
          <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Acceptance criteria are required to generate the AI verification prompt.</span>
        </div>
      )}

      {/* Prompt Preview Accordion */}
      {isPreviewOpen && (
        <div id="review-prompt-preview-box" className="p-3 bg-zinc-950 border border-indigo-900/60 rounded-xl space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400 pb-1 border-b border-zinc-800">
            <span className="font-semibold text-indigo-300">Generated Review Prompt Preview</span>
            <span className="text-[11px]">Formatted Markdown</span>
          </div>
          <pre className="text-xs font-mono text-zinc-200 bg-zinc-900/70 p-3 rounded-lg max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
            {fullPromptMarkdown}
          </pre>
        </div>
      )}
    </div>
  );
};
