import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { sanitizeActions } from './notifier.js'

const PROTOCOL = 'dshnotify'
const COMMAND_TIMEOUT = 15_000
const POLL_INTERVAL = 300
/** Token names are UUIDs minted by this transport; anything else is untrusted. */
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
/** Product name used only when the running executable has no shortcut of its own. */
const APP_PRODUCT_NAME = 'DeepSeek Harness'
/** Last-resort AUMID when no Start Menu shortcut can be read; its toast header shows this text. */
const LEGACY_APP_ID = 'com.deepseek.dsh'
/** Absolute system PowerShell; a bare name resolves through PATH and can be shadowed. */
const SYSTEM_POWERSHELL = path.join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
)

/**
 * Resolve the shell used to show toasts. An absolute path is preferred: a
 * toast spawned through a PATH-resolved PowerShell can fail silently (exit 0,
 * no window) when PATH is trimmed or shadowed. Kept pure for unit tests.
 * @returns {string} Absolute path when present, otherwise the bare command.
 */
export function powershellPath() {
  try {
    if (existsSync(SYSTEM_POWERSHELL)) return SYSTEM_POWERSHELL
  } catch {
    // An unreadable SystemRoot falls back to PATH resolution.
  }
  return 'powershell.exe'
}

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
 * Parse the JSON emitted by `assets/resolve-aumid.ps1`. Kept pure so the shape
 * check can be tested without Windows.
 * @param {unknown} stdout - Script output.
 * @returns {{ appId: string, shortcut: string, target: string } | undefined}
 */
export function parseAumidLookup(stdout) {
  let value
  try {
    value = JSON.parse(String(stdout ?? '').trim())
  } catch {
    return undefined
  }
  if (value === null || typeof value !== 'object') return undefined
  if (typeof value.aumid !== 'string' || value.aumid.trim().length === 0) return undefined
  return {
    appId: value.aumid.trim(),
    shortcut: typeof value.shortcut === 'string' ? value.shortcut : '',
    target: typeof value.target === 'string' ? value.target : '',
  }
}

/**
 * Split one AppUserModelID setting into ordered, de-duplicated candidates.
 * Keeping the list in a single semicolon-separated field avoids a second schema
 * knob while still allowing a config override plus an environment override.
 * Pure so it can be tested without Windows.
 * @param {unknown} value - Raw setting (config field or environment variable).
 * @returns {string[]} Identifiers in the order they were written.
 */
export function splitAppIdCandidates(value) {
  if (typeof value !== 'string') return []
  const seen = new Set()
  const result = []
  for (const part of value.split(';')) {
    const trimmed = part.trim()
    if (trimmed.length === 0) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

/**
 * Parse the JSON emitted by `assets/probe-aumid.ps1`.
 * @param {unknown} stdout - Script output.
 * @returns {{ appId: string, setting: string } | undefined}
 */
export function parseAumidProbe(stdout) {
  let value
  try {
    value = JSON.parse(String(stdout ?? '').trim())
  } catch {
    return undefined
  }
  if (value === null || typeof value !== 'object') return undefined
  if (typeof value.aumid !== 'string' || value.aumid.trim().length === 0) return undefined
  return {
    appId: value.aumid.trim(),
    setting: typeof value.setting === 'string' ? value.setting : '',
  }
}

/**
 * The application icon shipped beside the executable, as a `file:///` URL the
 * toast XML can render. Undefined when the layout is not the desktop bundle.
 * @param {string} target - Shortcut target or running executable.
 * @returns {string | undefined}
 */
function appLogoUrl(target) {
  const candidates = []
  if (typeof target === 'string' && target.length > 0) {
    candidates.push(path.join(path.dirname(target), 'resources', 'icon.png'))
  }
  if (typeof process.execPath === 'string' && process.execPath.length > 0) {
    candidates.push(path.join(path.dirname(process.execPath), 'resources', 'icon.png'))
  }
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return pathToFileURL(candidate).href
    } catch {
      // Not this layout; try the next candidate.
    }
  }
  return undefined
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
  const logo = typeof input.appLogo === 'string' && input.appLogo.length > 0
    ? `<image placement="appLogoOverride" src="${escapeXml(input.appLogo)}" hint-crop="circle"/>`
    : ''
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
    + `<visual><binding template="ToastGeneric">${logo}<text>${escapeXml(input.title)}</text>${body}</binding></visual>`
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
  #identity
  #duration
  #soundMode
  #systemName
  #logger
  #dir
  #toastScript
  #registerScript
  #resolveScript
  #probeScript
  #unregisterScript
  #vbsScript
  #owner
  #pending = new Map()
  #counter = 0
  #protocol
  #timer
  #draining = false

  /**
   * @param {object} options - Transport wiring.
   * @param {string} [options.appId] - Optional AppUserModelID override.
   * @param {string} [options.duration] - Toast lifetime (`short` or `long`).
   * @param {string} options.soundMode - Active sound mode.
   * @param {string} options.systemName - Optional system sound name.
   * @param {string} options.pluginDir - Plugin root containing `assets/`.
   * @param {(message: string) => void} [options.logger] - Diagnostic sink.
   */
  constructor({ appId, duration, soundMode, systemName, pluginDir, logger }) {
    this.#appId = typeof appId === 'string' ? appId : ''
    this.#duration = duration === 'short' ? 'short' : 'long'
    this.#soundMode = soundMode
    this.#systemName = systemName
    this.#logger = logger ?? (() => {})
    this.#dir = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'dsh-desktop-notify', 'actions')
    this.#toastScript = path.join(pluginDir, 'assets', 'winrt-toast.ps1')
    this.#registerScript = path.join(pluginDir, 'assets', 'register-protocol.ps1')
    this.#resolveScript = path.join(pluginDir, 'assets', 'resolve-aumid.ps1')
    this.#probeScript = path.join(pluginDir, 'assets', 'probe-aumid.ps1')
    this.#unregisterScript = path.join(pluginDir, 'assets', 'unregister-protocol.ps1')
    this.#vbsScript = path.join(pluginDir, 'assets', 'activate.vbs')
    this.#owner = randomUUID()
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
    const nextAppId = config?.windows?.appId
    if (typeof nextAppId === 'string' && nextAppId !== this.#appId) {
      this.#appId = nextAppId
      this.#identity = undefined
    }
  }

  /**
   * Resolve the toast identity once. Windows attributes a toast through the
   * AUMID of a registered Start Menu shortcut, which supplies both the display
   * name and the icon; an unregistered AUMID makes the header show the raw
   * identifier, so the shortcut is preferred over the packaged appId.
   * @returns {Promise<{ appId: string, source: string, shortcut?: string, target?: string, logoUrl?: string }>}
   */
  async #resolveIdentity() {
    if (this.#identity !== undefined) return this.#identity
    // Candidates are ordered: explicit configuration first, then the
    // environment override, then whatever the Start Menu shortcut carries, and
    // finally the packaged fallback. Windows is asked which ones it accepts.
    const candidates = []
    const push = (appId, source, extra = {}) => {
      const value = String(appId ?? '').trim()
      if (value.length === 0) return
      if (candidates.some((entry) => entry.appId.toLowerCase() === value.toLowerCase())) return
      candidates.push({ appId: value, source, ...extra })
    }
    for (const value of splitAppIdCandidates(this.#appId)) push(value, 'config')
    for (const value of splitAppIdCandidates(process.env.DSH_NOTIFY_AUMIDS)) push(value, 'env')
    const shortcut = await this.#lookupShortcut()
    if (shortcut !== undefined) {
      push(shortcut.appId, 'shortcut', { shortcut: shortcut.shortcut, target: shortcut.target })
    }
    push(LEGACY_APP_ID, 'fallback')

    const probed = await this.#probeIdentities(candidates.map((entry) => entry.appId))
    let chosen
    if (probed === 'unavailable') {
      // The probe itself failed; keep the ordered chain rather than guessing.
      chosen = { ...candidates[0], validated: false }
    } else if (probed === undefined) {
      chosen = { ...candidates[0], validated: false }
      this.#logger(`no AppUserModelID candidate is registered with Windows; using "${chosen.appId}" from ${chosen.source}`)
    } else {
      const matched = candidates.find((entry) => entry.appId.toLowerCase() === probed.appId.toLowerCase())
      chosen = { ...(matched ?? candidates[0]), validated: matched !== undefined }
    }
    this.#identity = {
      appId: chosen.appId,
      source: chosen.source,
      shortcut: chosen.shortcut,
      target: chosen.target,
      validated: chosen.validated === true,
      candidates: candidates.map((entry) => entry.appId),
      logoUrl: appLogoUrl(chosen.target ?? process.execPath),
    }
    if (!this.#identity.validated) {
      this.#logger(`Windows notification identity "${this.#identity.appId}" (source: ${this.#identity.source}) was not validated; set windows.appId if the toast header shows an identifier instead of the app name`)
    }
    return this.#identity
  }

  /**
   * Read the Start Menu shortcut that carries this app's AUMID.
   * @returns {Promise<{ appId: string, shortcut: string, target: string } | undefined>}
   */
  async #lookupShortcut() {
    try {
      const result = await runPowerShell(this.#resolveScript, [
        '-Executable', process.execPath,
        '-ProductName', APP_PRODUCT_NAME,
      ])
      if (!result.ok) {
        this.#logger(`cannot resolve the Windows notification identity: ${result.error}`)
        return undefined
      }
      return parseAumidLookup(result.stdout)
    } catch (error) {
      this.#logger(`cannot resolve the Windows notification identity: ${messageOf(error)}`)
      return undefined
    }
  }

  /**
   * Ask Windows which of these identifiers it actually accepts.
   * @param {string[]} candidates - Ordered identifiers.
   * @returns {Promise<{ appId: string, setting: string } | 'unavailable' | undefined>}
   */
  async #probeIdentities(candidates) {
    try {
      const result = await runPowerShell(this.#probeScript, ['-Candidates', candidates.join(';')])
      if (!result.ok) {
        this.#logger(`cannot validate the Windows notification identity: ${result.error}`)
        return 'unavailable'
      }
      return parseAumidProbe(result.stdout)
    } catch (error) {
      this.#logger(`cannot validate the Windows notification identity: ${messageOf(error)}`)
      return 'unavailable'
    }
  }

  /**
   * Probe the WinRT transport and the action protocol.
   * @returns {Promise<object>} Capability record.
   */
  async capabilities() {
    const [protocol, identity] = await Promise.all([this.#protocol, this.#resolveIdentity()])
    return {
      available: true,
      platform: 'win32',
      transport: 'winrt',
      actions: protocol.ok,
      protocol: protocol.ok ? 'registered' : 'failed',
      appId: identity.appId,
      appIdSource: identity.source,
      appIdValidated: identity.validated === true,
      appIdCandidates: identity.candidates ?? [],
      appLogo: identity.logoUrl !== undefined,
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
    const identity = await this.#resolveIdentity()
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
      appLogo: identity.logoUrl,
      soundMode: input.silent === true ? 'none' : this.#soundMode,
      systemName: this.#systemName,
    })
    const encoded = Buffer.from(xml, 'utf8').toString('base64')
    const shown = await runPowerShell(this.#toastScript, [
      '-Mode', 'show',
      '-AppId', identity.appId,
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
    const identity = await this.#resolveIdentity()
    await runPowerShell(this.#toastScript, [
      '-Mode', 'remove',
      '-AppId', identity.appId,
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
    const result = await runPowerShell(this.#registerScript, [
      '-WscriptPath', wscript,
      '-VbsScript', this.#vbsScript,
      '-ActionDir', this.#dir,
      '-Owner', this.#owner,
    ])
    if (!result.ok) {
      this.#logger(`notification action protocol registration failed: ${result.error}`)
      return { ok: false, error: result.error }
    }
    return { ok: true }
  }

  /**
   * Remove the `dshnotify:` protocol on uninstall or disable. The registration
   * nonce guards against deleting a newer instance's registration after a
   * plugin reload, and the rendezvous directory is removed only when this call
   * really unregistered.
   * @returns {Promise<{ ok: boolean, removed: boolean, reason?: string }>}
   */
  async unregisterProtocol() {
    const result = await runPowerShell(this.#unregisterScript, [
      '-Owner', this.#owner,
      '-ScriptPath', this.#vbsScript,
    ])
    if (!result.ok) {
      this.#logger(`notification action protocol unregistration failed: ${result.error}`)
      return { ok: false, removed: false, reason: result.error }
    }
    let parsed
    try {
      parsed = JSON.parse(String(result.stdout ?? '').trim())
    } catch {
      parsed = undefined
    }
    if (parsed === undefined || parsed === null || typeof parsed !== 'object') {
      return { ok: false, removed: false, reason: 'unregistration produced no result' }
    }
    if (parsed.removed !== true) {
      return { ok: parsed.ok === true, removed: false, reason: typeof parsed.reason === 'string' ? parsed.reason : undefined }
    }
    try {
      rmSync(this.#dir, { recursive: true, force: true })
    } catch (error) {
      this.#logger(`cannot clean the action directory: ${messageOf(error)}`)
    }
    return { ok: parsed.ok === true, removed: true }
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
      powershellPath(),
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
