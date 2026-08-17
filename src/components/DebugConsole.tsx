/**
 * @file src/components/DebugConsole.tsx
 * @description Collapsible bottom drawer logging all outbound GitHub API requests,
 * response HTTP codes, latency benchmarks, rate-limit consumption, and error diagnostics.
 */

import React, { useState } from 'react';
import {
  Terminal,
  ChevronUp,
  ChevronDown,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Filter,
  X,
} from 'lucide-react';
import { DebugLogEntry } from '../types/github';

interface DebugConsoleProps {
  logs: DebugLogEntry[];
  onClearLogs: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Real-time API telemetry console component.
 */
export const DebugConsole: React.FC<DebugConsoleProps> = ({
  logs,
  onClearLogs,
  isOpen,
  onToggle,
}) => {
  const [filter, setFilter] = useState<'all' | 'errors' | 'success'>('all');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'errors') return log.status >= 400 || log.status === 0 || !!log.error;
    if (filter === 'success') return log.status >= 200 && log.status < 300;
    return true;
  });

  const errorCount = logs.filter((l) => l.status >= 400 || l.status === 0 || !!l.error).length;

  return (
    <div
      id="debug-console-drawer"
      className={`fixed bottom-0 left-0 right-0 z-40 bg-zinc-950 border-t border-zinc-800 shadow-2xl transition-all duration-200 ${
        isOpen ? 'h-64' : 'h-8'
      }`}
    >
      {/* Console Bar / Header */}
      <div
        onClick={onToggle}
        className="h-8 px-4 bg-zinc-900 border-b border-zinc-800/80 flex items-center justify-between cursor-pointer select-none text-xs"
      >
        <div className="flex items-center gap-2 font-mono">
          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold text-zinc-200">GitHub API Debug Console</span>
          <span className="bg-zinc-800 text-zinc-400 px-1.5 py-0.2 rounded text-[10px]">
            {logs.length} calls
          </span>
          {errorCount > 0 && (
            <span className="bg-rose-950/80 text-rose-300 border border-rose-800 px-1.5 py-0.2 rounded text-[10px] flex items-center gap-1 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
              {errorCount} errors
            </span>
          )}
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {isOpen && (
            <>
              {/* Filter pills */}
              <div className="flex items-center bg-zinc-950 rounded border border-zinc-800 p-0.5 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`px-1.5 py-0.5 rounded ${
                    filter === 'all' ? 'bg-zinc-800 text-zinc-100 font-bold' : 'text-zinc-400'
                  }`}
                >
                  All ({logs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('errors')}
                  className={`px-1.5 py-0.5 rounded ${
                    filter === 'errors' ? 'bg-rose-950 text-rose-300 font-bold' : 'text-zinc-400'
                  }`}
                >
                  Errors ({errorCount})
                </button>
              </div>

              {/* Clear logs */}
              <button
                type="button"
                onClick={onClearLogs}
                className="p-1 text-zinc-400 hover:text-rose-300 rounded hover:bg-zinc-800 transition-colors"
                title="Clear logs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onToggle}
            className="text-zinc-400 hover:text-zinc-200"
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Log Feed when Open */}
      {isOpen && (
        <div className="h-[calc(100%-2rem)] flex flex-col md:flex-row overflow-hidden font-mono text-xs">
          {/* List of Requests */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-900 bg-zinc-950 p-1">
            {filteredLogs.length === 0 ? (
              <div className="p-4 text-center text-zinc-600 text-xs">
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
                    className={`p-1.5 rounded cursor-pointer transition-colors flex items-center justify-between gap-2 text-[11px] ${
                      isSelected
                        ? 'bg-indigo-950/40 text-indigo-200'
                        : 'hover:bg-zinc-900/60 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isError ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}

                      <span className="text-zinc-500">{log.timestamp}</span>

                      <span className="px-1 bg-zinc-800 text-zinc-300 font-bold rounded text-[10px]">
                        {log.method}
                      </span>

                      <span
                        className={`font-semibold ${
                          isError ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {log.status || 'ERR'}
                      </span>

                      <span className="truncate text-zinc-300 font-mono">
                        {log.endpoint}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-zinc-500 shrink-0">
                      {log.rateLimitRemaining !== undefined && (
                        <span className="text-[10px] text-zinc-400">
                          rem: {log.rateLimitRemaining}
                        </span>
                      )}
                      <span className="text-[10px] flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {log.durationMs}ms
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Selected Log Inspector Side */}
          {selectedLogId && (
            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-zinc-800 bg-zinc-900/40 p-3 overflow-y-auto text-[11px] space-y-2">
              <div className="flex items-center justify-between text-zinc-400 font-bold border-b border-zinc-800 pb-1">
                <span>Request Inspector</span>
                <button
                  type="button"
                  onClick={() => setSelectedLogId(null)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {(() => {
                const log = logs.find((l) => l.id === selectedLogId);
                if (!log) return null;
                return (
                  <div className="space-y-1.5 text-zinc-300">
                    <div>
                      <span className="text-zinc-500">Endpoint:</span>{' '}
                      <span className="text-indigo-300 break-all">{log.endpoint}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Status:</span>{' '}
                      <span
                        className={log.status >= 400 ? 'text-rose-400' : 'text-emerald-400'}
                      >
                        {log.status} {log.statusText}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Latency:</span> {log.durationMs}ms
                    </div>
                    {log.params && (
                      <div>
                        <span className="text-zinc-500">Parameters:</span>
                        <pre className="mt-1 p-1 bg-zinc-950 rounded border border-zinc-800 text-[10px] text-zinc-300 overflow-x-auto">
                          {JSON.stringify(log.params, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.error && (
                      <div className="p-2 bg-rose-950/50 border border-rose-800/80 rounded text-rose-300 text-[10px]">
                        <span className="font-bold">Error:</span> {log.error}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
