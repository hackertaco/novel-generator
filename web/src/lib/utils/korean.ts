/**
 * Shared Korean language utilities.
 */

/**
 * Detect whether a Korean character has a 받침 (final consonant).
 * Used to pick the correct particle (은/는, 이/가, 을/를, etc.).
 */
export function hasBatchim(char: string): boolean {
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
