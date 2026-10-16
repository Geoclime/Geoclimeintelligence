/**
 * The XML-style tags prompts wrap their material in. Each feature adds its own tags here, so
 * inert() neutralises them all.
 */
export const PROMPT_TAGS = ["not_visible_to_you", "conversation", "description", "notes", "file_content", "link_content"] as const;

const TAG_PATTERN = new RegExp(`<\\/?(${PROMPT_TAGS.join("|")})\\b`, "gi");

/**
 * Stops user-authored text from closing or opening one of our prompt tags (and so passing itself
 * off as instructions) by swapping its "<" for a look-alike. Run every piece of text a stranger
 * wrote through this before it goes into a prompt.
 */
export const inert = (text: string) => text.replace(TAG_PATTERN, (match) => `‹${match.slice(1)}`);
