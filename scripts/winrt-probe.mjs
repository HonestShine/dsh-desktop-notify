/**
 * Manual WinRT transport probe. Run with the plugin disabled so its watcher
 * does not consume the rendezvous file.
 *
 *   node scripts/winrt-probe.mjs [seconds] [--auto]
 *
 * `--auto` simulates the button click through the same VBS protocol handler, so
 * the whole show -> activate.vbs -> rendezvous -> drain path can be checked
 * without a human click.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WinRtNotifier } from '../lib/winrt.js'

const args = process.argv.slice(2)
const auto = args.includes('--auto')
const seconds = Number(args.find((value) => /^\d+$/u.test(value)) ?? '300')
const pluginDir = fileURLToPath(new URL('..', import.meta.url))
const notifier = new WinRtNotifier({
  appId: process.env.DSH_NOTIFY_APP_ID || 'com.deepseek.dsh',
  soundMode: 'system',
  systemName: '',
  pluginDir,
  logger: (message) => console.error(`[winrt-probe] ${message}`),
})

console.log('capabilities', JSON.stringify(await notifier.capabilities()))
let handle
const keepAlive = setInterval(() => {}, 1000)
const shown = notifier.show({
  title: 'DeepSeek Harness WinRT 探针',
  body: auto ? '自动点击“允许一次”验证按钮回传…' : '点击“允许一次”验证通知按钮回传；最长等待 5 分钟。',
  actions: [
    { id: 'reject', label: '拒绝' },
    { id: 'allow-once', label: '允许一次' },
  ],
  timeoutMs: Math.max(5, Math.min(seconds, 300)) * 1000,
  onHandle: (value) => {
    handle = value
  },
})

if (auto) {
  await new Promise((resolve) => setTimeout(resolve, 1200))
  if (handle === undefined) {
    console.error('[winrt-probe] no handle was returned; cannot simulate the click')
  } else {
    const dir = path.join(process.env.LOCALAPPDATA ?? '', 'dsh-desktop-notify', 'actions')
    const uri = `dshnotify:?token=${handle.token}&decision=allow-once`
    const wscript = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'wscript.exe')
    const child = spawn(wscript, ['//B', '//Nologo', path.join(pluginDir, 'assets', 'activate.vbs'), dir, uri], {
      stdio: 'ignore',
      windowsHide: true,
    })
    await new Promise((resolve, reject) => {
      child.once('exit', resolve)
      child.once('error', reject)
    })
    console.log('auto-click', JSON.stringify({ dir, uri: 'dshnotify:?token=<uuid>&decision=allow-once' }))
  }
}

const outcome = await shown
clearInterval(keepAlive)
console.log('outcome', JSON.stringify(outcome))
notifier.clearAll()
process.exitCode = outcome.reason === 'action' ? 0 : 1
