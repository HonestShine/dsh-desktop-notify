/**
 * Small, pure dedupe helpers shared by the reminder listeners.
 *
 * The notification service sees the same prompt from more than one source: the
 * `user-questions/request` waterfall and the programmatic `tool/ptc-dispatch*`
 * events can describe the same `ask_user_question` call. The old code used a
 * single two-second clock slot, which also swallowed a *different* question
 * that happened to arrive from another session at the same moment. The key
 * below is scoped by session and by the question text, so only the same prompt
 * is collapsed.
 */

/** How much of the question text identifies one prompt. */
const QUESTION_KEY_CHARS = 40

/**
 * Build a stable key for one question prompt.
 * @param {unknown} sessionId - Session or agent id.
 * @param {unknown} text - The question text (already parsed, not JSON).
 * @returns {string} `session:text-prefix`, or a session-only key when text is empty.
 */
export function questionDedupeKey(sessionId, text) {
  const session = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : 'unknown'
  const flat = typeof text === 'string' ? text.replace(/\s+/gu, ' ').trim() : ''
  return `${session}:${flat.slice(0, QUESTION_KEY_CHARS)}`
}

/**
 * Whether an error was recorded recently enough to suppress the completion
 * reminder that follows it.
 * @param {unknown} erroredAt - Timestamp of the last `agent/error`.
 * @param {number} now - Current clock.
 * @param {number} [windowMs] - Suppression window.
 * @returns {boolean}
 */
export function recentlyErrored(erroredAt, now, windowMs = 5000) {
  return typeof erroredAt === 'number'
    && Number.isFinite(erroredAt)
    && now - erroredAt < windowMs
}

/**
 * A bounded key -> timestamp memory. `claim()` returns true exactly once per
 * key inside the window, which is what the question listeners need.
 */
export class DedupeWindow {
  /** @type {Map<string, number>} */
  #seen = new Map()
  #windowMs
  #limit

  /**
   * @param {number} [windowMs] - How long one key stays claimed.
   * @param {number} [limit] - Hard cap on remembered keys.
   */
  constructor(windowMs = 5000, limit = 256) {
    this.#windowMs = windowMs
    this.#limit = limit
  }

  /**
   * Claim one key for this window.
   * @param {string} key - Dedupe key.
   * @param {number} [now] - Testable clock.
   * @returns {boolean} true when this key may be announced now.
   */
  claim(key, now = Date.now()) {
    if (typeof key !== 'string' || key.length === 0) return true
    const last = this.#seen.get(key)
    if (last !== undefined && now - last < this.#windowMs) return false
    this.#seen.set(key, now)
    if (this.#seen.size > this.#limit) this.#prune(now)
    return true
  }

  /** Forget every key (used when the plugin is disposed or config reloads). */
  clear() {
    this.#seen.clear()
  }

  /**
   * Drop keys older than the window. Called only when the map grows past its
   * cap, so the common path stays allocation-free.
   * @param {number} now - Current clock.
   */
  #prune(now) {
    const cutoff = now - this.#windowMs
    for (const [key, at] of this.#seen) {
      if (at < cutoff) this.#seen.delete(key)
    }
    // Fresh keys can still exceed the cap (a burst of distinct prompts); drop
    // the oldest insertions until the map is bounded again.
    while (this.#seen.size > this.#limit) {
      const oldest = this.#seen.keys().next()
      if (oldest.done === true) break
      this.#seen.delete(oldest.value)
    }
  }
}
