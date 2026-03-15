import SwiftUI

struct LicenseView: View {
    @ObservedObject var license = LicenseManager.shared
    @State private var inputKey: String = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 24) {
                // Logo
                VStack(spacing: 8) {
                    Image(systemName: "shippingbox.fill")
                        .font(.system(size: 50))
                        .foregroundColor(.blue)
                    Text("下单神器")
                        .font(.title).fontWeight(.bold)
                    Text("极速批发下单工具")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                // 输入框
                VStack(spacing: 12) {
                    TextField("输入序列号 XDSQ-XXXX-XXXX-XXXX", text: $inputKey)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(.body, design: .monospaced))
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .focused($isFocused)
                        .onSubmit { activate() }

                    if !license.errorMessage.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.caption)
                            Text(license.errorMessage)
                                .font(.caption)
                        }
                        .foregroundColor(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button(action: activate) {
                        HStack {
                            if license.isVerifying {
                                ProgressView()
                                    .tint(.white)
                                    .scaleEffect(0.8)
                            }
                            Text(license.isVerifying ? "验证中..." : "激活")
                                .bold()
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(inputKey.trimmingCharacters(in: .whitespaces).isEmpty ? Color.gray : Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(inputKey.trimmingCharacters(in: .whitespaces).isEmpty || license.isVerifying)
                }
                .padding(.horizontal, 4)
            }
            .padding(28)
            .background(Color(.systemBackground))
            .cornerRadius(16)
            .shadow(color: .black.opacity(0.08), radius: 10, y: 4)
            .padding(.horizontal, 24)

            Spacer()

            // 底部信息
            VStack(spacing: 4) {
                Text("购买序列号请联系客服")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text("WeChat: YOUR_WECHAT_ID")
                    .font(.caption)
                    .foregroundColor(.blue)
            }
            .padding(.bottom, 30)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .onAppear {
            if !license.licenseKey.isEmpty {
                inputKey = license.licenseKey
                // 自动验证已保存的序列号
                license.verify()
            }
        }
    }

    private func activate() {
        isFocused = false
        license.verify(key: inputKey)
    }
}
