/**
 * @file src/lib/file-filter.ts
 * @description File filter configuration presets, deterministic file filtering logic,
 * and exclusion reason evaluation for CommitPack.
 */

import { GitHubCommitFile } from '../types/github';
import {
  FileFilterConfig,
  FilterPresetName,
  ExcludedFileInfo,
  FileExclusionReason,
} from '../types/review';
import {
  normalizePath,
  parseGlobList,
  matchesAnyGlob,
  matchesExtensions,
  isCodeFile,
} from './glob-matcher';
import { isBinaryFile } from './github-api';

/**
 * Predefined filter presets for common development stacks.
 */
export const FILTER_PRESETS: Record<
  FilterPresetName,
  {
    label: string;
    description: string;
    config: Partial<FileFilterConfig>;
  }
> = {
  all: {
    label: 'All changed files',
    description: 'Includes all changed source files, excluding deletions by default.',
    config: {
      preset: 'all',
      includePatterns: '',
      excludePatterns: '',
      extensions: '',
      codeOnly: false,
      statuses: {
        added: true,
        modified: true,
        renamed: true,
        removed: false,
        copied: true,
        changed: true,
        unchanged: true,
      },
    },
  },
  code_only: {
    label: 'Code only',
    description: 'Filters out documentation, static assets, lockfiles, and configs.',
    config: {
      preset: 'code_only',
      includePatterns: '',
      excludePatterns: '*.lock, package-lock.json, pnpm-lock.yaml, yarn.lock, *.md, *.txt, public/**',
      extensions: '',
      codeOnly: true,
      statuses: {
        added: true,
        modified: true,
        renamed: true,
        removed: false,
        copied: true,
        changed: true,
        unchanged: true,
      },
    },
  },
  astro_ts: {
    label: 'Astro + TypeScript',
    description: 'Specialized for Astro projects with TypeScript and Supabase/Sanity.',
    config: {
      preset: 'astro_ts',
      includePatterns:
        'src/**/*.astro, src/**/*.ts, src/**/*.tsx, sanity/**/*.ts, supabase/**/*.ts, *.config.ts, *.config.mjs, astro.config.*',
      excludePatterns:
        'node_modules/**, dist/**, .astro/**, .next/**, coverage/**, public/**, *.lock, package-lock.json, pnpm-lock.yaml, yarn.lock, .env, .env.*, *.min.js',
      extensions: '',
      codeOnly: false,
      statuses: {
        added: true,
        modified: true,
        renamed: true,
        removed: false,
        copied: true,
        changed: true,
        unchanged: true,
      },
    },
  },
  next_ts: {
    label: 'Next.js + TypeScript',
    description: 'Specialized for Next.js App & Pages routers with TypeScript.',
    config: {
      preset: 'next_ts',
      includePatterns:
        'app/**/*.ts, app/**/*.tsx, pages/**/*.ts, pages/**/*.tsx, src/**/*.ts, src/**/*.tsx, components/**/*.ts, components/**/*.tsx, lib/**/*.ts, lib/**/*.tsx, *.config.ts, *.config.mjs, *.config.js, next.config.*',
      excludePatterns:
        'node_modules/**, dist/**, .next/**, coverage/**, public/**, *.lock, package-lock.json, pnpm-lock.yaml, yarn.lock, .env, .env.*, *.min.js',
      extensions: '',
      codeOnly: false,
      statuses: {
        added: true,
        modified: true,
        renamed: true,
        removed: false,
        copied: true,
        changed: true,
        unchanged: true,
      },
    },
  },
  supabase_sql: {
    label: 'Supabase / SQL',
    description: 'Specialized for SQL schema migrations, edge functions, and backend types.',
    config: {
      preset: 'supabase_sql',
      includePatterns:
        'supabase/**/*.sql, supabase/**/*.ts, migrations/**/*.sql, *.sql, *.ts',
      excludePatterns:
        'node_modules/**, dist/**, coverage/**, *.lock, package-lock.json, pnpm-lock.yaml, yarn.lock, .env, .env.*',
      extensions: '',
      codeOnly: false,
      statuses: {
        added: true,
        modified: true,
        renamed: true,
        removed: false,
        copied: true,
        changed: true,
        unchanged: true,
      },
    },
  },
  custom: {
    label: 'Custom',
    description: 'User-configured custom file patterns and exclusion rules.',
    config: {
      preset: 'custom',
    },
  },
};

/**
 * Creates a default FileFilterConfig.
 */
export function getDefaultFilterConfig(): FileFilterConfig {
  return {
    preset: 'all',
    includePatterns: '',
    excludePatterns: '',
    extensions: '',
    maxSizeKb: undefined,
    statuses: {
      added: true,
      modified: true,
      renamed: true,
      removed: false,
      copied: true,
      changed: true,
      unchanged: true,
    },
    codeOnly: false,
    includeContextFiles: false,
    contextFiles: [],
  };
}

export const DEFAULT_FILTER_CONFIG: FileFilterConfig = getDefaultFilterConfig();

/**
 * Applies active file filter configurations to a list of raw GitHub commit files.
 * Returns included files and excluded files with explicit reasons.
 * 
 * @param files - Raw files list from commit or compare API
 * @param config - Current active FileFilterConfig
 * @returns Object with included array, excluded array with reasons, and validation errors
 */
export function applyFileFilters(
  files: GitHubCommitFile[],
  config: FileFilterConfig
): {
  included: GitHubCommitFile[];
  excluded: ExcludedFileInfo[];
  patternErrors: string[];
} {
  const { includePatterns, excludePatterns, extensions, maxSizeKb, statuses, codeOnly } = config;

  const { regexes: includeRegexes, errors: incErrors } = parseGlobList(includePatterns);
  const { regexes: excludeRegexes, errors: excErrors } = parseGlobList(excludePatterns);
  const patternErrors = [...incErrors, ...excErrors];

  const included: GitHubCommitFile[] = [];
  const excluded: ExcludedFileInfo[] = [];

  for (const file of files) {
    const normPath = normalizePath(file.filename);

    // 1. Check Status Toggle (added, modified, renamed, removed, etc.)
    const statusKey = file.status.toLowerCase();
    const isStatusAllowed = (statuses as Record<string, boolean>)[statusKey] ?? true;
    if (!isStatusAllowed) {
      excluded.push({
        file,
        reason: 'status',
        details: `Status "${file.status}" is toggled OFF`,
      });
      continue;
    }

    // 2. Check Exclude Globs
    if (excludeRegexes.length > 0 && matchesAnyGlob(normPath, excludeRegexes)) {
      excluded.push({
        file,
        reason: 'glob_exclude',
        details: 'Matched exclude glob pattern',
      });
      continue;
    }

    // 3. Check Include Globs (if provided, must match at least one)
    if (includeRegexes.length > 0 && !matchesAnyGlob(normPath, includeRegexes)) {
      excluded.push({
        file,
        reason: 'glob_include_miss',
        details: 'Did not match any include glob pattern',
      });
      continue;
    }

    // 4. Check File Extensions filter
    if (extensions && !matchesExtensions(normPath, extensions)) {
      excluded.push({
        file,
        reason: 'extension',
        details: `Extension does not match "${extensions}"`,
      });
      continue;
    }

    // 5. Check Code-only checkbox
    if (codeOnly && !isCodeFile(normPath)) {
      excluded.push({
        file,
        reason: 'code_only',
        details: 'Non-code file (asset, doc, or unrecognized)',
      });
      continue;
    }

    // 6. Check Max Size in KB (using additions+deletions or changes estimate, or extracted size if available)
    if (maxSizeKb && maxSizeKb > 0) {
      // If content is already present or changes count is huge
      const estimatedBytes = file.content ? new Blob([file.content]).size : (file.changes || 0) * 80;
      const sizeKb = estimatedBytes / 1024;
      if (sizeKb > maxSizeKb) {
        excluded.push({
          file,
          reason: 'max_size',
          details: `Estimated size (${Math.round(sizeKb)}KB) exceeds limit (${maxSizeKb}KB)`,
        });
        continue;
      }
    }

    // All filters passed -> Included!
    included.push(file);
  }

  return { included, excluded, patternErrors };
}
