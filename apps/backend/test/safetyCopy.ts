/**
 * Safety-copy assertions must ignore *negated* sentences.
 *
 * The platform's own disclaimers say things like "No diet cures cancer" and
 * "it does not say whether you have breast cancer". A naive `/cures? cancer/` test would
 * fail on the very copy that makes the platform safe, so negative statements are stripped
 * before asserting that no harmful claim is present.
 */
const NEGATION = /\b(not|never|no|cannot|can't|won't|avoid|without|doesn't|does not|isn't|is not|don't|do not|shouldn't|should not)\b/i;

export function affirmativeSentences(text: string): string[] {
  return text
    .replace(/\\n/g, "\n")
    .split(/[.!?•\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 3)
    .filter((sentence) => !NEGATION.test(sentence));
}

/** True when no affirmative (non-negated) sentence makes the forbidden claim. */
export function makesAffirmativeClaim(text: string, pattern: RegExp): boolean {
  return affirmativeSentences(text).some((sentence) => pattern.test(sentence));
}
