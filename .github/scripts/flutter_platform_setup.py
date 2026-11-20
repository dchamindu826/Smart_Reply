"""Finishes the android/ and ios/ folders that `flutter create` made for flutter_app.

Run from flutter_app/ (the "Flutter app setup" workflow does this). Safe to run again:
every change checks first whether it is already there.

What it sets (from flutter_app/README.md):
  - app id lk.lumiai.smartreply on Android and iOS, app name "Smart Reply"
  - Android permissions, minSdk 24, core library desugaring
  - iOS usage texts, background modes, push entitlement, iOS 15 Podfile
"""

import pathlib
import plistlib
import re
import sys

APP_ID = "lk.lumiai.smartreply"
NAME = "Smart Reply"
root = pathlib.Path(".")


def fail(msg: str) -> None:
    print(f"::error::{msg}")
    sys.exit(1)


# ─── Android ───────────────────────────────────────────────────

manifest = root / "android/app/src/main/AndroidManifest.xml"
m = manifest.read_text()
perms = [
    "INTERNET", "RECORD_AUDIO", "CAMERA", "MODIFY_AUDIO_SETTINGS",
    "BLUETOOTH_CONNECT", "POST_NOTIFICATIONS", "WAKE_LOCK",
]
missing = [p for p in perms if f"android.permission.{p}\"" not in m]
if missing:
    lines = "".join(f'\n    <uses-permission android:name="android.permission.{p}" />' for p in missing)
    m = re.sub(r"(<manifest[^>]*>)", lambda x: x.group(1) + lines, m, count=1)
m = re.sub(r'android:label="[^"]*"', f'android:label="{NAME}"', m, count=1)
manifest.write_text(m)

gradle = root / "android/app/build.gradle.kts"
if not gradle.exists():
    fail("android/app/build.gradle.kts not found (this script expects the Kotlin Gradle files Flutter makes today).")
g = gradle.read_text()
g = re.sub(r'applicationId\s*=\s*"[^"]*"', f'applicationId = "{APP_ID}"', g, count=1)
g = re.sub(r"minSdk\s*=\s*[^\n]+", "minSdk = 24", g, count=1)
if "isCoreLibraryDesugaringEnabled" not in g:
    if "compileOptions {" not in g:
        fail("compileOptions block not found in build.gradle.kts")
    g = g.replace("compileOptions {", "compileOptions {\n        isCoreLibraryDesugaringEnabled = true", 1)
if "desugar_jdk_libs" not in g:
    g += '\ndependencies {\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")\n}\n'
if "checkReleaseBuilds" not in g:
    # release lint crashes inside lint on some plugins; it is not needed to build
    g = g.replace("    buildTypes {", "    lint {\n        checkReleaseBuilds = false\n        abortOnError = false\n    }\n\n    buildTypes {", 1)
gradle.write_text(g)

# ─── iOS ───────────────────────────────────────────────────────

info_path = root / "ios/Runner/Info.plist"
with info_path.open("rb") as f:
    info = plistlib.load(f)
info["CFBundleDisplayName"] = NAME
info["NSMicrophoneUsageDescription"] = "Smart Reply uses the microphone for WhatsApp calls and voice messages."
info["NSCameraUsageDescription"] = "Smart Reply uses the camera to send photos to customers."
info["NSPhotoLibraryUsageDescription"] = "Smart Reply lets you send photos and videos to customers."
# audio keeps a call going when the screen locks; remote-notification for push.
# ("voip" is left out: Apple rejects it unless the app uses PushKit/CallKit.)
info["UIBackgroundModes"] = ["audio", "remote-notification"]
info["ITSAppUsesNonExemptEncryption"] = False
with info_path.open("wb") as f:
    plistlib.dump(info, f)

ent = root / "ios/Runner/Runner.entitlements"
ent.write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    '<plist version="1.0">\n<dict>\n\t<key>aps-environment</key>\n\t<string>production</string>\n</dict>\n</plist>\n'
)

pbx = root / "ios/Runner.xcodeproj/project.pbxproj"
p = pbx.read_text()
# the Runner target's bundle id (RunnerTests has ".RunnerTests" after it)
p = re.sub(r"PRODUCT_BUNDLE_IDENTIFIER = [A-Za-z0-9.\-]+?(\.RunnerTests)?;",
           lambda x: f"PRODUCT_BUNDLE_IDENTIFIER = {APP_ID}{x.group(1) or ''};", p)
if "CODE_SIGN_ENTITLEMENTS" not in p:
    p = re.sub(rf"(\n(\s*)PRODUCT_BUNDLE_IDENTIFIER = {re.escape(APP_ID)};)",
               lambda x: f"\n{x.group(2)}CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;{x.group(1)}", p)
p = re.sub(r"IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;", "IPHONEOS_DEPLOYMENT_TARGET = 15.0;", p)
pbx.write_text(p)
if p.count("CODE_SIGN_ENTITLEMENTS") < 3:
    fail("Could not add the push entitlement to all three Runner build configurations.")

podfile = root / "ios/Podfile"
podfile.write_text("""platform :ios, '15.0'

# CocoaPods analytics sends network stats synchronously affecting flutter build latency.
ENV['COCOAPODS_DISABLE_STATS'] = 'true'

project 'Runner', {
  'Debug' => :debug,
  'Profile' => :release,
  'Release' => :release,
}

def flutter_root
  generated_xcode_build_settings_path = File.expand_path(File.join('..', 'Flutter', 'Generated.xcconfig'), __FILE__)
  unless File.exist?(generated_xcode_build_settings_path)
    raise "#{generated_xcode_build_settings_path} must exist. If you're running pod install manually, make sure flutter pub get is executed first"
  end

  File.foreach(generated_xcode_build_settings_path) do |line|
    matches = line.match(/FLUTTER_ROOT\\=(.*)/)
    return matches[1].strip if matches
  end
  raise "FLUTTER_ROOT not found in #{generated_xcode_build_settings_path}. Try deleting Generated.xcconfig, then run flutter pub get"
end

require File.expand_path(File.join('packages', 'flutter_tools', 'bin', 'podhelper'), flutter_root)

flutter_ios_podfile_setup

target 'Runner' do
  use_frameworks!

  flutter_install_all_ios_pods File.dirname(File.realpath(__FILE__))
  target 'RunnerTests' do
    inherit! :search_paths
  end
end

post_install do |installer|
  installer.pods_project.targets.each do |target|
    flutter_additional_ios_build_settings(target)
  end
end
""")

print(f"Platform folders ready: {APP_ID}, \"{NAME}\".")
