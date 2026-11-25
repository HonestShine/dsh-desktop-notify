# 四款 IM 桌面端托盘未读角标/闪烁 vs dsh-desktop-notify：差异清单

- 日期：2026-11-25
- 范围：微信 4.2.0.53、QQNT 9.9.37-54395、飞书 7.73.0.34、钉钉 9.0.5.261029005、DSH Desktop 0.2.2-rc.5 + dsh-desktop-notify 当前工作区
- 方法：静态逆向，不运行目标进程、不改源码/配置。证据分级：**观察**=字节/字符串/指令级；**推断**=由多处观察推出但缺完整调用链；**未知**=未确认。
- 后续状态：**仅作历史研究留存；2026-11-25 产品决定不支持托盘闪烁、托盘角标与消息计数，相关插件代码已移除。**
- 原始笔记：`D:\Temp\dsh-YblLlQ\rea\notes\{wechat,qq,feishu,dingtalk}-deep.md`

---

## 0. 结论先行

1. **四款 IM 都没有在托盘图标上画未读数字**。全部是“整张图标换状态”，数字最多进 tooltip / 会话列表 / 窗口内角标。托盘位只表达“有没有事”。
2. **三种不同范式**：
   - 微信：**没有未读图标**。托盘只有一张基图，未读时每 500ms 把图标隐藏一帧（`hIcon=NULL`），再加任务栏 `FlashWindowEx`。
   - 飞书 / 钉钉：**预烘焙的两态/三态图标**。飞书 normal/红点；钉钉 normal/红点/@，@ 优先。
   - QQ：**多状态整图 + 头像闪动**。`favicon-new`（蓝气泡）、`favicon-nonotify`（禁止符）、`favicon-reclusion`（橙气泡）等，另有“基础图标 ↔ 最新未读会话头像”的轮换。
3. **@ 提及在托盘上只有钉钉做了专用图标**；飞书在数据层有 `at` 分类但聚合为同一颗红点；QQ、微信托盘不区分 @。
4. **闪烁和常驻未读态是两件事**。飞书/钉钉/QQ 都是“先切未读态，再让图标在未读态与正常态之间交替”；微信是“正常图标 ↔ 空白”；任务栏闪烁是独立通道（微信/QQ/飞书有，钉钉新版没有）。
5. **停止条件高度一致**：窗口激活/点击托盘/打开会话/未读清零即停；没有一款靠 `FLASHW_TIMERNOFG` 让系统自动停，都是上层显式停。
6. **DSH 现状差距不在动画，而在“没有托盘状态”**：DSH 核心已有常驻托盘，但只有一张静态 `tray.ico`，没有未读态，也没有给插件的托盘 IPC；插件只能用 `navigator.setAppBadge()` 改任务栏数字角标。
7. **插件层零改动做不出托盘角标**。`DesktopTray` 在 DSH 的 `app.asar/lib/main.js` 私有作用域内，插件 README 也明确“不修改 app.asar/main/preload、不新增 IPC”。要落地托盘态，必须走 DSH 核心契约（跨仓库）。
8. **可直接复用的是设计规则，不是代码**：无数字、整图换态、状态优先级、聚焦即停、闪烁可关。四款的实现栈（Qt/Electron/CEF/自绘）与 DSH 插件都不同，没有可粘贴的函数。
9. **最高优先级不是“加一个红点”**，而是先把 DSH 的“未读”从“提醒条数”升级成“需要注意的等级”，否则托盘只能表达“有几条”，不能表达“哪条要审批、哪条只是完成”。
10. **建议分两阶段**：插件先做状态模型与任务栏 badge 语义（可独立发布）；托盘图标 + 闪烁作为 DSH 核心 feature request，等核心提供 `setAttention` 契约后再接。

---

## 1. 总览矩阵

| 维度 | 微信 4.2.0.53 | QQNT 9.9.37 | 飞书 7.73 | 钉钉 9.0.5 | DSH 当前 |
|---|---|---|---|---|---|
| 框架/托盘归属 | Qt 静态链接 + 自绘 `mmui::SystemTrayIconWin` | Electron 主进程 `Tray` 单例 | 原生 `frame.dll` + 自绘 `Lark_StatusTrayWindow` | 原生 Qt `tray_v2::TrayIconManager` | Electron 主进程 `DesktopTray` |
| 常驻托盘 | 有 | 有 | 有 | 有 | 有（核心） |
| 未读视觉 | **无未读图标**，图标隐藏/显示闪 | 整图多状态：new / nonotify / reclusion 等 | normal / notice 两态，右上红点 | normal / msg / at 三态 | **无**，仅任务栏数字 badge |
| 托盘数字 | 无 | 无（数字进 tooltip） | 无 | 无（`99+` 只在 UI） | 任务栏 badge 显示提醒会话数（**不含 approval**） |
| @ 提及 | 无 | 无 | 数据层有 `at`，图标不区分 | **有专用 `trayAt.ico`** | 无 |
| 免打扰 | 未知 | `favicon-nonotify` / 灰点 | 未知 | 未知 | 无 |
| 托盘闪 | 500ms 正常↔空白 | 基础图标↔最新未读头像 | normal↔notice（周期未知） | 600ms normal↔msg/at | 无 |
| 任务栏闪 | `FlashWindowEx` 3×300ms | `BrowserWindow.flashFrame` 按会话 | `FlashWindowEx` 4 次 | **新版不调用** | 仅核心更新提醒使用 |
| 停止条件 | 激活/点击 | 聚焦/点击/进托盘/未读清零 | 激活/点击/关闪烁 | 激活/右键/点击 | 聚焦清 badge |
| 点击 | 恢复主窗/菜单 | 恢复主窗/可直开未读/自绘菜单 | 恢复主窗/菜单/hover 菜单 | 恢复主窗/菜单 | toast 按钮回填审批 |
| 用户开关 | 未确认 | 很丰富（头像闪/消息盒/五类目） | `lark.flash_tray` + 菜单 | 未确认 | 审批/提问/完成/错误开关 |
| 资源策略 | 1 张 64×64 基图 | 20+ 套 favicon，多 DPI | 2 套 ico，内嵌红点 | 3 套 qrc ico | 1 张 64×64 |
| Shell 健壮性 | `TaskbarCreated` 重建 | Electron notify_icon_host | `TaskbarCreated` 重建 | worker + 双 GUID + 对账 | Electron Tray |

---

## 2. 逐客户端

### 2.1 微信：用“消失一帧”代替角标

**托盘实现（观察）**

- 不是 `QSystemTrayIcon`。微信自绘 `mmui::SystemTrayIconWin`，窗口类 `WxTrayIconMessageWindow`，直接调 `Shell_NotifyIconW`，`NOTIFYICON_VERSION_4`，`NOTIFYICONDATAW.cbSize=0x3D0`，GUID 身份 `XWeChat_System_Tray_Icon+_Guid_`。
- 托盘图标只有一条资源路径：`:/gui/icon/tray_window_icon/wechat_icon_64x64`。运行时 `GetSystemMetrics(SM_CXSMICON/SM_CYSMICON)` → `QIcon::pixmap` → `CreateIconIndirect` 生成 HICON，存在唯一槽位 `this+0x28`。
- 托盘模块内没有 `ExtTextOutW` / `CreateDIBSection` / `LoadImageW`；PE 只有 1 组应用图标。**没有第二套未读图标，也没有把红点/数字画进托盘的证据**。

**闪烁（观察）**

- 托盘图标闪烁：`QTimer(this+0x68)` 周期 **500ms**，回调把相位字节 `this+0x48` 取反，`NIM_MODIFY`：
  - 相位 1 → `hIcon = this+0x28`（正常图标）
  - 相位 0 → `hIcon = NULL`（图标消失一帧）
- 停止：`0x1D56570` 销毁闪烁集合、`QTimer::stop`、相位复位 1、恢复图标。
- 任务栏闪烁：托盘模块内 `0xA14810` 调 `FlashWindowEx(FLASHW_TRAY, uCount=3, dwTimeout=300ms)`；另有 Qt `setAlertState` 的 `FLASHW_TRAY,10,GetCaretBlinkTime()` 和一套 `FLASHW_ALL,4,100ms`，后两者无直接调用者。
- 导入表**没有** `SetOverlayIcon` / `ITaskbarList*`，所以微信不做 Win32 任务栏 overlay 角标。

**点击（观察）**

- `0x400/0x401`（NIN_SELECT）→ 单击；`0x203` 双击；`0x208` 中键；`0x7B` 右键菜单；`0x200` hover。
- 托盘只发信号，**不清未读**；清除在上层 `TrayActivated` / `ActiveWeChatFromSystemTray` 之后。

**判断**

- 微信的选择是“最低成本提醒”：不设计未读图标，直接让图标消失/出现 + 任务栏闪。优点是零资源、视觉强；缺点是用户不知道“有没有未读”，只知道“有东西在闪”，且闪烁期间托盘图标不可点。
- 对 DSH **不建议照抄**：DSH 的托盘是核心资产，隐藏/显示会造成任务栏图标区抖动，且插件无法控制。

### 2.2 QQNT：多状态整图 + 头像闪动 + 按会话任务栏闪

**前提（观察）**

- `application.asar` 1,455 个条目**全部加密**（JS/PNG 均无明文，`isByteCodeShell:true`），静态拿不到函数体；证据主要来自 `resources\app\major.node` 的 JS 字符串表（标识符、日志模板、设置键、CSS 类名都是明文）。

**托盘（观察/推断）**

- 主进程 Electron `Tray` 单例（业务名 `instIconTray`/`iconTray`），底层 `Shell_NotifyIconW`（`notify_icon_host.cc`、`Electron_NotifyIconHostWindow`、`TaskbarCreated`）。
- 图标来自 `resources\app\resource\favicon*.ico`：online/offline/leave/business/qme/reclusion/new/nonotify/empty/locked，每个都有 `-mm` 孪生版；每个 ico 含 16/20/24/32px 四个 32bpp 子图，`favicon.ico` 到 256px。
- **没有数字角标位图**；托盘不显示数字。`@` 不单独体现（`isAtMeMsg`/`isAtAllMsg` 只在 AIO 消息区）。

**未读模型（推断）**

- `TrayStore` 字段：`unReadCount`、`unReadListLength`、`hasAnyUnread`、`unreadFlag`、`GRAYPOINT`、`latestConcactFlashAvatar`、`isAvatarBlinkOpen`、五个类目开关（`kTrayFriendMsg`/`GroupMsg`/`FriendNotify`/`GroupNotify`/`Others`）。
- 有未读 → `favicon-new` 族（蓝气泡）；免打扰/不提醒 → `favicon-nonotify`（禁止符）/ `GRAYPOINT`；请勿打扰 → `favicon-reclusion`（橙气泡）。
- 数字只进 tooltip（`getUserToolTipStr` 拼 `unReadCount=`）。

**闪烁（推断）**

- 通道 A：`flashTrayIcon` + `setTrayInterval` + `iconTrayTimer` + `flashTrayToggle`，定时 `tray.setImage()` 在“基础状态图标”与“最新未读会话头像”（`latestConcactFlashAvatar`）之间轮换；设置项 `kTrayAvatarFlash` / 右键 `ToggleAvatarflash`；失败有 `setImage HICON error` 重试与降级。
- 通道 B：`TaskBarFlash` 调 `BrowserWindow.flashFrame()`，按会话窗口 `minimizedWindowAioMap`、`windowUpdateThrottleMs` 节流；`shouldFlashFrame`/`getIfNeedNotify`/`isWindowActive` 判定。
- 停止：托盘鼠标进入、点击、主窗聚焦、`openAio`/`openAllMsg`/`openNotify`、未读清零、设置变更、`clearTrayInterval`、`stopFlashWindow`。

**点击（推断）**

- 左键显示/切换主窗并停闪，可 `trayClickOpenAio` 直开未读会话；双击 `dbClickOpenAio`；右键是自绘 `WindowDriver` 弹窗（非系统菜单），含在线状态、`ToggleAvatarflash`、`CloseAudio`、`Quit` 等。

**判断**

- QQ 是“最像完整 IM 产品”的方案：状态多、可配置、按会话闪、头像闪有品牌感。但头像闪依赖“最新未读会话头像”管线，DSH 没有头像体系，复制成本高。
- 其“五类目开关 + 免打扰灰点 + 数字只进 tooltip”的产品分层值得借鉴。

### 2.3 飞书：两态烘焙图标 + 两套独立闪

**托盘（观察）**

- 原生 `frame.dll` 自绘 `Lark_StatusTrayWindow`，`Shell_NotifyIconW` V4，回调 `0x8001`，`TaskbarCreated` 重建。
- 图标 `IDR_TRAY_ICON_WIN` / `IDR_TRAY_ICON_NOTICE_WIN`（Win7 变体）；磁盘 `assets/image/tray.ico` / `tray_notice.ico` 可覆盖；再上是 `lark_tray_icon.ico` 自定义；动态头像走 `GetDynamicIconData`/`LoadDynamicIconAsImage`。
- 两 ico 均 98,534B，含 32/48/64/128 四尺寸；128×128 差异 bbox **(93,0)-(128,35)**，红点 `≈RGB(240,91,86)`，1308 像素。**红点是烤进图标的，无运行时合成、无数字**；`frame.dll` 无 GDI 文本/绘图导入。

**未读模型（观察）**

- 五类：`normal` / `special` / `at` / `buzz` / `other`，聚合成“有未读”一个布尔；`GetAllTenantsUnreadCound`（源码拼写错误）跨租户聚合。
- `NavigationAppModelImpl::SetBadge(number,bgcolor)` 只更新模型并打日志 `badge changed!`，函数体内无 OS/COM/GDI 调用；Windows 不用它做系统角标。

**闪烁（观察/推断）**

- 托盘闪：`FlashTray` / `OnFlashTray` / `[notify_and_tray][FlashTray][V2]: flash icon`，normal↔notice 两态切换，受 preference `lark.flash_tray` 与菜单 `IDS_LARK_TRAY_OPEN_FLASH`/`CLOSE_FLASH` 控制；**周期未知**（托盘 TU 无 500/700/2000ms 常量，`SetTimer` 不在托盘 TU）。
- 任务栏闪：`FlashWindowEx` 唯一调用点封装 `FLASHWINFO{cbSize=0x20, hwnd=self+0x30, flags=(self+0x138==0? FLASHW_ALL:FLASHW_TRAY), uCount=4, dwTimeout=0}`；无 `FLASHW_TIMER/TIMERNOFG`，靠上层反复调用；`flash=false` 即 `FLASHW_STOP`。
- 决策：主窗 active → “main window active” 不闪；minimized → 另一分支；否则 “windows taskbar icon flash” 并触发。

**点击（观察/推断）**

- 左键 `0x201` 恢复/聚焦；右键 `0x204` 弹菜单；hover 200ms 出 `StatusIconHoverMenu`；菜单含 Open / View More / Open Flash / Close Flash / Ignore All / Quit。

**判断**

- 飞书最接近“低成本高质量”：两张烘焙 ico + 两个独立信号（未读态、闪烁请求）+ 一个用户偏好。红点尺寸/位置/颜色可直接作为 DSH 资产规范参考。
- JS/CEF 完全不拥有托盘，只有一个 `flashTray` API；这与 DSH 插件处境相似，说明“原生层拥有托盘、上层只发意图”是合理架构。

### 2.4 钉钉：三态图标 + @ 优先 + 纯托盘闪

**托盘（观察）**

- 两代并存：旧 `SimpleTrayIconUtils` / `CTrayUIMgr`；新 `tray_notification::TrayIconManager` + `NativeTrayIconDetector`（`tray_icon_manager_win.cpp`），开关 `realm_win_enable_fixed_tray_icon_v2` 等。
- 新实现：独立 worker 线程 + 窗口类 `DingTalk.TrayWorker.` + 互斥体 `Local\DingTalk.TrayRegistration.` + 主/备双 GUID + `NIM_ADD/MODIFY/SETVERSION/DELETE` + `TaskbarCreated` 恢复 + 1000ms 崩溃重启 + 对账态（`NIM_MODIFY_reconcile` / `other_guid` / `DELETE_inactive`）。
- 三张 qrc 图标：`tray.ico`（正常）、`tray_msg.ico`（未读红点）、`trayAt.ico`（@）。选择逻辑：`vm_has_at ? trayAt : tray_msg`；恢复 `tray.ico`。**@ 优先于普通未读**。
- 渲染链 `RenderIconToExactSize` → `CreateDIBSection`/`CreateBitmap`/`CreateIconIndirect`，`target_px` 由 `GetSystemMetricsForDpi` 计算；无 DrawText，**不画数字**。`99+` 13 处引用全在 UI 侧。

**闪烁（观察）**

- `flash_timer_` 构造 `setInterval(0x258=600ms)`；`StartFlash` 把图标切到 `trayAt`/`tray_msg` 并启动；`StopFlash` 恢复 `tray.ico`。即 **normal ↔ msg/at 两态交替**，不是隐藏/显示。
- `USER32!FlashWindowEx` 虽导入，但**全 .text 无调用点**；新版托盘不闪任务栏。
- 停止：事件码 `0x7b`/`0x205`（激活/右键）→ `QTimer::stop` + `flashing=0`；左键点击走点击处理；hover 进入会重启 400ms 定时器；timer active 但 >3000ms 未 tick 会记 `flash_timer_not_advancing` 自愈。
- 未找到闪烁总时长上限。

**点击（观察/推断）**

- 左键恢复/置前主窗；右键 `TrayMenuPanel`（Open DingTalk / Settings / DingPan / Exit）；旧版 `CTrayUIMgr::OnTrayNotify` 带会话 cid，`[Tray] force bring window to top` 修复点击不显窗。

**判断**

- 钉钉的“三态 + @ 优先”是最贴合 DSH 语义的模型：DSH 有 approval/question/error 三种“需要你”的事件，正好可映射为不同状态（但 DSH 没有 @ 概念，可用“审批”专用态替代）。
- Worker/双 GUID/对账对 DSH 过重；DSH 用 Electron Tray，Explorer 重启由 Electron 处理，不需要自建 Shell worker。

### 2.5 DSH 当前：有托盘，但托盘是“死的”

**核心（观察）**

- `app.asar` 0.2.2-rc.5；`lib/main.js:2` 导入 `Tray`；`DesktopTray` 在 `lib/main.js:19942-19983`：
  - `new Tray(nativeImage.createFromPath(options.iconPath))`
  - `tray.on("click", () => options.open())`
  - tooltip `messages.aboutProduct`；context menu 仅 Open / Quit；`dispose()` destroy。
- 只有 win32 创建（`lib/main.js:21380-21394`），图标 `resources/tray.ico` 64×64；失败仅 `console.warn`。
- 单一静态图标，无未读、无 badge、无 attention IPC。
- `flashFrame` 只在 `lib/main.js:17145/17149` 的 `DesktopUpdateAttention` 使用，focus 时清除；不是给插件通知的公共能力。
- 全量 `DESKTOP_IPC` 未发现 tray/badge/attention；README `:222` 明确“No DSH core changes: app.asar, Electron main/preload are untouched and no IPC is added.”

**插件（观察）**

- `client.js:1066-1147` `startBadgeSync()`：`navigator.setAppBadge(unread)` / `clearAppBadge()`，只在窗口隐藏/失焦时 5 秒轮询，聚焦本地清角标。
- `index.js:194` 聚焦 `unreadSessions.clear()`；`lib/unread.js` 以 `Map<session, timestamp>` 统计“有未处理提醒的会话数”，上限 99；不区分 approval/question/turnEnd/error，且 **approval 路径没有 mark**（只覆盖 question/turnEnd/error）。
- 没有托盘图标、没有 `flashFrame`、没有 `setOverlayIcon`。

**差距**

| 能力 | 四款 IM | DSH 当前 | 差距性质 |
|---|---|---|---|
| 托盘未读态 | 全部有 | 无 | 核心未提供 |
| 托盘 @/审批专用态 | 钉钉有 @ | 无 | 核心未提供 + 插件无类型 |
| 托盘闪 | 微信/QQ/飞书/钉钉 | 无 | 核心未提供 |
| 任务栏闪 | 微信/QQ/飞书 | 仅核心更新 | 插件无 API |
| 数字角标 | **都不用** | 任务栏用 | DSH 反而更“重” |
| 免打扰 | QQ 有 | 无 | 产品缺口 |
| 点击进会话 | 四款都有 | toast 审批回填 | DSH 审批更强，但普通提醒不定位 |
| 用户开关 | QQ/飞书丰富 | 审批/提问/完成/错误 | 基本够用 |

---

## 3. 横向对比：真正值得注意的 8 个模式

### 3.1 托盘不显示数字，是四款的共同选择

- 微信：无未读图标。
- QQ：多状态整图，数字进 tooltip。
- 飞书：两态 ico，红点。
- 钉钉：三态 ico，红点/@。
- 原因：托盘 16×16 逻辑像素下数字不可读；Windows 通知区域还会缩放/收纳。数字属于“列表/窗口”层级，不属于“图标”层级。

**对 DSH 的含义**：现在 `navigator.setAppBadge(count)` 在任务栏显示数字是合理的；不要把这个数字再搬到托盘。托盘只需“有没有需要你的事”。

### 3.2 未读态是“整图替换”，不是运行时画点

- 飞书：`tray.ico` / `tray_notice.ico` 像素级差异就是右上角红点。
- 钉钉：`tray.ico` / `tray_msg.ico` / `trayAt.ico` 三张 qrc。
- QQ：`favicon-new` / `favicon-nonotify` / `favicon-reclusion` 等整套。
- 微信：连未读图都没有，直接空白闪烁。

**对 DSH 的含义**：如果做托盘态，资产应是 2–3 张预烘焙 ico，不要运行时用 Canvas/GDI 画；这样 DPI、抗锯齿、高对比度都稳定。

### 3.3 红点规格高度一致

| 应用 | 红点颜色 | 尺寸（相对图标） | 位置 |
|---|---|---|---|
| 钉钉 | `#FF5219` | 256px 图中直径约 73px ≈ 28.5% | 右上角，部分出血 |
| 飞书 | `≈#F05B56` | 128px 图中直径约 40px ≈ 31% | 右上角，bbox (93,0)-(128,35) |
| QQ | 蓝气泡（非红点） | 约 40% 宽 | 右下/覆盖主体 |
| 微信 | 无 | — | — |

**对 DSH 的含义**：若做红点，建议 28–31% 直径、右上角、允许出血 1–2px；颜色用品牌强调色，不要直接用纯红 `#FF0000`。

### 3.4 @/mention 只有钉钉做成独立图标

- 钉钉：`trayAt.ico`，红底白 @，比红点更大；`vm_has_at` 优先。
- 飞书：数据层有 `at` 分类，但聚合后仍是一颗红点。
- QQ：托盘不区分 @。
- 微信：无。

**对 DSH 的含义**：DSH 没有“@”语义，但有更强的“审批/提问”语义。与其造一个 @，不如做“审批专用态”（例如红色感叹号/对勾）——但前提是核心愿意为插件提供状态图标。

### 3.5 闪烁有三种实现，成本/观感差异很大

| 实现 | 代表 | 机制 | 优点 | 缺点 |
|---|---|---|---|---|
| 正常↔空白 | 微信 | 500ms `hIcon=NULL` / 恢复 | 零资源、最显眼 | 托盘图标消失，无法点击；观感粗糙 |
| 正常↔未读态 | 钉钉 / 飞书 | 600ms（钉钉）切换 ico | 状态始终可读，视觉稳定 | 需要两/三套 ico；持续闪会烦 |
| 基础↔最新未读头像 | QQ | `tray.setImage()` 轮换 | 有品牌感、信息量大 | 依赖头像管线；实现复杂 |

**对 DSH 的含义**：若做，选“正常↔未读态”，周期 600ms 左右，闪 3–5 次或直到聚焦；不要用空白闪烁。

### 3.6 任务栏闪烁是独立通道，且都“不自动停”

- 微信：`FLASHW_TRAY,3,300ms`；Qt `10,caret`；`FLASHW_ALL,4,100ms`。
- 飞书：`FLASHW_ALL/TRAY,4,0`；无 `FLASHW_TIMERNOFG`。
- QQ：`BrowserWindow.flashFrame`，按会话窗口，节流。
- 钉钉：新版不调用 `FlashWindowEx`。
- 共同点：聚焦/点击/已读后显式停；不依赖系统“前台自动停”。

**对 DSH 的含义**：Electron `BrowserWindow.flashFrame(true)` 在 Windows 上就是 `FlashWindowEx`；DSH 核心已有这个调用（更新提醒）。若开放给插件，应复用同一套“聚焦即停”，不要另造定时器。

### 3.7 点击行为：都回到主窗，只有 QQ 尝试“直开未读会话”

- 微信/飞书/钉钉：左键恢复/置前主窗；右键菜单。
- QQ：左键可 `trayClickOpenAio` 直开未读会话；双击 `dbClickOpenAio`；右键自绘菜单。
- 共同点：托盘点击是“回到应用”，不是“标记已读”；清除未读由上层在窗口激活/会话打开后做。

**对 DSH 的含义**：托盘点击应聚焦主窗；普通完成提醒可定位会话，审批提醒仍应回到审批面板/toast，不要打乱现有审批闭环。

### 3.8 用户开关：QQ 最细，飞书最克制

- QQ：`kTrayFlicker`（总）、`kTrayFlickerStyle`（头像/消息盒）、`kTrayAvatarFlash`、`kTrayMessageBox`、`kTrayIconBlink`、`kTrayVoices`、五类目开关、`kHideQQOnTaskBar`。
- 飞书：`lark.flash_tray` + 菜单“开启/关闭闪烁”。
- 钉钉/微信：未确认到同等粒度的托盘开关。
- DSH：审批/提问/完成/错误四个通知开关，没有“托盘/闪烁”维度。

**对 DSH 的含义**：不要一上来给 10 个开关；先给“启用托盘未读态”“启用闪烁”两个，默认开/关要有产品判断。

---

## 4. DSH 可复用/可借鉴清单

### A. 可直接复用（零代码，设计规则）

1. **托盘只表达布尔状态**：normal / unread / action（可选 mention）。数字留在任务栏 badge 或 tooltip。
2. **整图换态**：2–3 张预烘焙 ico；不做运行时绘制；多尺寸 16/20/24/32/48/64/128/256。
3. **红点规格**：右上角、直径 28–31%、允许出血 1–2px；颜色用品牌强调色（参考钉钉 `#FF5219`、飞书 `#F05B56`）。
4. **状态优先级**：action（审批/提问）> unread（完成/错误）> none；同级按最近时间。
5. **闪烁规则**：仅未聚焦时；normal↔unread 600ms；最多 3–5 次或直到聚焦；聚焦/点击立即停；提供关闭开关。
6. **点击规则**：托盘点击聚焦主窗；不直接清未读；清理由“窗口激活/会话打开”统一做。

### B. 插件层可先做（不改 DSH 核心）

1. **把 `UnreadTracker` 从“会话集合”升级为“状态集合”**  
   现在只存 `Map<session, timestamp>`。建议增加 `kind: 'approval' | 'question' | 'turnEnd' | 'error'`，并提供：
   - `level`：`none` / `info` / `action`
   - `count`：会话数
   - `hasAction`：是否存在审批/提问
   - `snapshot()` 返回 `{count, level, sessions}`
2. **任务栏 badge 语义收敛**  
   现在 `setAppBadge(unreadSessions.size)` 把 question/turnEnd/error 都算进去，且 **approval 不计入**。建议先加 `badge` 元数据与 `badge.scope` 配置，0.2.4 默认保持 `all` 兼容；0.3 再评估默认只对 `action`（approval/question）计数，`turnEnd/error` 不计入 badge（仍可发通知）。这样与四款 IM 的“只有需要你看的才红点”一致，又不会升级即变数字。
3. **为未来托盘契约预留适配层**  
   在 `client.js` 里抽一个 `setAttention(state)`：如果 `window.dshDesktop?.setAttention` 存在就调用，否则回退到 `navigator.setAppBadge`。现在只写回退分支，等核心 API 上线后零改动接入。
4. **诊断**  
   在 `/desktop-notify/debug` 里输出 `badge: {level,count,hasAction}`，方便验证。

> 这一阶段**不产生托盘图标**，只把“未读语义”准备好；可独立发版，风险低。

### C. 需要 DSH 核心契约（跨仓库）

最小 API 建议（命名可改）：

```ts
// main: DesktopTray
type AttentionLevel = 'none' | 'info' | 'action' | 'mention'
tray.setAttention({ level, count }: { level: AttentionLevel; count?: number }): void
```

行为：

- `level` 映射到 `tray.ico` / `tray-unread.ico` / `tray-action.ico`（可选 `tray-mention.ico`）。
- `action` 且窗口未聚焦 → `mainWindow.flashFrame(true)`；`none` 或聚焦 → `flashFrame(false)`。
- 点击托盘 → `focusPrimaryWindow()`；聚焦后 renderer 调 `setAttention({level:'none'})`。
- `TaskbarCreated` 由 Electron Tray 处理，不需要自建 worker。
- 只允许主窗 renderer / 已授权插件调用；校验 sender。

preload：

```ts
window.dshDesktop?.setAttention(state)
```

插件侧：

```js
const api = window.dshDesktop
if (api?.setAttention) api.setAttention({ level, count })
else navigator.setAppBadge?.(count)
```

**这是唯一能做出“托盘未读态 + 闪烁”的路径**；没有核心契约，插件层只能继续用任务栏 badge。

### D. 明确不借鉴

| 项 | 原因 |
|---|---|
| QQ 的“最新未读会话头像闪动” | 依赖头像管线；DSH 无头像体系；实现成本高、品牌感不属于 DSH |
| 钉钉的 worker + 双 GUID + 对账 | Electron Tray 已处理 Explorer 重启；自建 Shell worker 过重，易引入竞态 |
| 微信的“图标隐藏/显示” | 托盘图标消失期间不可点击；观感粗糙；不适合常驻生产力工具 |
| 飞书的多租户/忽略全部/悬浮菜单 | DSH 单租户、单主窗；不需要 |
| 托盘数字角标 | 四款都不做；16px 下不可读 |
| 无限闪烁 | 四款都靠聚焦/点击停；无限闪会疲劳，且 Windows 无自动停 |
| 运行时 GDI/Canvas 画红点 | DPI/抗锯齿/高对比度难保证；预烘焙 ico 更稳 |

---

## 5. 建议的落地顺序（与计划书配套）

1. **先定语义**：DSH 的“未读”到底代表“有提醒”还是“需要你决策”。建议 `action`（审批/提问）与 `info`（完成/错误）分开。
2. **插件 0.2.4（可独立发布）**：`UnreadTracker` 增加 kind/level；approval 接入 unread；`/status` 增加 `badge`；`setAttention` 适配层 + 回退（已落地）；badge 默认保持 `all`，`action` 作为可选配置；测试与文档。**不动托盘**。
3. **DSH 核心 RFC**：`desktopAttention` API + 3 张 ico + flash 策略；先在核心仓库实现，插件只做适配。
4. **联调**：100%/125%/150%/200% DPI；Explorer 重启；多窗口；聚焦/失焦；审批/提问/完成/错误四类事件；关闭闪烁开关。
5. **验收**：托盘图标在未读时可见但不刺眼；聚焦后 1 帧内恢复；不出现第二个托盘；不改变审批回填链路。

---

## 6. 未决与证据边界

| 项 | 状态 |
|---|---|
| 微信是否存在 XUI 运行时合成的带红点 QIcon | **未知**；托盘模块只认一个 HICON 槽位，未定位上层 `setIcon` 调用者 |
| 微信未读态 → 托盘闪烁的精确布尔式 | **未知**；`0x1D545B0` 内联判定未完全符号化 |
| QQ 托盘轮换间隔/闪动次数/默认值 | **未知**；asar 加密，数字不在字符串表 |
| QQ `-mm` 图标语义 | **未知** |
| 飞书托盘闪烁周期/驱动源 | **未知**；托盘 TU 无相关常量 |
| 飞书 DND 对托盘的门控 | **未知** |
| 钉钉闪烁总时长上限 | **未知**；未找到 deadline 字段 |
| 钉钉 DND/聚合规则 | **未知** |
| DSH 核心是否接受 `desktopAttention` 契约 | **待决策**；当前 README 明确不做核心改动 |

> 以上均为静态证据；未运行四款客户端做运行时验证。QQ 的 `application.asar` 加密，其结论主要来自 `major.node` 字符串表，已标注“推断”。

---

## 7. 附件

- 原始笔记：
  - `D:\Temp\dsh-YblLlQ\rea\notes\wechat-deep.md`（217 行）
  - `D:\Temp\dsh-YblLlQ\rea\notes\qq-deep.md`（176 行）
  - `D:\Temp\dsh-YblLlQ\rea\notes\feishu-deep.md`（264 行）
  - `D:\Temp\dsh-YblLlQ\rea\notes\dingtalk-deep.md`（383 行）
- 图标样本：
  - `D:\Temp\dsh-YblLlQ\rea\icons\dt-tray.png` / `dt-tray_msg.png` / `dt-trayAt.png`
  - `D:\Temp\dsh-YblLlQ\rea\icons\fs-tray.png` / `fs-tray_notice.png`
  - `D:\Temp\dsh-YblLlQ\rea\icons\qq-favicon*.png`
  - `D:\Temp\dsh-YblLlQ\rea\icons\dsh-tray.png`
- 关键源码/二进制位置：
  - 微信 `D:\Program Files\Weixin\4.2.0.53\Weixin.dll`
  - QQ `D:\Program Files\QQ\versions\9.9.37-54395\QQNT.dll`、`resources\app\application.asar`、`major.node`
  - 飞书 `D:\Program Files\Feishu\app\frame.dll`
  - 钉钉 `D:\Program Files\DingDing\main\current\MainFrame.dll`
  - DSH `C:\Users\33390\AppData\Local\Programs\DeepSeek Harness\resources\app.asar`、`resources\tray.ico`
