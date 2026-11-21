/**
 * Session-scoped unread tracking for the app badge.
 *
 * The badge means "how many sessions still need you", not "how many reminders
 * fired". A single chatty session therefore contributes one, and the settings
 * page's own test notification does not contribute at all (it is not a session
 * that needs an answer). The focused-presence handler still clears the whole
 * set, which keeps the original "come back to the app and the badge resets"
 * behaviour.
 */
export class UnreadTracker {
  /** @type {Map<string, number>} */
  #entries = new Map()
  #limit

  /**
   * @param {number} [limit] - Hard cap on distinct sessions.
   */
  constructor(limit = 99) {
    this.#limit = limit
  }

  /** Number of distinct sessions with unread reminders. */
  get size() {
    return this.#entries.size
  }

  /**
   * Mark one session as needing attention.
   * @param {string} key - Session id (or a stable fallback).
   * @param {number} [at] - Timestamp of the reminder.
   */
  mark(key, at = Date.now()) {
    const id = typeof key === 'string' && key.length > 0 ? key : 'unknown'
    this.#entries.set(id, at)
    if (this.#entries.size <= this.#limit) return
    // Drop the oldest entry so a long-running app cannot grow this forever.
    let oldestKey
    let oldestAt = Number.POSITIVE_INFINITY
    for (const [candidate, value] of this.#entries) {
      if (value < oldestAt) {
        oldestAt = value
        oldestKey = candidate
      }
    }
    if (oldestKey !== undefined) this.#entries.delete(oldestKey)
  }

  /** Clear every session (a focused window means the user is looking again). */
  clear() {
    this.#entries.clear()
  }

  /**
   * Drop one session, e.g. when its Agent is disposed.
   * @param {string} key - Session id.
   */
  remove(key) {
    if (typeof key === 'string' && key.length > 0) this.#entries.delete(key)
  }

  /** @returns {{ count: number, sessions: string[] }} Diagnostics-friendly view. */
  snapshot() {
    return { count: this.size, sessions: [...this.#entries.keys()] }
  }
}
