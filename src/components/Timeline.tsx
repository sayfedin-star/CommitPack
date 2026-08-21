/**
 * @file src/components/Timeline.tsx
 * @description Vertical commit timeline with conventional commit tags, author avatars,
 * search filtering, relative timestamps, SHA copy actions, and light/dark theme support.
 */

import React, { useState, useMemo } from 'react';
import {
  GitCommit,
  User,
  Calendar,
  ChevronRight,
  GitMerge,
  Search,
  Copy,
  Check,
  X,
  Tag,
} from 'lucide-react';
import { GitHubCommitListItem } from '../types/github';

interface TimelineProps {
  commits: GitHubCommitListItem[];
  selectedSha: string | null;
  onSelectCommit: (sha: string) => void;
  isLoading: boolean;
}

/**
 * Calculates a friendly relative date string from ISO date.
 */
function getRelativeTime(isoDate: string): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}

/**
 * Parses conventional commit prefix (e.g., feat, fix, docs, chore, refactor, test, perf, merge).
 */
function parseCommitType(message?: string): { type: string | null; cleanMessage: string } {
  if (!message) return { type: null, cleanMessage: '' };
  const firstLine = (message.split('\n')[0] || '').trim();
  const match = firstLine.match(/^([a-zA-Z]+)(?:\([^\)]+\))?(!)?:\s*(.+)$/);
  if (match) {
    return {
      type: match[1].toLowerCase(),
      cleanMessage: match[3],
    };
  }
  if (/^merge\b/i.test(firstLine)) {
    return { type: 'merge', cleanMessage: firstLine };
  }
  return { type: null, cleanMessage: firstLine };
}

function getCommitTypeBadge(type: string | null) {
  if (!type) return null;
  switch (type) {
    case 'feat':
      return (
        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          feat
        </span>
      );
    case 'fix':
      return (
        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          fix
        </span>
      );
    case 'docs':
      return (
        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          docs
        </span>
      );
    case 'refactor':
      return (
        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
          refactor
        </span>
      );
    case 'test':
      return (
        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-cyan-100 text-cyan-700 dark:bg-cyan-950/80 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
          test
        </span>
      );
    case 'perf':
      return (
        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
          perf
        </span>
      );
    case 'chore':
    case 'ci':
    case 'build':
      return (
        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
          {type}
        </span>
      );
    case 'merge':
      return (
        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-violet-100 text-violet-700 dark:bg-violet-950/80 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
          merge
        </span>
      );
    default:
      return (
        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
          {type}
        </span>
      );
  }
}

/**
 * Timeline component for browsing and picking git commits.
 */
export const Timeline: React.FC<TimelineProps> = ({
  commits,
  selectedSha,
  onSelectCommit,
  isLoading,
}) => {
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [copiedSha, setCopiedSha] = useState<string | null>(null);

  const handleCopySha = (sha: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sha);
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(null), 2000);
  };

  const filteredCommits = useMemo(() => {
    if (!filterQuery || !filterQuery.trim()) return commits;
    const q = filterQuery.toLowerCase().trim();
    return commits.filter((c) => {
      const msg = (c.commit?.message || '').toLowerCase();
      const author = (c.commit?.author?.name || c.author?.login || '').toLowerCase();
      const sha = (c.sha || '').toLowerCase();
      return msg.includes(q) || author.includes(q) || sha.includes(q);
    });
  }, [commits, filterQuery]);

  if (isLoading && commits.length === 0) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="p-3 bg-slate-100 dark:bg-zinc-900/50 rounded-lg border border-slate-200 dark:border-zinc-800 animate-pulse flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-zinc-800 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-3.5 bg-slate-200 dark:bg-zinc-800 rounded w-3/4" />
              <div className="h-2.5 bg-slate-200/60 dark:bg-zinc-800/60 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-zinc-500 text-xs">
        <GitCommit className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400 dark:text-zinc-400" />
        <p>No commits loaded. Inspect a repository above to start.</p>
      </div>
    );
  }

  return (
    <div id="commit-timeline-wrapper" className="flex flex-col h-full">
      {/* Timeline Filter Search */}
      {commits.length > 5 && (
        <div className="p-2 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 flex items-center gap-1.5 shrink-0">
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0 ml-1" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search commits by message, author, or SHA..."
            className="w-full bg-transparent text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none"
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => setFilterQuery('')}
              className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Commits List */}
      <div id="commit-timeline-container" className="divide-y divide-slate-200 dark:divide-zinc-800/60 overflow-y-auto flex-1">
        {filteredCommits.length === 0 ? (
          <div className="p-6 text-center text-xs font-mono text-slate-400 dark:text-zinc-500">
            No commits matching &quot;{filterQuery}&quot;
          </div>
        ) : (
          filteredCommits.map((c) => {
            const isSelected = selectedSha === c.sha;
            const shortSha = c.sha.substring(0, 7);
            const rawMessage = c.commit.message || '(no message)';
            const { type: commitType, cleanMessage } = parseCommitType(rawMessage);
            const hasExtraMessage = rawMessage.split('\n').length > 1;
            const authorName = c.commit.author?.name || c.author?.login || 'Unknown';
            const avatarUrl = c.author?.avatar_url;
            const dateStr = c.commit.author?.date;
            const isMergeCommit = c.parents && c.parents.length > 1;

            return (
              <div
                key={c.sha}
                id={`commit-item-${shortSha}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelectCommit(c.sha)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectCommit(c.sha);
                  }
                }}
                className={`w-full text-left p-3.5 transition-all flex items-start gap-3 group relative min-h-[52px] cursor-pointer select-none ${
                  isSelected
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-l-2 border-l-indigo-600 dark:border-l-indigo-500 pl-3'
                    : 'hover:bg-slate-100/80 dark:hover:bg-zinc-900/80 border-l-2 border-l-transparent'
                }`}
              >
                {/* Author Avatar or Fallback */}
                <div className="relative shrink-0 mt-0.5">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={authorName}
                      className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-zinc-700"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 flex items-center justify-center text-slate-500 dark:text-zinc-400">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                  {isMergeCommit && (
                    <span
                      title="Merge Commit (multiple parents)"
                      className="absolute -bottom-1 -right-1 bg-purple-600 text-white p-0.5 rounded-full ring-1 ring-white dark:ring-zinc-900"
                    >
                      <GitMerge className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                {/* Commit Meta & Headline */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-300 group-hover:bg-slate-300 dark:group-hover:bg-zinc-700'
                        }`}
                      >
                        {shortSha}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => handleCopySha(c.sha, e)}
                        title="Copy full SHA"
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                      >
                        {copiedSha === c.sha ? (
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>

                      {getCommitTypeBadge(commitType)}
                    </div>

                    <span
                      className="text-[11px] text-slate-500 dark:text-zinc-500 flex items-center gap-1 font-mono shrink-0"
                      title={dateStr ? new Date(dateStr).toLocaleString() : ''}
                    >
                      <Calendar className="w-3 h-3 text-slate-400 dark:text-zinc-600" />
                      {dateStr ? getRelativeTime(dateStr) : ''}
                    </span>
                  </div>

                  {/* Commit Message */}
                  <p
                    className={`text-xs font-medium leading-snug truncate ${
                      isSelected
                        ? 'text-indigo-950 dark:text-zinc-100 font-semibold'
                        : 'text-slate-800 dark:text-zinc-300 group-hover:text-slate-950 dark:group-hover:text-zinc-100'
                    }`}
                    title={rawMessage}
                  >
                    {cleanMessage}
                  </p>

                  {/* Author and Indicators */}
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                    <span className="truncate max-w-[160px]">
                      {authorName}
                    </span>

                    {hasExtraMessage && (
                      <span className="text-[10px] text-slate-500 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800/80 px-1 rounded border border-slate-200 dark:border-zinc-700/50">
                        +more
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight
                  className={`w-4 h-4 self-center transition-transform shrink-0 ${
                    isSelected
                      ? 'text-indigo-600 dark:text-indigo-400 translate-x-0.5'
                      : 'text-slate-400 dark:text-zinc-600 group-hover:text-slate-600 dark:group-hover:text-zinc-400 opacity-0 group-hover:opacity-100'
                  }`}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
