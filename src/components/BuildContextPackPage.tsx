/**
 * @file src/components/BuildContextPackPage.tsx
 * @description Dedicated task-first page for selecting multiple repository files
 * from branch HEAD, tracking token context budgets, and generating AI-ready context packs.
 */

import React from 'react';
import { MainRepoContext } from './MainRepoContext';

interface BuildContextPackPageProps {
  owner: string;
  repo: string;
  defaultBranch?: string;
  pat: string | null;
}

export const BuildContextPackPage: React.FC<BuildContextPackPageProps> = ({
  owner,
  repo,
  defaultBranch = 'main',
  pat,
}) => {
  return (
    <div id="build-context-pack-page" className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <MainRepoContext
        owner={owner}
        repo={repo}
        defaultBranch={defaultBranch}
        pat={pat}
      />
    </div>
  );
};
