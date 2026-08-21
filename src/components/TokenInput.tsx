/**
 * @file src/components/TokenInput.tsx
 * @description Modal for configuring GitHub Personal Access Token (PAT) with localStorage
 * persistence, live token testing, security assurances, and rate limit explanation.
 */

import React, { useState } from 'react';
import {
  Key,
  Shield,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Trash2,
  Lock,
} from 'lucide-react';
import { checkRateLimit } from '../lib/github-api';

interface TokenInputProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  onSaveToken: (token: string | null) => void;
}

/**
 * Token management dialog component.
 */
export const TokenInput: React.FC<TokenInputProps> = ({
  isOpen,
  onClose,
  token,
  onSaveToken,
}) => {
  const [inputValue, setInputValue] = useState<string>(token || '');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleTestToken = async () => {
    const rawVal = (inputValue || '').trim();
    if (!rawVal) {
      setTestResult({
        success: false,
        message: 'Please enter a token before testing.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const state = await checkRateLimit(rawVal);
      if (state.isAuthenticated && state.limit >= 5000) {
        setTestResult({
          success: true,
          message: `Token verified! 5,000 req/hr limit active (${state.remaining} remaining).`,
        });
      } else {
        setTestResult({
          success: false,
          message: 'Token was accepted but rate limit is standard (60 req/hr). Check token validity.',
        });
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: (err as Error).message || 'Token verification failed. Check permissions or expiration.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const cleanToken = (inputValue || '').trim();
    onSaveToken(cleanToken.length > 0 ? cleanToken : null);
    onClose();
  };

  const handleClear = () => {
    setInputValue('');
    onSaveToken(null);
    setTestResult({
      success: true,
      message: 'Token removed. Returned to 60 req/hr anonymous mode.',
    });
  };

  return (
    <div
      id="pat-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="pat-modal-dialog"
        className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-zinc-100 text-sm">
                GitHub Personal Access Token
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Unlock 5,000 requests/hour & access private repos
              </p>
            </div>
          </div>
          <button
            id="close-pat-modal-btn"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Security Guarantee Box */}
          <div className="bg-slate-50 dark:bg-zinc-950/70 border border-slate-200 dark:border-zinc-800/90 rounded-lg p-3.5 flex items-start gap-3">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-700 dark:text-zinc-300 space-y-1">
              <p className="font-medium text-slate-900 dark:text-zinc-200">100% Client-Side & Secure</p>
              <p className="text-slate-600 dark:text-zinc-400 leading-relaxed">
                Your token is stored exclusively in your browser's <code className="text-indigo-600 dark:text-indigo-300 font-mono">localStorage</code>. It is never logged, never sent to any backend, and passed strictly to <code className="text-indigo-600 dark:text-indigo-300 font-mono">api.github.com</code> in the <code className="text-slate-800 dark:text-zinc-300 font-mono">Authorization</code> header.
              </p>
            </div>
          </div>

          {/* Token Input Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="github-pat-input"
              className="text-xs font-medium text-slate-700 dark:text-zinc-300 flex items-center justify-between"
            >
              <span>Personal Access Token (classic or fine-grained)</span>
              <a
                href="https://github.com/settings/tokens/new?description=CommitPack&scopes=public_repo"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 text-[11px] flex items-center gap-1"
              >
                <span>Generate token</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </label>
            <div className="relative">
              <input
                id="github-pat-input"
                type="password"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setTestResult(null);
                }}
                placeholder="ghp_... or github_pat_..."
                className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-600 absolute right-3 top-2.5" />
            </div>
          </div>

          {/* Test Status feedback */}
          {testResult && (
            <div
              className={`p-3 rounded-lg text-xs flex items-start gap-2.5 border ${
                testResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">{testResult.message}</div>
            </div>
          )}

          {/* Token Recommendations */}
          <div className="text-[11px] text-slate-600 dark:text-zinc-400 space-y-1 bg-slate-50 dark:bg-zinc-950/40 p-3 rounded border border-slate-200 dark:border-zinc-800/60">
            <span className="font-semibold text-slate-800 dark:text-zinc-300">Recommended Scopes:</span>
            <ul className="list-disc pl-4 space-y-0.5 text-slate-600 dark:text-zinc-400">
              <li>For public repos: No scopes required (or <code className="text-slate-800 dark:text-zinc-300 font-mono">public_repo</code>)</li>
              <li>For private repos: <code className="text-slate-800 dark:text-zinc-300 font-mono">repo</code> (Full control of private repositories)</li>
            </ul>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-zinc-950/60 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            {token && (
              <button
                id="clear-pat-btn"
                type="button"
                onClick={handleClear}
                className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 flex items-center gap-1.5 px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Token</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              id="test-pat-btn"
              type="button"
              onClick={handleTestToken}
              disabled={isTesting || !(inputValue || '').trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-300 dark:border-zinc-700 disabled:opacity-50 transition-colors"
            >
              {isTesting ? 'Verifying...' : 'Test Token'}
            </button>
            <button
              id="save-pat-btn"
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all"
            >
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
