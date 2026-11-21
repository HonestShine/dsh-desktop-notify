/**
 * Manual macOS probe for the terminal-notifier/action round trip.
 *
 * Usage (after `pnpm install` in the plugin directory):
 *   node scripts/notify-probe.mjs [seconds]
 *
 * It prints the raw node-notifier callback and the normalized outcome so a
 * failure can be told apart from a button that simply was not clicked.
 */
import { setTimeout as delay } from 'node:timers/promises'

const seconds = Number(process.argv[2] ?? '60')
if (process.platform !== 'darwin') {
  console.error('notify-probe.mjs is the macOS probe; use scripts/winrt-probe.mjs on Windows')
  process.exit(1)
}

const { NotificationCenter } = await import('node-notifier')
const instance = new NotificationCenter({ withFallback: false })
const actions = ['拒绝', '允许一次']

const outcome = await new Promise((resolve) => {
  let settled = false
  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    resolve({ reason: 'timeout' })
  }, Math.max(5, Math.min(seconds, 300)) * 1000)

  instance.notify(
    {
      title: 'DeepSeek Harness 通知探针',
      message: '点击下方按钮验证通知交互；60 秒后自动结束。',
      actions,
      sound: false,
      timeout: Math.max(5, Math.min(seconds, 300)),
      group: 'dsh-desktop-notify-probe',
    },
    (error, response, metadata) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      console.log('callback', JSON.stringify({ error: error instanceof Error ? error.message : error ?? null, response, metadata }))
      const label = typeof metadata?.activationValue === 'string' ? metadata.activationValue : response
      const type = typeof metadata?.activationType === 'string' ? metadata.activationType : ''
      const lower = String(type || label || '').toLowerCase()
      if (lower === 'timeout' || lower === 'timedout') resolve({ reason: 'timeout' })
      else if (lower === 'closed' || lower === 'dismissed') resolve({ reason: 'dismissed' })
      else if (['activate', 'click', 'clicked', 'contentsclicked'].includes(lower)) resolve({ reason: 'click' })
      else if (actions.includes(String(label))) resolve({ reason: 'action', label })
      else resolve({ reason: 'unknown', type, label })
    },
  )
})

console.log('outcome', JSON.stringify(outcome))
if (outcome.reason === 'timeout') {
  await delay(100)
  process.exitCode = 2
} else if (outcome.reason === 'unknown') {
  process.exitCode = 3
}
