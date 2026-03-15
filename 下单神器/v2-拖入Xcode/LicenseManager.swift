import Foundation
import UIKit

class LicenseManager: ObservableObject {
    static let shared = LicenseManager()

    // ⚠️ 部署后改成你的服务器地址，例如 https://yourdomain.com
    private let serverURL = "https://YOUR-SERVER.com"

    @Published var isLicensed = false
    @Published var licenseKey: String = ""
    @Published var expiresAt: String = ""
    @Published var errorMessage: String = ""
    @Published var isVerifying = false

    private let keychain = KeychainHelper.shared

    init() {
        // 启动时读取已保存的序列号
        if let savedKey = keychain.read(key: "license_key") {
            licenseKey = savedKey
        }
    }

    // 设备唯一ID（基于 identifierForVendor + keychain 持久化）
    var deviceID: String {
        if let saved = keychain.read(key: "device_id") {
            return saved
        }
        let id = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        keychain.save(key: "device_id", value: id)
        return id
    }

    // 验证序列号
    func verify(key: String? = nil, completion: ((Bool) -> Void)? = nil) {
        let keyToVerify = (key ?? licenseKey).trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !keyToVerify.isEmpty else {
            errorMessage = "请输入序列号"
            completion?(false)
            return
        }

        isVerifying = true
        errorMessage = ""

        guard let url = URL(string: "\(serverURL)/api/verify") else {
            errorMessage = "服务器地址配置错误"
            isVerifying = false
            completion?(false)
            return
        }

        var request = URLRequest(url: url, timeoutInterval: 10)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "license_key": keyToVerify,
            "device_id": deviceID
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                self.isVerifying = false

                if let error = error {
                    // 网络错误时，如果之前验证过就允许离线使用
                    if self.hasLocalValidation() {
                        self.isLicensed = true
                        completion?(true)
                    } else {
                        self.errorMessage = "网络连接失败: \(error.localizedDescription)"
                        completion?(false)
                    }
                    return
                }

                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    self.errorMessage = "服务器响应异常"
                    completion?(false)
                    return
                }

                let valid = json["valid"] as? Bool ?? false
                let msg = json["msg"] as? String ?? ""

                if valid {
                    self.isLicensed = true
                    self.licenseKey = keyToVerify
                    self.expiresAt = json["expires_at"] as? String ?? ""
                    self.errorMessage = ""

                    // 保存到 Keychain
                    self.keychain.save(key: "license_key", value: keyToVerify)
                    self.keychain.save(key: "last_valid", value: ISO8601DateFormatter().string(from: Date()))

                    completion?(true)
                } else {
                    self.isLicensed = false
                    self.errorMessage = msg

                    // 如果是过期，保留序列号方便续费
                    if json["expired"] as? Bool == true {
                        self.keychain.save(key: "license_key", value: keyToVerify)
                    }

                    completion?(false)
                }
            }
        }.resume()
    }

    // 离线宽限：上次验证成功后 7 天内允许离线使用
    private func hasLocalValidation() -> Bool {
        guard let lastValid = keychain.read(key: "last_valid"),
              let date = ISO8601DateFormatter().date(from: lastValid) else {
            return false
        }
        let gracePeriod: TimeInterval = 7 * 24 * 3600 // 7天
        return Date().timeIntervalSince(date) < gracePeriod
    }

    // 格式化到期日期
    var expiresFormatted: String {
        guard !expiresAt.isEmpty else { return "" }
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: expiresAt) {
            let display = DateFormatter()
            display.dateFormat = "yyyy-MM-dd"
            return display.string(from: date)
        }
        return expiresAt
    }

    // 退出登录
    func logout() {
        isLicensed = false
        licenseKey = ""
        expiresAt = ""
        errorMessage = ""
        keychain.delete(key: "license_key")
        keychain.delete(key: "last_valid")
    }
}

// ====== Keychain 简易封装 ======
class KeychainHelper {
    static let shared = KeychainHelper()

    func save(key: String, value: String) {
        let data = value.data(using: .utf8)!
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)

        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]
        SecItemAdd(addQuery as CFDictionary, nil)
    }

    func read(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}
