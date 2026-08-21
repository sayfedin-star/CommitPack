/**
 * @file src/lib/github-api.ts
 * @description GitHub REST API client with rate-limit tracking, base64/raw file decoding,
 * binary file detection, debug logging, and abortable request support.
 */

import {
  GitHubRepoInfo,
  GitHubBranch,
  GitHubCommitListItem,
  GitHubCommitDetail,
  GitHubTreeResponse,
  RateLimitState,
  DebugLogEntry,
  GitHubCommitFile,
} from '../types/github';
import { GitHubCompareResult } from '../types/review';

// Known binary file extensions that should not be parsed as text
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'pdf', 'zip', 'tar', 'gz', 'bz2', '7z', 'rar',
  'woff', 'woff2', 'ttf', 'eot', 'otf', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg',
  'wasm', 'exe', 'dll', 'so', 'dylib', 'bin', 'pyc', 'class', 'jar', 'lockb', 'dat', 'iso', 'dmg',
]);

// Listener callbacks for rate limit updates and debug logs
type RateLimitListener = (state: RateLimitState) => void;
type DebugLogListener = (entry: DebugLogEntry) => void;

let rateLimitListeners: RateLimitListener[] = [];
let debugLogListeners: DebugLogListener[] = [];

/**
 * Registers a listener for rate limit changes.
 * @param listener - Function called whenever rate limit headers are received.
 * @returns Unsubscribe function.
 */
export function subscribeToRateLimit(listener: RateLimitListener): () => void {
  rateLimitListeners.push(listener);
  return () => {
    rateLimitListeners = rateLimitListeners.filter((l) => l !== listener);
  };
}

/**
 * Registers a listener for debug log entries.
 * @param listener - Function called whenever an API call completes or fails.
 * @returns Unsubscribe function.
 */
export function subscribeToDebugLogs(listener: DebugLogListener): () => void {
  debugLogListeners.push(listener);
  return () => {
    debugLogListeners = debugLogListeners.filter((l) => l !== listener);
  };
}

/**
 * Checks if a given file name or path is likely a binary file based on extension.
 * @param filename - The file path or name.
 * @returns True if binary extension detected.
 */
export function isBinaryFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? BINARY_EXTENSIONS.has(ext) : false;
}

/**
 * Safely decodes a Base64 string that may contain UTF-8 unicode characters.
 * @param base64 - Base64 encoded string.
 * @returns Decoded UTF-8 string.
 */
export function safeBase64Decode(base64: string): string {
  try {
    const cleanBase64 = base64.replace(/\s+/g, '');
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    // Fallback if TextDecoder encounters an issue
    return atob(base64.replace(/\s+/g, ''));
  }
}

/**
 * Internal helper to make authenticated/anonymous GitHub API calls with rate-limit tracking and logging.
 * 
 * @param endpoint - API path (e.g. '/repos/owner/repo')
 * @param options - Fetch options including PAT, headers, and AbortSignal
 * @returns Parsed JSON response or throws formatted Error.
 */
async function githubFetch<T>(
  endpoint: string,
  options: {
    token?: string | null;
    params?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    rawText?: boolean;
  } = {}
): Promise<T> {
  const { token, params, headers = {}, signal, rawText = false } = options;

  let url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const reqHeaders: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    ...headers,
  };

  if (token && token.trim()) {
    reqHeaders['Authorization'] = `Bearer ${token.trim()}`;
  }

  const startTime = performance.now();
  const logId = Math.random().toString(36).substring(2, 9);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: reqHeaders,
      signal,
    });

    const durationMs = Math.round(performance.now() - startTime);

    // Parse rate limit headers
    const limitHeader = response.headers.get('x-ratelimit-limit');
    const remainingHeader = response.headers.get('x-ratelimit-remaining');
    const resetHeader = response.headers.get('x-ratelimit-reset');
    const usedHeader = response.headers.get('x-ratelimit-used');

    let remainingCount: number | undefined;
    if (limitHeader && remainingHeader && resetHeader) {
      const limit = parseInt(limitHeader, 10);
      const remaining = parseInt(remainingHeader, 10);
      const reset = parseInt(resetHeader, 10);
      const used = usedHeader ? parseInt(usedHeader, 10) : limit - remaining;
      remainingCount = remaining;

      const rateLimitState: RateLimitState = {
        limit,
        remaining,
        reset,
        used,
        isAuthenticated: !!(token && token.trim()),
      };

      rateLimitListeners.forEach((l) => l(rateLimitState));
    }

    const logEntry: DebugLogEntry = {
      id: logId,
      timestamp: new Date().toLocaleTimeString(),
      method: 'GET',
      endpoint: url.replace('https://api.github.com', ''),
      params,
      status: response.status,
      statusText: response.statusText,
      durationMs,
      rateLimitRemaining: remainingCount,
    };

    if (!response.ok) {
      let errorMessage = `GitHub API error: ${response.status} ${response.statusText}`;

      if (response.status === 404) {
        errorMessage = 'Repository, commit, or file not found (404). Check the URL or provide a Personal Access Token if private.';
      } else if (response.status === 401) {
        errorMessage = 'Unauthorized (401). Your GitHub Personal Access Token is invalid or expired.';
      } else if (response.status === 403) {
        if (remainingCount === 0 && resetHeader) {
          const resetDate = new Date(parseInt(resetHeader, 10) * 1000).toLocaleTimeString();
          errorMessage = `GitHub API rate limit exceeded (403). Limit resets at ${resetDate}. Add a Personal Access Token to get 5,000 req/hr.`;
        } else {
          errorMessage = 'Forbidden (403). You may have hit a rate limit or lack permission for this repository.';
        }
      }

      logEntry.error = errorMessage;
      debugLogListeners.forEach((l) => l(logEntry));
      throw new Error(errorMessage);
    }

    debugLogListeners.forEach((l) => l(logEntry));

    if (rawText) {
      const text = await response.text();
      return text as unknown as T;
    }

    const data = await response.json();
    return data as T;
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') {
      const abortLog: DebugLogEntry = {
        id: logId,
        timestamp: new Date().toLocaleTimeString(),
        method: 'GET',
        endpoint: url.replace('https://api.github.com', ''),
        params,
        status: 0,
        statusText: 'Cancelled',
        durationMs: Math.round(performance.now() - startTime),
        error: 'Request aborted by user',
      };
      debugLogListeners.forEach((l) => l(abortLog));
      throw err;
    }

    const errorLog: DebugLogEntry = {
      id: logId,
      timestamp: new Date().toLocaleTimeString(),
      method: 'GET',
      endpoint: url.replace('https://api.github.com', ''),
      params,
      status: 0,
      statusText: 'Network Error',
      durationMs: Math.round(performance.now() - startTime),
      error: (err as Error).message || 'Network request failed',
    };
    debugLogListeners.forEach((l) => l(errorLog));
    throw err;
  }
}

/**
 * Fetches repository summary information.
 * 
 * @param owner - Repository owner (user or organization)
 * @param repo - Repository name
 * @param token - Optional GitHub Personal Access Token
 * @param signal - Optional AbortSignal
 * @returns Repository metadata object
 */
export async function getRepoInfo(
  owner: string,
  repo: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<GitHubRepoInfo> {
  return githubFetch<GitHubRepoInfo>(`/repos/${owner}/${repo}`, { token, signal });
}

/**
 * Fetches all branches for a given repository.
 * 
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param token - Optional GitHub Personal Access Token
 * @param signal - Optional AbortSignal
 * @returns Array of branch objects
 */
export async function getRepoBranches(
  owner: string,
  repo: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<GitHubBranch[]> {
  return githubFetch<GitHubBranch[]>(`/repos/${owner}/${repo}/branches`, {
    token,
    params: { per_page: 100 },
    signal,
  });
}

/**
 * Fetches commit timeline list with selectable pagination and branch filter.
 * 
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param perPage - Number of commits per request (10, 25, 50, 100)
 * @param branchOrSha - Optional branch name or SHA to start from
 * @param page - Page number (defaults to 1)
 * @param token - Optional GitHub Personal Access Token
 * @param signal - Optional AbortSignal
 * @returns Array of commit list items
 */
export async function getCommitList(
  owner: string,
  repo: string,
  perPage: number = 25,
  branchOrSha?: string,
  page: number = 1,
  token?: string | null,
  signal?: AbortSignal
): Promise<GitHubCommitListItem[]> {
  const params: Record<string, string | number> = {
    per_page: perPage,
    page,
  };
  if (branchOrSha) {
    params.sha = branchOrSha;
  }

  return githubFetch<GitHubCommitListItem[]>(`/repos/${owner}/${repo}/commits`, {
    token,
    params,
    signal,
  });
}

/**
 * Fetches detailed commit data including changed files[] and patch diffs.
 * 
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param sha - The full or short commit SHA
 * @param token - Optional GitHub Personal Access Token
 * @param signal - Optional AbortSignal
 * @returns Detailed commit object with file changes
 */
export async function getCommitDetail(
  owner: string,
  repo: string,
  sha: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<GitHubCommitDetail> {
  return githubFetch<GitHubCommitDetail>(`/repos/${owner}/${repo}/commits/${sha}`, {
    token,
    signal,
  });
}

/**
 * Fetches the latest HEAD commit for a specific branch.
 * 
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branch - Branch name
 * @param token - Optional GitHub Personal Access Token
 * @param signal - Optional AbortSignal
 * @returns Latest commit list item or null
 */
export async function getHeadCommit(
  owner: string,
  repo: string,
  branch: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<GitHubCommitListItem | null> {
  const commits = await githubFetch<GitHubCommitListItem[]>(`/repos/${owner}/${repo}/commits`, {
    token,
    params: {
      sha: branch,
      per_page: 1,
    },
    signal,
  });
  return commits && commits.length > 0 ? commits[0] : null;
}

/**
 * Compares two commits/refs via GitHub compare API.
 * GET /repos/{owner}/{repo}/compare/{base}...{head}
 * 
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param base - Base commit SHA or ref
 * @param head - Head commit SHA or ref
 * @param token - Optional GitHub Personal Access Token
 * @param signal - Optional AbortSignal
 * @returns Compare response with commits and changed files
 */
export async function compareCommits(
  owner: string,
  repo: string,
  base: string,
  head: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<GitHubCompareResult> {
  const safeBase = encodeURIComponent((base || '').trim());
  const safeHead = encodeURIComponent((head || '').trim());
  return githubFetch<GitHubCompareResult>(`/repos/${owner}/${repo}/compare/${safeBase}...${safeHead}`, {
    token,
    signal,
  });
}

/**
 * Calculates number of commits between base and head.
 * 
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param baseSha - Base commit SHA
 * @param headSha - Head commit SHA
 * @param token - Optional GitHub Personal Access Token
 * @param signal - Optional AbortSignal
 * @returns Total commits ahead count
 */
export async function getCommitCountBetween(
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<number> {
  try {
    const result = await compareCommits(owner, repo, baseSha, headSha, token, signal);
    return result.ahead_by ?? (result.commits ? result.commits.length : 0);
  } catch {
    return 0;
  }
}

/**
 * Fetches complete git tree for repository at a specific commit SHA.
 * 
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param sha - Commit SHA or tree SHA
 * @param token - Optional GitHub Personal Access Token
 * @param signal - Optional AbortSignal
 * @returns Full recursive tree response
 */
export async function getRepoTree(
  owner: string,
  repo: string,
  sha: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<GitHubTreeResponse> {
  return githubFetch<GitHubTreeResponse>(`/repos/${owner}/${repo}/git/trees/${sha}`, {
    token,
    params: { recursive: '1' },
    signal,
  });
}

/**
 * Fetches single file full content at a specific ref/commit.
 * Handles files <= 1MB via base64, files 1-100MB via raw header, and flags files > 100MB as too large.
 * 
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param path - Relative file path in repository
 * @param ref - Commit SHA or branch reference
 * @param token - Optional GitHub Personal Access Token
 * @param signal - Optional AbortSignal
 * @returns File content text or metadata error
 */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<{ content: string; binary: boolean; isTooLarge: boolean; size?: number }> {
  // Check extension for obvious binary files
  if (isBinaryFile(path)) {
    return {
      content: '[Binary file content omitted from text bundle]',
      binary: true,
      isTooLarge: false,
    };
  }

  // Attempt standard Contents API
  try {
    interface ContentApiResponse {
      type: string;
      size: number;
      name: string;
      path: string;
      content?: string;
      encoding?: string;
      download_url?: string;
    }

    const data = await githubFetch<ContentApiResponse>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
      token,
      params: { ref },
      signal,
    });

    const sizeInBytes = data.size || 0;
    const sizeInMB = sizeInBytes / (1024 * 1024);

    // Rule: Files > 100MB mark as too large
    if (sizeInMB > 100) {
      return {
        content: `[File size is ${(sizeInMB).toFixed(1)}MB — exceeds 100MB limit and was excluded]`,
        binary: false,
        isTooLarge: true,
        size: sizeInBytes,
      };
    }

    // Rule: Files <= 1MB with base64 content
    if (data.content && data.encoding === 'base64') {
      const decoded = safeBase64Decode(data.content);
      return {
        content: decoded,
        binary: false,
        isTooLarge: false,
        size: sizeInBytes,
      };
    }

    // Rule: Files 1-100MB or missing base64: fetch raw stream/text
    const rawContent = await githubFetch<string>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
      token,
      params: { ref },
      headers: {
        Accept: 'application/vnd.github.raw',
      },
      rawText: true,
      signal,
    });

    return {
      content: rawContent,
      binary: false,
      isTooLarge: false,
      size: sizeInBytes,
    };
  } catch (err: unknown) {
    // If Contents API fails due to size, fallback to raw endpoint directly
    try {
      const rawContent = await githubFetch<string>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
        token,
        params: { ref },
        headers: {
          Accept: 'application/vnd.github.raw',
        },
        rawText: true,
        signal,
      });

      return {
        content: rawContent,
        binary: false,
        isTooLarge: false,
      };
    } catch {
      throw err;
    }
  }
}

/**
 * Fetches the pre-deletion version of a removed file at the commit's parent SHA.
 * 
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param path - File path
 * @param parentSha - SHA of the commit's parent
 * @param token - Optional GitHub Personal Access Token
 * @param signal - Optional AbortSignal
 * @returns File content or error string
 */
export async function getPreDeletionFileContent(
  owner: string,
  repo: string,
  path: string,
  parentSha: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<string> {
  const result = await getFileContent(owner, repo, path, parentSha, token, signal);
  return result.content;
}

/**
 * Checks current GitHub rate limits against /rate_limit endpoint.
 * 
 * @param token - Optional GitHub Personal Access Token
 * @returns Current RateLimitState
 */
export async function checkRateLimit(token?: string | null): Promise<RateLimitState> {
  interface RateLimitApiResponse {
    resources: {
      core: {
        limit: number;
        remaining: number;
        reset: number;
        used: number;
      };
    };
  }

  const res = await githubFetch<RateLimitApiResponse>('/rate_limit', { token });
  const core = res.resources.core;
  const state: RateLimitState = {
    limit: core.limit,
    remaining: core.remaining,
    reset: core.reset,
    used: core.used,
    isAuthenticated: !!(token && token.trim()),
  };

  rateLimitListeners.forEach((l) => l(state));
  return state;
}
