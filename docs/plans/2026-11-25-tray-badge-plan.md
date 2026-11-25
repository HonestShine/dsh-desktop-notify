# 托盘未读态/闪烁：dsh-desktop-notify 借鉴计划书

- 日期：2026-11-25
- 输入：`docs/research/tray-badge-flash-benchmark-2026-11-25.md`
- 状态：**已废弃（2026-11-25 产品决定：不支持托盘闪烁、托盘角标、消息计数；阶段 1 代码已移除，0.2.4 仅保留移除记录）**
- 目标版本：插件 0.2.4（阶段 1）；DSH 核心契约另立 RFC（阶段 2）；插件适配 0.3.x（阶段 3）

---

## 1. 目标与非目标

### 1.1 目标

1. 让 DSH 的“未读”从**提醒条数**变成**注意等级**：审批/提问是 `action`，完成/错误是 `info`。
2. 在**不改 DSH 核心**的前提下，先把任务栏 badge 的语义做对，并预留托盘适配层。
3. 给出一个最小、可评审的 DSH 核心契约，让托盘能表达 `none / unread / action` 三态，并在未聚焦时闪烁。
4. 保持现有红线不变：审批闭环、跨平台、双提示音、多客户端 presence、回窗即撤、原生设置页/鉴权。

### 1.2 非目标

- 不在本仓库创建第二个托盘（Electron 插件侧也没有 Tray 权限）。
- 不复制 QQ 的“未读会话头像闪动”。
- 不复制钉钉的 worker/双 GUID/对账。
- 不做托盘数字角标（四款 IM 都不做）。
- 不改变审批 toast 的按钮、超时、回填链路。
- 不在本阶段改 DSH `app.asar` / `main` / `preload`。

---

## 2. 现状基线（代码事实）

| 位置 | 现状 |
|---|---|
| `lib/unread.js:11-65` | `UnreadTracker` 只有 `Map<string, number>`；`mark(key, at)`、`remove`、`clear`、`snapshot()`；上限 99；无 kind/level |
| `index.js:112` | `this.unreadSessions = new UnreadTracker()` |
| `index.js:600-621` | `#remind(copy, options)` 在 toast 成功（`outcome.reason !== 'error'`）后 `mark(options.key)` |
| `index.js:331-334` | question 提醒：`#remind(..., { key: sessionKey })` |
| `index.js:388-395` | turnEnd 提醒：`#remind(..., { key: #sessionKey(agent) })` |
| `index.js:407-417` | error 提醒：`#remind(copy, { key: #sessionKey(agent) })` |
| `index.js:442-540` | approval 接管：**没有** `unreadSessions.mark`；只在 `pendingApproval` 期间存在 |
| `index.js:190-195` | 聚焦 `this.unreadSessions.clear()` |
| `index.js:635-637` | `get unread() { return this.unreadSessions.size }` |
| `lib/routes.js` `/status` | 返回 `unread` 数字，无 badge 结构 |
| `client.js:1071-1150` | `startBadgeSync()` 轮询 `/status`，`navigator.setAppBadge(unread)`；隐藏/失焦才轮询，聚焦本地清 |
| `client.js:1105-1129` | `shouldPoll()` + 5s interval；聚焦时 `clearAppBadge()` |

**关键事实**：当前 badge **不包含 approval**，只包含 question/turnEnd/error 三类提醒；所以“审批优先”在 badge 上并不存在。

---

## 3. 方案总览

```
事件层            UnreadTracker                 Host /status              Client
approval  ─┐
question  ─┼─> kind + level + at  ──> badge {level,count} ──> setAttention()
turnEnd   ─┤                                                   ├─ dshDesktop.setAttention (核心可用)
error     ─┘                                                   └─ navigator.setAppBadge (回退)
```

- **阶段 1（本仓库，可独立发布）**：数据模型 + badge 语义 + 适配层 + 诊断 + 测试。托盘仍无。
- **阶段 2（DSH 核心仓库）**：`DesktopTray.setAttention` + 3 张 ico + flash 策略 + preload。
- **阶段 3（本仓库）**：接核心 API，加“托盘未读态/闪烁”开关，联调。

---

## 4. 阶段 1：插件 0.2.4（不改核心）

### 4.1 数据模型

把 `UnreadTracker` 的 value 从 `number` 改为 `{ at, kind, level }`，保持 `mark(key, at)` 兼容：

```js
// lib/unread.js
const KIND_LEVEL = {
  approval: 'action',
  question: 'action',
  error: 'info',
  turnEnd: 'info',
}

mark(key, at = Date.now(), kind = 'turnEnd') {
  const id = ...
  const level = KIND_LEVEL[kind] ?? 'info'
  this.#entries.set(id, { at, kind, level })
  ...
}
```

新增 API：

```js
snapshot() {
  return {
    count: this.size,
    actionCount: entries.filter(e => e.level === 'action').length,
    sessions: [...this.#entries.keys()],
    byKind: { approval, question, error, turnEnd },
    hasAction: entries.some(e => e.level === 'action'),
    level: hasAction ? 'action' : (size > 0 ? 'info' : 'none'),
  }
}
```

优先级：

| level | kind | 是否计入 badge（建议） |
|---|---|---|
| `action` | `approval` / `question` | 是 |
| `info` | `error` / `turnEnd` | 否（可发通知，仍进 `/status`） |
| `none` | — | 清空 |

> `error` 是否算 `action` 是产品决策；本计划默认 `info`，因为 error 不需要用户立即决策，但需要被看见。若希望 error 也红点，改 `KIND_LEVEL.error = 'action'` 即可。

### 4.2 事件接线

1. **approval**（新增）  
   在 `#handleApproval` 中，`pendingApproval` 建立后、`notifier.show` 前：
   ```js
   const sessionKey = this.#sessionKey(request?.agent)
   this.unreadSessions.mark(sessionKey, Date.now(), 'approval')
   ```
   - 在 `#closePending` / 所有 return 分支 / `finally` 中 `remove(sessionKey)`。
   - 只在“确实要弹 toast”的路径 mark；`onlyWhenHidden` 且窗口存在时提前 return，不 mark。
   - toast 失败（`outcome.reason === 'error'`）也 remove。
   - 这样 badge 的“审批”与实际待决策状态一致，不会因为审批 30 秒超时残留。

2. **question**：`#remind(copy, { key, kind: 'question' })`，把 `kind` 传进 `mark`。

3. **turnEnd**：`#remind(..., { key, kind: 'turnEnd' })`。

4. **error**：`#remind(copy, { key, kind: 'error' })`。

5. **`#remind` 签名**：
   ```js
   async #remind(copy, { sound, silent, key, kind = 'turnEnd' } = {}) { ... }
   ...
   this.unreadSessions.mark(options.key, Date.now(), kind)
   ```
   注意保持 `options.key` 为空时的兜底行为（`UnreadTracker` 会把空 key 转成 `'unknown'`）。

### 4.3 `/status` 与诊断

`index.js:140-173` 增加（保持 `unread` 兼容）：

```js
unread: this.unreadSessions.size,
badge: {
  scope: this.config.badge.scope,
  ...this.unreadSessions.snapshot(),
},
```

`debugReport()` (`index.js:288-300`) 已经返回 `unreadSessions: snapshot()`；扩展后自动带 `level/hasAction/byKind`，无需额外路由。

`lib/routes.js` 不需要改路由；`/status` 是既有 JSON，新增字段向后兼容。

### 4.4 Client 适配层

在 `client.js` 的 `startBadgeSync()` 里：

```js
const attention = status?.badge ?? {
  count: Number(status?.unread ?? 0),
  level: Number(status?.unread ?? 0) > 0 ? 'info' : 'none',
  hasAction: false,
}
const badgeCount = attention.scope === 'action'
  ? Number(attention.actionCount ?? 0)
  : Number(attention.count ?? 0)
const level = badgeCount > 0 ? attention.level : 'none'
applyAttention({ level, count: badgeCount })
```

抽一个模块级函数：

```js
function applyAttention(state) {
  const api = window.dshDesktop
  if (api && typeof api.setAttention === 'function') {
    try { api.setAttention(state); return 'desktop' } catch { /* fall through */ }
  }
  const count = Number(state?.count ?? 0)
  if (state?.level === 'none' || count <= 0) {
    navigator.clearAppBadge?.()
  } else {
    navigator.setAppBadge?.(count)
  }
  return 'web'
}
```

行为：

- **核心 API 未上线**：`window.dshDesktop` 不存在，回退 `setAppBadge`；默认 `scope='all'` 时数字与 0.2.3 一致，`scope='action'` 时只显示 action 数。
- **核心 API 上线**：直接调 `setAttention`，由主进程决定托盘/badge；renderer 不再重复 `setAppBadge`。
- **聚焦**：保持 `reconcile()` 里的本地清空，但同时调用 `applyAttention({ level:'none', count:0 })`，让核心托盘也能撤。
- **失败**：保留 `reportDiagnostic('badge sync failed')`；`setAttention` 抛错时降级到 web badge，并上报一次。

### 4.5 配置与兼容

新增（建议放 `lib/config.js` 顶层，而不是 `events` 下）：

```js
badge: z.object({
  scope: z.union(['all', 'action']).default('all')
    .description('Which unread kinds count toward the app badge.').volatile(),
}).default({ scope: 'all' }),
```

- **0.2.4 默认 `all`**，完全保留旧行为，避免升级后 badge 突然变少。
- 文档说明 `action` 是推荐值；0.3 再评估是否改默认。
- 若不想加配置，也可先只做 `badge` 字段与适配层，数字仍用 `unread`；但这样就还没有“审批优先”，所以建议加。

### 4.6 测试

在 `test/unit.test.js` 增加（保持现有 38 条全绿）：

1. `UnreadTracker.mark` 默认 kind=`turnEnd`，`snapshot().level='info'`。
2. `mark(..., 'approval')` → `level='action'`、`hasAction=true`、`byKind.approval=1`。
3. 同会话 approval + turnEnd：只 1 个 session，`level='action'`。
4. `remove` / `clear` 后 `level='none'`、`byKind` 归零。
5. 上限 99 仍生效；淘汰最旧。
6. `/status` 返回 `badge` 且 `unread` 不变（Host 层测试，若现有测试架构可覆盖）。
7. `applyAttention` 的回退分支：mock `navigator.setAppBadge/clearAppBadge` 断言 count；mock `window.dshDesktop.setAttention` 断言优先调用。
8. approval 路径：模拟 `#handleApproval` 开始/结束，断言 mark/remove（若难以单测，至少用 `debugReport` 集成测试）。

运行方式沿用：`node test/unit.test.js`（沙箱下 `node --test` 的 runner 会 `spawn EPERM`）。

### 4.7 文档与版本

- `README.md` / `README.zh-CN.md`：说明 badge 现在可配置为“只计需要决策的会话”；托盘态尚未提供。
- `CHANGELOG.md`：0.2.4 条目，注明“badge 新增 kind/level 元数据；默认行为不变”。
- 不新增依赖。

### 4.8 验收标准（阶段 1）

- [ ] 38 + 新增测试全绿；`node --check` 所有改动 JS 通过。
- [ ] 审批弹出时 `/status.badge.level === 'action'`，审批结束/超时/回填后回到 `none`（或剩余其他 kind）。
- [ ] question 弹出时 `level='action'`；turnEnd/error 为 `info`。
- [ ] 默认配置下 badge 数字与 0.2.3 完全一致（scope='all'）。
- [ ] `scope='action'` 时 badge 只随审批/提问变化。
- [ ] 聚焦后 badge 清空；再失焦收到新事件能重新出现。
- [ ] `window.dshDesktop.setAttention` 的 mock 被优先调用；不存在时回退 `setAppBadge`。
- [ ] 不改变审批 toast 的按钮、超时、回填结果。

---

## 5. 阶段 2：DSH 核心契约（跨仓库，另立 RFC）

> 本阶段不在 `dsh-desktop-notify` 仓库实施。没有这个契约，插件层无法控制托盘。

### 5.1 最小 API

```ts
// main: DesktopTray
type AttentionLevel = 'none' | 'info' | 'action'

interface AttentionState {
  level: AttentionLevel
  count?: number
}

class DesktopTray {
  setAttention(state: AttentionState): void
}
```

IPC：

```ts
ipcMain.handle('desktop:set-attention', (event, state) => {
  if (!isTrustedRenderer(event.senderFrame)) return
  tray.setAttention(sanitize(state))
})
```

preload：

```ts
contextBridge.exposeInMainWorld('dshDesktop', {
  setAttention: (state) => ipcRenderer.invoke('desktop:set-attention', state),
})
```

### 5.2 托盘行为

| 输入 | 图标 | 闪烁 |
|---|---|---|
| `level='none'` | `tray.ico` | `flashFrame(false)` |
| `level='info'` | `tray.ico`（或 `tray-info.ico`，可选） | 不闪 |
| `level='action'`，窗口未聚焦 | `tray-action.ico` | `flashFrame(true)` |
| `level='action'`，窗口已聚焦 | `tray-action.ico` | 不闪 |
| 点击托盘 | 保持当前态 | `flashFrame(false)` + `focusPrimaryWindow()` |

- `action` 图标建议：DSH 鲸鱼 + 右上角红点/感叹号；不要数字。
- `info` 是否单独图标由设计定；最小实现可复用 `tray.ico`，只靠任务栏 badge 表达 info。
- `flashFrame` 只对 `action` 且未聚焦；聚焦/`none` 立即停；不新增自建定时器。
- `TaskbarCreated` 由 Electron Tray 处理；不建 Shell worker。

### 5.3 资产

- `resources/tray.ico`（现有，64×64，黑鲸鱼白底）
- `resources/tray-action.ico`（新增）
- 可选 `resources/tray-info.ico`
- 每个 ico 至少 16/20/24/32/48/64/128/256；红点直径 28–31%，右上角，允许 1–2px 出血。
- 颜色用 DSH 品牌强调色；不要纯红 `#FF0000`。参考：钉钉 `#FF5219`、飞书 `#F05B56`。

### 5.4 安全与兼容

- 只接受主窗 / 已授权插件的 sender；拒绝任意 `webContents`。
- `state` 做白名单校验（level 枚举、count 0–999）。
- 无 `setAttention` 时保持现有单图标行为。
- macOS 没有 DSH 托盘（`DesktopTray` 仅 win32 创建）；macOS 继续用 Dock badge，不要让插件误以为有托盘。

### 5.5 验收（阶段 2）

- [ ] Windows 10/11 托盘在三种状态间切换，无第二个托盘图标。
- [ ] 未聚焦 `action` 闪烁；聚焦/点击/`none` 停止；不无限闪。
- [ ] Explorer 重启后托盘恢复，状态不丢。
- [ ] 100/125/150/200% DPI 下红点不糊、不出血过多。
- [ ] 高对比度主题下图标仍可辨。
- [ ] 不改变现有 `DesktopUpdateAttention` 的更新提醒行为。

---

## 6. 阶段 3：插件接核心（0.3.x）

1. `applyAttention` 已存在，无需改调用点；把 `setAttention` 的返回值/错误纳入诊断。
2. 新增配置：
   ```js
   tray: z.object({
     enabled: z.boolean().default(true),
     flash: z.boolean().default(true),
   }).default({ enabled: true, flash: true }),
   ```
   仅当核心 API 存在时显示/生效；否则设置页灰显并提示“当前 DSH 版本不支持托盘状态”。
3. 设置页文案：
   - “托盘显示未读状态（需要 DSH 0.3+）”
   - “需要决策时闪烁任务栏/托盘”
4. 诊断：`/desktop-notify/debug` 增加 `badge.transport: 'desktop' | 'web'`。
5. 联调矩阵见 §8。

---

## 7. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| badge 语义变化让用户以为“漏提醒” | 中 | 0.2.4 默认 `scope='all'`；CHANGELOG 明示；0.3 再评估默认 |
| approval 标记后超时残留 | 中 | 所有 return/finally 路径 remove；`debugReport` 可查 |
| 多客户端 presence 导致误清 | 低 | 保持现有“任一聚焦即清”语义；不改 presence |
| 核心不接受契约 | 高 | 阶段 1 仍可独立发布；托盘作为 RFC，不阻塞插件 |
| 闪烁疲劳 | 中 | 只 `action` 闪；聚焦即停；提供开关；不无限闪 |
| 托盘图标 DPI/对比度 | 中 | 多尺寸 ico；真机 100–200% 验收 |
| 第二个托盘 | 高 | 插件侧不建 Tray；核心唯一 owner；代码评审红线 |
| IPC 被任意 renderer 调用 | 高 | sender 校验 + 状态白名单 |

**回滚**：阶段 1 可用 `badge.scope='all'` + 不调用 `setAttention` 回退；阶段 3 可关 `tray.enabled`；核心可移除 `setAttention` 调用点，不影响现有单图标。

---

## 8. 联调/验收矩阵

| 场景 | 预期 |
|---|---|
| Windows 10 100%，审批弹出，窗口隐藏 | 托盘 action 态 + 闪烁；badge=action 数 |
| 点击审批 toast 的“允许一次” | 审批回填；托盘/ badge 在 1 帧内恢复 |
| 审批 30s 超时 | 回填 `timeout`；角标状态清除；无残留 |
| 审批期间聚焦窗口 | toast 撤回；角标状态清除；闪烁停 |
| question 弹出 | action 态；badge 计数 |
| turnEnd | info；不发 badge（scope=action）；通知仍发 |
| error | info；不发 badge（scope=action）；通知仍发；随后 idle 不重复完成 |
| 多会话同时有未读 | badge 显示会话数；托盘只表达最高 level |
| 关闭“托盘未读态” | 托盘保持静态；badge 仍工作 |
| Explorer 重启 | 托盘恢复；状态不丢 |
| 125/150/200% DPI | 红点清晰；不遮挡鲸鱼主体 |
| macOS | 无托盘；Dock badge 仍工作；设置页提示不支持托盘 |

---

## 9. 工作量估算

| 阶段 | 内容 | 估算 |
|---|---|---|
| 1 | `UnreadTracker` + 事件接线 + `/status` + client 适配 + 测试/文档 | 1–2 人日，约 150–250 行（含测试） |
| 2 | DSH 核心 `DesktopTray` + IPC + 资产 + 测试 | 3–5 人日（核心仓库） |
| 3 | 插件开关 + 诊断 + 联调 | 1–2 人日 |
| 合计 | | 5–9 人日，不含设计出图 |

---

## 10. 决策点

1. **badge 默认语义**：已定为 `all`，0.3 再评估 `action`。
2. **error 算不算 action**：已定为 `info`；要红点只需改 `KIND_LEVEL.error` 一行。
3. **托盘状态是否值得进 DSH 核心**：未定；阶段 1 已可独立交付，阶段 2/3 待核心确认。
4. **托盘图标风格**：未定；建议红点，不做 `info` 单独图标。
5. **闪烁策略**：已定为只 `action` 闪，`info` 不闪。

---

## 11. 交付物

- 本计划书：`docs/plans/2026-11-25-tray-badge-plan.md`
- 差异清单：`docs/research/tray-badge-flash-benchmark-2026-11-25.md`
- 阶段 1 代码：`lib/unread.js`、`lib/config.js`、`lib/normalize.js`、`index.js`、`client.js`、`test/unit.test.js`
- 阶段 1 文档：`README.md`、`docs/README.zh-CN.md`、`CHANGELOG.md`
- 原始逆向笔记：`D:\Temp\dsh-YblLlQ\rea\notes\{wechat,qq,feishu,dingtalk}-deep.md`
- 图标样本：`D:\Temp\dsh-YblLlQ\rea\icons\`

> 阶段 1 的改动未自动提交；提交前需展示 `git diff --stat` 并确认。阶段 2 不在本仓库实施。
