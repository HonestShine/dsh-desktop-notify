/**
 * Manual WinRT transport probe. Run with the plugin disabled so its watcher
 * does not consume the rendezvous file.
 *
 *   node scripts/winrt-probe.mjs [seconds]
 */
import { fileURLToPath } from 'node:url'
import { WinRtNotifier } from '../lib/winrt.js'

const seconds = Number(process.argv[2] ?? '300')
const pluginDir = fileURLToPath(new URL('..', import.meta.url))
const notifier = new WinRtNotifier({
  appId: process.env.DSH_NOTIFY_APP_ID || 'com.deepseek.dsh',
  soundMode: 'system',
  systemName: '',
  pluginDir,
  logger: (message) => console.error(`[winrt-probe] ${message}`),
})

console.log('capabilities', JSON.stringify(await notifier.capabilities()))
const keepAlive = setInterval(() => {}, 1000)
const outcome = await notifier.show({
  title: 'DeepSeek Harness WinRT 探针',
  body: '点击“允许一次”验证通知按钮回传；最长等待 5 分钟。',
  actions: [
    { id: 'reject', label: '拒绝' },
    { id: 'allow-once', label: '允许一次' },
  ],
  timeoutMs: Math.max(5, Math.min(seconds, 300)) * 1000,
})
clearInterval(keepAlive)
console.log('outcome', JSON.stringify(outcome))
notifier.clearAll()
process.exitCode = outcome.reason === 'action' ? 0 : 1
