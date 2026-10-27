import type { RawThemeEntry, Theme } from "./types.js";
import { logger } from "./logger.js";

const ERROR_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /Failed to prompt.*Enter your store password/is, message: "This store requires a password. Please provide it to continue." },
  { pattern: /Command timed out/i, message: "The operation timed out. Please try again." },
];

export function sanitizeError(rawOutput: string): string {
  for (const { pattern, message } of ERROR_PATTERNS) {
    if (pattern.test(rawOutput)) {
      logger.error("orchestrator", "CLI error matched known pattern", { rawOutput: rawOutput.slice(0, 500) });
      return message;
    }
  }
  logger.error("orchestrator", "Unknown CLI error", { rawOutput: rawOutput.slice(0, 1000) });
  return "An unexpected error occurred. Please try again.";
}

export function extractJsonArray(output: string): RawThemeEntry[] | null {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(output.slice(start, end + 1));
    return Array.isArray(parsed) ? (parsed as RawThemeEntry[]) : null;
  } catch {
    return null;
  }
}

export function parseThemeList(entries: RawThemeEntry[]): Theme[] {
  return entries.map((t) => ({
    id: String(t.id ?? ""),
    name: String(t.name ?? ""),
    role: String(t.role ?? ""),
  }));
}
