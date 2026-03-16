# 浏览器工具 - 项目记忆 (CLAUDE.md)

## 项目概述
这是一款 **iOS 通用浏览器工具**，基于 SwiftUI + WKWebView 构建。
用户可以通过粘贴条码列表，配合云端脚本实现网页自动化操作。
**注意：这是一款独立的浏览器工具，与任何第三方平台没有官方协议关系。**

## 技术栈
- **前端**: SwiftUI (iOS 16+)
- **WebView**: WKWebView + WKScriptMessageHandler
- **脚本**: JavaScript（云端托管于 GitHub Gist）
- **网络监控**: NWPathMonitor

## 项目结构
```
下单神器/
├── 第一版本/              # v1.0 原始版本（备份）
│   ├── ____App.txt
│   ├── ContentView.txt
│   └── github.txt
└── BrowserTool/           # v2.0 正式工程代码
    ├── App/
    │   ├── BrowserToolApp.swift    # App入口
    │   └── ContentView.swift       # 主界面
    ├── Views/
    │   └── WebView.swift           # WKWebView封装
    ├── Models/
    │   ├── OrderLog.swift          # 日志模型 + 统计数据
    │   └── NetworkObserver.swift   # 网络状态监听
    └── Resources/
        └── autoTask.js             # 自动化脚本（云端同步版本）
```

## 云端脚本地址
- Gist: `pianetaslot-droide/2b67c88036b16c0d4b91a7281748f8d4`
- 文件: `yollgo_script.js`
- 每次启动时带时间戳强制拉取最新版本

---

## 版本历史

### v1.0 - 初始版本
- 基础 WKWebView 浏览器
- 条码输入 + 搜索 + 加购功能
- 简单防频控（每50个冷却10秒）
- 频控弹窗自动关闭（仅检测 body.innerText）
- 固定2秒搜索间隔

### v2.0 - 全面优化版 (2026-03-15)
**防封控大幅升级：**
- 批次从50→20个，冷却从10秒→30秒
- 搜索间隔从固定2秒改为随机3~6秒（模拟人工节奏）
- 频控触发后指数退避（5s→10s→20s→40s→80s）
- 连续触发5次强制冷却90秒
- **自适应调速系统**：触发频控自动减速（+0.5x），连续成功30次自动提速（-0.2x）
- 增强弹窗检测：覆盖 modal/overlay/ion-alert 等多种DOM选择器
- 增加关键词检测：频繁/请稍后再试/try again

**UI/UX 改进：**
- 状态指示灯（绿色运行/蓝色连接/灰色待机）
- 实时统计面板：成功/无货/跳过/失败 分类计数
- 日志详情页（sheet弹出，可查看全部历史）
- 日志颜色分级（成功绿/失败红/冷却蓝/跳过橙）
- 重置按钮独立显示

**功能增强：**
- 条码自动去重（保留顺序，提示去除数量）
- 任务完成三次震动提醒
- 异常暂停震动提醒
- 断点续传（暂停后可继续）

**代码重构：**
- .txt 文件转为正式 .swift/.js 文件
- 代码分层：App / Views / Models / Resources
- OrderLog 模型增强（分类初始化、颜色枚举）
- WebView 独立封装
- NetworkObserver 独立封装

### v2.1 - 弹窗关闭增强 (2026-03-15)
**核心修复：频控弹窗无法关闭的问题**
- 弹窗关闭从单一 `click()` 升级为5种方法逐级尝试：
  1. Ionic `ionAlert.dismiss()` API（最可靠）
  2. Angular scope `.close()` / `.$close()` / `.hide()`
  3. `$ionicPopup` 服务 `.close()`
  4. 完整触摸+点击事件模拟（touchstart/touchend/mousedown/mouseup/click）
  5. 暴力移除 DOM（ion-alert/popup/backdrop 等）
- 新增 `ion-alert` 专项检测（`hasIonAlert`）

### v2.2 - 极速模式 (2026-03-15)
**去掉所有冷却，100%模拟人类最快操作节奏：**
- 移除批次冷却机制（无BATCH_SIZE/BATCH_COOLDOWN）
- 移除指数退避等待（弹窗关掉后立即继续）
- 移除自适应调速系统（不再减速）
- 单条间隔：0.8~1.5秒随机（模拟人类快速点击）
- 搜索等待：1.5~2.3秒随机（页面加载必需）
- 输入延迟：0.1~0.3秒（人类打字后按回车的停顿）
- 弹窗处理：关掉后仅等0.3~0.6秒即继续，不退避

### v2.4 - 弹窗卡死修复 (2026-03-15)
**核心修复：弹窗导致页面卡住、后续条码全被跳过的问题**

**问题根因：**
- CSS `display:none` 隐藏弹窗后，Ionic/Angular 框架仍认为弹窗打开
- 框架锁定页面交互，搜索无法执行，旧结果留在页面上
- 后续条码全被误判为"已在购物车"跳过

**修复方案：**
- 移除对弹窗本体的 CSS 隐藏（仅保留 body overflow 修复）
- 改为主动点击弹窗按钮（让框架正常处理关闭流程）
- 5级递进关闭：弹窗按钮 → Ok/确定搜索 → $ionicPopup API → ion-alert dismiss → DOM清理
- MutationObserver 检测弹窗后等100ms渲染完再点按钮
- DOM清理延迟50ms给框架时间

**搜索重试机制：**
- 搜索前检测 isPageBlocked（弹窗/popup-open 状态）
- 搜索后对比页面指纹验证搜索是否生效
- 未生效时关弹窗并重试（最多3次）

### v2.3 - 终极弹窗关闭 (2026-03-15)
**7种方法逐级关闭弹窗：**
1. $ionicPopup 服务 + _popupStack
2. Angular popup scope close/hide/dismiss
3. ion-alert dismiss API
4. Ionic 1 `.popup-buttons .button` 精准点击
5. 全局搜索 Ok/确定 按钮 + HTMLElement.prototype.click
6. 模拟 TouchEvent 坐标点击
7. 暴力删除 DOM + 清除 backdrop + body overflow
- 200ms 后二次验证清理

### v3.3 - 频控自动换IP修复 (2026-03-16)
**核心修复：频控检测后不换IP的问题**

**问题根因：**
- `session_reset` 处理器只清缓存重建WebView，不切换代理
- `switch_proxy` 处理器为空（只有注释，无逻辑）
- 频控是IP问题，同IP清缓存重新登录后马上又被频控

**修复方案：**
- 合并 `session_reset` 和 `switch_proxy` 为同一处理逻辑
- 频控触发时：有代理列表 → 自动切换到下一个代理（换IP）
- 无代理时：仅清缓存重置会话，并提示用户添加代理
- 日志明确显示切换到哪个代理地址

### v3.1 - 代理轮换（自动换IP）(2026-03-16)
**新增文件：**
- `ProxyManager.swift` — 代理列表管理 + 轮换逻辑

**核心功能：**
- 代理输入：支持 `ip:port` 或 `ip:port:user:pass` 格式，每行一个
- 代理列表持久化（UserDefaults）
- 频控弹窗自动检测（关键词：频繁/请稍后/操作过于/try again/too many）
- 检测到频控 → JS 发送 `switch_proxy` 消息 → Swift 切换下一个代理
- 通过 `.id()` 强制重建 WKWebView，应用新代理配置
- iOS 17+ `WKWebsiteDataStore.proxyConfigurations` 原生代理支持
- HTTP CONNECT 代理 + 可选认证（用户名密码）
- 切换后任务暂停，用户重新登录后点继续即可断点续传

**UI 改动：**
- 控制面板新增「代理」按钮（紫色主题）
- 展开代理输入框（可折叠）
- 实时显示当前使用的代理地址
- 切换代理时震动提醒

### v3.0 - 商业化（序列号验证系统）(2026-03-15)
**新增文件：**
- `server/` — Node.js 验证服务器（Express + SQLite）
- `LicenseManager.swift` — 序列号验证 + 设备绑定 + Keychain 存储
- `LicenseView.swift` — 序列号输入激活界面

**服务器端功能：**
- 序列号生成（XDSQ-XXXX-XXXX-XXXX 格式）
- 设备绑定（一号一机）
- 验证日志记录
- 管理后台 API（生成/禁用/启用/续费/解绑/统计）
- 管理员密钥鉴权

**App 端功能：**
- 启动时序列号验证门控
- Keychain 持久化存储序列号和设备ID
- 7天离线宽限期
- 退出登录功能

---

## 项目结构（更新）
```
下单神器/
├── server/                    # 验证服务器
│   ├── package.json
│   └── server.js              # Express API + SQLite
├── v2-拖入Xcode/             # iOS 客户端文件
│   ├── XiadanApp.swift
│   ├── ContentView.swift      # 主界面（含验证门控）
│   ├── WebView.swift
│   ├── OrderLog.swift
│   ├── NetworkObserver.swift
│   ├── LicenseManager.swift   # 序列号验证管理
│   ├── LicenseView.swift      # 激活界面
│   └── ProxyManager.swift     # 代理轮换管理
├── BrowserTool/               # v2 工程代码
└── 第一版本/                  # 备份 + 云端脚本
    └── github.txt             # Gist 云端脚本
```

---

## 开发注意事项
- 每次更新必须同步更新此 CLAUDE.md 的版本历史
- 云端 JS 脚本修改后需同步更新 `Resources/autoTask.js`
- 第一版本目录保留作为备份参考，不要删除
- 界面文案避免直接提及任何第三方平台名称（浏览器工具定位）
