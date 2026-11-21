/**
 * A bounded, in-memory decision log for `/desktop-notify/debug`.
 *
 * Notifications are mostly silent about the paths that did *not* fire. When a
 * user reports "I never saw the approval toast", the only useful evidence is
 * which gate stopped it. This ring keeps the last N lines and drops the oldest,
 * so it cannot grow with uptime. It is intentionally memory-only: the log is a
 * debugging aid, not durable telemetry.
 */

/** Default number of retained lines. */
export const DIAGNOSTICS_LIMIT = 40
/** Longest single line; protects the ring from a pasted stack trace. */
const MAX_LINE_CHARS = 300

export class Diagnostics {
  /** @type {string[]} */
  #lines = []
  #limit

  /**
   * @param {number} [limit] - Maximum retained lines.
   */
  constructor(limit = DIAGNOSTICS_LIMIT) {
    this.#limit = limit
  }

  /**
   * Append one line.
   * @param {unknown} message - Human-readable decision or failure.
   * @param {number} [at] - Testable clock.
   */
  note(message, at = Date.now()) {
    const text = String(message ?? '').replace(/\s+/gu, ' ').trim().slice(0, MAX_LINE_CHARS)
    if (text.length === 0) return
    this.#lines.push(`${new Date(at).toISOString()} ${text}`)
    if (this.#lines.length > this.#limit) {
      this.#lines.splice(0, this.#lines.length - this.#limit)
    }
  }

  /** @returns {string[]} Oldest-to-newest copy. */
  snapshot() {
    return [...this.#lines]
  }

  /** Number of retained lines. */
  get size() {
    return this.#lines.length
  }

  /** Forget everything (used by tests and a full plugin reset). */
  clear() {
    this.#lines.length = 0
  }
}
