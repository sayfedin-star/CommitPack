/**
 * @file src/components/DebugConsole.tsx
 * @description Slide-over/bottom drawer logging all outbound GitHub API requests,
 * response HTTP codes, latency benchmarks, rate-limit consumption, and error diagnostics.
 * When closed, it consumes 0px screen height and avoids layout clipping.
 */

import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  X,
  ChevronDown,
  Copy,
  Check,
} from 'lucide-react';
import { DebugLogEntry } from '../types/github';

interface DebugConsoleProps {
  logs: DebugLogEntry[];
  onClearLogs: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Real-time API telemetry console slide-over drawer component.
 */
export const DebugConsole: React.FC<DebugConsoleProps> = ({
  logs,
  onClearLogs,
  isOpen,
  onToggle,
}) => {
  const [filter, setFilter] = useState<'all' | 'errors' | 'success'>('all');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [hasCopiedCurl, setHasCopiedCurl] = useState<boolean>(false);

  // Keep --debug-console-height variable synchronized for legacy layout compatibility
  useEffect(() => {
    document.documentElement.style.setProperty('--debug-console-height', isOpen ? '280px' : '0px');
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filter === 'errors') return log.status >= 400 || log.status === 0 || !!log.error;
    if (filter === 'success') return log.status >= 200 && log.status < 300;
    return true;
  });

  const errorCount = logs.filter((l) => l.status >= 400 || l.status === 0 || !!l.error).length;

  return (
    <div
      id="debug-console-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex flex-col justify-end transition-opacity"
      onClick={onToggle}
    >
      <div
        id="debug-console-drawer"
        className="w-full bg-zinc-950 border-t border-zinc-800 shadow-2xl h-80 max-h-[85vh] flex flex-col transition-all font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="h-10 px-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between select-none text-xs">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-zinc-100">GitHub API Debug Logs</span>
            <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded text-[11px]">
              {logs.length} calls
            </span>
            {errorCount > 0 && (
              <span className="bg-rose-950/80 text-rose-300 border border-rose-800 px-2 py-0.5 rounded text-[11px] flex items-center gap-1 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                {errorCount} errors
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Filter pills */}
            <div className="flex items-center bg-zinc-950 rounded border border-zinc-800 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  filter === 'all' ? 'bg-zinc-800 text-zinc-100 font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All ({logs.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('errors')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  filter === 'errors' ? 'bg-rose-950 text-rose-300 font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Errors ({errorCount})
              </button>
            </div>

            {/* Clear logs */}
            <button
              type="button"
              onClick={onClearLogs}
              className="p-1.5 text-zinc-400 hover:text-rose-300 rounded hover:bg-zinc-800 transition-colors"
              title="Clear all logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            {/* Close Drawer button */}
            <button
              type="button"
              onClick={onToggle}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded hover:bg-zinc-800 transition-colors ml-1"
              title="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Log Feed & Inspector */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden text-xs">
          {/* List of Requests */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-900 bg-zinc-950 p-1">
            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 text-xs">
                No API requests recorded yet.
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isError = log.status >= 400 || log.status === 0 || !!log.error;
                const isSelected = selectedLogId === log.id;

                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLogId(isSelected ? null : log.id)}
                    className={`p-2 rounded cursor-pointer transition-colors flex items-center justify-between gap-2 text-[11px] ${
                      isSelected
                        ? 'bg-indigo-950/60 text-indigo-200 ring-1 ring-indigo-800'
                        : 'hover:bg-zinc-900/60 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isError ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}

                      <span className="text-zinc-500 text-[10px]">{log.timestamp}</span>

                      <span className="px-1.5 py-0.2 bg-zinc-800 text-zinc-300 font-bold rounded text-[10px]">
                        {log.method}
                      </span>

                      <span
                        className={`font-bold ${
                          isError ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {log.status || 'ERR'}
                      </span>

                      <span className="truncate text-zinc-300">
                        {log.endpoint}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-zinc-500 shrink-0">
                      {log.rateLimitRemaining !== undefined && (
                        <span className="text-[10px] text-zinc-400 font-mono">
                          quota: {log.rateLimitRemaining}
                        </span>
                      )}
                      <span className="text-[10px] flex items-center gap-0.5 font-mono">
                        <Clock className="w-2.5 h-2.5" />
                        {log.durationMs}ms
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Selected Log Inspector */}
          {selectedLogId && (
            <div className="w-full md:w-96 border-t md:border-t-0 md:border-l border-zinc-800 bg-zinc-900/60 p-3 overflow-y-auto text-[11px] space-y-2.5">
              <div className="flex items-center justify-between text-zinc-400 font-bold border-b border-zinc-800 pb-1.5">
                <span>Request Inspector</span>
                <button
                  type="button"
                  onClick={() => setSelectedLogId(null)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {(() => {
                const log = logs.find((l) => l.id === selectedLogId);
                if (!log) return null;
                return (
                  <div className="space-y-2 text-zinc-300">
                    <div>
                      <span className="text-zinc-500">Endpoint:</span>{' '}
                      <span className="text-indigo-300 break-all">{log.endpoint}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Status:</span>{' '}
                      <span
                        className={log.status >= 400 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}
                      >
                        {log.status} {log.statusText}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Latency:</span> {log.durationMs}ms
                    </div>
                    {log.rateLimitRemaining !== undefined && (
                      <div>
                        <span className="text-zinc-500">Rate Limit Remaining:</span> {log.rateLimitRemaining}
                      </div>
                    )}
                    {log.params && (
                      <div>
                        <span className="text-zinc-500">Parameters:</span>
                        <pre className="mt-1 p-1.5 bg-zinc-950 rounded border border-zinc-800 text-[10px] text-zinc-300 overflow-x-auto">
                          {JSON.stringify(log.params, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.error && (
                      <div className="p-2 bg-rose-950/50 border border-rose-800 rounded text-rose-300 text-[10px]">
                        <span className="font-bold">Error:</span> {log.error}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
