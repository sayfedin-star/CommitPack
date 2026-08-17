/**
 * @file src/components/ReviewSessionsModal.tsx
 * @description Local-only Review Sessions modal to save, update, filter,
 * reopen, export, and import code review workflows.
 */

import React, { useState } from 'react';
import {
  Bookmark,
  X,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Download,
  Upload,
  ExternalLink,
  GitCompare,
  GitCommit,
  Check,
  FolderOpen,
  Filter,
} from 'lucide-react';
import { ReviewSession, ReviewSessionStatus, FileFilterConfig } from '../types/review';
import {
  getSavedSessions,
  saveSessions,
  upsertSession,
  deleteSession,
  importSessionsJson,
  saveLastReviewedSha,
} from '../lib/session-storage';

interface ReviewSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRepo: string;
  currentBranch: string;
  currentMode: 'single' | 'compare';
  currentBaseSha?: string;
  currentHeadSha: string;
  currentGithubUrl: string;
  currentTaskText: string;
  currentFilters: FileFilterConfig;
  includedCount: number;
  excludedCount: number;
  onRestoreSession: (session: ReviewSession) => void;
}

export const ReviewSessionsModal: React.FC<ReviewSessionsModalProps> = ({
  isOpen,
  onClose,
  currentRepo,
  currentBranch,
  currentMode,
  currentBaseSha,
  currentHeadSha,
  currentGithubUrl,
  currentTaskText,
  currentFilters,
  includedCount,
  excludedCount,
  onRestoreSession,
}) => {
  const [sessions, setSessions] = useState<ReviewSession[]>(() => getSavedSessions());
  const [filterCurrentOnly, setFilterCurrentOnly] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Form for new session
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newStatus, setNewStatus] = useState<ReviewSessionStatus>('pending');
  const [newNotes, setNewNotes] = useState('');

  if (!isOpen) return null;

  const currentRepoFullName = currentRepo.toLowerCase();
  const currentBranchLower = currentBranch.toLowerCase();

  const filteredSessions = filterCurrentOnly
    ? sessions.filter(
        (s) =>
          s.repo.toLowerCase() === currentRepoFullName &&
          s.branch.toLowerCase() === currentBranchLower
      )
    : sessions;

  const sortedSessions = [...filteredSessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const handleSaveCurrentSession = () => {
    const session: ReviewSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      repo: currentRepo,
      branch: currentBranch,
      mode: currentMode,
      baseSha: currentMode === 'compare' ? currentBaseSha : undefined,
      headSha: currentHeadSha,
      commitOrCompareUrl: currentGithubUrl,
      taskText: currentTaskText,
      status: newStatus,
      notes: newNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      filtersSnapshot: {
        preset: currentFilters.preset,
        includePatterns: currentFilters.includePatterns ? currentFilters.includePatterns.split(',') : [],
        excludePatterns: currentFilters.excludePatterns ? currentFilters.excludePatterns.split(',') : [],
        extensions: currentFilters.extensions ? currentFilters.extensions.split(',') : [],
        maxSizeKb: currentFilters.maxSizeKb,
        statuses: Object.entries(currentFilters.statuses)
          .filter(([, v]) => v)
          .map(([k]) => k),
        codeOnly: currentFilters.codeOnly,
        contextFiles: currentFilters.contextFiles,
      },
      includedFileCount: includedCount,
      excludedFileCount: excludedCount,
    };

    const updated = upsertSession(session);
    setSessions(updated);
    setIsCreatingNew(false);
    setNewNotes('');
  };

  const handleDelete = (id: string) => {
    const updated = deleteSession(id);
    setSessions(updated);
  };

  const handleUpdateStatus = (session: ReviewSession, status: ReviewSessionStatus) => {
    const updatedSession: ReviewSession = {
      ...session,
      status,
      reviewedAt: status === 'passed' ? new Date().toISOString() : session.reviewedAt,
      updatedAt: new Date().toISOString(),
    };
    if (status === 'passed') {
      const [owner, repoName] = session.repo.split('/');
      if (owner && repoName) {
        saveLastReviewedSha(owner, repoName, session.branch, session.headSha);
      }
    }
    const updated = upsertSession(updatedSession);
    setSessions(updated);
  };

  const handleExportJson = () => {
    const payload = JSON.stringify({ sessions }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commitpack-review-sessions-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const res = importSessionsJson(content);
      if (res.success) {
        setImportSuccess(`Imported ${res.count} review sessions`);
        setSessions(getSavedSessions());
        setTimeout(() => setImportSuccess(null), 4000);
      } else {
        setImportError(res.error || 'Failed to import JSON');
        setTimeout(() => setImportError(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const getStatusBadge = (status: ReviewSessionStatus) => {
    switch (status) {
      case 'passed':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
      case 'needs_fixes':
        return 'bg-rose-950/80 text-rose-300 border-rose-800';
      default:
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
    }
  };

  return (
    <div
      id="review-sessions-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <span>Review Sessions</span>
                <span className="text-[10px] font-mono font-normal bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                  Local-Only
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Save, reopen, and track verification statuses across single commits and range reviews.
              </p>
            </div>
          </div>

          <button
            id="close-review-sessions-modal"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="px-4 py-3 bg-zinc-900/60 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300 hover:text-zinc-100 select-none">
              <input
                type="checkbox"
                checked={filterCurrentOnly}
                onChange={(e) => setFilterCurrentOnly(e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0"
              />
              <span>Filter by current repository ({currentRepo || 'any'})</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {/* Save Current State Trigger */}
            <button
              id="create-new-session-btn"
              type="button"
              onClick={() => setIsCreatingNew(!isCreatingNew)}
              disabled={!currentHeadSha}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-mono text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Save Current Session</span>
            </button>

            {/* Export JSON */}
            <button
              id="export-sessions-json-btn"
              type="button"
              onClick={handleExportJson}
              className="p-1.5 text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700"
              title="Export all review sessions to JSON"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Import JSON */}
            <label
              htmlFor="import-sessions-input"
              className="p-1.5 text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 cursor-pointer"
              title="Import review sessions from JSON"
            >
              <Upload className="w-4 h-4" />
              <input
                id="import-sessions-input"
                type="file"
                accept=".json,application/json"
                onChange={handleImportJson}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Notices */}
        {importSuccess && (
          <div className="mx-4 mt-3 p-2.5 bg-emerald-950/50 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2 font-mono">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{importSuccess}</span>
          </div>
        )}
        {importError && (
          <div className="mx-4 mt-3 p-2.5 bg-rose-950/50 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center gap-2 font-mono">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{importError}</span>
          </div>
        )}

        {/* New Session Creation Form */}
        {isCreatingNew && (
          <div className="m-4 p-4 bg-zinc-950 border border-indigo-900/60 rounded-xl space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-300">
              <span className="font-bold text-indigo-400">Save Review Session for Current Inspection</span>
              <span className="text-[11px] text-zinc-500">
                {currentRepo} ({currentBranch})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-zinc-400 text-[11px]">Mode & Ref:</span>
                <p className="text-zinc-200">
                  {currentMode === 'compare' ? `Compare: ${currentBaseSha?.substring(0, 7)}...${currentHeadSha.substring(0, 7)}` : `Commit: ${currentHeadSha.substring(0, 7)}`}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-400 text-[11px] block">Initial Status:</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as ReviewSessionStatus)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-200"
                >
                  <option value="pending">Pending Review</option>
                  <option value="passed">Passed / Verified</option>
                  <option value="needs_fixes">Needs Fixes</option>
                </select>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <label className="text-zinc-400 text-[11px] block font-mono">Session Notes (Optional):</label>
              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="e.g. Verified auth token rotation logic, next: test error boundaries"
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreatingNew(false)}
                className="px-3 py-1.5 bg-zinc-800 text-zinc-300 text-xs rounded font-mono"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentSession}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold font-mono rounded shadow"
              >
                Save Session
              </button>
            </div>
          </div>
        )}

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sortedSessions.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 text-xs font-mono">
              <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-40 text-zinc-400" />
              <p>No saved review sessions found.</p>
              <p className="text-[11px] text-zinc-600 mt-1">
                Save your active commit or compare review state to bookmark your verification progress.
              </p>
            </div>
          ) : (
            sortedSessions.map((s) => {
              const isCompare = s.mode === 'compare';
              return (
                <div
                  key={s.id}
                  id={`review-session-card-${s.id}`}
                  className="p-3.5 bg-zinc-950/70 border border-zinc-800 hover:border-zinc-700/80 rounded-xl space-y-2.5 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isCompare ? (
                        <span className="p-1 rounded bg-purple-950/60 text-purple-400 border border-purple-800/60">
                          <GitCompare className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="p-1 rounded bg-indigo-950/60 text-indigo-400 border border-indigo-800/60">
                          <GitCommit className="w-3.5 h-3.5" />
                        </span>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-zinc-100 font-mono">
                          {s.repo}
                        </span>
                        <span className="text-[11px] text-zinc-400 font-mono">
                          ({s.branch})
                        </span>
                      </div>
                    </div>

                    {/* Status picker & actions */}
                    <div className="flex items-center gap-2">
                      <select
                        value={s.status}
                        onChange={(e) =>
                          handleUpdateStatus(s, e.target.value as ReviewSessionStatus)
                        }
                        className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border focus:outline-none cursor-pointer ${getStatusBadge(
                          s.status
                        )}`}
                      >
                        <option value="pending" className="bg-zinc-900 text-zinc-200">
                          Pending
                        </option>
                        <option value="passed" className="bg-zinc-900 text-zinc-200">
                          Passed
                        </option>
                        <option value="needs_fixes" className="bg-zinc-900 text-zinc-200">
                          Needs Fixes
                        </option>
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          onRestoreSession(s);
                          onClose();
                        }}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono rounded flex items-center gap-1 border border-zinc-700 transition-colors"
                        title="Load this session in workspace"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Reopen</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        className="p-1 text-zinc-500 hover:text-rose-400 rounded hover:bg-zinc-900"
                        title="Delete session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Ref details & task snippet */}
                  <div className="text-xs font-mono text-zinc-400 space-y-1">
                    <div className="flex flex-wrap items-center gap-3 text-[11px]">
                      <span>
                        Ref:{' '}
                        <strong className="text-zinc-200">
                          {isCompare ? `${s.baseSha?.substring(0, 7)}...${s.headSha.substring(0, 7)}` : s.headSha.substring(0, 7)}
                        </strong>
                      </span>
                      <span>
                        Files: <strong>{s.includedFileCount}</strong> included
                        {s.excludedFileCount > 0 ? ` (${s.excludedFileCount} excluded)` : ''}
                      </span>
                      <span>
                        Saved: {new Date(s.updatedAt).toLocaleDateString()}
                      </span>
                    </div>

                    {s.taskText && (
                      <p className="text-zinc-300 text-[11px] bg-zinc-900/60 p-2 rounded border border-zinc-800/80 truncate">
                        "{s.taskText}"
                      </p>
                    )}

                    {s.notes && (
                      <p className="text-indigo-300 text-[11px] italic">
                        Notes: {s.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
