import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let url: URL
    @Binding var scriptToInject: String
    @Binding var isRunning: Bool
    var onMessage: ([String: Any]) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "bridge")

        let navScript = WKUserScript(source: """
            window.addEventListener('hashchange', function() {
                if (!window.isPaused) {
                    window.isPaused = true;
                    window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg:'检测到路由切换，任务已暂停'});
                }
            });
            window.addEventListener('click', function(e) {
                let target = e.target.closest('.back-button, .back-text, .tab-item, .tabs, .ion-ios-arrow-back, ion-tab, .buttons-left');
                if (target && !window.isPaused) {
                    window.isPaused = true;
                    window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg:'检测到页面跳转操作，任务已暂停'});
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
