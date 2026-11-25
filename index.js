import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Service } from '@deepseek-ai/cordis'
import { Config as ConfigSchema, normalizeConfig } from './lib/config.js'
import { DedupeWindow, questionDedupeKey, recentlyErrored } from './lib/dedupe.js'
import { Diagnostics } from './lib/diagnostics.js'
import { formatApproval, formatError, formatPtcQuestion, formatQuestion, formatTurnEnd, labelsFor, parseToolArguments, resolveLocale } from './lib/messages.js'
import { Notifier, sanitizeActions } from './lib/notifier.js'
import { Presence } from './lib/presence.js'
import { installRoutes } from './lib/routes.js'
import { isRootSession } from './lib/session.js'
import { SoundPlayer } from './lib/sound.js'
import { TurnCache } from './lib/turns.js'
import { WinRtNotifier } from './lib/winrt.js'

const PLUGIN_DIR = fileURLToPath(new URL('.', import.meta.url))
const BUNDLED_SOUND = fileURLToPath(new URL('./assets/notify.wav', import.meta.url))
const BUNDLED_ALERT = fileURLToPath(new URL('./assets/alert.wav', import.meta.url))
const PLAY_SCRIPT = fileURLToPath(new URL('./assets/play-wav.ps1', import.meta.url))

/** One question prompt may arrive from the waterfall and from PTC; collapse it for this long. */
const QUESTION_DEDUPE_MS = 5000
/** An idle event this soon after `agent/error` is the same turn, not a completion. */
const ERROR_SUPPRESS_MS = 5000

/** Defer to the in-app approval panel. */
const DELEGATE = Symbol('delegate')

/**
 * Host-side desktop notification service. Owns the platform notifier, the
 * notification sound, presence tracking, and the approval waterfall takeover.
 */
export default class DesktopNotifyService extends Service {
  static Config = ConfigSchema

  /** @param {object} config - Resolved plugin config. */
  constructor(ctx, config) {
    super(ctx, 'desktopNotify')
    this.config = normalizeConfig(config)
    this.diagnostics = new Diagnostics()
    const sink = ctx.logger?.('desktop-notify')
    this.log = (message, level = 'info') => {
      try {
        this.diagnostics.note(message)
      } catch {
        // The ring is a debugging aid; never let it break a notification.
      }
      try {
        if (typeof sink?.[level] === 'function') {
          sink[level](message)
          return
        }
      } catch {
        // Fall through to the console.
      }
      if (level === 'error') console.error(`[desktop-notify] ${message}`)
      else if (level === 'warn') console.warn(`[desktop-notify] ${message}`)
      else console.info(`[desktop-notify] ${message}`)
    }
    this.presence = new Presence(this.config.presence.staleSeconds * 1000)
    if (process.platform !== 'win32' && process.platform !== 'darwin') {
      this.log('desktop notifications support only Windows and macOS; notifications are disabled on this platform', 'warn')
    }
    this.notifier = process.platform === 'win32'
      ? new WinRtNotifier({
          appId: this.config.windows.appId,
          duration: this.config.windows.duration,
          soundMode: this.config.sound.mode,
          systemName: this.config.sound.systemName,
          pluginDir: PLUGIN_DIR,
          logger: (message) => this.log(message, 'warn'),
        })
      : new Notifier({
          platform: process.platform,
          config: this.config,
          logger: (message) => this.log(message, 'warn'),
        })
    this.sound = new SoundPlayer({
      platform: process.platform,
      bundledFile: BUNDLED_SOUND,
      ps1Path: PLAY_SCRIPT,
      logger: (message) => this.log(message, 'warn'),
    })
    // Interaction cue: a different, shorter cue than the notification chime,
    // played whenever the agent needs an approval or an answer. It never looks
    // at window focus, because the in-app approval panel gives no audible cue.
    this.attentionSound = new SoundPlayer({
      platform: process.platform,
      bundledFile: BUNDLED_ALERT,
      ps1Path: PLAY_SCRIPT,
      logger: (message) => this.log(message, 'warn'),
    })
    // Resolve the Windows toast identity in the background so the first real
    // approval does not pay the shortcut + AUMID probe latency.
    if (process.platform === 'win32' && this.config.enabled && typeof this.notifier.warmup === 'function') {
      this.warmupTimer = setTimeout(() => {
        void this.notifier.warmup()
      }, 1500)
      this.warmupTimer.unref?.()
    }
    this.lastCueAt = 0
    /** @type {{ reason: string, actionId?: string, label?: string, at: number, test?: boolean } | undefined} */
    this.lastOutcome = undefined
    /** @type {object | undefined} */
    this.pendingApproval = undefined
    /** @type {Map<string, string>} */
    this.agentStatus = new Map()
    /** @type {Map<string, number>} */
    this.agentErrorAt = new Map()
    /** Cross-source question dedupe, scoped by session + question text. */
    this.questions = new DedupeWindow(QUESTION_DEDUPE_MS)
    /** Best-effort turn-end context from the committed session events. */
    this.turns = new TurnCache()
    /** Agent id -> wall clock when the current turn was first seen running. */
    this.turnStartedAt = new Map()
    this.disposed = false

    ctx.effect(() => () => this.#dispose(), 'desktop-notify: lifecycle')
    if (this.config.enabled) this.#installListeners()
    this.#installRoutes()
  }

  /* ------------------------------------------------------------------ */
  /* Public service API                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Show one notification and await its outcome.
   * @param {object} input - Notification input.
   * @returns {Promise<{ reason: string, actionId?: string, label?: string }>}
   */
  show(input) {
    return this.notifier.show(input)
  }

  /** @returns {Promise<object>} Platform and runtime diagnostics. */
  async status() {
    const notifier = await this.notifier.capabilities()
    return {
      platform: process.platform,
      supported: process.platform === 'win32' || process.platform === 'darwin',
      enabled: this.config.enabled,
      notifier,
      sound: {
        mode: this.config.sound.mode,
        customFile: this.config.sound.file,
        systemName: this.config.sound.systemName,
      },
      presence: this.presence.snapshot(),
      attention: {
        enabled: this.config.attention.enabled,
        mode: this.config.attention.mode,
      },
      windows: {
        appId: this.config.windows.appId,
        resolvedAppId: notifier.appId,
        appIdSource: notifier.appIdSource,
      appIdValidated: notifier.appIdValidated === true,
        appLogo: notifier.appLogo === true,
        canRepairProtocol: process.platform === 'win32',
      },
      macos: {
        identity: 'terminal-notifier',
        customPath: this.config.macos.customNotifierPath,
      },
      pendingApproval: this.pendingApproval !== undefined,
      lastOutcome: this.lastOutcome,
    }
  }

  /**
   * Re-register the Windows action protocol.
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async repairWindowsProtocol() {
    if (typeof this.notifier.repairProtocol !== 'function') {
      return { ok: false, error: 'the active transport has no Windows protocol registration' }
    }
    return await this.notifier.repairProtocol()
  }

  /**
   * Record a Client presence frame.
   * @param {{ clientId: string, focused: boolean, locale?: string }} report - Presence frame.
   */
  reportPresence(report) {
    this.presence.update(report)
  }

  /**
   * Fire one interactive test notification without blocking the HTTP response.
   * @returns {Promise<{ sent: boolean, labels: string[] }>}
   */
  async sendTest() {
    const locale = this.presence.locale() ?? detectLocale()
    const dict = labelsFor(locale)
    const actions = sanitizeTestActions(dict)
    void this.sound.play(this.config.sound, { preview: false })
    void this.notifier.show({
      title: dict.testTitle,
      body: dict.testBody,
      actions,
      timeoutMs: 60_000,
      timeoutSeconds: 60,
    }).then((outcome) => {
      this.lastOutcome = { ...outcome, at: Date.now(), test: true }
    }).catch((error) => {
      this.lastOutcome = {
        reason: 'error',
        error: error instanceof Error ? error.message : String(error),
        at: Date.now(),
        test: true,
      }
    })
    return { sent: true, labels: actions.map((action) => action.label) }
  }

  /**
   * Validate and preview a sound configuration.
   * @param {string} mode - Sound mode.
   * @param {string} file - Custom file.
   * @param {string} systemName - Optional system sound name.
   * @returns {Promise<{ ok: boolean, code?: string, message?: string }>}
   */
  async previewSound(mode, file, systemName) {
    const normalized = ['system', 'bundled', 'custom', 'none'].includes(mode) ? mode : this.config.sound.mode
    const check = this.sound.validate(normalized, typeof file === 'string' ? file : '')
    if (!check.ok) return { ok: false, code: 'invalid-sound', message: check.error }
    if (normalized === 'none') return { ok: true, silent: true }
    const result = await this.sound.play(
      { mode: normalized, file, systemName: typeof systemName === 'string' ? systemName : '' },
      { preview: true },
    )
    return result.ok ? { ok: true } : { ok: false, code: 'sound-failed', message: result.error }
  }

  async previewAttention(mode, file) {
    const normalized = ['bundled', 'custom', 'none'].includes(mode) ? mode : this.config.attention.mode
    const check = this.attentionSound.validate(normalized, typeof file === 'string' ? file : '')
    if (!check.ok) return { ok: false, code: 'invalid-sound', message: check.error }
    if (normalized === 'none') return { ok: true, silent: true }
    const result = await this.attentionSound.play(
      { mode: normalized, file: typeof file === 'string' ? file : '' },
      { preview: true },
    )
    return result.ok ? { ok: true } : { ok: false, code: 'sound-failed', message: result.error }
  }

  /**
   * Append one client-side diagnostic line. Kept on the service so `/report`
   * stays a thin route.
   * @param {unknown} line - Client message.
   * @returns {{ ok: boolean }}
   */
  report(line) {
    const text = typeof line === 'string' ? line.trim() : ''
    if (text.length === 0) return { ok: false }
    this.diagnostics.note(`client: ${text.slice(0, 500)}`)
    return { ok: true }
  }

  /**
   * Stop every sound that is still playing. Called when the window regains
   * focus, when the plugin is disposed, and by the settings page.
   * @returns {{ ok: boolean, stopped: number }}
   */
  silence() {
    const stopped = this.sound.stopAll() + this.attentionSound.stopAll()
    if (stopped > 0) this.diagnostics.note(`silence: stopped ${stopped} sound(s)`)
    return { ok: true, stopped }
  }

  /**
   * Diagnostics snapshot for `GET /desktop-notify/debug`: the ordinary status
   * plus the decision ring and the small in-memory caches.
   * @returns {Promise<object>}
   */
  async debugReport() {
    const status = await this.status()
    return {
      ...status,
      diagnostics: this.diagnostics.snapshot(),
      turns: { cached: this.turns.size, running: this.turnStartedAt.size },
      sounds: {
        notification: { playing: this.sound.playing },
        attention: { playing: this.attentionSound.playing },
      },
    }
  }

  /* ------------------------------------------------------------------ */
  /* Listener wiring                                                      */
  /* ------------------------------------------------------------------ */

  #installListeners() {
    const ctx = this.ctx
    // Read-only fold of the committed event stream. It gives the turn reminder
    // the real end reason and the last reply text; when the event is not
    // forwarded to this plugin the cache stays empty and `formatTurnEnd` falls
    // back to the old generic copy.
    ctx.on('session/event', (session, event) => {
      try {
        this.turns.observe(session, event)
      } catch (error) {
        this.log(`turn context fold failed: ${messageOf(error)}`, 'warn')
      }
    })
    ctx.on('approval/request', (request, next) => this.#handleApproval(request, next), {
      prepend: true,
      global: true,
    })
    ctx.on('user-questions/request', (request, next) => {
      const sessionKey = this.#sessionKey(request?.agent)
      const key = questionDedupeKey(sessionKey, firstQuestionText(request))
      if (!this.questions.claim(key)) {
        this.diagnostics.note(`suppressed question: duplicate ${key}`)
        return next()
      }
      const cued = this.#cueAttention()
      if (this.#shouldRemind('question')) {
        try {
          const copy = formatQuestion(request, this.#locale(), this.#sessionTitleOf(request?.agent))
          void this.#remind(copy, { sound: !cued, silent: cued })
        } catch (error) {
          this.log(`question reminder failed: ${messageOf(error)}`, 'warn')
        }
      }
      return next()
    }, { prepend: true, global: true })
    // `run_code` can call `ask_user_question` without going through the question
    // waterfall; the tool dispatch is the only observable signal for that case.
    const onProgrammaticQuestion = (payload) => {
      try {
        if (payload?.name !== 'ask_user_question') return
        const sessionKey = this.#sessionKey(payload?.agent)
        const args = parseToolArguments(payload?.arguments ?? payload?.args)
        const key = questionDedupeKey(sessionKey, firstQuestionText(args))
        if (!this.questions.claim(key)) {
          this.diagnostics.note(`suppressed ptc question: duplicate ${key}`)
          return
        }
        const cued = this.#cueAttention()
        if (!this.#shouldRemind('question')) return
        const copy = formatPtcQuestion(payload, this.#locale(), this.#sessionTitleOf(payload?.agent))
        void this.#remind(copy, { sound: !cued, silent: cued })
      } catch (error) {
        this.log(`programmatic question reminder failed: ${messageOf(error)}`, 'warn')
      }
    }
    ctx.on('tool/ptc-dispatch-start', onProgrammaticQuestion, { global: true })
    ctx.on('tool/ptc-dispatch', onProgrammaticQuestion, { global: true })
    ctx.on('agent/status', (payload) => {
      try {
        const agent = payload?.agent
        if (agent === undefined || typeof agent.id !== 'string') return
        const status = payload.status
        const previous = this.agentStatus.get(agent.id)
        const erroredAt = this.agentErrorAt.get(agent.id)
        this.agentStatus.set(agent.id, status)
        if (status === 'running') {
          this.agentErrorAt.delete(agent.id)
          if (!this.turnStartedAt.has(agent.id)) this.turnStartedAt.set(agent.id, Date.now())
        }
        const startedAt = status === 'idle' ? this.turnStartedAt.get(agent.id) : undefined
        if (status === 'idle') this.turnStartedAt.delete(agent.id)
        if (status !== 'idle' || previous !== 'running') return
        if (!isRootSession(agent)) return
        // An error already produced its own toast; the idle that follows is the
        // same turn, not a second completion.
        if (recentlyErrored(erroredAt, Date.now(), ERROR_SUPPRESS_MS)) {
          this.agentErrorAt.delete(agent.id)
          return
        }
        if (!this.#shouldRemind('turnEnd')) return
        const turn = this.turns.take(agent?.session?.id)
        const durationSeconds = startedAt === undefined ? undefined : (Date.now() - startedAt) / 1000
        return this.#remind(
          formatTurnEnd(agent, this.#locale(), this.#sessionTitleOf(agent), {
            reason: turn?.reason,
            text: turn?.text,
            durationSeconds,
          }),
        )
      } catch (error) {
        this.log(`turn reminder failed: ${messageOf(error)}`, 'warn')
      }
      return undefined
    }, { global: true })
    ctx.on('agent/error', (payload) => {
      try {
        const agent = payload?.agent
        if (agent === undefined || typeof agent.id !== 'string') return
        if (!isRootSession(agent)) return
        const now = Date.now()
        const copy = formatError(payload, this.#locale(), this.#sessionTitleOf(agent))
        const signature = `${agent.id}:${copy.title}:${copy.body}`
        if (this.#recentlySent(signature, now)) {
          // The same failure was already announced; still suppress the idle
          // that follows it, because that turn is not a completion.
          this.agentErrorAt.set(agent.id, now)
          return
        }
        if (!this.#shouldRemind('errors')) return
        this.agentErrorAt.set(agent.id, now)
        void this.#remind(copy)
      } catch (error) {
        this.log(`error reminder failed: ${messageOf(error)}`, 'warn')
      }
    }, { global: true })
    ctx.on('agent/disposed', (payload) => {
      const agent = payload?.agent
      const id = agent?.id
      if (typeof id === 'string') {
        this.agentStatus.delete(id)
        this.agentErrorAt.delete(id)
        this.turnStartedAt.delete(id)
        const sessionId = agent?.session?.id
        this.turns.delete(typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : id)
      }
    }, { global: true })
  }

  /**
   * Take over one approval request from the Host waterfall.
   * @param {object} request - Approval request.
   * @param {() => Promise<string>} next - Next waterfall answerer.
   * @returns {Promise<string>} Approval outcome.
   */
  async #handleApproval(request, next) {
    let focus
    try {
      if (!this.config.enabled) {
        this.diagnostics.note('suppressed approval: plugin disabled')
        return await safeNext(next)
      }
      const cued = this.#cueAttention()
      if (!this.config.approval.enabled) {
        this.diagnostics.note('suppressed approval: switch off')
        return await safeNext(next)
      }
      if (this.pendingApproval !== undefined) {
        this.diagnostics.note('suppressed approval: another approval is pending')
        return await safeNext(next)
      }
      if (this.config.approval.onlyWhenHidden && this.presence.isPresent()) {
        this.diagnostics.note('suppressed approval: window present')
        return await safeNext(next)
      }
      const locale = this.#locale()
      const copy = formatApproval(request, locale, this.#sessionTitleOf(request?.agent))
      const actions = sanitizeApprovalActions(copy.actions)
      if (actions.length !== 2) {
        this.diagnostics.note('suppressed approval: action labels are not usable')
        return await safeNext(next)
      }
      const hasClient = this.#hasLiveClient()
      if (!hasClient) this.diagnostics.note('approval: no live client; timeout extended')
      const timeoutMs = this.config.approval.timeoutSeconds * 1000
      const effectiveTimeoutMs = hasClient ? timeoutMs : Math.max(timeoutMs, 120_000)
      const pending = {
        delegate: next,
        handle: undefined,
        cancel: undefined,
        disposed: false,
      }
      const disposed = Promise.withResolvers()
      pending.cancel = () => disposed.resolve({ kind: 'dispose' })
      this.pendingApproval = pending
      // The interaction cue already played at the top of the handler; playing
      // the notification sound too would double-cue the same prompt.
      if (!cued) void this.sound.play(this.config.sound, { preview: false })
      const shown = this.notifier.show({
        title: copy.title,
        body: copy.body,
        actions,
        silent: cued,
        timeoutMs: effectiveTimeoutMs,
        timeoutSeconds: Math.max(5, Math.ceil(effectiveTimeoutMs / 1000)),
        onHandle: (handle) => {
          pending.handle = handle
        },
      })
      const racers = [shown.then((outcome) => ({ kind: 'notify', outcome }))]
      // Always race the focus signal. The previous gate skipped it when the
      // gateway reported no live client, which meant a window opened *after* the
      // toast appeared could never withdraw it. The waiter is cancelled below,
      // so an approval that ends by timeout or action leaves nothing behind.
      focus = this.presence.waitForPresent()
      racers.push(focus.promise.then(() => ({ kind: 'focus' })))
      if (request?.signal !== undefined) {
        racers.push(new Promise((resolve) => {
          if (request.signal.aborted) resolve({ kind: 'abort' })
          else request.signal.addEventListener('abort', () => resolve({ kind: 'abort' }), { once: true })
        }))
      }
      racers.push(disposed.promise)
      const result = await Promise.race(racers)
      if (result.kind === 'abort') {
        await this.#closePending(pending)
        return 'cancelled'
      }
      if (result.kind === 'dispose') return await safeNext(next)
      if (result.kind === 'focus') {
        await this.#closePending(pending)
        return await safeNext(next)
      }
      const outcome = result.outcome
      if (outcome.reason === 'action') {
        if (outcome.actionId === 'reject') return 'rejected'
        if (outcome.actionId === 'allow-once') return 'allowed-once'
      }
      if (outcome.reason === 'click') {
        this.#focusApp()
        if (this.#hasLiveClient()) return await safeNext(next)
        return 'unavailable'
      }
      if (outcome.reason === 'error') this.log(`notification failed: ${outcome.error ?? 'unknown'}`, 'warn')
      if (this.#hasLiveClient()) return await safeNext(next)
      return 'unavailable'
    } catch (error) {
      this.log(`approval takeover failed: ${messageOf(error)}`, 'warn')
      return 'unavailable'
    } finally {
      focus?.cancel?.()
      this.pendingApproval = undefined
    }
  }

  async #closePending(pending) {
    if (pending.handle === undefined) return
    await this.notifier.close(pending.handle)
  }

  /**
   * Decide whether an automatic reminder should be shown.
   * @param {'question' | 'turnEnd' | 'errors'} key - Event switch.
   * @returns {boolean}
   */
  #shouldRemind(key) {
    if (!this.config.enabled) return false
    if (this.config.events[key] !== true) {
      this.diagnostics.note(`suppressed ${key}: switch off`)
      return false
    }
    if (this.config.events.onlyWhenHidden && this.presence.isPresent()) {
      this.diagnostics.note(`suppressed ${key}: window present`)
      return false
    }
    return true
  }

  /**
   * Stable session identity used by question dedupe. Prefers the Session id,
   * because one agent can survive across turns; falls back to the Agent id.
   * @param {object | undefined} agent - Live Agent.
   * @returns {string} Stable key, or an empty string when neither id exists.
   */
  #sessionKey(agent) {
    const sessionId = agent?.session?.id
    if (typeof sessionId === 'string' && sessionId.length > 0) return sessionId
    return typeof agent?.id === 'string' ? agent.id : ''
  }

  /**
   * Play the interaction cue when the agent needs the user. Independent of
   * window focus: an approval or a question must be audible even while the app
   * is in the foreground, where the in-app panel shows no sound of its own.
   * @returns {boolean} True when the cue is enabled, so no notification sound should double it.
   */
  #cueAttention() {
    if (!this.config.enabled || !this.config.attention.enabled) return false
    if (this.config.attention.mode === 'none') return false
    const now = Date.now()
    if (now - this.lastCueAt >= 800) {
      this.lastCueAt = now
      void this.attentionSound.play(this.config.attention, { preview: false }).catch(() => {})
    }
    return true
  }

  /**
   * Show a non-interactive reminder and play the configured sound.
   * @param {{ title: string, body: string }} copy - Notification copy.
   * @param {{ sound?: boolean, silent?: boolean }} [options] - Per-reminder switches.
   * @returns {Promise<void>}
   */
  async #remind(copy, options = {}) {
    if (this.disposed) return
    if (options.sound !== false) void this.sound.play(this.config.sound, { preview: false })
    void this.notifier.show({
      title: copy.title,
      body: copy.body,
      silent: options.silent === true,
    }).then((outcome) => {
      // Transports report failures by resolving { reason: 'error' } instead of
      // rejecting; ignoring that shape is what made a broken toast look
      // successful. Record it so the settings page can show the last failure.
      if (outcome?.reason !== 'error') return
      const detail = String(outcome.error ?? 'unknown error')
      this.lastOutcome = { reason: 'error', error: detail, at: Date.now(), remind: true }
      this.log(`reminder notification failed: ${detail}`, 'warn')
    }).catch((error) => {
      this.log(`reminder notification failed: ${messageOf(error)}`, 'warn')
    })
  }

  #recentlySent(signature, now) {
    const last = this.#recent.get(signature)
    this.#recent.set(signature, now)
    if (this.#recent.size > 64) {
      const cutoff = now - 60_000
      for (const [key, at] of this.#recent) if (at < cutoff) this.#recent.delete(key)
    }
    return last !== undefined && now - last < 2000
  }

  #recent = new Map()

  #locale() {
    return this.presence.locale() ?? detectLocale()
  }

  /**
   * Read the live session title for a notification body.
   * @param {object | undefined} agent - Live Agent.
   * @returns {string} Session title, or an empty string.
   */
  #sessionTitleOf(agent) {
    try {
      const titles = this.ctx.get('sessionTitle')
      const title = titles?.get?.(agent?.session)?.title
      return typeof title === 'string' ? title : ''
    } catch {
      return ''
    }
  }

  #hasLiveClient() {
    try {
      const gateway = this.ctx.get('typertGateway')
      return gateway?.hasLiveClient?.() === true
    } catch {
      return false
    }
  }

  #focusApp() {
    if (process.platform !== 'win32' && process.platform !== 'darwin') return
    const url = 'dsh://open'
    const options = { stdio: 'ignore', windowsHide: true, detached: true }
    try {
      const child = process.platform === 'win32'
        ? spawn('cmd.exe', ['/c', 'start', '', url], options)
        : spawn('open', [url], options)
      child.on('error', () => {})
      child.unref()
    } catch {
      // Focusing the app is best effort.
    }
  }

  #installRoutes() {
    this.ctx.inject(['webServer', 'connection'], (scope) => {
      scope.effect(() => installRoutes(scope, this), 'desktop-notify: routes')
    })
  }

  #dispose() {
    if (this.disposed) return
    this.disposed = true
    if (this.warmupTimer !== undefined) clearTimeout(this.warmupTimer)
    try {
      this.pendingApproval?.cancel?.()
    } catch {
      // The waterfall may already be unwound.
    }
    this.sound.stopAll()
    this.attentionSound.stopAll()
    this.notifier.clearAll()
    if (typeof this.notifier.unregisterProtocol === 'function') {
      void this.notifier.unregisterProtocol().then((result) => {
        if (result.removed === true) this.log('notification action protocol unregistered')
      }).catch((error) => {
        this.log(`notification action protocol unregistration failed: ${messageOf(error)}`, 'warn')
      })
    }
    this.presence.dispose()
  }
}

/** @param {object} actions @returns {Array<{ id: string, label: string }>} */
function sanitizeApprovalActions(actions) {
  return sanitizeActions([
    { id: 'reject', label: actions.reject },
    { id: 'allow-once', label: actions.allowOnce },
  ])
}

function sanitizeTestActions(dict) {
  return sanitizeActions([
    { id: 'dismiss', label: dict.testDismiss },
    { id: 'confirm', label: dict.testConfirm },
  ])
}

function detectLocale() {
  try {
    return resolveLocale(Intl.DateTimeFormat().resolvedOptions().locale)
  } catch {
    return 'en'
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Read the first question text from a waterfall request or parsed PTC args.
 * Used only as part of the dedupe key, so a missing text is fine.
 * @param {unknown} value - Request, parsed arguments, or anything else.
 * @returns {string}
 */
function firstQuestionText(value) {
  const list = Array.isArray(value?.questions) ? value.questions : []
  const first = list[0]
  return first !== null && typeof first === 'object' && typeof first.question === 'string'
    ? first.question
    : ''
}

async function safeNext(next) {
  try {
    return await next()
  } catch {
    return 'unavailable'
  }
}
