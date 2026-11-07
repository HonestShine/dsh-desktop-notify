import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sanitizeActions } from './notifier.js'

const PROTOCOL = 'dshnotify'
const COMMAND_TIMEOUT = 15_000
const POLL_INTERVAL = 300
/** Token names are UUIDs minted by this transport; anything else is untrusted. */
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

/**
 * Whether one rendezvous token is safe to treat as a file name. Protocol
 * activation can hand this transport an arbitrary token, so the file layer only
 * accepts the UUID shape produced by `show()`.
 * @param {unknown} token - Candidate token.
 * @returns {boolean}
 */
export function isActionToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token)
}

/**
 * Build the Windows Toast XML for one notification. Pure so the escaping and
 * protocol arguments can be unit tested without Windows.
 * @param {object} input - Notification input.
 * @returns {string} Toast XML.
 */
export function buildToastXml(input) {
  const actions = sanitizeActions(input.actions)
  const duration = input.duration === 'short' ? 'short' : 'long'
  const audio = input.soundMode === 'system'
    ? `<audio src="ms-winsoundevent:${escapeXml(normalizeWindowsSound(input.systemName))}" loop="false"/>`
    : '<audio silent="true"/>'
  const body = typeof input.body === 'string' && input.body.length > 0
    ? `<text>${escapeXml(input.body)}</text>`
    : ''
  const actionXml = actions.map((action) => (
    `<action content="${escapeXml(action.label)}" activationType="protocol" `
    + `arguments="${PROTOCOL}:?token=${encodeURIComponent(input.token)}&amp;decision=${encodeURIComponent(action.id)}"/>`
  )).join('')
  return `<toast duration="${duration}" activationType="protocol" launch="dsh://open">`
    + `<visual><binding template="ToastGeneric"><text>${escapeXml(input.title)}</text>${body}</binding></visual>`
    + `${actionXml.length === 0 ? '' : `<actions>${actionXml}</actions>`}`
    + `${audio}`
    + '</toast>'
}

/**
 * Escape one XML text or attribute value.
 * @param {unknown} value - Raw value.
 * @returns {string}
 */
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;')
}

/** @param {string | undefined} systemName @returns {string} */
export function normalizeWindowsSound(systemName) {
  return typeof systemName === 'string' && systemName.startsWith('Notification.')
    ? systemName
    : 'Notification.Default'
}

/**
 * WinRT toast transport for Windows. It replaces node-notifier's SnoreToast
 * transport, which reports Hidden without rendering on current Windows 11.
 * Actions are delivered by a `dshnotify:` protocol activation that writes a
 * decision file consumed by this process.
 */
export class WinRtNotifier {
  #appId
  #duration
  #soundMode
  #systemName
  #logger
  #dir
  #toastScript
  #registerScript
  #vbsScript
  #pending = new Map()
  #counter = 0
  #protocol
  #timer
  #draining = false

  /**
   * @param {object} options - Transport wiring.
   * @param {string} options.appId - Windows AppUserModelID.
   * @param {string} [options.duration] - Toast lifetime (`short` or `long`).
   * @param {string} options.soundMode - Active sound mode.
   * @param {string} options.systemName - Optional system sound name.
   * @param {string} options.pluginDir - Plugin root containing `assets/`.
   * @param {(message: string) => void} [options.logger] - Diagnostic sink.
   */
  constructor({ appId, duration, soundMode, systemName, pluginDir, logger }) {
    this.#appId = appId
    this.#duration = duration === 'short' ? 'short' : 'long'
    this.#soundMode = soundMode
    this.#systemName = systemName
    this.#logger = logger ?? (() => {})
    this.#dir = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'dsh-desktop-notify', 'actions')
    this.#toastScript = path.join(pluginDir, 'assets', 'winrt-toast.ps1')
    this.#registerScript = path.join(pluginDir, 'assets', 'register-protocol.ps1')
    this.#vbsScript = path.join(pluginDir, 'assets', 'activate.vbs')
    try {
      mkdirSync(this.#dir, { recursive: true })
    } catch (error) {
      this.#logger(`cannot create action directory: ${messageOf(error)}`)
    }
    this.#protocol = this.#registerProtocol()
    this.#timer = setInterval(() => {
      void this.#drain()
    }, POLL_INTERVAL)
    this.#timer.unref?.()
  }

  /** @param {object} config - Replacement config after a settings reload. */
  updateConfig(config) {
    this.#soundMode = config?.sound?.mode ?? this.#soundMode
    this.#systemName = config?.sound?.systemName ?? this.#systemName
    this.#appId = config?.windows?.appId ?? this.#appId
  }

  /**
   * Probe the WinRT transport and the action protocol.
   * @returns {Promise<object>} Capability record.
   */
  async capabilities() {
    const protocol = await this.#protocol
    return {
      available: true,
      platform: 'win32',
      transport: 'winrt',
      actions: protocol.ok,
      protocol: protocol.ok ? 'registered' : 'failed',
      ...(protocol.ok ? {} : { error: protocol.error }),
    }
  }

  /**
   * Re-register the `dshnotify:` protocol.
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async repairProtocol() {
    this.#protocol = this.#registerProtocol()
    return await this.#protocol
  }

  /**
   * Show one Windows toast.
   * @param {object} input - Notification input.
   * @returns {Promise<{ reason: string, actionId?: string, label?: string, error?: string }>}
   */
  async show(input) {
    const actions = sanitizeActions(input.actions)
    let protocol
    if (actions.length > 0) {
      protocol = await this.#protocol
      if (!protocol.ok) {
        return { reason: 'error', error: protocol.error ?? 'notification action protocol is not registered' }
      }
    }
    const token = randomUUID()
    const tag = `dn${(++this.#counter).toString(36)}`
    const xml = buildToastXml({
      title: input.title,
      body: input.body,
      actions,
      token,
      duration: this.#duration,
      soundMode: this.#soundMode,
      systemName: this.#systemName,
    })
    const encoded = Buffer.from(xml, 'utf8').toString('base64')
    const shown = await runPowerShell(this.#toastScript, [
      '-Mode', 'show',
      '-AppId', this.#appId,
      '-EncodedXml', encoded,
      '-Tag', tag,
      '-Group', tag,
    ])
    if (!shown.ok) return { reason: 'error', error: shown.error }
    const handle = { id: 0, group: tag, tag, token }
    if (typeof input.onHandle === 'function') {
      try {
        input.onHandle(handle)
      } catch {
        // A broken handle observer must not prevent the notification.
      }
    }
    if (actions.length === 0) return { reason: 'sent' }
    return await new Promise((resolve) => {
      const timer = Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
        ? setTimeout(() => {
            this.#pending.delete(token)
            void this.close(handle)
            resolve({ reason: 'timeout' })
          }, input.timeoutMs)
        : undefined
      timer?.unref?.()
      this.#pending.set(token, {
        resolve,
        timer,
        actions,
        handle,
      })
    })
  }

  /**
   * Remove one toast.
   * @param {{ group: string, tag?: string }} handle - Handle returned to the caller.
   * @returns {Promise<void>}
   */
  async close(handle) {
    const tag = handle?.tag ?? handle?.group
    if (typeof tag !== 'string' || tag.length === 0) return
    const pending = handle?.token === undefined ? undefined : this.#pending.get(handle.token)
    if (pending !== undefined) {
      this.#pending.delete(handle.token)
      if (pending.timer !== undefined) clearTimeout(pending.timer)
    }
    await runPowerShell(this.#toastScript, [
      '-Mode', 'remove',
      '-AppId', this.#appId,
      '-Tag', tag,
      '-Group', tag,
    ])
  }

  /** Stop polling and settle pending action waiters. */
  clearAll() {
    if (this.#timer !== undefined) clearInterval(this.#timer)
    this.#timer = undefined
    for (const pending of this.#pending.values()) {
      if (pending.timer !== undefined) clearTimeout(pending.timer)
      pending.resolve({ reason: 'dismissed' })
    }
    this.#pending.clear()
  }

  async #registerProtocol() {
    const wscript = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'wscript.exe')
    const command = `"${wscript}" //B //Nologo "${this.#vbsScript}" "${this.#dir}" "%1"`
    const result = await runPowerShell(this.#registerScript, ['-CommandValue', command])
    if (!result.ok) {
      this.#logger(`notification action protocol registration failed: ${result.error}`)
      return { ok: false, error: result.error }
    }
    return { ok: true }
  }

  async #drain() {
    if (this.#draining) return
    this.#draining = true
    try {
      let files
      try {
        files = readdirSync(this.#dir)
      } catch {
        return
      }
      for (const name of files) {
        if (!name.endsWith('.json')) continue
        const file = path.join(this.#dir, name)
        if (!isActionToken(name.slice(0, -'.json'.length))) {
          // A forged rendezvous file cannot name a pending token; drop it so it
          // does not accumulate.
          try {
            unlinkSync(file)
          } catch {
            // Leave it for the next poll.
          }
          continue
        }
        let parsed
        try {
          parsed = JSON.parse(readFileSync(file, 'utf8'))
        } catch {
          continue
        }
        try {
          unlinkSync(file)
        } catch {
          // A raced write leaves the file for the next poll.
        }
        const token = typeof parsed?.token === 'string' ? parsed.token : ''
        const decision = typeof parsed?.decision === 'string' ? parsed.decision : ''
        const pending = isActionToken(token) ? this.#pending.get(token) : undefined
        if (pending === undefined) continue
        this.#pending.delete(token)
        if (pending.timer !== undefined) clearTimeout(pending.timer)
        const action = pending.actions.find((candidate) => candidate.id === decision)
        pending.resolve(action === undefined
          ? { reason: 'unknown', label: decision }
          : { reason: 'action', actionId: action.id, label: action.label })
      }
    } finally {
      this.#draining = false
    }
  }
}

function runPowerShell(script, args) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
      { windowsHide: true, timeout: COMMAND_TIMEOUT },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ ok: true, stdout: String(stdout ?? '') })
          return
        }
        resolve({
          ok: false,
          error: String(stderr ?? '').trim() || error.message,
        })
      },
    )
  })
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
