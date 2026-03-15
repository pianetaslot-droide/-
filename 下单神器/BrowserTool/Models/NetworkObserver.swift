import Foundation
import Network
import Combine

class NetworkObserver: ObservableObject {
    private let monitor = NWPathMonitor()
    @Published var isConnected = true

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.isConnected = (path.status == .satisfied)
            }
        }
        let queue = DispatchQueue(label: "NetworkMonitor")
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }
}
