import Foundation

struct OrderLog: Identifiable {
    let id = UUID()
    let time = Date().formatted(.dateTime.hour().minute().second())
    let code: String
    let status: String
    let isError: Bool
    let isSystem: Bool

    // 便捷初始化 - 系统消息
    static func system(_ msg: String) -> OrderLog {
        OrderLog(code: "", status: msg, isError: true, isSystem: true)
    }

    // 便捷初始化 - 普通条目
    static func item(code: String, status: String) -> OrderLog {
        OrderLog(code: code, status: status,
                 isError: status.contains("Rimanere") || status.contains("disponibile"),
                 isSystem: false)
    }

    // 便捷初始化 - 等待/冷却消息
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
        if status.contains("cooldown") || status.contains("backoff") { return .cooldown }
        if status.contains("Aggiunto") { return .success }
        if isError { return .error }
        if status.contains("esistente") { return .skip }
        return .normal
    }

    enum LogColor {
        case normal, error, success, cooldown, skip
    }
}

// 统计数据
struct TaskStats {
    var success: Int = 0
    var failed: Int = 0
    var skipped: Int = 0
    var noProduct: Int = 0

    var total: Int { success + failed + skipped + noProduct }

    mutating func record(_ status: String) {
        if status.contains("Aggiunto") { success += 1 }
        else if status.contains("Rimanere") { failed += 1 }
        else if status.contains("esistente") { skipped += 1 }
        else if status.contains("disponibile") { noProduct += 1 }
    }

    mutating func reset() {
        success = 0; failed = 0; skipped = 0; noProduct = 0
    }
}
