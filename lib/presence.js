/**
 * Multi-client presence tracking for the desktop notification service. Each
 * browser page reports focus changes and a heartbeat; the service treats any
 * fresh focused client as "the user is at the app".
 */
export class Presence {
  /** @type {Map<string, { focused: boolean, locale: string, at: number }>} */
  #clients = new Map()
  /** @type {Set<() => void>} */
  #waiters = new Set()
  #staleMs

  /**
   * @param {number} staleMs - Age after which a client report is ignored.
   */
  constructor(staleMs) {
    this.#staleMs = staleMs
  }

  /** @param {number} staleMs - Replace the staleness window after a config reload. */
  setStaleMs(staleMs) {
    this.#staleMs = staleMs
  }

  /**
   * Record one client report.
   * @param {{ clientId: string, focused: boolean, locale?: string }} report - Presence frame.
   * @param {number} [now] - Testable clock.
   */
  update(report, now = Date.now()) {
    if (typeof report?.clientId !== 'string' || report.clientId.length === 0) return
    this.#clients.set(report.clientId, {
      focused: report.focused === true,
      locale: typeof report.locale === 'string' ? report.locale : '',
      at: now,
    })
    if (report.focused === true) this.#flushWaiters()
  }

  /**
   * Whether any fresh client reports focus.
   * @param {number} [now] - Testable clock.
   * @returns {boolean}
   */
  isPresent(now = Date.now()) {
    this.#prune(now)
    for (const client of this.#clients.values()) {
      if (client.focused) return true
    }
    return false
  }

  /**
   * Locale of the freshest client, if one ever reported.
   * @param {number} [now] - Testable clock.
   * @returns {string | undefined}
   */
  locale(now = Date.now()) {
    this.#prune(now)
    let best
    let bestFocused
    for (const client of this.#clients.values()) {
      if (client.locale.length === 0) continue
      if (best === undefined || client.at > best.at) best = client
      if (client.focused && (bestFocused === undefined || client.at > bestFocused.at)) bestFocused = client
    }
    return (bestFocused ?? best)?.locale
  }

  /**
   * Resolve on the next focused report (or immediately when already focused).
   * @returns {Promise<void>}
   */
  whenPresent() {
    if (this.isPresent()) return Promise.resolve()
    return new Promise((resolve) => {
      this.#waiters.add(resolve)
    })
  }

  /** @returns {{ focused: boolean, clients: number, locale?: string }} */
  snapshot(now = Date.now()) {
    this.#prune(now)
    let focused = false
    for (const client of this.#clients.values()) focused ||= client.focused
    return {
      focused,
      clients: this.#clients.size,
      ...(this.locale(now) === undefined ? {} : { locale: this.locale(now) }),
    }
  }

  /** Release pending presence waiters. */
  dispose() {
    this.#clients.clear()
    this.#flushWaiters()
  }

  #prune(now) {
    const staleAfter = this.#staleMs
    for (const [id, client] of this.#clients) {
      if (now - client.at > staleAfter) this.#clients.delete(id)
    }
  }

  #flushWaiters() {
    const waiters = [...this.#waiters]
    this.#waiters.clear()
    for (const resolve of waiters) resolve()
  }
}
