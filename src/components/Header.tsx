/**
 * @file src/components/Header.tsx
 * @description Application top header with logo, primary 3-task navigation,
 * rate limit monitor, PAT management, review sessions, API logs drawer toggle, and theme switch.
 */

import React, { useState, useEffect } from 'react';
import {
  Package,
  Key,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Terminal,
  RefreshCw,
  Bookmark,
  Sun,
  Moon,
  GitCommit,
  FolderGit2,
  Boxes,
} from 'lucide-react';
import { RateLimitState } from '../types/github';
import { checkRateLimit } from '../lib/github-api';
import { AppWorkspace } from '../types/navigation';

interface HeaderProps {
  activeWorkspace: AppWorkspace;
  onSelectWorkspace: (workspace: AppWorkspace) => void;
  rateLimit: RateLimitState | null;
  pat: string | null;
  onOpenPatModal: () => void;
  isDebugOpen: boolean;
  onToggleDebug: () => void;
  onOpenSessionsModal: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSelectTheme?: (theme: 'light' | 'dark') => void;
  errorLogCount?: number;
}

/**
 * Top navigation and status bar component with primary task destinations.
 */
export const Header: React.FC<HeaderProps> = ({
  activeWorkspace,
  onSelectWorkspace,
  rateLimit,
  pat,
  onOpenPatModal,
  isDebugOpen,
  onToggleDebug,
  onOpenSessionsModal,
  theme,
  onToggleTheme,
  onSelectTheme,
  errorLogCount = 0,
}) => {
  const [resetCountdown, setResetCountdown] = useState<string>('');
  const [isRefreshingRateLimit, setIsRefreshingRateLimit] = useState(false);

  // Update reset countdown timer every second
  useEffect(() => {
    if (!rateLimit?.reset) return;

    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const remainingSeconds = Math.max(0, rateLimit.reset - now);
      if (remainingSeconds <= 0) {
        setResetCountdown('Resetting now');
        return;
      }
      const mins = Math.floor(remainingSeconds / 60);
      const secs = remainingSeconds % 60;
      setResetCountdown(`${mins}m ${secs}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [rateLimit?.reset]);

  const handleRefreshRateLimit = async () => {
    setIsRefreshingRateLimit(true);
    try {
      await checkRateLimit(pat);
    } catch {
      // Ignored if rate limit fails
    } finally {
      setIsRefreshingRateLimit(false);
    }
  };

  const remaining = rateLimit?.remaining ?? (pat ? 5000 : 60);
  const totalLimit = rateLimit?.limit ?? (pat ? 5000 : 60);
  const isAuthenticated = !!(pat && pat.trim()) || !!rateLimit?.isAuthenticated;
  const isLowQuota = remaining <= 10;

  return (
    <header
      id="commitpack-header"
      className="bg-white/95 dark:bg-zinc-900/90 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 sticky top-0 z-40 px-3 sm:px-4 py-2 transition-colors"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2.5">
        {/* Left: Brand Logo + Primary Task Navigation */}
        <div className="flex items-center justify-between w-full md:w-auto gap-3 sm:gap-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-md shadow-indigo-500/20 ring-1 ring-indigo-400/30">
              <Package className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-zinc-100">
                Commit<span className="text-indigo-600 dark:text-indigo-400">Pack</span>
              </span>
            </div>
          </div>

          {/* Primary Task Destinations (Desktop / Tablet) */}
          <nav
            id="primary-app-nav"
            className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/80 p-1 rounded-lg border border-slate-200/80 dark:border-zinc-700/60"
            aria-label="Primary destinations"
          >
            <button
              id="nav-review-commit-btn"
              type="button"
              onClick={() => onSelectWorkspace('review-commit')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeWorkspace === 'review-commit'
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-slate-200/60 dark:ring-zinc-700/80'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>Review Commit</span>
            </button>

            <button
              id="nav-browse-repository-btn"
              type="button"
              onClick={() => onSelectWorkspace('browse-repository')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeWorkspace === 'browse-repository'
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-slate-200/60 dark:ring-zinc-700/80'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              <span>Browse Repository</span>
            </button>

            <button
              id="nav-build-context-pack-btn"
              type="button"
              onClick={() => onSelectWorkspace('build-context-pack')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeWorkspace === 'build-context-pack'
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-slate-200/60 dark:ring-zinc-700/80'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Build Context Pack</span>
            </button>
          </nav>
        </div>

        {/* Right Section: Rate Limit, Sessions, PAT, Debug Logs, and Theme Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2 w-full md:w-auto justify-end flex-wrap">
          {/* Rate limit status pill */}
          <div
            id="rate-limit-badge"
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 rounded-md text-xs border font-mono transition-colors ${
              isLowQuota
                ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/70'
                : isAuthenticated
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50'
                : 'bg-slate-100 dark:bg-zinc-800/70 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700/70'
            }`}
            title={`Rate limit: ${remaining} / ${totalLimit} requests remaining this hour. Reset in ${resetCountdown || '1h'}`}
          >
            {isAuthenticated ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            )}

            <div className="flex items-center gap-1">
              <span>
                <strong className={isLowQuota ? 'text-rose-700 dark:text-rose-200' : 'text-slate-900 dark:text-zinc-100'}>
                  {remaining}
                </strong>
                <span className="text-slate-400 dark:text-zinc-500">/{totalLimit}</span>
              </span>

              <span className="text-[10px] text-slate-500 dark:text-zinc-400 hidden xl:inline">
                ({isAuthenticated ? '5k/h' : '60/h'})
              </span>
            </div>

            {resetCountdown && (
              <span className="hidden 2xl:flex items-center gap-1 text-[10px] text-slate-500 dark:text-zinc-400 border-l border-slate-200 dark:border-zinc-700 pl-1.5">
                <Clock className="w-2.5 h-2.5" />
                {resetCountdown}
              </span>
            )}

            <button
              id="refresh-rate-limit-btn"
              type="button"
              onClick={handleRefreshRateLimit}
              disabled={isRefreshingRateLimit}
              className="text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors ml-0.5"
              title="Refresh quota stats"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshingRateLimit ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
            </button>
          </div>

          {/* Review Sessions Modal Trigger */}
          <button
            id="open-sessions-modal-btn"
            type="button"
            onClick={onOpenSessionsModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 transition-all shadow-xs"
            title="Manage saved review sessions"
          >
            <Bookmark className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden sm:inline">Sessions</span>
          </button>

          {/* GitHub PAT Modal Trigger */}
          <button
            id="open-pat-modal-btn"
            type="button"
            onClick={onOpenPatModal}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
              isAuthenticated
                ? 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 border-slate-300 dark:border-zinc-700'
                : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/80'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden sm:inline">
              {isAuthenticated ? 'PAT Active' : 'Add Token'}
            </span>
          </button>

          {/* Debug Console / Logs Trigger */}
          <button
            id="toggle-debug-console-btn"
            type="button"
            onClick={onToggleDebug}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border transition-all ${
              isDebugOpen
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'
            }`}
            title="Toggle API Debug Console Drawer"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Logs</span>
            {errorLogCount > 0 && (
              <span className="px-1 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                {errorLogCount}
              </span>
            )}
          </button>

          {/* Theme Switcher: Segmented White / Dark mode switch */}
          <div
            id="theme-mode-switcher"
            className="flex items-center bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-slate-200 dark:border-zinc-700/80"
            role="group"
            aria-label="Theme mode selector"
          >
            {/* White / Light Mode button */}
            <button
              id="switch-to-white-mode-btn"
              type="button"
              onClick={() => {
                if (theme !== 'light') {
                  if (onSelectTheme) onSelectTheme('light');
                  else onToggleTheme();
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                theme === 'light'
                  ? 'bg-white text-amber-600 shadow-xs ring-1 ring-slate-200/80 font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
              title="Switch to White (Light) Mode"
              aria-pressed={theme === 'light'}
            >
              <Sun className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-amber-500 fill-amber-400/20' : 'text-slate-400 dark:text-zinc-500'}`} />
              <span className="text-[11px]">White</span>
            </button>

            {/* Dark Mode button */}
            <button
              id="switch-to-dark-mode-btn"
              type="button"
              onClick={() => {
                if (theme !== 'dark') {
                  if (onSelectTheme) onSelectTheme('dark');
                  else onToggleTheme();
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                theme === 'dark'
                  ? 'bg-zinc-900 text-indigo-400 shadow-xs ring-1 ring-zinc-700 font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
              title="Switch to Dark Mode"
              aria-pressed={theme === 'dark'}
            >
              <Moon className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-indigo-400 fill-indigo-400/20' : 'text-slate-400 dark:text-zinc-500'}`} />
              <span className="text-[11px]">Dark</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
