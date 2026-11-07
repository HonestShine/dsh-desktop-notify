/**
 * Session lineage helpers shared by the reminder listeners. The `origin` field
 * is present on DSH 0.2.x and marks subagent sessions; older headers may only
 * carry `parentSession`, which is retained as the conservative fallback.
 * @param {object | undefined} agent - Live Agent.
 * @returns {boolean} true when reminders should consider this Session a root.
 */
export function isRootSession(agent) {
  const header = agent?.session?.header
  if (header === undefined || header === null) return true
  if (header.origin === 'subagent') return false
  if (header.origin !== undefined) return true
  return header.parentSession === undefined
}
