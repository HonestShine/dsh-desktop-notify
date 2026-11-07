import path from 'node:path'

/** Supported UI locales for toast copy; unknown locales fall back to English. */
const SUPPORTED = new Set(['zh', 'en'])

const DICT = {
  zh: {
    approvalTitle: '需要审批',
    approvalFallback: '工具请求特权执行',
    reject: '拒绝',
    allowOnce: '允许一次',
    questionTitle: '需要你回答',
    questionFallback: '会话正在等待你的回答',
    turnEndTitle: '回复完成',
    errorTitle: '会话出错',
    testTitle: '桌面通知测试',
    testBody: '点击下方按钮即可验证通知交互。',
    testDismiss: '关闭',
    testConfirm: '收到',
  },
  en: {
    approvalTitle: 'Approval required',
    approvalFallback: 'A tool requests privileged execution',
    reject: 'Reject',
    allowOnce: 'Allow once',
    questionTitle: 'Your answer is needed',
    questionFallback: 'A session is waiting for your answer',
    turnEndTitle: 'Reply finished',
    errorTitle: 'Session error',
    testTitle: 'Desktop notification test',
    testBody: 'Use a button below to verify notification actions.',
    testDismiss: 'Dismiss',
    testConfirm: 'Got it',
  },
}

/**
 * Resolve a UI locale id to one of the dictionaries above.
 * @param {string | undefined} locale - Active locale id reported by the Client.
 * @returns {'zh' | 'en'} Normalized locale.
 */
export function resolveLocale(locale) {
  if (typeof locale !== 'string') return 'en'
  const base = locale.toLowerCase().split(/[-_]/u)[0]
  return SUPPORTED.has(base) ? base : 'en'
}

/** @param {string | undefined} locale @returns {object} Dictionary for the locale. */
export function labelsFor(locale) {
  return DICT[resolveLocale(locale)]
}

/** @param {string | undefined} locale @returns {{ reject: string, allowOnce: string }} */
export function approvalLabels(locale) {
  const dict = labelsFor(locale)
  return { reject: dict.reject, allowOnce: dict.allowOnce }
}

/**
 * Build the approval toast copy from one `approval/request` event.
 * @param {object} request - Approval request (`toolName`, `reason`, `displayReason`).
 * @param {string | undefined} locale - Active UI locale.
 * @param {string} [sessionTitle] - Session title for the first line.
 * @returns {{ title: string, body: string, actions: { reject: string, allowOnce: string } }}
 */
export function formatApproval(request, locale, sessionTitle = '') {
  const dict = labelsFor(locale)
  const reason = localizedReason(request?.displayReason, locale)
    || (typeof request?.reason === 'string' && request.reason.length > 0 ? request.reason : '')
    || dict.approvalFallback
  const tool = typeof request?.toolName === 'string' && request.toolName.length > 0 ? request.toolName : 'tool'
  const prefix = cleanTitle(sessionTitle)
  return {
    title: dict.approvalTitle,
    body: truncate(`${prefix.length === 0 ? '' : `${prefix}：`}${tool} · ${reason}`, 180),
    actions: approvalLabels(locale),
  }
}

/**
 * Resolve the localized `displayReason` object DSH attaches to an approval
 * request. Older releases may carry a plain string instead.
 * @param {unknown} display - `displayReason` value.
 * @param {string | undefined} locale - Active UI locale.
 * @returns {string} The best localized reason, or an empty string.
 */
export function localizedReason(display, locale) {
  if (typeof display === 'string') return display
  if (display === null || typeof display !== 'object') return ''
  const preferred = resolveLocale(locale)
  const candidate = display[preferred] ?? display.en ?? Object.values(display).find((value) => typeof value === 'string')
  return typeof candidate === 'string' ? candidate : ''
}

/**
 * Build the turn-finished toast copy for one Agent.
 * @param {object} agent - Live Agent with a `session.header`.
 * @param {string | undefined} locale - Active UI locale.
 * @param {string} [sessionTitle] - Session title for the body.
 * @returns {{ title: string, body: string }}
 */
export function formatTurnEnd(agent, locale, sessionTitle = '') {
  const dict = labelsFor(locale)
  return {
    title: dict.turnEndTitle,
    body: cleanTitle(sessionTitle) || sessionLabel(agent),
  }
}

/**
 * Build the error toast copy for one failed turn.
 * @param {{ error?: unknown, agent?: object }} payload - `agent/error` payload.
 * @param {string | undefined} locale - Active UI locale.
 * @param {string} [sessionTitle] - Session title for the first line.
 * @returns {{ title: string, body: string }}
 */
export function formatError(payload, locale, sessionTitle = '') {
  const dict = labelsFor(locale)
  const message = payload?.error instanceof Error
    ? payload.error.message
    : typeof payload?.error === 'string'
      ? payload.error
      : ''
  const prefix = cleanTitle(sessionTitle)
  const detail = message || sessionLabel(payload?.agent)
  return {
    title: dict.errorTitle,
    body: truncate(prefix.length === 0 ? detail : `${prefix}：${detail}`, 180),
  }
}

/**
 * Build the question toast copy for one `user-questions/request` event.
 * @param {object} request - Question request with a `questions` array.
 * @param {string | undefined} locale - Active UI locale.
 * @param {string} [sessionTitle] - Session title for the first line.
 * @returns {{ title: string, body: string }}
 */
export function formatQuestion(request, locale, sessionTitle = '') {
  const dict = labelsFor(locale)
  const first = Array.isArray(request?.questions) ? request.questions[0] : undefined
  const question = typeof first?.question === 'string' && first.question.length > 0 ? first.question : ''
  const prefix = cleanTitle(sessionTitle)
  const detail = question || dict.questionFallback
  return {
    title: dict.questionTitle,
    body: truncate(prefix.length === 0 ? detail : `${prefix}：${detail}`, 180),
  }
}

/**
 * Normalize a Host-provided session title for one toast line.
 * @param {unknown} title - Raw title.
 * @returns {string} Trimmed, truncated title.
 */
export function cleanTitle(title) {
  return typeof title === 'string' ? truncate(title, 80) : ''
}

/**
 * Human-readable session context for reminders.
 * @param {object | undefined} agent - Live Agent.
 * @returns {string} Working-directory basename, or the generic session label.
 */
export function sessionLabel(agent) {
  const cwd = agent?.session?.header?.cwd
  if (typeof cwd === 'string' && cwd.length > 0) {
    const base = path.basename(cwd)
    if (base.length > 0) return truncate(base, 80)
  }
  return 'DeepSeek Harness'
}

/**
 * Hard-truncate a single-line string for a toast body.
 * @param {string} text - Source text.
 * @param {number} max - Maximum characters.
 * @returns {string} Truncated text with an ellipsis.
 */
export function truncate(text, max) {
  const flat = String(text ?? '').replace(/\s+/gu, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, Math.max(0, max - 1))}…`
}
