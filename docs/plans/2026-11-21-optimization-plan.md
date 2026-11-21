# dsh-desktop-notify 优化计划书

> 日期：2026-11-21 · 基线：`@honorshine/dsh-desktop-notify@0.2.2`（外部提交 `3ba1d0b` 已占用 0.2.2）· 目标版本：`0.2.3`
>
> 原则：**不改动特色功能的行为契约**；只做修错、加法、可观测性与资源治理。全程不执行 `git commit` / `git push` / `npm publish`，每阶段结束后由人工审阅 `git diff`。

---

## 1. 目标

在保持以下六项特色功能不变的前提下，完成一轮可验证的优化：

1. 审批闭环：通知内按钮 → `dshnotify:` → 回填 `approval/request` waterfall。
2. 桌面端双平台：Windows WinRT / macOS terminal-notifier（DSH 桌面端不提供 Linux 安装包，Linux 路径已移除）。
3. 双提示音：交互提示音与通知铃声分离，交互音不受焦点门控。
4. 多客户端 presence：`clientId` 聚合、stale 过期、idle 判定、`whenPresent()` 竞速。
5. 回窗即撤：通知结果 / 用户回窗 / 请求中断三方竞速。
6. 原生配置：schemastery schema + `configForms` 设置页 + 根会话过滤 + 统一路由鉴权。

## 2. 非目标（本次不做）

- 不迁到渲染层通知、不接管侧栏排序、不引入 ffmpeg / 音效库 / 文本模板库。
- 不做 TypeScript / rolldown 迁移，不新增运行时依赖。
- 不做「点击定位到具体会话」「plan-review 独立开关」「tag 策略改造」：这三项依赖未验证的 DSH 接口或 WinRT 语义，单列到验证清单，验证通过后再排期。
- 不改 `app.asar` / Electron main / preload，不加 IPC。
- 不 commit、不 push、不发布。

## 3. 红线契约（每阶段回归检查）

| # | 契约 | 位置 |
|---|---|---|
| 1 | `approval/request` 监听保持 `prepend + global`，单条 pending，两按钮，返回值只允许 `allowed-once` / `rejected` / `unavailable` / `cancelled` | `index.js` |
| 2 | `dshnotify:` token 必须是本实例 UUID；decision 必须匹配白名单；rendezvous 目录不能被越权写入 | `lib/winrt.js`、`assets/activate.vbs` |
| 3 | 通知结果 / 回窗 / abort 三方竞速语义不变；回窗仍关闭 toast 并回退面板 | `index.js` |
| 4 | 交互提示音仍在 approval/question 时播放，不受焦点门控，800ms 去重，且不双响 | `index.js` |
| 5 | `Presence` 的多客户端、stale、`whenPresent()` 行为不变；只允许新增取消能力 | `lib/presence.js` |
| 6 | 子智能体仍不触发 turnEnd/error 提醒 | `lib/session.js` |
| 7 | 所有 `/desktop-notify/*` 路由仍先过 `connection.requestRejection` | `lib/routes.js` |

## 4. 阶段与步骤

### 阶段 0：基线与计划（本次）

- 运行基线测试：`node test/unit.test.js`（`node --test` 在当前沙箱会因 runner 子进程 `EPERM` 失败，故用直接执行）。
- 记录 `git status --short`，确认工作区只有上一轮报告文件。
- 产出本计划书。

**验收**：25 条测试全绿；工作区无未预期改动。

### 阶段 1：P0 正确性修复

| 步骤 | 改动 | 文件 |
|---|---|---|
| 1.1 | 新增 `questionDedupeKey()` 与 `DedupeWindow`，替代 2 秒全局时间槽 | `lib/dedupe.js`（新） |
| 1.2 | 新增 `UnreadTracker`：按会话计数、可清空、测试通知不计入 | `lib/unread.js`（新） |
| 1.3 | `agentErrorAt` 真正参与 idle 守卫（5 秒窗口） | `index.js` |
| 1.4 | 提问瀑布与 PTC 共用 `DedupeWindow`，key = 会话 + 摘要前 40 字，窗口 5 秒 | `index.js` |
| 1.5 | `unread` 改为 `UnreadTracker`；`reportPresence(focused)` 清空；测试通知不计数 | `index.js` |
| 1.6 | `Presence.waitForPresent()` 返回可取消 waiter；审批始终参与回窗竞速 | `lib/presence.js`、`index.js` |
| 1.7 | 超时后保留 400ms 宽限，避免边界点击被丢弃 | `lib/winrt.js` |
| 1.8 | 补测试：去重键、未读追踪、error 守卫、presence 取消 | `test/unit.test.js` |

**验收**：
- error 后 5 秒内的 idle 不产生「回复完成」。
- 两个会话 2 秒内各提一个问题，两条都提醒；同一问题双源只提醒一次。
- 同一会话连发 3 条提醒，角标=1；测试通知不改变角标。
- 超时前 100ms 点击按钮，稳定返回 action。
- 无 client 时打开窗口，toast 被关闭并回退面板。

### 阶段 2：P1 结束原因 + 回复摘要 + 文案预算

| 步骤 | 改动 | 文件 |
|---|---|---|
| 2.1 | 新增 `plainSummary()`：markdown 扁平化，预算 110 字，不切 ASCII 单词 | `lib/summary.js`（新） |
| 2.2 | 新增 `TurnCache`：`session/event` 的 `turn/end`、`assistant/message`、`session/disposed`，上限 64 | `lib/turns.js`（新） |
| 2.3 | `formatTurnEnd` 接受 `{ reason, text }` 与用时；按 `completed/blocked/max-tokens/aborted/interrupted/error` 出句 | `lib/messages.js` |
| 2.4 | 文案预算：标题 48、正文 120；保留 `truncate` 兼容现有测试 | `lib/messages.js` |
| 2.5 | `index.js` 订阅 `session/event`、维护 turn 缓存与 running 起始时间、idle 时取缓存 | `index.js` |
| 2.6 | 补测试：摘要、TurnCache、6 种结束文案、缺失缓存降级 | `test/unit.test.js` |

**验收**：
- 中止/拦截/超限/中断/错误不再写「回复完成」。
- completed 正文能看到最后一条回复的扁平化摘要；摘要为空时回退会话标题。
- `session/event` 不可见时缓存为空，行为与 0.2.1 一致。

### 阶段 3：P1 诊断面 + 音效治理

| 步骤 | 改动 | 文件 |
|---|---|---|
| 3.1 | 新增 `Diagnostics` 有界环（40 条） | `lib/diagnostics.js`（新） |
| 3.2 | 在 6 个抑制/失败点写诊断：onlyWhenHidden、pending 占用、无 client、发送失败、角标不支持、音效失败 | `index.js`、`client.js` |
| 3.3 | 新增 `GET /desktop-notify/debug`、`POST /desktop-notify/report`、`POST /desktop-notify/silence`，全部走 `rejected()` | `lib/routes.js` |
| 3.4 | `SoundPlayer` 登记在播 child、8 秒封顶、`stopAll()`；`dispose` 与 `/silence` 调用 | `lib/sound.js`、`index.js` |
| 3.5 | Client 在窗口 focus、`enabled=false`、`sound.mode='none'` 时调用 `/silence` | `client.js` |
| 3.6 | 补测试：诊断环上限、`stopAll` 空集合安全、路由形状 | `test/unit.test.js` |

**验收**：
- `/debug` 未通过连接鉴权时返回拒绝；通过时能看到最近决策与 `lastOutcome`。
- 3 分钟自定义 wav 播放 8 秒后停止；回窗后立刻静音。
- 诊断环不超过 40 条。

### 阶段 4：P2 性能与资源

| 步骤 | 改动 | 文件 |
|---|---|---|
| 4.1 | `#drain` 改为按需轮询：有 pending 才启动，清空后停止 | `lib/winrt.js` |
| 4.2 | Client 角标轮询只在窗口隐藏/失焦时运行，切后台立即刷新 | `client.js` |
| 4.3 | WinRT 身份解析预热：win32 且启用时，空闲预热一次 AUMID/协议 | `lib/winrt.js`、`index.js` |
| 4.4 | 补/调整测试：轮询生命周期（可用纯函数或伪 timer 覆盖的部分） | `test/unit.test.js` |

**验收**：
- 无 pending 时不再每 300ms 读 rendezvous 目录；有 pending 时点击延迟仍 ≤ 300ms。
- 前台聚焦时角标请求不再每 5 秒发；切后台立即拉一次。
- 首次审批 toast 不再等待 AUMID 解析（预热成功时）。

### 阶段 5：测试、文档与最终验收

| 步骤 | 改动 | 文件 |
|---|---|---|
| 5.1 | 版本升到 `0.2.3`，CHANGELOG 增加条目 | `package.json`、`CHANGELOG.md` |
| 5.2 | README / 中文 README 同步：结束原因文案、诊断路由、音效封顶、未读语义、宽限说明 | `README.md`、`docs/README.zh-CN.md` |
| 5.3 | 全量测试 + 语法检查 + `git diff --stat` 审阅 | — |

**验收**：
- `node test/unit.test.js` 全绿（本次实际 38 条，基线 25 条）。
- `node --check` 所有改动 JS 通过。
- `git status` 只包含预期文件；不 commit。
- 文档中的路由、字段、行为与代码一致。

## 执行偏差记录

1. 会话进行中外部任务提交了 `3ba1d0b feat: declare DSH host range in engines.dsh`，把版本推到 `0.2.2` 并写了同名 CHANGELOG 段；本计划改用 `0.2.3`，未覆盖该提交内容。
2. `node --test test/unit.test.js` 在当前沙箱因 runner 子进程 `EPERM` 失败；统一改用 `node test/unit.test.js`（DSH 沙箱下直接执行）。
3. 「点击定位会话」「plan-review」「tag 策略」按计划保持未做，仅记录在待验证项。
4. 追加平台收敛：DSH 桌面端只发布 Windows/macOS，移除 Linux（notify-send/paplay/canberra/aplay）代码与文档；非 Windows/macOS 平台返回不支持，macOS 仅做代码/单测层面验证。

## 5. 验证命令

```bash
node test/unit.test.js
node --check index.js
node --check client.js
for f in lib/*.js; do node --check "$f"; done
git diff --stat
git status --short
```

Windows 手工验收（最终由人工执行）：

1. 后台触发审批 → toast 带两按钮 → 分别点「拒绝」「允许一次」→ 面板结果正确。
2. 审批中切回窗口 → toast 关闭、回退面板。
3. 两个会话并发提问 → 两条提醒都到。
4. 触发一次失败 turn → 只有「会话出错」，没有「回复完成」。
5. 设置页发测试通知 → 角标不增加；真实提醒才增加。
6. 自定义长音频 → 8 秒停止；回窗立即静音。
7. `GET /desktop-notify/debug`（带连接凭据）返回诊断；不带凭据返回拒绝。
8. 切换设置项 → 插件重载后行为生效，审批进行中时避免改设置（已知限制）。

## 6. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| `session/event` 对根插件不可见 | 结束原因缓存为空 | 缓存缺失时完全降级到 0.2.1 文案；先打一条诊断确认 |
| 晚点击宽限改变超时时间线 | 超时晚 400ms | 常量集中；人工验收超时场景 |
| 未读改为会话级 | 角标语义变化 | 保留 focused 清零兜底；CHANGELOG 说明 |
| `waitForPresent` 可取消 | 竞速行为变化 | 不改 `whenPresent()` 旧行为；新增方法单独测试 |
| 按需轮询遗漏启动 | 按钮点击无响应 | `show()` 添加 pending 后立即 arm；`clearAll()` 停；测试覆盖 |
| 音效 kill 误伤 | 提示音被截断 | 只对文件播放登记；交互音单独上限；失败静默 |

回滚方式：每个阶段独立可回退；出错时按文件恢复（`git diff` 可见），不执行 `git reset --hard`。

## 7. 交付物

- 代码：`lib/` 新增 5 个模块，`index.js`、`client.js`、`lib/{messages,presence,routes,sound,winrt}.js` 修改。
- 测试：`test/unit.test.js` 扩充。
- 文档：本计划书、CHANGELOG、README / 中文 README。
- 最终 `git diff --stat` 与验收记录；**不提交、不推送**。

## 8. 执行记录

| 阶段 | 状态 | 备注 |
|---|---|---|
| 0 基线 | 完成 | 25 条测试通过；报告文件已在工作区 |
| 1 P0 | 完成 | 会话级未读、提问去重、error 守卫、晚点击宽限、回窗竞速；30 条测试 |
| 2 P1 内容 | 完成 | turn 缓存、摘要、6 种结束文案、文案预算；34 条测试 |
| 3 P1 诊断/音效 | 完成 | 诊断环、debug/report/silence 路由、音效封顶；36 条测试 |
| 4 P2 性能 | 完成 | 按需轮询、角标后台轮询、身份预热；36 条测试 |
| 5 文档/验收 | 完成 | 0.2.3、CHANGELOG/README 同步；38 条测试；未 commit |

## 9. 本地真实交互测试（Windows）

环境：Windows `10.0.26300`，DSH 桌面端运行中；测试使用临时 `LOCALAPPDATA` 隔离动作目录，测试前备份并在测试后恢复了 `HKCU\Software\Classes\dshnotify` 注册。

| 项 | 命令 | 结果 |
|---|---|---|
| WinRT toast + AUMID 解析 | `node scripts/winrt-probe.mjs 20 --auto` | `capabilities.available=true`，`appId=electron.app.DeepSeek Harness`（source=shortcut，validated=true，appLogo=true） |
| 通知按钮回传 | 同上，`activate.vbs` 模拟点击「允许一次」 | `outcome={"reason":"action","actionId":"allow-once","label":"允许一次"}` |
| 注册表恢复 | `reg import` 备份 | 恢复成功，协议仍指向已安装插件 |
| 音效播放 | `SoundPlayer.play({mode:'bundled'})` | `ok=true`，`playing=1` |
| 音效停止 | 播放后立即 `stopAll()` | `stopped=1` |
| macOS | 无 macOS 硬件 | 仅代码/单测层面验证（Mac 选项构造、`mapOutcome`、`afplay` 候选、声音校验） |

注意：真实测试需要 Node 启动 PowerShell/wscript，当前 DSH 沙箱会返回 `spawn EPERM`，本次通过一次性 `danger-full-access` 完成并在同一命令中恢复注册表。
