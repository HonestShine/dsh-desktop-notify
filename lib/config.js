import z from '@deepseek-ai/schemastery'
import { normalizeConfig } from './normalize.js'

export { normalizeConfig }

/**
 * Host configuration for the desktop notification service. Every field is
 * user-editable through the Client settings section; the entry id
 * (`desktop-notify`) is also the settings namespace the Client writes to.
 */
export const Config = z.object({
  enabled: z.boolean().default(true).description('Enable desktop notifications.').volatile(),
  approval: z.object({
    enabled: z.boolean().default(true).description('Show permission requests as actionable notifications.').volatile(),
    onlyWhenHidden: z.boolean().default(true).description('Only take over approval while the app window is not focused.').volatile(),
    timeoutSeconds: z.number().min(5).max(300).default(30).description('Seconds to wait for a notification decision.').volatile(),
  }).default({
    enabled: true,
    onlyWhenHidden: true,
    timeoutSeconds: 30,
  }),
  events: z.object({
    question: z.boolean().default(true).description('Notify when the agent asks a question.').volatile(),
    turnEnd: z.boolean().default(true).description('Notify when a turn finishes.').volatile(),
    errors: z.boolean().default(true).description('Notify when a turn fails.').volatile(),
    onlyWhenHidden: z.boolean().default(true).description('Only show the three reminders while the app window is not focused.').volatile(),
  }).default({
    question: true,
    turnEnd: true,
    errors: true,
    onlyWhenHidden: true,
  }),
  sound: z.object({
    mode: z.union(['system', 'bundled', 'custom', 'none']).default('bundled').description('Notification sound source.').volatile(),
    file: z.string().default('').description('Absolute path to a custom audio file.').volatile(),
    systemName: z.string().default('').description('Optional platform sound name override.').volatile(),
  }).default({
    mode: 'bundled',
    file: '',
    systemName: '',
  }),
  windows: z.object({
    appId: z.string().default('').description('Optional AppUserModelID override for Windows toasts; empty auto-detects the installed app shortcut.').volatile(),
    duration: z.union(['short', 'long']).default('long').description('Windows toast lifetime.').volatile(),
  }).default({
    appId: '',
    duration: 'long',
  }),
  macos: z.object({
    customNotifierPath: z.string().default('').description('Optional path to a custom terminal-notifier build.').volatile(),
  }).default({
    customNotifierPath: '',
  }),
  presence: z.object({
    staleSeconds: z.number().min(30).max(600).default(120).description('How long a browser presence report stays valid.').volatile(),
    idleSeconds: z.number().min(0).max(3600).default(180).description('Treat a focused but idle window as away after this many seconds; 0 disables.').volatile(),
  }).default({
    staleSeconds: 120,
    idleSeconds: 180,
  }),
})
