/**
 * @file src/lib/glob-matcher.ts
 * @description Deterministic client-side glob matcher, path normalizer,
 * and file classification helper for CommitPack filtering.
 */

// Extensions recognized as source code / scripts / configs
export const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'astro', 'vue', 'svelte',
  'py', 'pyw', 'rb', 'php', 'java', 'kt', 'kts', 'scala', 'clj',
  'c', 'h', 'cpp', 'hpp', 'cc', 'hh', 'cxx', 'hxx', 'cs', 'rs', 'go', 'swift',
  'sql', 'graphql', 'gql', 'proto',
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'styl',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'xml', 'env',
  'dockerfile', 'makefile', 'cmake', 'prisma', 'sol',
]);

/**
 * Normalizes a file path to forward slashes and removes leading/trailing slashes.
 * 
 * @param path - Raw file path
 * @returns Normalized forward-slash path
 */
export function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Converts a single glob pattern into a valid RegExp.
 * Supports:
 * - `**` matches zero or more path segments
 * - `*` matches characters within a single segment (excluding `/`)
 * - `?` matches a single non-slash character
 * - directory prefixes (e.g. `src/` -> `src/**`)
 * 
 * @param pattern - Glob pattern string
 * @returns RegExp or null if pattern is invalid
 */
export function globToRegex(pattern: string): RegExp | null {
  let p = pattern.trim().replace(/\\/g, '/');
  if (!p) return null;

  // If pattern ends with a slash, treat as directory prefix: dir/ -> dir/**
  if (p.endsWith('/')) {
    p = `${p}**`;
  }

  // Escape special regex characters except * and ?
  // First, temporarily replace ** and * with placeholders
  const doubleStarToken = '__DOUBLE_STAR__';
  const singleStarToken = '__SINGLE_STAR__';
  const questionToken = '__QUESTION_MARK__';

  let regexStr = p
    .replace(/\*\*/g, doubleStarToken)
    .replace(/\*/g, singleStarToken)
    .replace(/\?/g, questionToken)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex symbols
    .replace(new RegExp(doubleStarToken, 'g'), '.*')
    .replace(new RegExp(singleStarToken, 'g'), '[^/]*')
    .replace(new RegExp(questionToken, 'g'), '[^/]');

  // Match from start to end
  return new RegExp(`^${regexStr}$`, 'i');
}

/**
 * Parses a comma-separated or newline-separated list of glob patterns into an array of RegExps.
 * 
 * @param patternsStr - Raw input string (e.g. "src/lib/*.ts")
 * @returns Array of compiled RegExps and any syntax warnings
 */
export function parseGlobList(patternsStr: string): { regexes: RegExp[]; errors: string[] } {
  if (!patternsStr || !patternsStr.trim()) {
    return { regexes: [], errors: [] };
  }

  const rawPatterns = patternsStr
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const regexes: RegExp[] = [];
  const errors: string[] = [];

  for (const raw of rawPatterns) {
    try {
      const reg = globToRegex(raw);
      if (reg) {
        regexes.push(reg);
      }
    } catch (err: unknown) {
      errors.push(`Invalid pattern "${raw}": ${(err as Error).message}`);
    }
  }

  return { regexes, errors };
}

/**
 * Tests whether a normalized path matches any glob in a compiled regex list.
 * 
 * @param path - Normalized file path
 * @param regexes - List of compiled glob RegExps
 * @returns boolean
 */
export function matchesAnyGlob(path: string, regexes: RegExp[]): boolean {
  if (regexes.length === 0) return false;
  return regexes.some((reg) => reg.test(path));
}

/**
 * Checks whether a file path has an extension in a comma-separated extension list.
 * e.g. ".ts,.tsx,.astro,.sql"
 * 
 * @param path - File path
 * @param extensionsStr - Comma-separated list of extensions (with or without leading dots)
 * @returns boolean
 */
export function matchesExtensions(path: string, extensionsStr: string): boolean {
  if (!extensionsStr || !extensionsStr.trim()) return true;

  const validExts = extensionsStr
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);

  if (validExts.length === 0) return true;

  const fileExt = path.split('.').pop()?.toLowerCase();
  if (!fileExt) return false;

  return validExts.includes(fileExt);
}

/**
 * Checks if a file path is considered a code/source file.
 * 
 * @param path - File path
 * @returns boolean
 */
export function isCodeFile(path: string): boolean {
  const basename = path.split('/').pop()?.toLowerCase() || '';
  if (basename === 'dockerfile' || basename === 'makefile' || basename === 'gemfile') {
    return true;
  }
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? CODE_EXTENSIONS.has(ext) : false;
}
