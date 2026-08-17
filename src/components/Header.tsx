/**
 * @file src/components/Header.tsx
 * @description Application top header with logo, live GitHub API rate limit monitor,
 * PAT management button, quick sample repo selector, and debug console toggle.
 */

import React, { useState, useEffect } from 'react';
import {
  Package,
  Key,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Terminal,
  Sparkles,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { RateLimitState } from '../types/github';
import { checkRateLimit } from '../lib/github-api';

interface HeaderProps {
  rateLimit: RateLimitState | null;
  pat: string | null;
  onOpenPatModal: () => void;
  onSelectSampleRepo: (repoUrl: string) => void;
  isDebugOpen: boolean;
  onToggleDebug: () => void;
}

const SAMPLE_REPOS = [
  { name: 'facebook/react', label: 'React' },
  { name: 'tailwindlabs/tailwindcss', label: 'Tailwind' },
  { name: 'shadcn-ui/ui', label: 'shadcn/ui' },
  { name: 'torvalds/linux', label: 'Linux' },
];

/**
 * Top navigation and status bar component.
 */
export const Header: React.FC<HeaderProps> = ({
  rateLimit,
  pat,
  onOpenPatModal,
  onSelectSampleRepo,
  isDebugOpen,
  onToggleDebug,
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
    <header id="commitpack-header" className="bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 sticky top-0 z-40 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand Logo & Tagline */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-400/30">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-zinc-100">
                  Commit<span className="text-indigo-400">Pack</span>
                </span>
                <span className="text-[10px] font-mono uppercase bg-indigo-950/80 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800/60">
                  AI Packager
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                Extract commit changes into AI agent bundles & ZIPs
              </p>
            </div>
          </div>

          {/* Mobile Debug / PAT trigger */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              id="mobile-pat-button"
              onClick={onOpenPatModal}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 rounded border border-zinc-700/60 text-xs"
              title="GitHub Token"
            >
              <Key className="w-4 h-4" />
            </button>
            <button
              id="mobile-debug-button"
              onClick={onToggleDebug}
              className={`p-1.5 rounded border text-xs ${
                isDebugOpen
                  ? 'bg-indigo-950 text-indigo-300 border-indigo-700'
                  : 'bg-zinc-800/80 text-zinc-400 border-zinc-700/60'
              }`}
              title="Debug Console"
            >
              <Terminal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Sample Repositories */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-950/60 px-2.5 py-1 rounded-full border border-zinc-800">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-zinc-500 font-medium">Quick load:</span>
          <div className="flex items-center gap-1">
            {SAMPLE_REPOS.map((sample) => (
              <button
                key={sample.name}
                id={`sample-repo-${sample.label.toLowerCase()}`}
                onClick={() => onSelectSampleRepo(sample.name)}
                className="px-2 py-0.5 rounded text-[11px] font-mono text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rate Limit Badge & PAT Action */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          {/* Rate limit status pill */}
          <div
            id="rate-limit-badge"
            className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-xs border font-mono ${
              isLowQuota
                ? 'bg-rose-950/50 text-rose-300 border-rose-800/70'
                : isAuthenticated
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50'
                : 'bg-zinc-800/70 text-zinc-300 border-zinc-700/70'
            }`}
            title={`Rate limit: ${remaining} / ${totalLimit} requests remaining this hour. Reset in ${resetCountdown || '1h'}`}
          >
            {isAuthenticated ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}

            <div className="flex items-center gap-1.5">
              <span>
                <strong className={isLowQuota ? 'text-rose-200' : 'text-zinc-100'}>
                  {remaining}
                </strong>
                <span className="text-zinc-500">/{totalLimit}</span>
              </span>

              <span className="text-[10px] text-zinc-400 hidden sm:inline">
                ({isAuthenticated ? 'Auth 5k/hr' : 'Anon 60/hr'})
              </span>
            </div>

            {resetCountdown && (
              <span className="hidden xl:flex items-center gap-1 text-[10px] text-zinc-400 border-l border-zinc-700 pl-1.5">
                <Clock className="w-2.5 h-2.5" />
                {resetCountdown}
              </span>
            )}

            <button
              id="refresh-rate-limit-btn"
              onClick={handleRefreshRateLimit}
              disabled={isRefreshingRateLimit}
              className="text-zinc-400 hover:text-zinc-200 transition-colors ml-0.5"
              title="Refresh quota stats"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshingRateLimit ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>

          {/* GitHub PAT Modal Trigger */}
          <button
            id="open-pat-modal-btn"
            onClick={onOpenPatModal}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
              isAuthenticated
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/40'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">
              {isAuthenticated ? 'PAT Active' : 'Add Token (5k/hr)'}
            </span>
          </button>

          {/* Debug Console Toggle */}
          <button
            id="toggle-debug-console-btn"
            onClick={onToggleDebug}
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border transition-all ${
              isDebugOpen
                ? 'bg-zinc-800 text-indigo-300 border-indigo-700/60 shadow-inner'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-800'
            }`}
            title="Toggle API Debug Console"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Logs</span>
          </button>
        </div>
      </div>
    </header>
  );
};
