/**
 * @file src/types/github.ts
 * @description Type definitions for GitHub API entities, commit metadata, file trees,
 * extraction state, rate limiting, debug logs, and bundle export structures.
 */

export interface GitHubRepoInfo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export interface GitHubCommitAuthor {
  name: string;
  email: string;
  date: string;
}

export interface GitHubCommitListItem {
  sha: string;
  node_id: string;
  commit: {
    author: GitHubCommitAuthor;
    committer: GitHubCommitAuthor;
    message: string;
    tree: {
      sha: string;
      url: string;
    };
    comment_count: number;
  };
  url: string;
  html_url: string;
  comments_url: string;
  author: {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  } | null;
  committer: {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  } | null;
  parents: Array<{
    sha: string;
    url: string;
    html_url: string;
  }>;
  stats?: {
    total: number;
    additions: number;
    deletions: number;
  };
}

export type FileStatus = 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';

export interface GitHubCommitFile {
  sha: string;
  filename: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  changes: number;
  blob_url: string;
  raw_url: string;
  contents_url: string;
  patch?: string;
  previous_filename?: string;
  // Extracted content data
  content?: string;
  binary?: boolean;
  isTooLarge?: boolean;
  fetchError?: string;
  contentLoading?: boolean;
  preDeletionContent?: string;
}

export interface GitHubCommitDetail extends GitHubCommitListItem {
  stats: {
    total: number;
    additions: number;
    deletions: number;
  };
  files: GitHubCommitFile[];
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface RateLimitState {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
  used: number;
  isAuthenticated: boolean;
}

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  method: 'GET' | 'POST' | 'HEAD';
  endpoint: string;
  params?: Record<string, string | number | boolean>;
  status: number;
  statusText: string;
  durationMs: number;
  error?: string;
  rateLimitRemaining?: number;
}

export type ExtractionMode = 'full' | 'patch-only';

export interface ExtractionProgress {
  total: number;
  current: number;
  currentFilename: string;
  isComplete: boolean;
  isCancelled: boolean;
  errorCount: number;
}

export interface ParsedRepoUrl {
  isValid: boolean;
  owner: string;
  repo: string;
  branch?: string;
  commitSha?: string;
  error?: string;
}

export interface CommitBundleData {
  repo: string;
  commit: string;
  branch: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  htmlUrl: string;
  files: Array<{
    path: string;
    status: FileStatus;
    additions: number;
    deletions: number;
    patch?: string;
    content?: string;
    binary?: boolean;
    previous_filename?: string;
  }>;
}
