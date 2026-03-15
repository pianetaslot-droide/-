import Foundation

struct OrderLog: Identifiable {
    let id = UUID()
    let time = Date().formatted(.dateTime.hour().minute().second())
    let code: String
    let status: String
    let isError: Bool
    let isSystem: Bool

    static func system(_ msg: String) -> OrderLog {
        OrderLog(code: "", status: msg, isError: true, isSystem: true)
    }

    static func item(code: String, status: String) -> OrderLog {
        OrderLog(code: code, status: status,
                 isError: status.contains("失败") || status.contains("无商品"),
                 isSystem: false)
    }

    static func waiting(_ msg: String) -> OrderLog {
        OrderLog(code: "", status: "⏳ \(msg)", isError: false, isSystem: true)
    }

    var displayText: String {
        if isSystem || code.isEmpty {
            return "\(time) - \(status)"
        }
        return "\(time) - [\(code)] \(status)"
    }

    var displayColor: LogColor {
        if status.contains("冷却") || status.contains("退避") { return .cooldown }
        if status.contains("加购成功") { return .success }
        if isError { return .error }
        if status.contains("跳过") { return .skip }
        return .normal
    }

    enum LogColor {
        case normal, error, success, cooldown, skip
    }
}

struct TaskStats {
    var success: Int = 0
    var failed: Int = 0
    var skipped: Int = 0
    var noProduct: Int = 0

    var total: Int { success + failed + skipped + noProduct }

    mutating func record(_ status: String) {
        if status.contains("加购成功") { success += 1 }
        else if status.contains("失败") { failed += 1 }
        else if status.contains("跳过") { skipped += 1 }
        else if status.contains("无商品") { noProduct += 1 }
    }

    mutating func reset() {
        success = 0; failed = 0; skipped = 0; noProduct = 0
    }
}
