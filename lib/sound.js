import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'

/** Windows toast sound names must keep this prefix or SnoreToast resets them. */
const WINDOWS_SOUND_PREFIX = 'Notification.'
const DEFAULT_WINDOWS_SOUND = 'Notification.Default'
const DEFAULT_MACOS_SOUND = 'Bottle'
/** System sound names accepted by terminal-notifier. */
const MACOS_SOUNDS = new Set([
  'Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Glass', 'Hero',
  'Morse', 'Ping', 'Pop', 'Purr', 'Sosumi', 'Submarine', 'Tink',
])

/** A notification sound is a cue, not media: stop it after this long. */
const SOUND_CAP_MS = 8000

/**
 * Validate one user-supplied audio path for the current platform.
 * @param {NodeJS.Platform} platform - `process.platform`.
 * @param {string} file - Absolute path supplied by the user.
 * @returns {{ ok: true, path: string } | { ok: false, error: string }}
 */
export function validateSoundFile(platform, file) {
  if (typeof file !== 'string' || file.trim().length === 0) {
    return { ok: false, error: 'sound file path is empty' }
  }
  if (!path.isAbsolute(file.trim())) {
    return { ok: false, error: 'sound file path must be absolute' }
  }
  const normalized = path.resolve(file.trim())
  let stat
  try {
    stat = statSync(normalized)
  } catch {
    return { ok: false, error: `sound file not found: ${normalized}` }
  }
  if (!stat.isFile()) return { ok: false, error: `sound path is not a file: ${normalized}` }
  if (platform === 'win32' && path.extname(normalized).toLowerCase() !== '.wav') {
    return { ok: false, error: 'Windows custom notification sounds must be .wav files' }
  }
  return { ok: true, path: normalized }
}

/**
 * Resolve the toast-level sound options for one mode.
 * Non-system modes silence the toast and rely on the external player.
 * @param {NodeJS.Platform} platform - `process.platform`.
 * @param {'system' | 'bundled' | 'custom' | 'none'} mode - Sound mode.
 * @param {string} systemName - Optional system sound name.
 * @returns {{ sound?: string, silent?: boolean }} Options merged into the toast.
 */
export function toastSoundOptions(platform, mode, systemName) {
  if (mode === 'system') {
    if (platform === 'win32') {
      const name = typeof systemName === 'string' && systemName.startsWith(WINDOWS_SOUND_PREFIX)
        ? systemName
        : DEFAULT_WINDOWS_SOUND
      return { sound: name }
    }
    if (platform === 'darwin') {
      // `true` is node-notifier's shorthand for the Bottle system sound.
      return { sound: MACOS_SOUNDS.has(systemName) ? systemName : true }
    }
    return {}
  }
  if (platform === 'win32') return { silent: true }
  if (platform === 'darwin') return { sound: false }
  return {}
}

/**
 * Build the external player candidates for a file on one platform.
 * @param {NodeJS.Platform} platform - `process.platform`.
 * @param {string} file - Validated audio file.
 * @param {string} ps1Path - Bundled Windows playback script.
 * @param {string} powershell - PowerShell executable.
 * @returns {Array<{ command: string, args: string[] }>} Candidates in preference order.
 */
export function buildPlayerCandidates(platform, file, ps1Path, powershell = 'powershell.exe') {
  if (platform === 'win32') {
    return [{
      command: powershell,
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        ps1Path,
        file,
      ],
    }]
  }
  if (platform === 'darwin') return [{ command: 'afplay', args: [file] }]
  return []
}

/**
 * Spawn the first candidate that starts successfully.
 * @param {Array<{ command: string, args: string[] }>} candidates - Commands to try.
 * @param {(child: import('node:child_process').ChildProcess) => void} [onChild] - Called with the winning child.
 * @returns {Promise<{ ok: true, command: string } | { ok: false, error: string }>}
 */
export function spawnFirst(candidates, onChild) {
  return new Promise((resolve) => {
    let index = 0
    const attempt = () => {
      const candidate = candidates[index]
      index += 1
      if (candidate === undefined) {
        resolve({ ok: false, error: 'no supported audio player was found' })
        return
      }
      let settled = false
      let child
      try {
        child = spawn(candidate.command, candidate.args, {
          stdio: 'ignore',
          windowsHide: true,
        })
      } catch (error) {
        settle(null, error)
        return
      }
      child.once('error', (error) => settle(null, error))
      child.once('spawn', () => {
        if (typeof onChild === 'function') {
          try {
            onChild(child)
          } catch {
            // A tracking failure must not turn a playable sound into an error.
          }
        }
        settle(candidate)
      })
      child.once('exit', () => {})

      function settle(started, error) {
        if (settled) return
        settled = true
        if (started !== null) {
          resolve({ ok: true, command: started.command })
          return
        }
        if (index < candidates.length) attempt()
        else resolve({ ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    }
    attempt()
  })
}

/**
 * Play notification sounds through the platform player, or leave the toast's
 * own sound untouched.
 */
export class SoundPlayer {
  #platform
  #bundledFile
  #ps1Path
  #powershell
  #logger
  /** Children currently playing; killed on stopAll() or after the cap. */
  #children = new Set()

  /**
   * @param {object} options - Player wiring.
   * @param {NodeJS.Platform} options.platform - `process.platform`.
   * @param {string} options.bundledFile - Absolute path to the bundled chime.
   * @param {string} options.ps1Path - Absolute path to `play-wav.ps1`.
   * @param {string} [options.powershell] - PowerShell executable.
   * @param {(message: string) => void} [options.logger] - Diagnostic sink.
   */
  constructor({ platform, bundledFile, ps1Path, powershell, logger }) {
    this.#platform = platform
    this.#bundledFile = bundledFile
    this.#ps1Path = ps1Path
    this.#powershell = powershell ?? (platform === 'win32' ? 'powershell.exe' : 'pwsh')
    this.#logger = logger ?? (() => {})
  }

  /**
   * Resolve the effective file for a mode.
   * @param {'bundled' | 'custom'} mode - File-backed mode.
   * @param {string} file - Configured custom path.
   * @returns {{ ok: true, path: string } | { ok: false, error: string }}
   */
  #fileFor(mode, file) {
    if (mode === 'bundled') return { ok: true, path: this.#bundledFile }
    return validateSoundFile(this.#platform, file)
  }

  /**
   * Play the sound for one notification, or preview a system sound.
   * @param {{ mode: 'system' | 'bundled' | 'custom' | 'none', file?: string, systemName?: string }} sound - Sound config.
   * @param {{ preview?: boolean }} [options] - Preview plays the system sound directly.
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async play(sound, options = {}) {
    if (this.#platform !== 'win32' && this.#platform !== 'darwin') {
      return { ok: false, error: 'desktop sounds support only Windows and macOS' }
    }
    const mode = sound?.mode ?? 'bundled'
    if (mode === 'none') return { ok: true }
    if (mode === 'system') {
      if (options.preview === true) return await this.#playSystem(sound?.systemName ?? '')
      // Both supported platforms play the system sound through the toast itself.
      return { ok: true }
    }
    const file = this.#fileFor(mode, sound?.file ?? '')
    if (!file.ok) {
      this.#logger(`notification sound skipped: ${file.error}`)
      return { ok: false, error: file.error }
    }
    const result = await spawnFirst(
      buildPlayerCandidates(this.#platform, file.path, this.#ps1Path, this.#powershell),
      (child) => this.#track(child),
    )
    if (!result.ok) this.#logger(`notification sound failed: ${result.error}`)
    return result
  }

  async #playSystem(systemName) {
    if (this.#platform === 'win32') {
      const result = await spawnFirst([{
        command: this.#powershell,
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-Command',
          '[System.Media.SystemSounds]::Asterisk.Play()',
        ],
      }], (child) => this.#track(child))
      if (!result.ok) this.#logger(`system sound failed: ${result.error}`)
      return result
    }
    if (this.#platform === 'darwin') {
      const name = MACOS_SOUNDS.has(systemName) ? systemName : DEFAULT_MACOS_SOUND
      const result = await spawnFirst(
        [{ command: 'afplay', args: [`/System/Library/Sounds/${name}.aiff`] }],
        (child) => this.#track(child),
      )
      if (!result.ok) this.#logger(`system sound failed: ${result.error}`)
      return result
    }
    return { ok: false, error: 'desktop sounds support only Windows and macOS' }
  }

  /** Number of sounds currently tracked (diagnostics). */
  get playing() {
    return this.#children.size
  }

  /**
   * Stop every tracked sound. Returns how many children were signalled.
   * @returns {number}
   */
  stopAll() {
    let stopped = 0
    for (const child of this.#children) {
      try {
        child.kill()
        stopped += 1
      } catch {
        // A child that already exited needs no cleanup.
      }
    }
    this.#children.clear()
    return stopped
  }

  /**
   * Track one spawned player: cap its lifetime and forget it on exit.
   * @param {import('node:child_process').ChildProcess} child - Player process.
   */
  #track(child) {
    if (child === null || typeof child !== 'object') return
    this.#children.add(child)
    const timer = setTimeout(() => {
      this.#children.delete(child)
      try {
        child.kill()
      } catch {
        // Already gone.
      }
    }, SOUND_CAP_MS)
    timer.unref?.()
    const forget = () => {
      clearTimeout(timer)
      this.#children.delete(child)
    }
    child.once('exit', forget)
    child.once('error', forget)
  }

  /**
   * Validate a preview request without playing it.
   * @param {'system' | 'bundled' | 'custom' | 'none'} mode - Requested mode.
   * @param {string} file - Custom file.
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  validate(mode, file) {
    if (mode === 'custom') return validateSoundFile(this.#platform, file)
    if (mode === 'bundled') return { ok: true }
    if (mode === 'system' || mode === 'none') return { ok: true }
    return { ok: false, error: `unknown sound mode: ${String(mode)}` }
  }
}
