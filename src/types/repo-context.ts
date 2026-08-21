/**
 * @file src/types/repo-context.ts
 * @description Types for Main Repository Context, Full Tree Copy, Selected File Pack,
 * tri-state selection, search filtering, and localStorage persistence.
 */

export type RepoTreeMode = 'commit' | 'main-context';

export type TreeCopyFormat = 'flat' | 'compact' | 'ascii';
export type FilePackFormat = 'markdown' | 'json';

export interface PersistedRepoContextState {
  activeMode: RepoTreeMode;
  approvedFallbackBranch?: string | null;
  selectedPaths: string[];
  lastUsedFormat?: TreeCopyFormat | FilePackFormat;
}

export type FolderCheckboxState = 'unchecked' | 'checked' | 'indeterminate';

export interface MainTreeNode {
  name: string;
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  isBinary: boolean;
  children: Map<string, MainTreeNode>;
  // Pre-computed descendant paths for fast recursive folder checking
  descendantTextPaths: string[];
  descendantBinaryPaths: string[];
}

export interface FilePackFetchProgress {
  total: number;
  current: number;
  currentPath: string;
  isFetching: boolean;
}

export interface CachedMainTree {
  owner: string;
  repo: string;
  branch: string;
  sha: string;
  isFallback: boolean;
  truncated: boolean;
  items: Array<{
    path: string;
    type: 'blob' | 'tree' | 'commit';
    sha: string;
    size?: number;
  }>;
  fetchedAt: number;
}
