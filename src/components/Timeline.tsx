/**
 * @file src/components/Timeline.tsx
 * @description Vertical commit timeline with author avatars, relative timestamps,
 * short SHA chips, commit message parsing, and selection triggers.
 */

import React from 'react';
import {
  GitCommit,
  User,
  Calendar,
  ChevronRight,
  GitMerge,
  FileCode2,
} from 'lucide-react';
import { GitHubCommitListItem } from '../types/github';

interface TimelineProps {
  commits: GitHubCommitListItem[];
  selectedSha: string | null;
  onSelectCommit: (sha: string) => void;
  isLoading: boolean;
}

/**
 * Calculates a friendly relative date string from ISO date (e.g. '3 hours ago').
 * 
 * @param isoDate - ISO string date
 * @returns Human-readable relative time string
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
 * Timeline component for browsing and picking git commits.
 */
export const Timeline: React.FC<TimelineProps> = ({
  commits,
  selectedSha,
  onSelectCommit,
  isLoading,
}) => {
  if (isLoading && commits.length === 0) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800 animate-pulse flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-zinc-800 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-3.5 bg-zinc-800 rounded w-3/4" />
              <div className="h-2.5 bg-zinc-800/60 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="p-8 text-center text-zinc-500 text-xs">
        <GitCommit className="w-8 h-8 mx-auto mb-2 opacity-40 text-zinc-400" />
        <p>No commits loaded. Inspect a repository above to start.</p>
      </div>
    );
  }

  return (
    <div id="commit-timeline-container" className="divide-y divide-zinc-800/60 overflow-y-auto">
      {commits.map((c) => {
        const isSelected = selectedSha === c.sha;
        const shortSha = c.sha.substring(0, 7);
        const rawMessage = c.commit.message || '(no message)';
        const firstLineMessage = rawMessage.split('\n')[0];
        const hasExtraMessage = rawMessage.split('\n').length > 1;
        const authorName = c.commit.author?.name || c.author?.login || 'Unknown';
        const avatarUrl = c.author?.avatar_url;
        const dateStr = c.commit.author?.date;
        const isMergeCommit = c.parents && c.parents.length > 1;

        return (
          <button
            key={c.sha}
            id={`commit-item-${shortSha}`}
            type="button"
            onClick={() => onSelectCommit(c.sha)}
            className={`w-full text-left p-3.5 transition-all flex items-start gap-3 group relative ${
              isSelected
                ? 'bg-indigo-950/40 border-l-2 border-l-indigo-500 pl-3'
                : 'hover:bg-zinc-900/80 border-l-2 border-l-transparent'
            }`}
          >
            {/* Author Avatar or Fallback */}
            <div className="relative shrink-0 mt-0.5">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={authorName}
                  className="w-7 h-7 rounded-full object-cover border border-zinc-700"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
              {isMergeCommit && (
                <span
                  title="Merge Commit (multiple parents)"
                  className="absolute -bottom-1 -right-1 bg-purple-900 text-purple-200 p-0.5 rounded-full ring-1 ring-zinc-900"
                >
                  <GitMerge className="w-2.5 h-2.5" />
                </span>
              )}
            </div>

            {/* Commit Meta & Headline */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded ${
                    isSelected
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-800 text-zinc-300 group-hover:bg-zinc-700 group-hover:text-zinc-100'
                  }`}
                >
                  {shortSha}
                </span>

                <span
                  className="text-[11px] text-zinc-500 flex items-center gap-1 font-mono shrink-0"
                  title={dateStr ? new Date(dateStr).toLocaleString() : ''}
                >
                  <Calendar className="w-3 h-3 text-zinc-600" />
                  {dateStr ? getRelativeTime(dateStr) : ''}
                </span>
              </div>

              {/* Commit Message (first line) */}
              <p
                className={`text-xs font-medium leading-snug truncate ${
                  isSelected ? 'text-zinc-100' : 'text-zinc-300 group-hover:text-zinc-100'
                }`}
                title={rawMessage}
              >
                {firstLineMessage}
              </p>

              {/* Author and Indicators */}
              <div className="flex items-center justify-between mt-1 text-[11px] text-zinc-400">
                <span className="truncate max-w-[160px] text-zinc-400">
                  {authorName}
                </span>

                {hasExtraMessage && (
                  <span className="text-[10px] text-zinc-500 bg-zinc-800/80 px-1 rounded">
                    +more
                  </span>
                )}
              </div>
            </div>

            <ChevronRight
              className={`w-4 h-4 self-center transition-transform shrink-0 ${
                isSelected
                  ? 'text-indigo-400 translate-x-0.5'
                  : 'text-zinc-600 group-hover:text-zinc-400 opacity-0 group-hover:opacity-100'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
};
