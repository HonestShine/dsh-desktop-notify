# 同类通知插件对标调研

> 调研时间：2026-11-19 · 我方基准：`@honorshine/dsh-desktop-notify@0.1.3` · 两个参考仓库均为 MIT

## 结论先行

1. 两个参考仓库走的是两条**不同**路线，都与我方不完全重合：`paleech0/dsh-notify-desktop` 是**宿主侧 PowerShell + WinRT toast**（与我方 Windows 分支同构，可借鉴度最高）；`chendaleiQ/dsh-plugin-desktop-notify` 是**渲染层 Electron Notification + 应用角标**（架构不同，只能借概念）。
2. 我方在**交互闭环**上明确领先：只有我们把通知按钮的点击结果回填写回 `approval/request` waterfall；A 点击只唤回窗口，B 完全不参与审批决策。
3. 值得吸收的价值集中在**健壮性**，不是功能：AUMID 多候选与有效性探测、子进程三条隐性约束、事件入口收敛。
4. **最大疑似缺口**：A 发现 `ask_user_question` 在 programmatic tool call（`run_code` 内）场景下不产生 `tool/call`，只能从 `tool/ptc-dispatch-start` 捕获。我方仅监听 `user-questions/request`，是否存在同类漏检**尚未实测**（见第 9 节 V1）。
5. 明确不跟进：接管侧栏排序、迁移到渲染层通知、单文件巨型文件写法。

## 1. 调研范围与方法

| 项 | 值 |
|---|---|
| 我方基准 | `@honorshine/dsh-desktop-notify@0.1.3`，3754 行 JS（含 338 行测试） |
| 仓库 A | `paleech0/dsh-notify-desktop` @ `9ddf3acb949e4b6018965712dd0704c98c7a60b3`（MIT，v0.2.5） |
| 仓库 B | `chendaleiQ/dsh-plugin-desktop-notify` @ `626148f05ee8a9de818e9f9e59b59f51faa2cfcf`（MIT，v0.6.5） |
| 本地快照 | `D:\Temp\dsh-gKWQTP\dsh-notify-refs\` |
| 精读笔记 | 同目录下 `paleech0-…-notes.md`（17.6KB）与 `chendaleiQ-…-notes.md` |

**方法**：两个子 Agent 并行下载 + 按 8 个维度精读 + 笔记落盘 + 回传带 `路径:行号` 的摘要；主 Agent 抽查核验，并用我方源码建立对照基准。

**获取偏差（必须记录）**：本机 `git clone` 与 `curl` 均两次失败于 Windows schannel `SEC_E_NO_CREDENTIALS`。最终仓库 A 走 codeload tarball（commit 由 GitHub API 取得，本地无 `.git`），仓库 B 走 GitHub REST + raw 逐文件取回（二进制图片未取）。因此**文本层面结论可信，界面截图等二进制细节未经核对**。

**抽查核验结果**

| 被抽查结论 | 证据位置 | 结果 |
|---|---|---|
| 首见只记基线，不补发历史横幅 | B `lib/client.js`:665-683 | 属实 |
| 角标只在真正看过时清零 | B `lib/client.js`:428-439 | 属实 |
| 外部接口用 loopback + token 设防 | B `index.js`:105-120 | 属实 |
| `tool/ptc-dispatch-start` 捕获 run_code 内提问 | A `src/projection.ts`:285-301 | 属实 |
| AUMID 候选 + `Setting` 非空探测 | A `src/index.ts`:890-902 | 属实（Agent 摘要写的环境变量名 `DSH_NOTIFY_AUMID` 有误，源码为 `DSH_NOTIFY_AUMIDS`） |
| 点击 toast 只唤回窗口，不回填答案 | A `src/index.ts`:994-1000、`README.md`:275 | 属实 |

## 2. 三方元信息

| 维度 | 我方 v0.1.3 | A（paleech0 0.2.5） | B（chendaleiQ 0.6.5） |
|---|---|---|---|
| 运行位置 | Host 插件（Cordis `Service`） | Host 插件 + 少量 Client | Host 薄壳 + Client 主体 |
| 通知实现 | WinRT toast（PowerShell）/ terminal-notifier / notify-send | 仅 PowerShell + WinRT toast | 渲染层 `new Notification` |
| 运行时依赖 | `node-notifier@12.1.0` | 无 | 无 |
| 源码规模 | 3754 行（`index.js` 531 + `client.js` 1105 + `lib/` 1780 + 测试 338） | src 7849 行 / tests 2233 行 | 1542 行（`index.js` 544 + `lib/client.js` 998） |
| 平台 | Windows + macOS + Linux | **仅 Windows** | 三平台（Electron 能力） |
| 事件接入 | 逐 hook 订阅（5 个） | 单一投影收敛（projection） | 会话列表订阅 + 边缘检测 |

## 3. 架构对比

### 3.1 我方：宿主侧瀑布接管

调用链：`approval/request`（`prepend+global`，`index.js`:224）→ `#handleApproval`（`:287`）→ `WinRtNotifier.show`（`lib/winrt.js`）→ PowerShell 发 toast → 点击触发 `dshnotify:` 协议 → VBS 写 rendezvous JSON → 轮询取回 → 解析成 `allow-once` / `reject` 交回 waterfall。

特点：审批决策**真正闭合**；通知、声音、焦点竞速三者在同一处编排（`index.js`:324-329）。代价是宿主侧要自己处理协议注册、AUMID、进程清理。

### 3.2 A：投影驱动的 Windows 专用通知

调用链：`projection.applyNotifyEvent`（`src/projection.ts`:222）→ client tick（`src/client/index.ts`:759）→ `decideNotification`（`decision.ts`:167）→ `showToast`（`notifier.ts`:408）→ `POST /dsh-notify/toast`（`notifier.ts`:176）→ `handleHostToast`（`src/index.ts`:1091）→ PowerShell AUMID 探测 + `Show`（`:890-916`）→ 点击 `dsh://open`（`:995`）。

特点：事件入口收敛为**一个投影**（`src/projection.ts`:222-336），不是逐 hook 订阅；这带来两个好处——状态机集中、易覆盖冷门事件（见 5.3）。但 toast 只有「唤回窗口」一种动作，**没有决策回传**。

### 3.3 B：渲染层自带通知与角标

调用链：`sessionStatus/list.subscribe` → `sync` → 边缘检测（`lib/client.js`:669-683）→ `deliverCompletion` → `GET /desktop-notify/turn`（800ms 超时）→ `new Notification`（`client.js`:588）→ 点击重试约 150/60/300ms 打开会话（`:594-636`）→ `setAttention` + `setAppBadge`（`:428-439`）。

特点：几乎零平台适配成本（Electron 自身跨平台），且天然拥有「未读」概念；但**无法把决策回传给 Host**，也不产生系统级通知身份（标题显示的是应用名而非 Toast 的 AppUserModelID 语义）。

## 4. 能力矩阵

| 能力 | 我方 | A | B | 备注 |
|---|---|---|---|---|
| 通知按钮回填审批 | ✅ `allow-once`/`reject` | ❌ 仅唤回窗口 | ❌ 不参与审批 | 我方核心优势 |
| Windows toast 身份（AUMID） | ✅ lnk 自动识别 + 手动覆盖 | ✅ 多候选 + `Setting` 探测 | ❌ 无（渲染层通知） | A 更稳 |
| 通知声音 | ✅ 系统/内置/自定义/静音 | ✅ 子进程 `SoundPlayer` + 转码缓存 | ❌ 未提供 | 见 5.5 |
| 交互提示音（与通知音分离） | ✅ | ❌ | ❌ | 我方独有 |
| 焦点感知 | ✅ 心跳 + 空闲判定 | ❌ 未发现 | ✅ `isLooking` | 语义不同：B 是「看没看」，我方是「在不在」 |
| 未读计数 / 应用角标 | ❌ | ❌ | ✅ `setAppBadge` | 见 5.2 |
| 重载不重放历史 | 部分（宿主侧无重放路径） | ❌ | ✅ 首见只记基线 | 见 5.1 |
| 外部脚本可触发通知 | ❌ 仅插件内 `ctx.desktopNotify` | ❌ | ✅ token 回环接口 | 见 5.6 |
| 跨平台 | ✅ 三平台 | ❌ 仅 Windows | ✅ 三平台 | A 明确不做 |
| 通知去重 | ✅ 签名 + 30s | 未核 | ✅ 粘性条目 | |
| 代码组织 | 模块化（`lib/` 9 模块） | 宿主单文件 1462 行 | 两文件 | 我方最优 |

## 5. 值得借鉴的设计

### 5.1 首见基线（防重载刷屏）

B 在 `lib/client.js`:665-683 用 `previous` Map 存每个会话上一帧状态，**第一次见到某会话时只写基线不触发通知**，注释直言：否则「每次窗口重载，所有历史未读与等待中的审批会当作新事件，一次刷出一串横幅」。

我方现状：通知由宿主发出，宿主重载不会重放历史请求，因此**当前没有这个缺陷**；但一旦将来把展示移到 client 侧（例如做 5.2 的角标），这套基线机制就是必需的。

### 5.2 粘性 attention 与应用角标

B 的每条横幅都落一条粘性条目（`lib/client.js`:701-723），只有 `isLooking()`（主视图 + 有焦点 + 可见）才清除；`applyBadge` 仅在数值变化时写 `setAppBadge` / `clearAppBadge`（`:428-439`）。这比「弹完即忘」更贴近用户感知。

我方现状：`lib/presence.js` 只维护焦点与空闲，**没有未读概念**；`client.js` 已存在（1105 行，负责设置页），具备在渲染层执行 `navigator.setAppBadge` 的位置，但 DSH 桌面端是否启用该 API 需实测（V2）。

### 5.3 事件入口收敛为投影

A 把所有通知相关事件折进一个 `applyNotifyEvent`（`src/projection.ts`:222-336），而不是散落订阅。直接收益是能系统性覆盖冷门路径——例如 `tool/ptc-dispatch-start` 里的 `ask_user_question`（`:285-301`），代码注释写明这是 **0.2.0-rc.2 会话日志实测**得出：programmatic tool call 不产生 `tool/call`。

我方现状：5 个 hook 各自 `ctx.on`（`index.js`:222-279），职责清晰但**缺少一张「所有可能触发提问/审批/结束的事件清单」**，这正是漏检风险来源（V1）。

建议借鉴的是**方法**（先枚举事件源再写状态机），不是照搬投影结构——我方已有模块化基础，不必重构。

### 5.4 AUMID 多候选 + 有效性探测

A 的解析脚本（`src/index.ts`:890-902）逻辑：读 `DSH_NOTIFY_AUMIDS`（分号分隔）→ 逐个 `CreateToastNotifier(id)` 并检查 `.Setting` 非空 → 第一个有效者胜出 → 全失败则退回最后一个候选。选中身份会写进诊断输出（`:1069`）。

我方现状：`assets/resolve-aumid.ps1` 从已安装快捷方式推导 AppUserModelID，失败才用配置覆盖（单一来源，**无有效性校验**）。若快捷方式指向的 AUMID 与注册状态不匹配，toast 可能静默不显示。

### 5.5 子进程的三条隐性约束

A 的 `AGENTS.md`:43 与 `src/index.ts`:1036-1067 记录：调用 PowerShell 必须 **绝对路径**、**不 detached**、**stdio piped 且读取 draining**。违反任一条，toast 会静默失效而退出码仍为 0——非常难查。

我方现状（已核对）：
- `lib/winrt.js`:471 使用 `execFile` + `windowsHide: true` + `timeout`，满足「不 detached」与「stdout 被收集（draining）」。
- **第一条不满足**：`lib/winrt.js`:469 的 `powershell.exe` 是**裸名**，依赖 `PATH`；而同文件 `:365` 的 `wscript.exe` 反而取了 `process.env.SystemRoot` 绝对路径。两处写法不一致——PowerShell 走 PATH 在 PATH 被裁剪或被劫持时会静默失败，正是 A 记录的那个坑。
- `lib/routes.js`:205 的 `detached: true` 用于「打开系统通知设置」，属于有意唤起外部程序，与 toast 路径无关。

### 5.6 外部脚本可触发的回环接口

B 在宿主侧挂 3 条路由（`index.js`:105-305）：外部工具 POST 请求入队，渲染层通过应用协议消费；请求受 `token` + loopback 约束，注释说明了两个设计点——用 `ctx.inject` 等 `webServer` 绑定完成（单次 `ctx.get` 会输掉竞态），以及渲染层路由依赖 Host 自身 `connection` 准入（`:105-120`）。

我方现状：`lib/routes.js` 只有内部用途路由（`status` / `presence` / `test` / `preview-sound` / `preview-attention` / `open-notification-settings` / `repair-windows`），**没有对外触发通知的入口**；插件间可通过 `ctx.desktopNotify.show()`，但 shell 脚本、cron、浏览器 agent 无从接入。

## 6. 坑位清单（对方踩过的）

| 坑 | 证据 | 对我们的启示 |
|---|---|---|
| 接管侧栏排序等于把排序改成「手动」，用户拖拽会被覆盖 | B `lib/client.js`:371-411、`:837-849`，其 `README.md`:114-117 自认 | 副作用型写入必须默认关闭，不要作为「顺手功能」 |
| 「这一轮怎么结束的」依赖宿主半边在线，拿不到就一律说「已完成」 | B `client.js`:555-568、`:151-163`；patch 默认 `enabled: false`（`cordis.patch.yml`:19） | 降级路径要说真话：不确定时用中性措辞，不要断言成功 |
| 版本号散落三处手工同步 | B `package.json`:3、`client.js`:33、tag | 我方版本号只在 `package.json` 维护，注意别在 `cordis.patch.yml` 复制 |
| toast 无法观测到「被用户关掉」，所以文件声音只能限时截断 | A `README.md`:277 | 我方用按钮协议回传决策，天然规避；但「用户直接关掉通知」仍无法感知 |
| 子进程约束违反时静默失败、退出码 0 | A `src/index.ts`:1036-1067 | 我方 toast 路径需补一条「发送后校验」的回归测试 |
| 声音表两半各写一份、`/questions` 路由漏校验自定义头 | A `src/index.ts`:353-359、`:300-305` | 我方 `lib/routes.js` 统一 `withErrors` 包装，已较好；新增路由仍要过一遍鉴权 |

## 7. 我方独有优势（不要为对齐而退化）

- **审批决策闭环**：通知按钮直接把结果交回 `approval/request`，A/B 都做不到。这是本插件的存在理由，任何重构都不能丢。
- **跨平台**：A 明确只做 Windows；我方三分支且有降级路径。
- **双提示音分离**：交互提示音与通知铃声互斥、且交互音不受焦点影响（`index.js`:290-317）。A/B 均无此概念。
- **焦点竞速**：通知结果 / 用户回窗 / 请求中断三方竞速（`index.js`:324-329），回窗即放弃通知，避免「人已经在了还弹窗」。
- **模块化**：`lib/` 按职责拆分；A 的宿主单文件 1462 行 + 16 条路由集中注册，是反面样本。

## 8. 灵感清单

| 编号 | 项 | 来源 | 价值 | 成本 | 风险 | 建议 |
|---|---|---|---|---|---|---|
| A1 | AUMID 多候选 + `Setting` 有效性探测 + 身份诊断 | A `src/index.ts`:890-902 | 高 | 小 | 低 | **做** |
| A2 | 子进程三约束审计 + toast 发送校验测试 | A `src/index.ts`:1036-1067 | 中高 | 小 | 低 | **做** |
| A3 | 未读计数 + 应用角标 | B `lib/client.js`:428-439 | 中高 | 中 | 中 | 验证 V2 后做 |
| A4 | 粘性未读（查看即清） | B `lib/client.js`:701-723 | 中 | 中 | 中 | 与 A3 合并 |
| B1 | 外部脚本 token 接口 | B `index.js`:105-305 | 中 | 中 | 中（安全面） | 需权衡 |
| B2 | 提问事件源补全（含 ptc-dispatch） | A `src/projection.ts`:285-301 | 高（若确有漏） | 待定 | 待定 | **先验证 V1** |
| B3 | 声音转码缓存（ffmpeg） | A `src/index.ts`:421-424 | 低 | 高 | 高（引入新依赖） | 不做 |
| C1 | 接管侧栏排序 | B `lib/client.js`:371-411 | 低 | 中 | 高（侵入用户数据） | 不做 |
| C2 | 迁移到渲染层 notification | B 整体 | — | 高 | 高（丢失按钮回传） | 不做 |
| C3 | 单文件巨型写法 | A `src/index.ts` | — | — | — | 不学 |
| C4 | 自有 `dsh://open` 协议 | A `src/index.ts`:995 | 低 | 中 | 高（与 `dshnotify:` 并存会冲突） | 不做 |

### A1 细化（推荐先做）

候选链改为：配置覆盖 → `DSH_NOTIFY_AUMIDS`（分号分隔）→ 快捷方式推导 → 兜底常量；每个候选用 `CreateToastNotifier($id).Setting` 判有效性；把最终采用的身份与来源写进 `/desktop-notify/status`，让设置页能显示「当前通知身份：X（来源：快捷方式）」。

改动面：`assets/resolve-aumid.ps1`、`lib/winrt.js` 的 AUMID 解析、`lib/config.js` 增加可选多值字段、`index.js` 的 status 输出、`client.js` 设置页展示、`test/unit.test.js` 补用例。

### A2 细化

1. 把 `lib/winrt.js`:469 的 `powershell.exe` 改为绝对路径（`process.env.SystemRoot` + `System32\WindowsPowerShell\v1.0\powershell.exe`），与同文件 `:365` 的 `wscript.exe` 写法对齐；`PATH` 兜底时记 warn。
2. 补一条集成测试：构造一个必然失败的 toast（无效 AUMID），断言能拿到非 0 退出码或 stderr，而不是静默。
3. 检查 `show()` 返回值的 error 是否会被 `#remind` 吞掉（`index.js`:233 用的是 `void`）。

### B1 细化（若要做）

新增 `POST /desktop-notify/notify`，要求：仅绑定 loopback、`Authorization: Bearer <token>`、token 从 `%LOCALAPPDATA%\dsh-desktop-notify\endpoint.json` 读取、请求体限长（沿用 16KB）、速率限制（如 10 次/分钟）、不参与审批（只做提醒类通知）。

## 9. 待验证项

| 编号 | 待验证 | 为什么重要 | 验证方法 |
|---|---|---|---|
| V1 | ~~`run_code` 内的 `ask_user_question` 是否触发 `user-questions/request`~~ **已实测：不触发** | 我方确实漏掉一整类提问提醒，B2 升为必修 | 2026-11-19 在本机 `run_code` 内调一次；`#cueAttention()` 不受焦点门控，交互提示音未响即证明事件根本没到达 |
| V2 | ~~渲染层是否支持 `navigator.setAppBadge`~~ **改为运行时特性检测** | 不支持时静默跳过，不影响其他功能 | `startBadgeSync()` 以 `typeof navigator.setAppBadge === 'function'` 门控 |
| V3 | ~~`lib/winrt.js` 的 PowerShell 路径是否为绝对路径~~ **已验证：否**，`:469` 为裸名 `powershell.exe`，只有 `wscript.exe` 用绝对路径 | 静默失败风险**已确认存在** | 无需再验，直接并入 A2 |

## 10. 快照与清理

- 快照目录：`D:\Temp\dsh-gKWQTP\dsh-notify-refs\`（含两份笔记与两个仓库副本）
- 本调研**未修改** `dsh-desktop-notify` 任何源码，未安装依赖，未运行参考仓库代码。
- 不需要时可整目录删除；该目录位于系统临时区，非项目工作区。

## 11. 实施结果（2026-11-19，v0.2.0）

| 项 | 结论 | 落地 |
|---|---|---|
| V1 | 已实测：`run_code` 内 `ask_user_question` **不**触发 `user-questions/request` | 触发 B2 |
| V2 | 未预验证，改为运行时特性检测 + 静默降级 | A3 以 `typeof navigator.setAppBadge` 门控 |
| V3 | 已确认 `powershell.exe` 为裸名 | A2 改为绝对路径 |
| A1 | AUMID 多候选 + `Setting` 校验 + 状态诊断 | 已完成：新增 `assets/probe-aumid.ps1`、`splitAppIdCandidates`、`parseAumidProbe`、`appIdValidated` |
| A2 | PowerShell 绝对路径 + 提醒失败可见 | 已完成：`powershellPath()`；`#remind` 处理 `{ reason: 'error' }` |
| A3 | 未读计数 + 应用角标 | 已完成：宿主 `unread` 计数 + `/status` 暴露 + 客户端 `startBadgeSync()`（数值变化才写、聚焦清零、切后台立即刷新）；**真机验证推迟到下一版本** |
| A4 | 粘性未读 | 部分：窗口聚焦即清零，未做到按会话粒度的粘性 |
| B2 | 程序化提问提醒 | 已完成：监听 `tool/ptc-dispatch-start` / `tool/ptc-dispatch`，与瀑布共用两秒去重槽；**2026-11-19 重启后实测生效** |
| B1 / B3 / C1-C4 | — | 按决策不做 |

版本升至 `0.2.0`；`README.md`、`docs/README.zh-CN.md`、`CHANGELOG.md` 已同步；单测 25 条通过。

**复核记录（2026-11-19，重启后）**：再次在 `run_code` 内触发 `ask_user_question`，交互提示音正常播放。提示音不受焦点门控，这证明 `tool/ptc-dispatch*` 事件在 DSH `0.2.2-rc.x` 上确实存在且被捕获，B2 的事件名假设成立。
**A3 的验证状态**：真机验证推迟到下一版本。原因是三件事叠加——本地 HTTP 调 `/desktop-notify/*` 一律返回 401（`lib/routes.js`:47 的 `connection.requestRejection` 需要会话凭据，Node 侧无法伪造）；测试通知原本不经过 `#remind`（已修，但仍需重启）；窗口聚焦时 `unread` 会被立即清零，而点按钮必然在前台。

理论链路（静态可确认）：`#remind` 成功 → `unread += 1`（`index.js`:451）→ 客户端每 5 秒及 `visibilitychange → hidden` 时拉 `/status` → 数值变化才写 `setAppBadge`/`clearAppBadge` → `reportPresence(focused: true)` 清零（`index.js`:161）。已知风险：后台页面的定时器会被 Chromium 节流，角标更新可能延迟；渲染层若无 Badging API 则整体静默跳过。
