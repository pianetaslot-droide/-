import SwiftUI
import AudioToolbox

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

    @StateObject private var networkObserver = NetworkObserver()
    @Environment(\.scenePhase) var scenePhase

    private let targetURL = "https://app.yollgo.com/#/account/login"
    private let cloudScriptURL = "https://gist.githubusercontent.com/pianetaslot-droide/2b67c88036b16c0d4b91a7281748f8d4/raw/yollgo_script.js"

    // MARK: - Body
    var body: some View {
        VStack(spacing: 0) {
            controlPanel
            Divider()
            WebView(url: URL(string: targetURL)!, scriptToInject: $injectedJS, isRunning: $isRunning) { data in
                handleMessage(data)
            }
        }
        .onChange(of: networkObserver.isConnected) { _, newValue in
            if !newValue && isRunning { pauseTask(); addLog(.system("网络中断，已自动暂停")) }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase != .active && isRunning { pauseTask(); addLog(.system("应用退后台，已暂停")) }
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
            // 顶部栏
            HStack {
                Circle()
                    .fill(isRunning ? Color.green : (isFetchingScript ? Color.blue : Color.gray))
                    .frame(width: 8, height: 8)

                Text(isRunning ? "运行中" : (isFetchingScript ? "连接云端..." : "浏览器工具"))
                    .font(.subheadline).fontWeight(.semibold)
                    .foregroundColor(isRunning ? .green : (isFetchingScript ? .blue : .primary))

                Spacer()

                if !logs.isEmpty {
                    Button(action: { showLogSheet = true }) {
                        HStack(spacing: 2) {
                            Image(systemName: "list.bullet.rectangle")
                            Text("日志").font(.caption)
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

    // MARK: - 展开面板内容
    private var expandedPanel: some View {
        VStack(spacing: 10) {
            // 输入框
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

            // 去重提示
            if duplicateCount > 0 {
                HStack(spacing: 4) {
                    Image(systemName: "info.circle").font(.caption2)
                    Text("已自动去除 \(duplicateCount) 个重复条码")
                        .font(.caption2)
                }
                .foregroundColor(.orange)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            // 进度条 + 统计
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

            // 操作按钮
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

            // 网络提示
            if !networkObserver.isConnected {
                Label("网络连接异常", systemImage: "wifi.slash")
                    .font(.caption).foregroundColor(.red)
            }

            // 最近日志（最多2条）
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
            statItem("成功", count: stats.success, color: .green)
            statItem("无货", count: stats.noProduct, color: .orange)
            statItem("跳过", count: stats.skipped, color: .blue)
            statItem("失败", count: stats.failed, color: .red)
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
                    addLog(.system("当前无网络，请恢复网络后继续"))
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
        if isFetchingScript { return "正在拉取指令" }
        if isRunning { return "暂停执行" }
        return currentIndex > 0 ? "继续执行" : "开始执行"
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

    // MARK: - 日志详情页
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
            .navigationTitle("执行日志")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("清空") { logs.removeAll() }
                        .foregroundColor(.red)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("关闭") { showLogSheet = false }
                }
            }
        }
    }

    // MARK: - 日志颜色
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
            let msg = data["msg"] as? String ?? "已暂停"
            addLog(.system(msg))
            // 震动提醒用户注意
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
        } else if type == "finish" {
            isRunning = false
            addLog(.system("全部完成！成功\(stats.success) 无货\(stats.noProduct) 跳过\(stats.skipped) 失败\(stats.failed)"))
            // 完成提醒：三次震动
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

        // 去重（保留顺序）
        var seen = Set<String>()
        var uniqueCodes: [String] = []
        for code in allCodes {
            if seen.insert(code).inserted {
                uniqueCodes.append(code)
            }
        }
        duplicateCount = allCodes.count - uniqueCodes.count
        totalCount = uniqueCodes.count

        // 拉取云端脚本
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
        isRunning = false
        isFetchingScript = false
        stats.reset()
        logs.removeAll()
        injectedJS = "(function(){ window.curIdx = 0; window.isPaused = true; if(window.cleanupStealth) window.cleanupStealth(); return null; })();"
    }
}
