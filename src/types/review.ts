/**
 * @file src/types/review.ts
 * @description Types for Review Sessions, File Filtering, Compare Range,
 * Repository Telemetry, and Review Prompt structures.
 */

import { FileStatus, GitHubCommitFile } from './github';

export type ReviewSessionStatus = 'pending' | 'passed' | 'needs_fixes';

export interface ReviewSessionFiltersSnapshot {
  preset: string;
  includePatterns: string[];
  excludePatterns: string[];
  extensions: string[];
  maxSizeKb?: number;
  statuses: string[];
  codeOnly: boolean;
  contextFiles: string[];
}

export interface ReviewSession {
  id: string;
  repo: string;
  branch: string;
  mode: 'single' | 'compare';
  baseSha?: string;
  headSha: string;
  commitOrCompareUrl: string;
  taskText: string;
  status: ReviewSessionStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  filtersSnapshot: ReviewSessionFiltersSnapshot;
  includedFileCount: number;
  excludedFileCount: number;
  notes?: string;
}

export type FilterPresetName =
  | 'all'
  | 'code_only'
  | 'astro_ts'
  | 'next_ts'
  | 'supabase_sql'
  | 'custom';

export interface FileFilterConfig {
  preset: FilterPresetName;
  includePatterns: string; // Comma-separated or newline
  excludePatterns: string; // Comma-separated or newline
  extensions: string; // e.g. ".ts,.tsx,.astro,.sql"
  maxSizeKb?: number;
  statuses: Record<FileStatus, boolean>;
  codeOnly: boolean;
  includeContextFiles: boolean;
  contextFiles: string[]; // List of explicit repository paths
}

export type FileExclusionReason =
  | 'status'
  | 'glob_exclude'
  | 'glob_include_miss'
  | 'extension'
  | 'max_size'
  | 'code_only'
  | 'binary';

export interface ExcludedFileInfo {
  file: GitHubCommitFile;
  reason: FileExclusionReason;
  details?: string;
}

export interface ContextFileItem {
  path: string;
  content?: string;
  error?: string;
  isLoading?: boolean;
  size?: number;
  isCustom?: boolean;
}

export interface GitHubCompareCommit {
  sha: string;
  node_id: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
    tree: {
      sha: string;
      url: string;
    };
  };
  html_url: string;
  author: {
    login: string;
    avatar_url: string;
    html_url: string;
  } | null;
  parents: Array<{
    sha: string;
    html_url: string;
  }>;
}

export interface GitHubCompareResult {
  url: string;
  html_url: string;
  permalink_url: string;
  diff_url: string;
  patch_url: string;
  base_commit: GitHubCompareCommit;
  merge_base_commit: GitHubCompareCommit;
  status: 'ahead' | 'behind' | 'identical' | 'diverged';
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  commits: GitHubCompareCommit[];
  files?: GitHubCommitFile[];
}

export interface PersistedRepoState {
  lastKnownHeadSha: string;
  lastCheckedAt: string; // ISO string
  dismissedNewHeadSha?: string;
  newCommitCount?: number;
}
