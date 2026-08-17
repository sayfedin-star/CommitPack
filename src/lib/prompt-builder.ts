/**
 * @file src/lib/prompt-builder.ts
 * @description Generates structured AI agent review prompts combining
 * user acceptance criteria, scope metadata, and complete Commit Pack Markdown.
 */

export interface ReviewPromptParams {
  owner: string;
  repo: string;
  branch: string;
  mode: 'single' | 'compare';
  baseSha?: string;
  headSha: string;
  githubUrl: string;
  includedFileCount: number;
  excludedFileCount: number;
  taskText: string;
  commitPackMarkdown: string;
}

/**
 * Builds the complete Markdown prompt for AI agent code review.
 * 
 * @param params - Scope, task, and pack content parameters
 * @returns Fully formatted Markdown review prompt string
 */
export function buildReviewPrompt(params: ReviewPromptParams): string {
  const {
    owner,
    repo,
    branch,
    mode,
    baseSha,
    headSha,
    githubUrl,
    includedFileCount,
    excludedFileCount,
    taskText,
    commitPackMarkdown,
  } = params;

  const reviewModeLabel = mode === 'compare' ? 'Compare Range' : 'Single Commit';
  const baseValue = mode === 'compare' && baseSha ? baseSha : 'N/A';
  const excludedLine =
    excludedFileCount > 0
      ? `\n- Excluded files: ${excludedFileCount} (filtered by active rules)`
      : '';

  return `# Implementation Review Request

You are reviewing implementation progress for a GitHub change set.

## Scope
- Repository: ${owner}/${repo}
- Branch: ${branch}
- Review mode: ${reviewModeLabel}
- Base: ${baseValue}
- Head: ${headSha}
- Commit/range URL: ${githubUrl}
- Included files: ${includedFileCount}${excludedLine}

## Acceptance Criteria
${taskText.trim()}

## Review Instructions
Review only the provided files and patches. Do not assume code exists outside
this package.

For every acceptance criterion:
1. Return one status: Implemented, Partially implemented, Not implemented,
   or Cannot verify from the provided context.
2. Cite exact file paths and relevant behavior or code evidence.
3. Identify missing work, incorrect logic, regressions, security concerns,
   and meaningful edge cases.
4. Distinguish confirmed facts from assumptions.
5. End with a concise prioritized checklist of next actions.

Return the response in concise Markdown.

---

# Commit Pack
${commitPackMarkdown.trim()}
`;
}
