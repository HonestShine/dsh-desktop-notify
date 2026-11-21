# 两个同类通知插件 vs 当前项目：差异报告

> 调研时间：2026-11-21 · 当前基线：`@honorshine/dsh-desktop-notify@0.2.1` · 上游快照：仓库 A `dsh-notify-desktop@0.2.5`（`6bce5eb`）、仓库 B `dsh-plugin-desktop-notify@0.6.5`（`626148f`）
>
> 方法：两个子 Agent 分别全量精读 A / B，产出逐条带 `文件:行号` 的笔记；主 Agent 独立读当前项目源码并抽查上游关键结论。所有结论标注证据，未实测的部分单列在第 9 节。
>
> 与 `docs/research/competitor-notify-plugins.md`（2026-11-19）的关系：那份是 v0.1.3 基线，它推荐的 A1（AUMID 多候选）、A2（PowerShell 绝对路径 + 失败可见）、A3（角标）、B2（程序化提问）已在 0.2.0 落地。本报告**去重后**只谈尚未吸收的差异。

---

## 0. 结论先行

1. **A 与 B 都不是审批闭环插件**：A 的 Windows 主路径只有「点击回前台」（渲染层兜底通知才带会话跳转），B 只有「点击回会话」；把通知按钮的决策交回 `approval/request` 的仍然只有当前项目。这是产品定位差异，不是功能落后。
2. **A 值得学的是「通知内容质量 + 可配置性 + 工程闸门」**：`turn/end.reason` 的 5 种结束（DSH 实际有 6 种，A 漏了 `interrupted`）、回复摘要扁平化、每情况音效/文案、催办三模式、诊断环、155 条测试。
3. **B 值得学的是「会话级语义 + 点击落点 + 失败互斥」**：按会话粘性未读（角标=需要你的会话数）、点通知定位到具体会话、error 后不再补一条「完成」、结束原因在 Host 事件点缓存。
4. **当前项目真正剩下的高价值缺口只有四个**：结束原因与正文摘要（现在永远写「回复完成」）、error 后可能重复一条完成、提问去重是 2 秒全局时间槽（并发提问会吞）、未读是「提醒条数」而非「会话数」。
5. **两个已确认的代码级问题**：`agentErrorAt` 只写不读（死状态，`index.js:86/288/302`）；`#takeQuestionSlot` 的 2 秒全局窗口会吞掉第二个会话的提问（`index.js:413-418`）。
6. **明确不跟进**：迁到渲染层通知、TS/rolldown 迁移、ffmpeg 转码、文本模板库、接管侧栏排序、自建 token/队列外部接口。

---

## 1. 拉取与核对

### 1.1 快照

| 项 | 仓库 A | 仓库 B |
|---|---|---|
| 本地路径 | `D:\Temp\dsh-rixLch\upstream\paleech0-dsh-notify-desktop` | `D:\Temp\dsh-rixLch\upstream\chendaleiQ-dsh-plugin-desktop-notify` |
| 版本 | `dsh-notify-desktop@0.2.5` | `dsh-plugin-desktop-notify@0.6.5` |
| HEAD | `6bce5eb80eb28a3d17965cf9295eb57154570f9f` | `626148f05ee8a9de818e9f9e59b59f51faa2cfcf` |
| 提交时间 | 2026-11-19 | 2026-11-08 |
| 规模 | `src/` 7849 行 + 测试 2233 行，TypeScript | `index.js` 544 + `lib/client.js` 998 = 1542 行，纯 JS |
| 许可证 | MIT | MIT |

环境偏差：本机 DSH 自带 git（niugit + schannel）连 GitHub 报 `SEC_E_NO_CREDENTIALS`，改用机器上已有的 PortableGit 2.55 + `http.sslBackend=openssl` 完成浅克隆；未安装依赖、未运行仓库代码。

A 的 HEAD 已从旧调研记录的 `9ddf3ac` 前进到 `6bce5eb`（提交主题是 rc.5 兼容性验证；浅克隆无法列出中间全部差异）。B 与旧调研记录完全一致。

### 1.2 精读笔记

- A：`D:\Temp\dsh-rixLch\notes\A-paleech0-notes.md`（555 行）
- B：`D:\Temp\dsh-rixLch\notes\B-chendaleiQ-notes.md`（373 行）

### 1.3 主 Agent 抽查核验

| 结论 | 证据 | 结果 |
|---|---|---|
| A 的 `/debug` 与 `/questions` 是裸 GET，无鉴权 | A `src/index.ts:300-308`、`:1318-1328` | 属实（只校验 method） |
| B 的 host 半边在发布 patch 里默认关闭 | B `cordis.patch.yml:14-19`、`index.js:31` | 属实 |
| B 点通知走 `uiWorkspace.openSession` 并三级降级 | B `lib/client.js:446-480`、`:594-636` | 属实 |
| 当前项目 `agentErrorAt` 只写不读 | `index.js:86/288/302`，全仓无读取点 | 属实 |
| 当前项目自定义音效没有播放封顶、没有句柄 | `lib/sound.js:115-153` | 属实 |
| 当前项目 tag 是 `dn<计数>`，进程重启归零 | `lib/winrt.js:405` | 属实 |

---

## 2. 三个项目的定位差异

| 维度 | 当前项目 0.2.1 | A（paleech0 0.2.5） | B（chendaleiQ 0.6.5） |
|---|---|---|---|
| 运行位置 | Host `Service`（`index.js:26-92`） | Host 投影 + Client 决策，Host 发 toast | Host 薄壳（默认关）+ Client 主体 |
| 通知通道 | WinRT toast / terminal-notifier | 仅 Windows WinRT toast | 渲染层 `new Notification()` |
| 能否在通知里审批 | **能**：按钮 → `dshnotify:` → 回填 waterfall | 不能，主路径点击只回前台 | 不能，点击回会话 |
| 事件来源 | 6 个 Host hook 直订 | `notify` 会话投影（纯 fold） | 渲染层 `sessionStatus` + `sessions.list` 边缘检测 |
| 内容来源 | 会话标题 / 事件字段 | 投影里的 `turn/end.reason` + 回复正文 | 结束后再查 Host 的 `/turn` 路由 |
| 配置位置 | Host schema + 原生设置页 | Client `localStorage` + Host 磁盘库 | Client `localStorage`，无设置页 |
| 平台 | Windows / macOS | 仅 Windows | Client 三平台，Host 兜底仅 macOS |
| 规模 | 4079 行（含 396 行测试），25 测试 | 10082 行（含 2233 行测试），155 测试 | 2316 行（含 660 行测试） |

一句话：**A 是「Windows 通知体验工程」，B 是「渲染层会话提醒 + 跳转」，当前项目是「审批决策闭环工程」。三者的交集只有「弹一条系统通知」。**

---

## 3. 架构差异

### 3.1 事件入口：投影 vs 直订 vs UI store

**A：把会话日志折成一个纯投影。**

- 只注册一个 `notify` 投影（A `src/projection.ts:384-398`），fold 覆盖 `turn/start`、`assistant/message`、`turn/end`、`approval/asked|decided`、`tool/call`、`tool/ptc-dispatch-start|dispatch`、`tool/result`、`user/message`（A `src/projection.ts:222-336`）。
- `turn/end` 直接落 `{turn, reason.kind, body}`（A `src/projection.ts:245-255`）；`assistant/message` 累积正文并按 400 字截断（`:234-244`）。
- 不关心的事件必须返回同一个 state 引用，因为 registry 用 `Object.is` 判变更（A `src/projection.ts:1-11`、`:333-334`）。
- 好处：**事件源完整**——超时提问仍挂起、fork 继承跳过、回复正文和结束原因都在一个 switch 里看得见。

**B：Host 只订 `session/event` 记两份缓存，决策全在渲染层。**

- Host 在 `turn/end` 时写 `lastTurnEnds: Map<sessionId,{kind,at}>`（B `index.js:432-446`），在 `assistant/message` 时记最近一条文本（`:448-458`）。
- 渲染层读 `uiSession.sessionStatus` + `sessions.list`，用 `previous` Map 做边缘检测（B `lib/client.js:650-683`）。

**当前项目：Host 直接订 6 个事件。**

- `approval/request`（`prepend+global`）、`user-questions/request`、`tool/ptc-dispatch-start|dispatch`、`agent/status`、`agent/error`、`agent/disposed`（`index.js:231-305`）。
- 优点：审批必须在这里接管，天然就在瀑布上；缺点：**拿不到 `turn/end.reason`，也拿不到回复正文**，新增事件源没有一张「完整清单」可对照。

结论：不需要照搬 A 的投影（我们不在渲染层决策，也拿不到投影的 wire），但**应该借 B 的最小做法**——在 Host 订 `session/event`，把 `turn/end.reason` 和最后一条 assistant 文本缓存下来，供现有的 `agent/status` 提醒使用。

### 3.2 决策位置：宿主 vs 渲染层

| | 当前 | A | B |
|---|---|---|---|
| 「弹不弹」 | Host：`#shouldRemind` + presence 竞速 | Client：`decideNotification`（A `src/client/decision.ts:167-184`） | Client：`sync()` 边缘检测（B `lib/client.js:650-746`） |
| 「怎么弹」 | Host：WinRT/terminal-notifier | Host：`POST /dsh-notify/toast` → PowerShell（A `src/client/notifier.ts:176-195`） | Client：`new Notification()`（B `lib/client.js:588`） |
| 焦点判定 | Client 心跳上报的 `Presence`（多客户端 + idle） | Host 问 OS `GetForegroundWindow`（A `src/index.ts:158-195`） | Client `document.hasFocus()` + `visibilityState`（B `lib/client.js:247-274`） |
| 回窗即撤 | 有：`Promise.race` 里放 `whenPresent()`（`index.js:350-368`） | 无 | 无 |

当前项目的决策位置是**正确的**：审批需要阻断并回填，只有 Host 能做；A/B 都在渲染层，注定拿不到「点击结果」这条回传通道。

### 3.3 通知通道与点击落点

| | 当前 | A | B |
|---|---|---|---|
| Windows | 自建 `winrt-toast.ps1`，base64 XML（`lib/winrt.js:394-450`） | 内联 PowerShell，XML 走环境变量（A `src/index.ts:1018-1084`） | 不适用 |
| 通知身份 | 4 级候选 + `Setting` 校验 + `appIdValidated`（`lib/winrt.js:272-378`） | 2 候选 + `Setting`，子进程打印所选 id（A `src/aumid.ts:16-41`） | 无 |
| 按钮 | 审批两键，protocol 回传（`lib/winrt.js:160-163`） | 无按钮 | 无按钮 |
| 点击 | `dsh://open` 回前台（`index.js:511-525`） | 主路径 `dsh://open` 回前台（A `src/index.ts:994-996`）；渲染层兜底通知可 `openSession`（A `src/client/navigate.ts:36-47`） | `uiWorkspace.openSession(sessionId)` 定位会话（B `lib/client.js:446-480`） |
| 通知头图标 | `appLogoOverride` + `resources/icon.png`（`lib/winrt.js:124-140`） | 靠 AUMID 注册的显示名 | 应用自身图标 |
| tag 策略 | `dn<自增>`，每次唯一（`lib/winrt.js:405`） | 按 turn/request/reminder 分三种（A `src/client/notifier.ts:99-116`） | 不传 tag（B `lib/client.js:584-588`） |

点击落点是当前项目**最明显的交互差距**。但 B 自己也不信任 `openSession`（三级降级 + 150/60/300ms 重试），落地前必须先验证（第 9 节 V2）。

### 3.4 未读与角标

- 当前：`unread` 是**提醒条数**，每条提醒 +1、测试通知也 +1（`index.js:184`、`:455`），任意 focused presence 直接清零（`index.js:161`），客户端 5 秒轮询 `/status` 写 `setAppBadge`（`client.js:1069-1111`）。
- B：`attention: Map<sessionId, {...}>`（B `lib/client.js:312`），角标 = `attention.size`，**只有 `isLooking()`（主视图 + 有焦点 + 可见）才删该会话条目**（B `lib/client.js:428-439`、`:701-723`）。角标语义是「需要你的会话数」。
- A：没有角标。

B 的语义更准：同一个会话连发 3 条提醒不该显示 3；窗口聚焦但正在看别的会话也不该全清。第一步可以先做 Host 侧 `Map<agentId, …>`（角标=会话数、测试通知不计入），精确「看过才清」需要 Client 上报 `activeSessionId`，属第二阶段。

---

## 4. 能力矩阵

图例：✅ 完整 · 🟡 部分/有替代 · ❌ 无。

| # | 能力 | 当前 | A | B | 证据 |
|---|---|---|---|---|---|
| 1 | Host 常驻，关窗仍能通知 | ✅ | ✅ | ❌ | 当前 `index.js:26-92`；B 主体在 renderer（`lib/client.js:13-16`） |
| 2 | 通知内审批决策 | ✅ | ❌ | ❌ | 当前 `index.js:313-388`、`lib/winrt.js:536-584` |
| 3 | 点击回前台 | ✅ | ✅ | ✅ | 当前 `index.js:511-525`；A `src/index.ts:59-71` |
| 4 | 点击定位到具体会话 | ❌ | 🟡 仅渲染层兜底通知 | ✅ | A `src/client/navigate.ts:36-47`（Host toast 不带会话）；B `lib/client.js:446-480` |
| 5 | 结束原因细分 | ❌ | ✅ 5 种（漏 `interrupted`） | 🟡 3 种且 error 说成完成 | A `src/projection.ts:245-255`、`src/client/decision.ts:20-31`；B `lib/client.js:563-568` |
| 6 | 通知正文=回复摘要 | ❌ | ✅ markdown 扁平化 78 字 | ✅ 首行 + 140 字 | A `src/client/summary.ts:18-52`；B `index.js:347-355` |
| 7 | 完成用时 | ❌ | ❌ | ✅ | B `lib/client.js:127-134`、`:692-698` |
| 8 | 提问（含 run_code 内） | ✅ | ✅ | ✅ | 当前 `index.js:237-265`；A `src/projection.ts:285-316` |
| 9 | plan-review 独立识别 | ❌ | ✅ | ✅ | A `src/scenarios.ts:42-46`；B `lib/client.js:709-712` |
| 10 | 子智能体过滤 | ✅ | ❌ | ✅ | 当前 `lib/session.js:8-14`；B `lib/client.js:659-663` |
| 11 | 冷启动不重放历史 | 🟡 事件驱动 | ✅ 首见 seed + 60s | ✅ 首见 seed | A `src/client/runner.ts:18-46`；B `lib/client.js:665-683` |
| 12 | 跨源提问去重 | 🟡 2s 全局时间槽 | ✅ 摘要前缀 + 5s | ✅ 边缘检测 | 当前 `index.js:413-418`；A `src/client/runner.ts:73-75` |
| 13 | AUMID 多候选 + 校验 | ✅ 4 级链 | ✅ 2 候选 | ❌ | 当前 `lib/winrt.js:272-378`；A `src/aumid.ts:16-41` |
| 14 | 通知按钮协议自修复 | ✅ | ❌ | ❌ | 当前 `lib/routes.js:186-200` |
| 15 | 每情况音效 | ❌ 单一铃声 | ✅ 9 情况 | ❌ | A `src/types.ts:264-313` |
| 16 | 音效库（导入/改名/删除） | ❌ 手填路径 | ✅ | ❌ | A `src/index.ts:256-293`、`:506-569` |
| 17 | 非 wav 自定义音效 | 🟡 macOS 交给 afplay | ✅ ffmpeg 转码缓存 | ❌ | A `src/index.ts:929-948` |
| 18 | 音效播放封顶/立即停 | ❌ | ✅ 8s + `/silence` | ❌ | A `src/index.ts:121`、`:225-246` |
| 19 | 交互提示音（与铃声分离） | ✅ | ❌ | ❌ | 当前 `index.js:69-78`、`:426-435` |
| 20 | 仅提示音模式 | ❌ | ✅ | ❌ | A `src/client/decision.ts:130-132` |
| 21 | 催办 once/repeat/sticky | 🟡 只有审批超时回落 | ✅ 三模式 | ❌ | A `src/client/reminder.ts:45-72` |
| 22 | 每情况自定义文案 | ❌ 固定 dict | ✅ 模板 + 占位符 + 磁盘库 | 🟡 仅标题可覆盖 | A `src/text-store.ts:1-213` |
| 23 | 未读计数 | 🟡 提醒条数 | ❌ | ✅ 会话级粘性 | 当前 `index.js:481`；B `lib/client.js:312` |
| 24 | 应用角标 | ✅ | ❌ | ✅ | 当前 `client.js:1069-1111`；B `lib/client.js:428-439` |
| 25 | 聚焦/离开判定 | ✅ 多客户端 + idle | ✅ OS 前台探测 | ✅ document.hasFocus | 当前 `lib/presence.js`；A `src/index.ts:158-195`；B `lib/client.js:247-274` |
| 26 | 回窗即撤通知 | ✅ | ❌ | ❌ | 当前 `index.js:350-368` |
| 27 | 外部脚本触发通知 | ❌ 仅插件内 API | ❌ | ✅ token + endpoint + 队列 | B `index.js:105-305` |
| 28 | 客户端决策诊断 | ❌ | ✅ 40 行环 + `/debug` | ✅ `lastNotify/lastClick` | A `src/index.ts:93-111`、`:1318-1368` |
| 29 | 设置页 | ✅ 原生表单 | ✅ 3 卡 + 2 折叠库 | ❌ localStorage | 当前 `client.js:517-1007` |
| 30 | 路由鉴权统一 | ✅ | ❌ GET 裸奔 | 🟡 token/connection | 当前 `lib/routes.js:47-58`；A `src/index.ts:300-308` |
| 31 | 双平台 | ✅ Windows / macOS | ❌ 仅 Windows | 🟡 Client 三平台 | 当前 `lib/notifier.js` |
| 32 | 类型系统 | ❌ | ✅ strict | ❌ | A `tsconfig.json:8-12` |
| 33 | 构建链 | 无（源码即产物） | ✅ rolldown + d.ts | 无 | A `build.mjs` |
| 34 | 测试 | 25 条纯函数 | 155 条（含 jsdom） | 自建断言脚本，断言弱 | 当前 `test/unit.test.js`；A `tests/`；B `test/*.mjs` |
| 35 | CI | ❌ | ✅ windows-latest | 🟡 publish/test | A `.github/workflows/check.yml` |
| 36 | 验收文档 | ❌ | ✅ 9 篇 + 哈希 | ❌ | A `docs/acceptance/` |
| 37 | 模块化 | ✅ `lib/` 9 模块 | ❌ 宿主单文件 1462 行 | 🟡 两文件 | A `src/index.ts:1-1462` |

---

## 5. 可借鉴清单

> 价格口径：XS < 30 行 · S < 100 行 · M < 300 行 · L 更大。已吸收的旧清单项（AUMID、PowerShell 路径、PTC 提问、角标、失败可见）不再列入。

| 优先级 | 项 | 来源 | 成本 | 风险 | 建议 |
|---|---|---|---|---|---|
| **P0** | 结束原因 + 回复摘要 + 用时 | B + A | M | 低-中 | **做** |
| **P0** | error 后抑制「完成」 | B | XS | 低 | **做** |
| **P0** | 提问去重键从时间槽改成事件键 | A | XS | 低 | **做** |
| **P0** | 会话级未读（Host 侧） | B | S-M | 低-中 | **做** |
| **P1** | 诊断环 + `/debug` | A + B | S | 低 | **做** |
| **P1** | 音效封顶 + `/silence` | A | S-M | 低 | **做** |
| **P2** | 点击定位到会话 | B | M-L | 中高 | 先验证再做 |
| **P2** | plan-review 独立文案 | A + B | S | 低 | 先验证再做 |
| **P2** | 每情况音效 | A | M | 中 | 有余力再做 |
| **P3** | 外部触发通知（窄版） | B | S-M | 中 | 可选 |

### 5.1 P0-1 结束原因 + 回复摘要 + 用时（收益最大）

**现状**：`agent/status` 只给 `running → idle`，`formatTurnEnd` 永远返回「回复完成 / 会话标题」（`lib/messages.js:102-108`）。`aborted`、`blocked`、`max-tokens`、`interrupted` 全被说成「完成」，这是**错误陈述**，不是措辞问题。

**A 的做法**：投影在 `turn/end` 落 `reason.kind` 与正文（A `src/projection.ts:245-255`），客户端用 `plainSummary` 把 markdown 摊平成 78 字以内、不切断 ASCII 单词（A `src/client/summary.ts:18-52`），标题优先用工作区名（`:55-67`）。

**B 的做法（成本更低）**：Host 直接订 `session/event`，在 `turn/end` 缓存 `{kind, at}`（B `index.js:432-446`），在 `assistant/message` 记首行文本（`:347-355`、`:488-492`），`completed` 用文本、其余用固定句（`:494-504`）。

**建议实现**（不照搬投影、不改触发点）：

1. 新增 `lib/turns.js`：`ctx.on('session/event', …)` 维护 `Map<sessionId, {reason, text, runningSince, at}>`，上限 64，`session/disposed` 清理。
2. 新增 `lib/summary.js`：移植 A 的 `plainSummary` 思路（去代码块/表格/链接/强调，预算 ~120 字，不切 ASCII 单词），MIT 来源需在文件头注明。
3. `formatTurnEnd(agent, locale, title, turn)`：`completed` → 「工作区 · 摘要」；其余按 kind 出句（被拦截/输出到上限/被中止/出错/被中断）。
4. 触发仍走现有 `running → idle`（保留 presence/onlyWhenHidden 逻辑），idle 时取 10 秒内的缓存；缓存缺失则维持现状降级，**不新增第二条触发路径**。
5. `agentErrorAt` 改成真正的互斥：错误提醒后 5 秒内的 idle 不再发「完成」。
6. 用时：`agent/status` 首次 `running` 记时间，`idle` 计算 `1m23s` 拼进完成文案（B `lib/client.js:127-134`）。

**改动面**：`lib/turns.js`（新，~70 行）、`lib/summary.js`（新，~50 行）、`lib/messages.js`（~40 行）、`index.js`（~25 行）、`test/unit.test.js`（~8 条）。**M**。

**风险**：`session/event` 的可见性与 `turn/end` 顺序未实测（V1）；`session/event` 可能对宿主插件不可见，需先打一条日志确认。配置重载会丢内存缓存，属可接受降级。

### 5.2 P0-2 error 后不再补「完成」

**现状**：`agent/error` 写入 `agentErrorAt`（`index.js:288`），但全仓没有读取点；`agent/status` 的 idle 分支只看 `previous === 'running'`（`index.js:270-276`）。若 error 后仍来一次 idle，用户会连续收到「会话出错」+「回复完成」。

**B 的做法**：`failurePending = entry.error !== undefined`，该轮不再算完成边（B `lib/client.js:675`、`:682`），新 turn running 时清 error（`:721`）。

**建议**：在 idle 分支检查 `agentErrorAt.get(agent.id)`，5 秒内直接跳过；`agent/status` 首次 running 时删除该条。

**改动面**：`index.js` ~10 行 + 1 条测试。**XS**。

### 5.3 P0-3 提问去重键

**现状**：`#takeQuestionSlot` 是纯时间窗口——2 秒内第二次直接丢弃（`index.js:413-418`）。两个会话（或两个不同问题）在 2 秒内到达时，第二条**既没有提醒也没有提示音**。

**A 的做法**：去重键是问题摘要前 40 字，窗口 5 秒（A `src/client/runner.ts:73-75`），只用于跨源去重（瀑布 vs PTC），不吞不同问题。

**建议**：key 改为 `sessionId + ':' + (header|question 前 40 字)`，窗口 5 秒；同一 key 只播一次，不同 key 正常提醒。

**改动面**：`index.js` ~15 行 + 2 条测试。**XS**。

### 5.4 P0-4 会话级未读

**现状**：`unread += 1`（`index.js:455`），测试通知也 +1（`:184`），任意 focused presence 清零（`:161`）；角标语义是「提醒条数」。

**B 的做法**：`attention: Map<sessionId, …>`，角标 = `size`（B `lib/client.js:312`、`:428-439`），`isLooking()` 才删条目（`:701-703`）。

**建议（分两步）**：

1. Host 把 `unread` 换成 `Map<agentId, {kind, at}>`；角标 = `size`；测试通知走独立标记、不计入。聚焦仍整体清零（行为兼容）。
2. 验证 Client 能拿到 `activeSessionId` 后，presence 上报带上它，只清对应会话。

**改动面**：第一步 `index.js` ~40 行 + `client.js` 无改动（仍读 `unread`，但返回 `size`）+ 3 条测试。**S-M**。

**风险**：第二步若拿不到 active session，会退化成「永不清零」；不要在没有验证前做。

### 5.5 P1-1 诊断环 + `/debug`

**现状**：只有 `/status` 静态快照 + `lastOutcome`（`index.js:107-140`、`lib/routes.js:114-119`）；「为什么这条没弹」无从查。

**A 的做法**：Client 每条决策 `report(line)` → `POST /report`；Host 40 行环形缓冲；`/debug` 一次性返回能力/最近决策/播放器数/身份（A `src/index.ts:93-111`、`:1270-1287`、`:1310-1368`）。

**建议**：新增 `lib/diagnostics.js`（有界环 + `note()`），`/desktop-notify/report`（过 `rejected()`/`jsonBody()`），`/debug` 返回环 + 能力 + `lastOutcome`；在 6 个「抑制/失败」分支各写一行（`onlyWhenHidden`、`pendingApproval` 占用、无 live client、发送失败、角标不支持、音效失败）。

**改动面**：`lib/diagnostics.js`（新 ~45 行）、`lib/routes.js`（+2 路由 ~25 行）、`index.js`（~20 行）、`client.js`（`report()` ~15 行）、测试 3 条。**S**。

**风险**：低；`/debug` 必须走现有 `rejected()`，不要学 A 的裸 GET。

### 5.6 P1-2 音效封顶 + `/silence`

**现状**：`spawnFirst` 不保存子进程、没有超时（`lib/sound.js:115-153`）；自定义音效播到文件结束，用户回窗后仍在响。

**A 的做法**：`soundPlayers: Set<ChildProcess>`，每条播放 8 秒封顶，`POST /dsh-notify/silence` 全部 kill（A `src/index.ts:121`、`:955-970`、`:225-246`）。

**建议**：`SoundPlayer` 记录在播 child，`play()` 成功即登记，8 秒 `kill`，新增 `stopAll()`；`/desktop-notify/silence` 走鉴权；Client 在 `focus`、`enabled=false`、`sound.mode='none'` 时 POST。交互提示音单独上限（它本来就短，例如 3 秒）。

**改动面**：`lib/sound.js` ~40 行、`lib/routes.js` +1、`index.js` ~15、`client.js` ~15、测试 2 条。**S-M**。

### 5.7 P2-1 点击定位到会话（先验证）

B 通过 `ctx.uiWorkspace.openSession(sessionId)` 跳会话，三级降级 + 重试（B `lib/client.js:446-480`、`:594-636`）。当前 toast 的 `launch="dsh://open"` 不带会话参数（`lib/winrt.js:164`），点击只能回前台。

可行路径：协议/launch 里带 `session=<id>` → Host 记录「待打开会话」→ Client 轮询 `/status` 后调 `openSession`。前提是 DSH 真的暴露该接口（V2）。**在验证前不要改协议参数**，否则可能破坏现有 `dshnotify:` 校验。

### 5.8 P2-2 / P2-3

- **plan-review**：A 把 `intent.kind === 'plan-review'` 单独成场景与开关（A `src/projection.ts:177-179`、`src/scenarios.ts:42-46`），B 也有独立文案。当前 `formatQuestion` 只取 `questions[0].question`（`lib/messages.js:139-149`）。若 `user-questions/request` 的 payload 里有 intent（A 的实现说明有），加一个标题即可，成本 S。先抓一次真实 plan review 验证。
- **每情况音效**：A 有 9 情况 × 20 音效目录（A `src/types.ts:264-313`）。当前是单一 `sound` + 独立 `attention`。建议只做 4 组（完成/审批/提问/错误），复用现成 `sound` 结构与设置页，**不做音效库/转码/文本模板**（成本是收益的 3 倍）。

---

## 6. 明确不借鉴 / 负资产

| 项 | 来源 | 原因 |
|---|---|---|
| 迁到渲染层通知 | B 整体 | 关窗即无提醒；拿不到按钮回传；丢失审批闭环 |
| 接管侧栏排序 | B `lib/client.js:371-411`、`:837-849` | 改用户数据；排序变「手动」；卸载写空而非恢复（B README 自认） |
| Host/Client 双半且 Host 默认关 | B `cordis.patch.yml:14-19` | 功能割裂、双通知、两套文案与焦点语义 |
| TS + rolldown 迁移 | A | 收益是类型安全，成本是全量重写 + 构建产物提交；当前 4079 行不值得 |
| ffmpeg 转码 + 音效库 | A | 新外部依赖；当前 Windows 只支持 wav 是有意取舍 |
| 每情况文本模板库 | A | 3 套/情况 + 占位符 + 磁盘原子写 + 管理 UI，收益低 |
| 155 条测试/CI 全盘照搬 | A | 值得借「纯函数可测 + 一条 smoke」，不必借 22 个 spec 的体量 |
| 外部 token + endpoint + 队列 | B `index.js:105-305` | 复杂度是「通知在 renderer」逼出来的；当前 Host 直发即可，最多加一条窄路由 |
| localStorage 偏好 | B | 换 profile 即丢；当前 schema + 设置页是优势 |
| 裸 GET `/debug`、`/questions` | A `src/index.ts:300-308`、`:1318-1328` | 泄露会话 id 与诊断；当前路由鉴权统一，不要退化 |

---

## 7. 当前项目已经领先、不要为对齐而退化的点

1. **审批闭环**：`approval/request` 瀑布接管 + `dshnotify:` 按钮回传（`index.js:313-388`、`lib/winrt.js:536-584`）。A/B 都没有。
2. **桌面端双平台**：WinRT / terminal-notifier 两条分支（`lib/notifier.js`）。
3. **双提示音分离**：交互音不看焦点、800ms 去重、该次 toast 静音（`index.js:426-435`、`:343`）。
4. **多客户端 presence + idle**：`clientId` 维度、stale 过期、`whenPresent()` 可等待（`lib/presence.js`、`client.js:269-352`）。
5. **回窗即撤**：通知结果 / 回窗 / 请求中断三方竞速（`index.js:350-368`）。
6. **原生配置**：schemastery schema + `configForms`，可被 CLI/其它插件统一读写（`lib/config.js:11-70`）。
7. **子智能体过滤**：`isRootSession`（`lib/session.js:8-14`）。
8. **路由鉴权与错误包装统一**：`rejected()` + `withErrors()` + `jsonBody()`（`lib/routes.js:29-112`）。
9. **图标链路**：原生 `settings.section.icon` + DOM patch 兜底 + `appLogoOverride`（`client.js:407-475`、`lib/winrt.js:124-140`）。
10. **零构建安装**：源码即产物，`link:` 即可用。

---

## 8. 建议节奏

### v0.2.2（P0，都是小改）

1. `agentErrorAt` 互斥（XS）。
2. 提问去重键（XS）。
3. 会话级未读第一步（S）。
4. `turn/end` 缓存 + 结束原因文案 + 回复摘要 + 用时（M）。
5. 相应单测 12-15 条；README/CHANGELOG 同步。

验收标准：同一轮 error 不再出现「完成」；两个会话 2 秒内各提一个问题都能收到提醒；`aborted/max-tokens/blocked` 文案不再写「已完成」；角标数字等于「有未处理提醒的会话数」。

### v0.3.0（P1）

1. 诊断环 + `/report` + `/debug`。
2. 音效封顶 + `/silence`。
3. （验证通过后）点击定位会话。
4. （验证通过后）plan-review 文案。

### 可选 spike（不排期）

- `session/event` 在 Host 插件中的可见性与 `turn/end` 顺序（V1）。
- `uiWorkspace.openSession` 在 0.2.2 的可用性（V2）。
- `document.hasFocus()` 在提问视图/iframe 下的可靠性（V3）。
- `agent/error` 之后是否必来 `agent/status: idle`（V4）。
- plan-review 是否走 `user-questions/request`（V5）。

---

## 9. 待验证项

| 编号 | 待验证 | 为什么重要 | 方法 |
|---|---|---|---|
| V1 | `session/event` 的 `turn/end` 对普通 Host 插件可见，且 `reason.kind` 取值符合预期 | P0-1 的前提；不可见就只能继续用 idle 泛化 | 在 `index.js` 临时 `ctx.on('session/event', console.log)` 跑一轮，观察 reason |
| V2 | `ctx.uiWorkspace.openSession(sessionId)` 在 0.2.2 可用且稳定 | 点击定位会话的唯一入口；B 自己三级降级说明它不稳 | Client 里打一条探针，点设置页按钮试跳 |
| V3 | `document.hasFocus()` 在提问面板/iframe 聚焦时是否为 false | 若是，presence 会误判「离开」，在用户正看着时弹通知 | 提问时看 `/status` 的 presence.focused，并与窗口实际状态对照 |
| V4 | `agent/error` 后是否一定来 `agent/status: idle` | 决定 P0-2 的窗口大小；若不来则不需要互斥 | 触发一次失败 turn，看日志/通知顺序 |
| V5 | plan-review 是否走 `user-questions/request`，payload 是否含 intent | 决定 P2-2 能否只改文案 | 触发一次计划确认，打印 request |

已知事实（来自本机 `app.asar` 只读检索 + B Agent 核对）：`TurnEndReason.kind` 的取值为 `completed | blocked | max-tokens | interrupted | aborted | error`（另有 seed-only 的 `forked`）；`sessionStatus.completionUnread` 只在非主视图且 running 由 true→false 时置位。上述两点支撑 B 的 `isLooking` 语义，也支撑 P0-1 的原因表，但**事件可见性仍需 V1 实测**。

---

## 10. 附件

- 仓库 A：`D:\Temp\dsh-rixLch\upstream\paleech0-dsh-notify-desktop`
- 仓库 B：`D:\Temp\dsh-rixLch\upstream\chendaleiQ-dsh-plugin-desktop-notify`
- A 精读笔记：`D:\Temp\dsh-rixLch\notes\A-paleech0-notes.md`
- B 精读笔记：`D:\Temp\dsh-rixLch\notes\B-chendaleiQ-notes.md`
- 旧调研（v0.1.3 基线）：`docs/research/competitor-notify-plugins.md`

本报告未修改任何上游仓库、未安装依赖、未运行上游代码；当前项目除新增本文件外无改动。
