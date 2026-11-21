import Flutter
import PushKit
import UIKit
import flutter_callkit_incoming

/// Classic app start (no UIScene) so the Flutter engine and plugins are ready when iOS wakes the
/// closed app for a VoIP push: PushKit must hand every call push to CallKit at once, or iOS stops
/// waking the app for calls.
@main
@objc class AppDelegate: FlutterAppDelegate, PKPushRegistryDelegate {
  private var voipRegistry: PKPushRegistry?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [PKPushType.voIP]
    voipRegistry = registry

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // The VoIP token the server sends call pushes to (read in Dart with getDevicePushTokenVoIP).
  func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
    let token = credentials.token.map { String(format: "%02x", $0) }.joined()
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP(token)
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP("")
  }

  // Incoming WhatsApp call: show it on CallKit straight away.
  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }
    let p = payload.dictionaryPayload
    let id = p["id"] as? String ?? UUID().uuidString
    let data = flutter_callkit_incoming.Data(
      id: id,
      nameCaller: p["nameCaller"] as? String ?? "WhatsApp call",
      handle: p["handle"] as? String ?? "",
      type: 0
    )
    data.appName = "Smart Reply"
    data.duration = 45000
    data.handleType = "generic"
    data.supportsVideo = false
    data.maximumCallGroups = 1
    data.maximumCallsPerCallGroup = 1
    data.includesCallsInRecents = false
    data.audioSessionMode = "voiceChat"
    data.extra = ["callId": id]
    guard let plugin = SwiftFlutterCallkitIncomingPlugin.sharedInstance else {
      completion()
      return
    }
    plugin.showCallkitIncoming(data, fromPushKit: true) {
      completion()
    }
  }
}
