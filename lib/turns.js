/**
 * A small cache of the newest turn per session.
 *
 * The Host's `agent/status` event only says "running" or "idle"; it does not
 * carry why the turn ended, and it never carries the reply text. The committed
 * `session/event` stream does. This cache is intentionally tiny and best-effort:
 * when the event stream is unavailable (older Host, or an event that is not
 * forwarded to this plugin), `take()` returns undefined and the reminder falls
 * back to the old generic copy.
 */

/** How many sessions are tracked before the oldest entry is dropped. */
const MAX_ENTRIES = 64
/** How much reply text is kept per session; summaries are much shorter. */
const MAX_TEXT_CHARS = 4000
/** A turn-end older than this is not the one the idle event is about. */
export const TURN_REASON_TTL_MS = 10_000

/**
 * The last finished (or in-progress) turn of one session.
 * @typedef {{ reason: string, text: string, turn: number | undefined, at: number }} TurnSnapshot
 */
export class TurnCache {
  /** @type {Map<string, { reason: string, text: string, turn: number | undefined, at: number }>} */
  #entries = new Map()

  /**
   * Fold one committed session event into the cache.
   * @param {{ id?: unknown } | undefined} session - Session header owner.
   * @param {{ type?: unknown, data?: unknown, time?: unknown } | undefined} event - Committed event.
   */
  observe(session, event) {
    const id = typeof session?.id === 'string' ? session.id : ''
    if (id.length === 0) return
    const type = event?.type
    const data = event?.data
    const at = typeof event?.time === 'number' ? event.time : Date.now()
    if (type === 'turn/start') {
      const entry = this.#entry(id)
      entry.text = ''
      entry.reason = ''
      entry.turn = typeof data?.turn === 'number' ? data.turn : undefined
      entry.at = at
      return
    }
    if (type === 'assistant/message') {
      const text = assistantText(data?.message)
      if (text.length === 0) return
      const entry = this.#entry(id)
      // A new assistant message after a finished turn starts a fresh body even
      // if the `turn/start` event was not forwarded to this plugin.
      if (entry.reason.length > 0) {
        entry.text = ''
        entry.reason = ''
      }
      entry.text = `${entry.text}${text}`.slice(0, MAX_TEXT_CHARS)
      entry.at = at
      return
    }
    if (type === 'turn/end') {
      const entry = this.#entry(id)
      const reason = data?.reason?.kind
      entry.reason = typeof reason === 'string' && reason.length > 0 ? reason : 'completed'
      entry.at = at
    }
  }

  /**
   * Read the newest turn context for one session.
   * @param {unknown} sessionId - Session id.
   * @param {number} [now] - Testable clock.
   * @param {number} [maxAgeMs] - Freshness window.
   * @returns {TurnSnapshot | undefined}
   */
  take(sessionId, now = Date.now(), maxAgeMs = TURN_REASON_TTL_MS) {
    const entry = typeof sessionId === 'string' ? this.#entries.get(sessionId) : undefined
    if (entry === undefined) return undefined
    if (now - entry.at > maxAgeMs) return undefined
    return { reason: entry.reason, text: entry.text, turn: entry.turn, at: entry.at }
  }

  /**
   * Drop one session.
   * @param {string} sessionId - Session id.
   */
  delete(sessionId) {
    if (typeof sessionId === 'string' && sessionId.length > 0) this.#entries.delete(sessionId)
  }

  /** Number of tracked sessions (diagnostics). */
  get size() {
    return this.#entries.size
  }

  /**
   * Read or create one entry, trim the cache when it grows.
   * @param {string} id - Session id.
   */
  #entry(id) {
    let entry = this.#entries.get(id)
    if (entry === undefined) {
      entry = { reason: '', text: '', turn: undefined, at: Date.now() }
      this.#entries.set(id, entry)
      if (this.#entries.size > MAX_ENTRIES) {
        const oldest = this.#entries.keys().next()
        if (oldest.done !== true) this.#entries.delete(oldest.value)
      }
    }
    return entry
  }
}

/**
 * Concatenate the text blocks of one assistant message.
 * @param {unknown} message - Assistant message payload.
 * @returns {string}
 */
export function assistantText(message) {
  const content = message?.content
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      text += block.text
    }
  }
  return text
}
