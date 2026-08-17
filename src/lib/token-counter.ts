/**
 * @file src/lib/token-counter.ts
 * @description Provides token estimation utilities for AI agent context window budgeting.
 */

/**
 * Estimates token count for a text string using standard GPT/Claude ~4 characters per token heuristic,
 * with adjustment for whitespace, punctuation, and code structure.
 * 
 * @param text - The input text or code block.
 * @returns Estimated number of tokens.
 */
export function estimateTokenCount(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }
  
  // Clean whitespace normalization heuristic:
  // Standard code & markdown generally runs at ~3.6 - 4.0 chars per token for typical LLM tokenizers (tiktoken/cl100k, gemini).
  const length = text.length;
  const wordCount = (text.match(/\S+/g) || []).length;
  
  // Blend char-based and word-based heuristic for high fidelity code estimation
  const tokenEstimate = Math.ceil((length / 3.8 + wordCount * 0.2) / 1.1);
  return Math.max(1, tokenEstimate);
}

/**
 * Fast character-based token estimation alias (~4 chars per token).
 * 
 * @param text - Input text
 * @returns Estimated token count
 */
export function countTokensFast(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Formats a raw number of tokens with human-readable suffix (e.g. 1.4k, 120k).
 * 
 * @param tokens - Integer token count.
 * @returns Formatted string representation.
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return tokens.toLocaleString();
}

/**
 * Checks if token count exceeds recommended threshold (100k tokens).
 * 
 * @param tokens - The estimated token count.
 * @returns Object with warning flag and model suggestion.
 */
export function checkTokenBudget(tokens: number): {
  isOverBudget: boolean;
  warning?: string;
  modelSuggestion?: string;
} {
  const MAX_RECOMMENDED_TOKENS = 100_000;
  if (tokens > MAX_RECOMMENDED_TOKENS) {
    return {
      isOverBudget: true,
      modelSuggestion: '100k',
      warning: `Bundle is ~${formatTokenCount(tokens)} tokens, which exceeds standard 100k context budget. Consider filtering files or using patch-only mode.`,
    };
  }
  return { isOverBudget: false, modelSuggestion: '100k' };
}
