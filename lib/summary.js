/**
 * Turn one assistant reply into a short, single-line toast summary.
 *
 * The projected body is the assistant's own markdown. Pasted into a Windows
 * toast it shows asterisks, pipe tables and code fences across the two or three
 * lines the shell renders, which reads worse than no body at all. This module
 * flattens it and bounds it to the toast's budget; the cut never splits an
 * ASCII word.
 */

/** Characters kept of the reply. Three toast lines hold roughly this much. */
export const SUMMARY_LIMIT = 110

/**
 * Flatten markdown into one bounded plain-text line.
 * @param {unknown} text - Raw assistant text.
 * @param {number} [limit] - Character budget.
 * @returns {string} Plain summary, or an empty string.
 */
export function plainSummary(text, limit = SUMMARY_LIMIT) {
  if (typeof text !== 'string' || text.length === 0) return ''
  let out = text
  out = out.replace(/```[\s\S]*?```/gu, ' ')
  out = out.replace(/`([^`]*)`/gu, '$1')
  out = out.replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
  out = out.replace(/^\s{0,3}#{1,6}\s+/gmu, '')
  out = out.replace(/^\s{0,3}>\s?/gmu, '')
  out = out.replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gmu, '')
  out = out.replace(/^\s*\|.*\|\s*$/gmu, ' ')
  out = out.replace(/\*\*(.+?)\*\*/gu, '$1')
  out = out.replace(/(?:\*|_)([^*_]+)(?:\*|_)/gu, '$1')
  out = out.replace(/<[^>]+>/gu, ' ')
  out = out.replace(/\s+/gu, ' ').trim()
  if (out.length <= limit) return out
  let cut = Math.max(1, limit - 2)
  // Do not slice an ASCII word in half: "…Windows 直" is fine, "…Wi…" is not.
  while (cut > 1 && isWordChar(out[cut - 1]) && isWordChar(out[cut])) cut -= 1
  return `${out.slice(0, cut).trimEnd()}…`
}

/** @param {string | undefined} char @returns {boolean} */
function isWordChar(char) {
  return char !== undefined && /[A-Za-z0-9]/u.test(char)
}
