import Foundation

struct ProxyInfo: Equatable {
    let host: String
    let port: UInt16
    let username: String?
    let password: String?

    var display: String {
        "\(host):\(port)"
    }
}

class ProxyManager: ObservableObject {
    @Published var proxies: [ProxyInfo] = []
    @Published var currentIndex: Int = -1       // -1 = 直连（无代理）
    @Published var webViewId: UUID = UUID()      // 切换代理时变更，强制重建 WebView
    @Published var proxyInput: String = "" {
        didSet {
            UserDefaults.standard.set(proxyInput, forKey: "proxy_list")
            parseProxies()
        }
    }

    var current: ProxyInfo? {
        guard currentIndex >= 0 && currentIndex < proxies.count else { return nil }
        return proxies[currentIndex]
    }

    var hasProxies: Bool { !proxies.isEmpty }

    init() {
        proxyInput = UserDefaults.standard.string(forKey: "proxy_list") ?? ""
        parseProxies()
    }

    /// 解析代理列表，格式：ip:port 或 ip:port:user:pass，每行一个
    func parseProxies() {
        let lines = proxyInput.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        proxies = lines.compactMap { line in
            let parts = line.components(separatedBy: ":")
            guard parts.count >= 2, let port = UInt16(parts[1]) else { return nil }
            let user = parts.count >= 3 ? parts[2] : nil
            let pass = parts.count >= 4 ? parts[3] : nil
            return ProxyInfo(host: parts[0], port: port, username: user, password: pass)
        }

        // 如果当前索引越界，重置
        if currentIndex >= proxies.count {
            currentIndex = proxies.isEmpty ? -1 : 0
        }
    }

    /// 切换到下一个代理，返回新代理信息
    @discardableResult
    func switchToNext() -> ProxyInfo? {
        guard !proxies.isEmpty else { return nil }
        currentIndex = (currentIndex + 1) % proxies.count
        webViewId = UUID()  // 触发 WebView 重建
        return current
    }
}
