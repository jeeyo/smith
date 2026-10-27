cask "smith" do
  arch arm: "aarch64", intel: "x64"

  version "0.2.0"
  sha256 arm:   "67fa1902c8fada6af36c65fa1bf10141c706824fc18b7f079bfe3732f20cddd2",
         intel: "e78d7c55aeb4cf7c712138e7a80900bef0f5d163a199e2edb0607106a8d45ed0"

  url "https://github.com/jeeyo/smith/releases/download/v#{version}/Smith_#{version}_#{arch}.dmg"
  name "Smith"
  desc "Smith"
  homepage "https://github.com/jeeyo/smith"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on formula: [
    "git",
    "node@22",
    "uv",
  ]

  app "Smith.app"
  binary "#{appdir}/Smith.app/Contents/MacOS/Smith", target: "smith"

  # Smith is not yet signed/notarized with an Apple Developer ID, so Gatekeeper
  # reports the quarantined download as "damaged". Clear the quarantine flag.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/Smith.app"]
  end

  zap trash: [
    "~/.smith",
    "~/Library/Application Support/com.jeeyo.smith",
    "~/Library/Application Support/Smith",
    "~/Library/Application Support/smith",
    "~/Library/Caches/com.jeeyo.smith",
    "~/Library/Preferences/com.jeeyo.smith.plist",
    "~/Library/Saved Application State/com.jeeyo.smith.savedState",
  ]
end
