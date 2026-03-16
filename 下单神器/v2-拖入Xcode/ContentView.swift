import SwiftUI
import AudioToolbox
import WebKit

struct ContentView: View {
    // MARK: - State
    @State private var barcodeInput: String = ""
    @State private var injectedJS: String = ""
    @State private var isRunning = false
    @State private var isFetchingScript = false
    @State private var currentIndex = 0
    @State private var totalCount = 0
    @State private var logs: [OrderLog] = []
    @State private var stats = TaskStats()
    @State private var isPanelExpanded: Bool = true
    @State private var showLogSheet = false
    @State private var duplicateCount = 0
    @State private var invalidCount = 0
    @State private var cachedCodes: [String] = []
    @State private var cachedScript: String = ""
    @State private var savedUsername: String = ""
    @State private var savedPassword: String = ""
    @State private var isAutoResuming = false
    @State private var sessionResetCount = 0
    @State private var lastResetTime: Date? = nil
    @State private var waitingForAirplaneToggle = false
    @AppStorage("appLanguage") private var appLanguage: String = "zh"

    @StateObject private var networkObserver = NetworkObserver()
    @StateObject private var proxyManager = ProxyManager()
    @StateObject private var license = LicenseManager.shared
    @Environment(\.scenePhase) var scenePhase

    private let targetURL = "https://app.yollgo.com/#/account/login"
    private let cloudScriptURL = "https://gist.githubusercontent.com/pianetaslot-droide/2b67c88036b16c0d4b91a7281748f8d4/raw/yollgo_script.js"

    // MARK: - Body
    var body: some View {
        // TODO: 测试阶段跳过验证，上线前改回来
        mainView
//        if !license.isLicensed {
//            LicenseView(license: license)
//        } else {
//            mainView
//        }
    }

    // MARK: - 主界面（验证通过后显示）
    private var mainView: some View {
        VStack(spacing: 0) {
            controlPanel
            Divider()
            WebView(url: URL(string: targetURL)!, scriptToInject: $injectedJS, isRunning: $isRunning, proxyInfo: proxyManager.current) { data in
                handleMessage(data)
            }
            .id(proxyManager.webViewId)
        }
        .onChange(of: networkObserver.isConnected) { _, newValue in
            if !newValue && isRunning {
                pauseTask()
                addLog(.system(L("网络中断，已自动暂停", "Rete interrotta, pausa automatica")))
            }
            // 飞行模式换IP：网络恢复后自动清缓存+重新登录+继续任务
            if newValue && waitingForAirplaneToggle {
                waitingForAirplaneToggle = false
                addLog(.system(L("网络已恢复（新IP），正在重置会话...", "Rete ripristinata (nuovo IP), reset sessione...")))
                AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
                // 等2秒让网络稳定
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                    self.clearWebsiteDataAndRebuild()
                }
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase != .active && isRunning { pauseTask(); addLog(.system(L("应用退后台，已暂停", "App in background, pausa"))) }
        }
        .onChange(of: isRunning) { _, isNowRunning in
            UIApplication.shared.isIdleTimerDisabled = isNowRunning
        }
        .sheet(isPresented: $showLogSheet) {
            logDetailSheet
        }
    }

    // MARK: - 控制面板
    private var controlPanel: some View {
        VStack(spacing: 0) {
            HStack {
                Circle()
                    .fill(isRunning ? Color.green : (isFetchingScript ? Color.blue : Color.gray))
                    .frame(width: 8, height: 8)

                Text(isRunning ? L("运行中", "In esecuzione") : (isFetchingScript ? L("连接云端...", "Connessione...") : L("浏览器工具", "Browser Tool")))
                    .font(.subheadline).fontWeight(.semibold)
                    .foregroundColor(isRunning ? .green : (isFetchingScript ? .blue : .primary))

                Text("v3.2")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 5).padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.1))
                    .cornerRadius(4)

                Spacer()

                if !logs.isEmpty {
                    Button(action: { showLogSheet = true }) {
                        HStack(spacing: 2) {
                            Image(systemName: "list.bullet.rectangle")
                            Text(L("日志", "Log")).font(.caption)
                        }
                        .padding(.horizontal, 8).padding(.vertical, 5)
                        .background(Color.secondary.opacity(0.12))
                        .cornerRadius(10)
                    }
                }

                Button(action: { withAnimation(.easeInOut(duration: 0.25)) { isPanelExpanded.toggle() } }) {
                    Image(systemName: isPanelExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption).fontWeight(.medium)
                        .padding(8)
                        .background(Color.secondary.opacity(0.12))
                        .clipShape(Circle())
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)

            if isPanelExpanded {
                expandedPanel
            }
        }
        .background(Color(.systemBackground))
        .shadow(color: Color.black.opacity(0.04), radius: 2, x: 0, y: 2)
    }

    // MARK: - 展开面板
    private var expandedPanel: some View {
        VStack(spacing: 10) {
            ZStack(alignment: .topTrailing) {
                TextEditor(text: $barcodeInput)
                    .frame(height: 55)
                    .padding(4)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.25)))
                    .disabled(isRunning || isFetchingScript)

                if !barcodeInput.isEmpty && !isRunning && !isFetchingScript {
                    Button(action: resetAll) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.secondary)
                            .padding(8)
                    }
                }
            }

            if invalidCount > 0 || duplicateCount > 0 {
                VStack(alignment: .leading, spacing: 2) {
                    if invalidCount > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "exclamationmark.triangle").font(.caption2)
                            Text(L("已自动去除 \(invalidCount) 个非13位条码", "Rimossi \(invalidCount) codici non di 13 cifre"))
                                .font(.caption2)
                        }
                        .foregroundColor(.red)
                    }
                    if duplicateCount > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "info.circle").font(.caption2)
                            Text(L("已自动去除 \(duplicateCount) 个重复条码", "Rimossi \(duplicateCount) codici duplicati"))
                                .font(.caption2)
                        }
                        .foregroundColor(.orange)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if totalCount > 0 {
                VStack(spacing: 6) {
                    HStack {
                        ProgressView(value: Double(currentIndex), total: Double(totalCount))
                        Text("\(currentIndex)/\(totalCount)")
                            .font(.caption).monospacedDigit().foregroundColor(.secondary)
                    }
                    if stats.total > 0 {
                        statsBar
                    }
                }
            }

            HStack(spacing: 10) {
                mainActionButton
                if currentIndex > 0 && !isRunning {
                    Button(action: resetAll) {
                        Image(systemName: "arrow.counterclockwise")
                            .bold()
                            .frame(width: 44, height: 44)
                            .background(Color.secondary.opacity(0.15))
                            .foregroundColor(.primary)
                            .cornerRadius(8)
                    }
                }
            }

            if !networkObserver.isConnected {
                Label(L("网络连接异常", "Rete non disponibile"), systemImage: "wifi.slash")
                    .font(.caption).foregroundColor(.red)
            }

            if !logs.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(logs.suffix(2)) { log in
                        Text(log.displayText)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(logColor(log))
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal)
        .padding(.bottom, 10)
    }

    // MARK: - 统计栏
    private var statsBar: some View {
        HStack(spacing: 12) {
            statItem(L("成功", "OK"), count: stats.success, color: .green)
            statItem(L("无货", "Esaurito"), count: stats.noProduct, color: .orange)
            statItem(L("跳过", "Saltato"), count: stats.skipped, color: .blue)
            statItem(L("失败", "Fallito"), count: stats.failed, color: .red)
        }
        .font(.caption2)
    }

    private func statItem(_ label: String, count: Int, color: Color) -> some View {
        HStack(spacing: 3) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text("\(label) \(count)")
                .monospacedDigit()
                .foregroundColor(count > 0 ? color : .secondary)
        }
    }

    // MARK: - 主按钮
    private var mainActionButton: some View {
        Button(action: {
            if isRunning || isFetchingScript {
                pauseTask()
            } else {
                if !networkObserver.isConnected {
                    addLog(.system(L("当前无网络，请恢复网络后继续", "Nessuna rete, riprova dopo la connessione")))
                } else if currentIndex > 0 && !cachedCodes.isEmpty && !cachedScript.isEmpty {
                    // 断点续传：直接恢复，不重新拉取脚本
                    resumeTask()
                } else {
                    startTask()
                }
            }
        }) {
            Label(buttonTitle, systemImage: buttonIcon)
                .bold()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(buttonColor)
                .foregroundColor(.white)
                .cornerRadius(8)
        }
        .disabled(barcodeInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private var buttonTitle: String {
        if isFetchingScript { return L("正在拉取指令", "Caricamento...") }
        if isRunning { return L("暂停执行", "Pausa") }
        return currentIndex > 0 ? L("继续执行", "Continua") : L("开始执行", "Avvia")
    }

    private var buttonIcon: String {
        if isFetchingScript { return "arrow.down.doc.fill" }
        return isRunning ? "pause.fill" : "play.fill"
    }

    private var buttonColor: Color {
        if !networkObserver.isConnected { return .red }
        if barcodeInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .gray }
        if isRunning || isFetchingScript { return .orange }
        return .green
    }

    // MARK: - 日志详情
    private var logDetailSheet: some View {
        NavigationView {
            List(logs) { log in
                VStack(alignment: .leading, spacing: 2) {
                    Text(log.displayText)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(logColor(log))
                }
            }
            .listStyle(.plain)
            .navigationTitle(L("执行日志", "Log esecuzione"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(L("清空", "Svuota")) { logs.removeAll() }
                        .foregroundColor(.red)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(L("关闭", "Chiudi")) { showLogSheet = false }
                }
            }
        }
    }

    private func logColor(_ log: OrderLog) -> Color {
        switch log.displayColor {
        case .success: return .green
        case .cooldown: return .blue
        case .error: return .red
        case .skip: return .orange
        case .normal: return .primary
        }
    }

    // MARK: - 消息处理
    func addLog(_ log: OrderLog) {
        logs.append(log)
    }

    func handleMessage(_ data: [String: Any]) {
        guard let type = data["type"] as? String else { return }

        if type == "update" {
            let status = data["status"] as? String ?? "已处理"
            let code = data["code"] as? String ?? ""

            if code == "System" {
                addLog(.waiting(status))
            } else if status.contains("重试") || status.contains("退避") || status.contains("频控") {
                addLog(OrderLog(code: code, status: status, isError: false, isSystem: false))
            } else {
                currentIndex = (data["idx"] as? Int ?? 0) + 1
                stats.record(status)
                addLog(.item(code: code, status: status))
            }
        } else if type == "auto_pause" {
            isRunning = false
            if let idx = data["curIdx"] as? Int {
                currentIndex = idx
            }
            let msg = data["msg"] as? String ?? "已暂停"
            if msg != "已暂停" {
                addLog(.system(msg))
                AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
            }
        } else if type == "save_credentials" {
            if let user = data["username"] as? String, let pass = data["password"] as? String {
                savedUsername = user
                savedPassword = pass
                addLog(.system("登录凭据已保存，代理切换时将自动登录"))
            }
        } else if type == "session_reset" || type == "switch_proxy" {
            if let idx = data["curIdx"] as? Int {
                currentIndex = idx
            }
            isRunning = false
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)

            // 频控是IP问题 → 有代理就换IP，没代理就提示飞行模式换IP
            if proxyManager.hasProxies {
                let nextProxy = proxyManager.switchToNext()
                addLog(.system(L("频控→切换代理: \(nextProxy?.display ?? "直连")", "Limite freq→proxy: \(nextProxy?.display ?? "diretto")")))
                let minInterval: TimeInterval = 30
                if let last = lastResetTime, Date().timeIntervalSince(last) < minInterval {
                    let waitTime = minInterval - Date().timeIntervalSince(last)
                    addLog(.system(L("等待 \(Int(waitTime)) 秒后重置...", "Attendo \(Int(waitTime))s...")))
                    DispatchQueue.main.asyncAfter(deadline: .now() + waitTime) {
                        self.clearWebsiteDataAndRebuild()
                    }
                } else {
                    clearWebsiteDataAndRebuild()
                }
            } else {
                // 无代理 → 飞行模式换IP
                waitingForAirplaneToggle = true
                addLog(.system(L("⚠️ 频控！请开关飞行模式换IP，网络恢复后自动继续", "⚠️ Limite freq! Attiva/disattiva modalità aereo, riprendo automaticamente")))
                // 连续震动3次提醒用户
                for i in 0..<3 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.5) {
                        AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
                    }
                }
            }
        } else if type == "login_success" {
            addLog(.system("登录成功，自动继续任务..."))
            isAutoResuming = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                if !self.cachedCodes.isEmpty && !self.cachedScript.isEmpty {
                    self.executeRemoteScript(remoteJS: self.cachedScript, codes: self.cachedCodes)
                }
            }
        } else if type == "finish" {
            isRunning = false
            addLog(.system("全部完成！成功\(stats.success) 无货\(stats.noProduct) 跳过\(stats.skipped) 失败\(stats.failed)"))
            for i in 0..<3 {
                DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.4) {
                    AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
                }
            }
        }
    }

    // MARK: - 任务控制
    func startTask() {
        let ns = barcodeInput as NSString
        let regex = try? NSRegularExpression(pattern: "\\d+")
        let allCodes = regex?.matches(in: barcodeInput, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range) } ?? []

        guard !allCodes.isEmpty else { return }

        // 过滤非13位条码
        let validCodes = allCodes.filter { $0.count == 13 }
        invalidCount = allCodes.count - validCodes.count

        var seen = Set<String>()
        var uniqueCodes: [String] = []
        for code in validCodes {
            if seen.insert(code).inserted {
                uniqueCodes.append(code)
            }
        }
        duplicateCount = validCodes.count - uniqueCodes.count
        totalCount = uniqueCodes.count

        let cacheBusterURL = cloudScriptURL + "?t=\(Int(Date().timeIntervalSince1970))"
        guard let url = URL(string: cacheBusterURL) else { return }

        isFetchingScript = true

        let request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 10.0)
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                self.isFetchingScript = false
                if let error = error {
                    self.addLog(.system("请求失败: \(error.localizedDescription)"))
                    return
                }
                guard let data = data, let remoteJS = String(data: data, encoding: .utf8) else {
                    self.addLog(.system("脚本内容为空"))
                    return
                }
                self.cachedCodes = uniqueCodes
                self.cachedScript = remoteJS
                self.executeRemoteScript(remoteJS: remoteJS, codes: uniqueCodes)
            }
        }.resume()
    }

    func executeRemoteScript(remoteJS: String, codes: [String]) {
        isRunning = true
        let jsArray = "[\"" + codes.joined(separator: "\",\"") + "\"]"

        injectedJS = """
        (function(){
            try {
                window.onunhandledrejection = function(e) {
                    window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg: '后台报错: ' + (e.reason ? e.reason.message : '未知异常')});
                };
                window.isPaused = false;
                window.curIdx = \(currentIndex);
                window._postResetSlowdown = \(sessionResetCount);
                \(remoteJS)
                if (typeof window.startAutoTask === 'function') {
                    window.startAutoTask(\(jsArray));
                } else {
                    window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg:'云端函数解析失败'});
                }
            } catch(e) {
                window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg:'执行报错: ' + e.message});
            }
            return null;
        })();
        """
    }

    // MARK: - 自动登录
    func injectAutoLogin() {
        guard !savedUsername.isEmpty && !savedPassword.isEmpty else { return }

        let escapedUser = savedUsername.replacingOccurrences(of: "'", with: "\\'")
        let escapedPass = savedPassword.replacingOccurrences(of: "'", with: "\\'")

        injectedJS = """
        (function(){
            window._autoResuming = true;
            var attempts = 0;
            function tryLogin() {
                attempts++;
                if (attempts > 20) {
                    window._autoResuming = false;
                    window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg:'自动登录超时，请手动登录后继续'});
                    return;
                }
                var inputs = document.querySelectorAll('input');
                var userInput = null, passInput = null;
                inputs.forEach(function(inp) {
                    if (inp.type === 'password') passInput = inp;
                    else if (['text','tel','email','number'].indexOf(inp.type) !== -1 && !userInput) userInput = inp;
                });
                if (!userInput || !passInput) { setTimeout(tryLogin, 500); return; }

                var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                setter.call(userInput, '\(escapedUser)');
                userInput.dispatchEvent(new Event('input', {bubbles:true}));
                userInput.dispatchEvent(new Event('change', {bubbles:true}));
                setter.call(passInput, '\(escapedPass)');
                passInput.dispatchEvent(new Event('input', {bubbles:true}));
                passInput.dispatchEvent(new Event('change', {bubbles:true}));

                try {
                    if (window.angular) {
                        var scope = window.angular.element(userInput).scope();
                        if (scope) {
                            if (scope.input) { scope.input.phone = '\(escapedUser)'; scope.input.password = '\(escapedPass)'; }
                            scope.$apply();
                        }
                    }
                } catch(e) {}

                setTimeout(function() {
                    var btn = document.querySelector('button[type="submit"], .submit-btn, .login-btn, .button-positive, ion-button');
                    if (!btn) {
                        document.querySelectorAll('button, .button, a.button').forEach(function(b) {
                            var t = (b.innerText || '').trim();
                            if (t === '登录' || t === '登 录' || t.toLowerCase() === 'login' || t.toLowerCase() === 'sign in') btn = b;
                        });
                    }
                    if (btn) btn.click();
                }, 500);
            }
            if (window.location.hash.indexOf('/login') !== -1) {
                setTimeout(tryLogin, 1000);
            } else {
                window._autoResuming = false;
                window.webkit.messageHandlers.bridge.postMessage({type:'login_success'});
            }
            return null;
        })();
        """
    }

    // MARK: - Session Reset
    func clearWebsiteDataAndRebuild() {
        guard !savedUsername.isEmpty && !savedPassword.isEmpty else {
            addLog(.system(L("需要手动登录（未捕获登录凭据）", "Login manuale necessario")))
            return
        }

        sessionResetCount += 1
        lastResetTime = Date()

        let dataStore = WKWebsiteDataStore.default()
        let dataTypes = WKWebsiteDataStore.allWebsiteDataTypes()

        dataStore.fetchDataRecords(ofTypes: dataTypes) { records in
            dataStore.removeData(ofTypes: dataTypes, for: records) {
                DispatchQueue.main.async {
                    self.proxyManager.webViewId = UUID()
                    self.addLog(.system(self.L("会话已重置(第\(self.sessionResetCount)次)，正在重新登录...", "Sessione resettata (#\(self.sessionResetCount)), login...")))

                    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                        self.isAutoResuming = true
                        self.injectAutoLogin()
                    }
                }
            }
        }
    }

    func resumeTask() {
        isRunning = true
        executeRemoteScript(remoteJS: cachedScript, codes: cachedCodes)
    }

    func pauseTask() {
        isRunning = false
        isFetchingScript = false
        injectedJS = "(function(){ window.isPaused = true; return null; })();"
    }

    func resetAll() {
        barcodeInput = ""
        currentIndex = 0
        totalCount = 0
        duplicateCount = 0
        invalidCount = 0
        sessionResetCount = 0
        lastResetTime = nil
        isRunning = false
        isFetchingScript = false
        stats.reset()
        logs.removeAll()
        injectedJS = "(function(){ window.curIdx = 0; window.isPaused = true; if(window.cleanupStealth) window.cleanupStealth(); return null; })();"
    }

    // MARK: - 多语言
    func L(_ zh: String, _ it: String) -> String {
        appLanguage == "it" ? it : zh
    }
}
