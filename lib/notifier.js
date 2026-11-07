import { toastSoundOptions } from './sound.js'

/** Longest action label accepted by the platform toast renderers. */
const MAX_ACTION_LABEL = 24
/** At most three inline actions keep the toast readable on every platform. */
const MAX_ACTIONS = 3

/**
 * Sanitize caller-provided action buttons for the notification binaries.
 * Windows joins labels with `;`, terminal-notifier splits them on `,`, and a
 * leading `-` would be read as a flag, so all three are removed here.
 * @param {ReadonlyArray<{ id: string, label: string }> | undefined} actions - Requested actions.
 * @returns {Array<{ id: string, label: string }>} Safe, unique actions.
 */
export function sanitizeActions(actions) {
  if (!Array.isArray(actions)) return []
  const seen = new Set()
  const result = []
  for (const action of actions) {
    if (result.length >= MAX_ACTIONS) break
    if (action === null || typeof action !== 'object') continue
    const id = typeof action.id === 'string'
      ? action.id.trim().replace(/[^A-Za-z0-9_-]/gu, '-').slice(0, 32)
      : ''
    let label = typeof action.label === 'string' ? action.label : ''
    label = label
      .replace(/[,;]/gu, ' ')
      .replace(/\s+/gu, ' ')
      .replace(/^[-–—]+/u, '')
      .trim()
      .slice(0, MAX_ACTION_LABEL)
      .trim()
    if (id.length === 0 || label.length === 0) continue
    let unique = label
    let suffix = 2
    while (seen.has(unique.toLowerCase())) {
      unique = `${label.slice(0, MAX_ACTION_LABEL - 4)} ${suffix}`
      suffix += 1
    }
    seen.add(unique.toLowerCase())
    result.push({ id, label: unique })
  }
  return result
}

/**
 * Normalize a node-notifier callback into one platform-neutral outcome.
 * Windows reports the pressed button as `activationType`; macOS reports
 * `actionClicked` plus `activationValue`; Linux reports the label.
 * @param {ReadonlyArray<{ id: string, label: string }>} actions - Sanitized actions.
 * @param {string | undefined} response - node-notifier response string.
 * @param {Record<string, unknown> | undefined} metadata - node-notifier metadata.
 * @returns {{ reason: string, actionId?: string, label?: string, error?: string }}
 */
export function mapOutcome(actions, response, metadata) {
  const meta = metadata !== null && typeof metadata === 'object' ? metadata : {}
  const activation = typeof meta.activationType === 'string' ? meta.activationType.trim() : ''
  const value = typeof meta.activationValue === 'string' ? meta.activationValue.trim() : ''
  const responseText = typeof response === 'string' ? response.trim() : ''
  const lower = (value || activation || responseText).toLowerCase()

  // Buttons win over the generic activation type: Linux reports `click` plus
  // the pressed label, Windows reports the label as the activation itself.
  for (const candidate of [value, responseText, activation]) {
    if (candidate.length === 0) continue
    const byLabel = actions.find((action) => action.label.toLowerCase() === candidate.toLowerCase())
    if (byLabel !== undefined) return { reason: 'action', actionId: byLabel.id, label: byLabel.label }
    const byId = actions.find((action) => action.id.toLowerCase() === candidate.toLowerCase())
    if (byId !== undefined) return { reason: 'action', actionId: byId.id, label: byId.label }
  }

  if (lower === 'timeout' || lower === 'timedout' || lower === 'timed out') return { reason: 'timeout' }
  if (lower === 'closed' || lower === 'dismissed') return { reason: 'dismissed' }
  if (['activate', 'click', 'clicked', 'contentsclicked', 'contents_clicked', 'contents-clicked'].includes(lower)) {
    return { reason: 'click' }
  }

  if (activation.toLowerCase() === 'actionclicked') return { reason: 'action', label: value || activation }
  const raw = value || activation || responseText
  return { reason: raw.length === 0 ? 'sent' : 'unknown', label: raw }
}

/**
 * Build the Windows toast options.
 * @param {object} input - Notification input.
 * @returns {Record<string, unknown>} SnoreToast-compatible options.
 */
export function buildWindowsOptions(input) {
  const sound = toastSoundOptions('win32', input.soundMode, input.systemName)
  return {
    title: input.title,
    message: input.body,
    ...(input.actions.length === 0 ? {} : { actions: input.actions.map((action) => action.label) }),
    id: input.id,
    duration: input.duration,
    ...(input.appId.length === 0 ? {} : { appID: input.appId }),
    ...sound,
  }
}

/**
 * Build the macOS terminal-notifier options.
 * @param {object} input - Notification input.
 * @returns {Record<string, unknown>} terminal-notifier-compatible options.
 */
export function buildMacOptions(input) {
  const sound = toastSoundOptions('darwin', input.soundMode, input.systemName)
  return {
    title: input.title,
    message: input.body,
    group: input.group,
    ...(input.actions.length === 0 ? {} : { actions: input.actions.map((action) => action.label) }),
    ...(input.actions.length === 0 ? {} : { timeout: input.timeoutSeconds }),
    ...sound,
  }
}

/**
 * Build the Linux notify-send options.
 * @param {object} input - Notification input.
 * @returns {Record<string, unknown>} notify-send-compatible options.
 */
export function buildLinuxOptions(input) {
  return {
    title: input.title,
    message: input.body,
    'app-name': 'DeepSeek Harness',
    icon: input.iconPath,
    urgency: 'normal',
    timeout: input.timeoutSeconds,
    ...(input.actions.length === 0 ? {} : { actions: input.actions.map((action) => action.label) }),
  }
}

/**
 * node-notifier adapter: lazy loading, per-platform option building, action
 * normalization, timeout racing, and best-effort dismissal.
 */
export class Notifier {
  #platform
  #config
  #iconPath
  #logger
  #instance
  #loading
  #loadError
  #counter = 0

  /**
   * @param {object} options - Adapter wiring.
   * @param {NodeJS.Platform} options.platform - `process.platform`.
   * @param {object} options.config - Normalized config.
   * @param {string} options.iconPath - Notification icon for Linux.
   * @param {(message: string) => void} [options.logger] - Diagnostic sink.
   */
  constructor({ platform, config, iconPath, logger }) {
    this.#platform = platform
    this.#config = config
    this.#iconPath = iconPath
    this.#logger = logger ?? (() => {})
  }

  /** @param {object} config - Replacement config after a settings reload. */
  updateConfig(config) {
    this.#config = config
  }

  /**
   * Whether the platform notifier loaded successfully.
   * @returns {Promise<{ available: boolean, platform: string, error?: string }>}
   */
  async capabilities() {
    try {
      await this.#ensure()
      return { available: true, platform: this.#platform }
    } catch (error) {
      return {
        available: false,
        platform: this.#platform,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Show one notification.
   * @param {object} input - Notification input.
   * @param {string} input.title - Toast title.
   * @param {string} input.body - Toast body.
   * @param {Array<{ id: string, label: string }>} [input.actions] - Inline buttons.
   * @param {number} [input.timeoutMs] - Own timeout; 0 disables it.
   * @param {number} [input.timeoutSeconds] - Platform-level timeout for action toasts.
   * @param {number} [input.autoCloseMs] - Dismiss a non-action toast after this delay.
   * @param {string} [input.group] - Replacement group on macOS.
   * @returns {Promise<{ reason: string, actionId?: string, label?: string, error?: string }>}
   */
  async show(input) {
    let instance
    try {
      instance = await this.#ensure()
    } catch (error) {
      return { reason: 'error', error: error instanceof Error ? error.message : String(error) }
    }
    const actions = sanitizeActions(input.actions)
    this.#counter += 1
    const id = this.#counter
    const group = input.group ?? `desktop-notify-${id}`
    const timeoutMs = Number.isFinite(input.timeoutMs) && input.timeoutMs > 0 ? input.timeoutMs : 0
    const autoCloseMs = Number.isFinite(input.autoCloseMs) && input.autoCloseMs > 0 ? input.autoCloseMs : 0
    const timeoutSeconds = Math.max(5, Math.round(input.timeoutSeconds ?? (timeoutMs > 0 ? timeoutMs / 1000 : 30)))
    const soundMode = this.#config.sound.mode
    const base = {
      title: input.title,
      body: input.body,
      actions,
      id,
      group,
      appId: this.#config.windows.appId,
      duration: this.#config.windows.duration,
      iconPath: this.#iconPath,
      soundMode,
      systemName: this.#config.sound.systemName,
      timeoutSeconds,
    }
    const options = this.#platform === 'win32'
      ? buildWindowsOptions(base)
      : this.#platform === 'darwin'
        ? buildMacOptions(base)
        : buildLinuxOptions(base)

    if (typeof input.onHandle === 'function') {
      try {
        input.onHandle({ id, group })
      } catch {
        // A broken handle observer must not prevent the notification.
      }
    }

    return await new Promise((resolve) => {
      let settled = false
      let timer
      let autoTimer
      const finish = (outcome) => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        if (autoTimer !== undefined) clearTimeout(autoTimer)
        resolve(outcome)
      }
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          void this.close({ id, group })
          finish({ reason: 'timeout' })
        }, timeoutMs)
      }
      if (autoCloseMs > 0) {
        autoTimer = setTimeout(() => {
          void this.close({ id, group })
          finish({ reason: 'dismissed' })
        }, autoCloseMs)
      }
      try {
        instance.notify(options, (error, response, metadata) => {
          const outcome = mapOutcome(actions, response, metadata)
          if (outcome.reason === 'unknown' && error instanceof Error) {
            finish({ reason: 'error', error: error.message })
            return
          }
          if (outcome.reason === 'sent' && error instanceof Error) {
            finish({ reason: 'error', error: error.message })
            return
          }
          finish(outcome)
        })
      } catch (error) {
        finish({ reason: 'error', error: error instanceof Error ? error.message : String(error) })
      }
    })
  }

  /**
   * Best-effort dismissal of one toast.
   * @param {{ id: number, group: string }} handle - Identifier returned by show().
   * @returns {Promise<void>}
   */
  async close(handle) {
    const instance = this.#instance
    if (instance === undefined) return
    try {
      if (this.#platform === 'win32') {
        await new Promise((resolve) => {
          instance.notify({ id: handle.id, remove: handle.id }, () => resolve())
        })
      } else if (this.#platform === 'darwin') {
        await new Promise((resolve) => {
          instance.notify({ group: handle.group, remove: handle.group }, () => resolve())
        })
      }
    } catch (error) {
      this.#logger(`dismiss failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Release waiting terminal-notifier processes. */
  clearAll() {
    try {
      this.#instance?.clearAll?.()
    } catch (error) {
      this.#logger(`clearAll failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async #ensure() {
    if (this.#instance !== undefined) return this.#instance
    if (this.#loadError !== undefined) throw this.#loadError
    if (this.#loading === undefined) {
      this.#loading = (async () => {
        try {
          const mod = await import('node-notifier')
          const fallback = mod.default
          const Ctor = this.#platform === 'win32'
            ? (mod.WindowsToaster ?? fallback?.WindowsToaster)
            : this.#platform === 'darwin'
              ? (mod.NotificationCenter ?? fallback?.NotificationCenter)
              : (mod.NotifySend ?? fallback?.NotifySend)
          const constructor = typeof Ctor === 'function' ? Ctor : fallback
          if (typeof constructor !== 'function') throw new Error('node-notifier did not expose a platform notifier')
          const options = this.#platform === 'darwin'
            ? {
                withFallback: false,
                ...(this.#config.macos.customNotifierPath.length === 0 ? {} : { customPath: this.#config.macos.customNotifierPath }),
              }
            : { withFallback: false }
          this.#instance = new constructor(options)
          return this.#instance
        } catch (error) {
          this.#loadError = error instanceof Error ? error : new Error(String(error))
          throw this.#loadError
        } finally {
          this.#loading = undefined
        }
      })()
    }
    return await this.#loading
  }
}
