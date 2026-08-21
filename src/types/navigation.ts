/**
 * @file src/types/navigation.ts
 * @description Primary navigation workspace types for CommitPack.
 */

export type AppWorkspace = 'review-commit' | 'browse-repository' | 'build-context-pack';

export interface WorkspaceDefinition {
  id: AppWorkspace;
  title: string;
  shortTitle: string;
  description: string;
  badge?: string;
}

export const WORKSPACES: WorkspaceDefinition[] = [
  {
    id: 'review-commit',
    title: 'Review Commit',
    shortTitle: 'Review',
    description: 'Review changes in a commit or compare range and generate structured AI prompts.',
  },
  {
    id: 'browse-repository',
    title: 'Browse Repository',
    shortTitle: 'Browse',
    description: 'Explore repository source files at branch HEAD and copy code snippets.',
  },
  {
    id: 'build-context-pack',
    title: 'Build Context Pack',
    shortTitle: 'Context Pack',
    description: 'Bundle multiple source files with token budget tracking for AI coding agents.',
  },
];
