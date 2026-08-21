/**
 * @file src/lib/main-tree-cache.ts
 * @description In-memory session cache for repository main branch trees, resolving SHA,
 * and truncated tree flags to prevent excessive GitHub API recursive calls.
 */

import { CachedMainTree } from '../types/repo-context';

const treeCache = new Map<string, CachedMainTree>();

function makeKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export function getCachedMainTree(owner: string, repo: string): CachedMainTree | null {
  return treeCache.get(makeKey(owner, repo)) || null;
}

export function setCachedMainTree(owner: string, repo: string, tree: CachedMainTree): void {
  treeCache.set(makeKey(owner, repo), tree);
}

export function clearCachedMainTree(owner: string, repo: string): void {
  treeCache.delete(makeKey(owner, repo));
}

export function clearAllMainTreeCache(): void {
  treeCache.clear();
}
