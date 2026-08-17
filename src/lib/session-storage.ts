/**
 * @file src/lib/session-storage.ts
 * @description Centralized LocalStorage persistence manager for Review Sessions,
 * repository state caches, review checkpoints, active filters, and task drafts.
 */

import { ReviewSession, FileFilterConfig, PersistedRepoState } from '../types/review';
import { getDefaultFilterConfig } from './file-filter';

const SESSIONS_STORAGE_KEY = 'commitpack:v1:review-sessions';

/**
 * Normalizes repository key identifier.
 */
function getRepoBranchKey(owner: string, repo: string, branch: string = 'main'): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}:${branch.toLowerCase()}`;
}

function getRepoKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

// -------------------------------------------------------------
// REVIEW SESSIONS
// -------------------------------------------------------------

/**
 * Loads all saved review sessions from localStorage.
 */
export function getSavedSessions(): ReviewSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Ensure basic required fields exist
    return parsed.filter(
      (s): s is ReviewSession =>
        Boolean(s && typeof s === 'object' && s.id && s.repo && s.headSha)
    );
  } catch (err) {
    console.error('Failed to load review sessions from localStorage:', err);
    return [];
  }
}

/**
 * Saves review sessions to localStorage.
 */
export function saveSessions(sessions: ReviewSession[]): boolean {
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    return true;
  } catch (err) {
    console.error('Failed to save review sessions to localStorage:', err);
    return false;
  }
}

/**
 * Adds or updates a review session.
 */
export function upsertSession(session: ReviewSession): ReviewSession[] {
  const existing = getSavedSessions();
  const index = existing.findIndex((s) => s.id === session.id);
  let updated: ReviewSession[];

  if (index >= 0) {
    updated = [...existing];
    updated[index] = { ...session, updatedAt: new Date().toISOString() };
  } else {
    updated = [session, ...existing];
  }

  saveSessions(updated);
  return updated;
}

/**
 * Deletes a session by ID.
 */
export function deleteSession(id: string): ReviewSession[] {
  const existing = getSavedSessions();
  const updated = existing.filter((s) => s.id !== id);
  saveSessions(updated);
  return updated;
}

/**
 * Validates and imports external sessions JSON string.
 */
export function importSessionsJson(jsonString: string): { success: boolean; count: number; error?: string } {
  try {
    const parsed = JSON.parse(jsonString);
    const candidateList = Array.isArray(parsed) ? parsed : parsed.sessions;
    if (!Array.isArray(candidateList)) {
      return { success: false, count: 0, error: 'Invalid format: Expected JSON array of sessions' };
    }

    const validSessions: ReviewSession[] = [];
    for (const item of candidateList) {
      if (item && typeof item === 'object' && item.id && item.repo && item.headSha) {
        validSessions.push(item as ReviewSession);
      }
    }

    if (validSessions.length === 0) {
      return { success: false, count: 0, error: 'No valid sessions found in JSON payload' };
    }

    const existing = getSavedSessions();
    const existingIds = new Set(existing.map((s) => s.id));
    const merged = [...existing];

    for (const s of validSessions) {
      if (existingIds.has(s.id)) {
        const idx = merged.findIndex((m) => m.id === s.id);
        merged[idx] = s;
      } else {
        merged.push(s);
        existingIds.add(s.id);
      }
    }

    saveSessions(merged);
    return { success: true, count: validSessions.length };
  } catch (err: unknown) {
    return { success: false, count: 0, error: (err as Error).message || 'JSON parse failure' };
  }
}

// -------------------------------------------------------------
// REPOSITORY TELEMETRY / REFRESH STATE
// -------------------------------------------------------------

export function getPersistedRepoState(owner: string, repo: string, branch: string): PersistedRepoState | null {
  try {
    const key = `commitpack:v1:repo-state:${getRepoBranchKey(owner, repo, branch)}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePersistedRepoState(
  owner: string,
  repo: string,
  branch: string,
  state: PersistedRepoState
): void {
  try {
    const key = `commitpack:v1:repo-state:${getRepoBranchKey(owner, repo, branch)}`;
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues
  }
}

// -------------------------------------------------------------
// LAST REVIEWED COMMIT CHECKPOINT (SINCE LAST REVIEW)
// -------------------------------------------------------------

export function getLastReviewedSha(owner: string, repo: string, branch: string): string | null {
  try {
    const key = `commitpack:v1:last-reviewed:${getRepoBranchKey(owner, repo, branch)}`;
    return localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

export function saveLastReviewedSha(owner: string, repo: string, branch: string, sha: string): void {
  try {
    const key = `commitpack:v1:last-reviewed:${getRepoBranchKey(owner, repo, branch)}`;
    localStorage.setItem(key, sha.trim());
  } catch {
    // Ignore storage issues
  }
}

// -------------------------------------------------------------
// FILE FILTERS PER REPO/BRANCH
// -------------------------------------------------------------

export function getSavedFilters(owner: string, repo: string, branch?: string): FileFilterConfig {
  try {
    const key = branch
      ? `commitpack:v1:filters:${getRepoBranchKey(owner, repo, branch)}`
      : `commitpack:v1:filters:${getRepoKey(owner, repo)}`;
    const raw = localStorage.getItem(key);
    if (!raw) return getDefaultFilterConfig();
    const parsed = JSON.parse(raw);
    return { ...getDefaultFilterConfig(), ...parsed };
  } catch {
    return getDefaultFilterConfig();
  }
}

export function saveFilters(owner: string, repo: string, branchOrConfig: string | FileFilterConfig, maybeConfig?: FileFilterConfig): void {
  try {
    let key: string;
    let config: FileFilterConfig;

    if (typeof branchOrConfig === 'string') {
      key = `commitpack:v1:filters:${getRepoBranchKey(owner, repo, branchOrConfig)}`;
      config = maybeConfig || getDefaultFilterConfig();
    } else {
      key = `commitpack:v1:filters:${getRepoKey(owner, repo)}`;
      config = branchOrConfig;
    }

    localStorage.setItem(key, JSON.stringify(config));
  } catch {
    // Ignore storage issues
  }
}

export const getSavedFilterConfig = (owner: string, repo: string) => getSavedFilters(owner, repo);
export const saveFilterConfig = (owner: string, repo: string, config: FileFilterConfig) => saveFilters(owner, repo, config);

// -------------------------------------------------------------
// REVIEW TASK DRAFT
// -------------------------------------------------------------

export function getSavedTaskText(owner: string, repo: string, branch: string): string {
  try {
    const key = `commitpack:v1:task:${getRepoBranchKey(owner, repo, branch)}`;
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function saveTaskText(owner: string, repo: string, branch: string, text: string): void {
  try {
    const key = `commitpack:v1:task:${getRepoBranchKey(owner, repo, branch)}`;
    if (!text.trim()) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, text);
    }
  } catch {
    // Ignore storage issues
  }
}

export const getSavedTaskDraft = getSavedTaskText;
export const saveTaskDraft = saveTaskText;
