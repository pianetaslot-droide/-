import SwiftUI
import WebKit
import Network

struct WebView: UIViewRepresentable {
    let url: URL
    @Binding var scriptToInject: String
    @Binding var isRunning: Bool
    var proxyInfo: ProxyInfo?
    var onMessage: ([String: Any]) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "bridge")

        // 代理配置（iOS 17+）
        if #available(iOS 17.0, *), let proxy = proxyInfo {
            let endpoint = NWEndpoint.hostPort(
                host: NWEndpoint.Host(proxy.host),
                port: NWEndpoint.Port(integerLiteral: proxy.port)
            )
            let proxyConfig = ProxyConfiguration(httpCONNECTProxy: endpoint)
            if let user = proxy.username, let pass = proxy.password {
                proxyConfig.applyCredential(username: user, password: pass)
            }
            config.websiteDataStore.proxyConfigurations = [proxyConfig]
        }

        // 页面导航安全拦截 + 登录凭据捕获脚本
        let navScript = WKUserScript(source: """
            // 路由切换拦截
            window.addEventListener('hashchange', function() {
                // 自动登录流程中，登录成功后的跳转不暂停
                if (window._autoResuming) {
                    window._autoResuming = false;
                    window.webkit.messageHandlers.bridge.postMessage({type:'login_success'});
                    return;
                }
                if (!window.isPaused) {
                    window.isPaused = true;
                    window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg:'检测到路由切换，任务已暂停'});
                }
            });

            // 导航按钮拦截
            window.addEventListener('click', function(e) {
                let target = e.target.closest('.back-button, .back-text, .tab-item, .tabs, .ion-ios-arrow-back, ion-tab, .buttons-left');
                if (target && !window.isPaused) {
                    window.isPaused = true;
                    window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg:'检测到页面跳转操作，任务已暂停'});
                }
            }, true);

            // 捕获登录凭据：用户点击登录按钮时保存账号密码
            document.addEventListener('click', function(e) {
                var btn = e.target.closest('button, .button, ion-button, [type="submit"]');
                if (btn && window.location.hash.indexOf('/login') !== -1) {
                    var inputs = document.querySelectorAll('input');
                    var user = '', pass = '';
                    inputs.forEach(function(inp) {
                        if (inp.type === 'password' && inp.value) pass = inp.value;
                        else if (['text','tel','email','number'].indexOf(inp.type) !== -1 && inp.value) user = inp.value;
                    });
                    if (user && pass) {
                        window.webkit.messageHandlers.bridge.postMessage({
                            type: 'save_credentials', username: user, password: pass
                        });
                    }
                }
            }, true);
        """, injectionTime: .atDocumentEnd, forMainFrameOnly: false)
        config.userContentController.addUserScript(navScript)

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = context.coordinator
        wv.allowsBackForwardNavigationGestures = true
        return wv
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        if !scriptToInject.isEmpty {
            let js = scriptToInject
            uiView.evaluateJavaScript(js) { _, error in
                if let error = error {
                    let nsError = error as NSError
                    let exceptionMsg = nsError.userInfo["WKJavaScriptExceptionMessage"] as? String ?? nsError.localizedDescription
                    DispatchQueue.main.async {
                        self.onMessage(["type": "auto_pause", "msg": "JS底层报错: \(exceptionMsg)"])
                    }
                }
            }
            DispatchQueue.main.async { self.scriptToInject = "" }
        }
        if uiView.url == nil {
            uiView.load(URLRequest(url: url))
        }
    }

    class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: WebView
        init(_ parent: WebView) { self.parent = parent }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            DispatchQueue.main.async {
                if self.parent.isRunning {
                    self.parent.isRunning = false
                    self.parent.onMessage(["type": "auto_pause", "msg": "检测到全页跳转，任务自动暂停"])
                    webView.evaluateJavaScript("(function(){ window.isPaused = true; return null; })();")
                }
            }
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if let dict = message.body as? [String: Any] {
                DispatchQueue.main.async {
                    self.parent.onMessage(dict)
                }
            }
        }
    }
}
