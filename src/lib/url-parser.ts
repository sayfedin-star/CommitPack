/**
 * @file src/lib/url-parser.ts
 * @description Parses and validates GitHub repository URLs, shorthand notation,
 * branch paths, and commit links.
 */

import { ParsedRepoUrl } from '../types/github';

/**
 * Parses user input string into repository coordinates (owner, repo, branch, commitSha).
 * Handles:
 * - https://github.com/owner/repo
 * - http://github.com/owner/repo
 * - github.com/owner/repo
 * - owner/repo (shorthand)
 * - https://github.com/owner/repo/tree/branch-name (with nested branch paths)
 * - https://github.com/owner/repo/commit/sha
 * - https://github.com/owner/repo/pull/123/commits/sha
 * 
 * @param input - The raw string input from the user.
 * @returns ParsedRepoUrl object with isValid flag and parsed coordinates or error message.
 */
export function parseGitHubUrl(input: string): ParsedRepoUrl {
  if (!input || !input.trim()) {
    return {
      isValid: false,
      owner: '',
      repo: '',
      error: 'Please enter a GitHub repository URL or owner/repo shorthand (e.g. facebook/react)',
    };
  }

  const cleanInput = input.trim().replace(/\.git$/, '');

  // Case 1: Shorthand owner/repo format (e.g., 'facebook/react' or 'torvalds/linux')
  const shorthandRegex = /^([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+)$/;
  const shorthandMatch = cleanInput.match(shorthandRegex);
  if (shorthandMatch) {
    const [, owner, repo] = shorthandMatch;
    return {
      isValid: true,
      owner,
      repo,
    };
  }

  // Case 2: Full or partial GitHub URLs
  let normalizedUrl = cleanInput;
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    const url = new URL(normalizedUrl);
    
    // Check if domain is github.com or api.github.com
    if (!url.hostname.includes('github.com')) {
      return {
        isValid: false,
        owner: '',
        repo: '',
        error: 'Only GitHub repository URLs (github.com) are supported.',
      };
    }

    // Path segments: ['owner', 'repo', 'tree', 'main', ...]
    const segments = url.pathname.split('/').filter(Boolean);

    if (segments.length < 2) {
      return {
        isValid: false,
        owner: '',
        repo: '',
        error: 'Invalid GitHub URL. Must contain both owner and repository name.',
      };
    }

    const owner = segments[0];
    const repo = segments[1];
    let branch: string | undefined;
    let commitSha: string | undefined;

    if (segments.length >= 4 && segments[2] === 'tree') {
      // /owner/repo/tree/branch-name or nested/branch/path
      branch = segments.slice(3).join('/');
    } else if (segments.length >= 4 && segments[2] === 'commit') {
      // /owner/repo/commit/sha
      commitSha = segments[3];
    } else if (segments.length >= 5 && segments[2] === 'pull' && segments[4] === 'commits') {
      // /owner/repo/pull/123/commits/sha
      commitSha = segments[5];
    }

    return {
      isValid: true,
      owner,
      repo,
      branch,
      commitSha,
    };
  } catch {
    return {
      isValid: false,
      owner: '',
      repo: '',
      error: 'Malformed URL. Please enter a valid URL (e.g., https://github.com/owner/repo)',
    };
  }
}
