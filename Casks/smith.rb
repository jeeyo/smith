cask "smith" do
  arch arm: "aarch64", intel: "x64"

  version "0.3.0"
  sha256 arm:   "408ff4ffd44143460d9e19e5db96568f14a9224adba74b38c6bceb5204ae06bb",
         intel: "9b89d85d133811d829f37bd3b218f75a988c1741448e141734d8b19c9958c7e1"

  url "https://github.com/jeeyo/smith/releases/download/v#{version}/Smith_#{version}_#{arch}.dmg"
  name "Smith"
  desc "Shared board for a leaderless team of coding agents"
  homepage "https://github.com/jeeyo/smith"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on formula: [
    "git",
    "node@22",
  ]
  depends_on :macos

  app "Smith.app"
  binary "#{appdir}/Smith.app/Contents/MacOS/smith"

  # Smith is not yet signed/notarized with an Apple Developer ID, so Gatekeeper
  # reports the quarantined download as "damaged". Clear the quarantine flag.
  postflight_steps do
    run "/usr/bin/xattr",
        args:           ["-cr", "{{appdir}}/Smith.app"],
        writable_paths: "{{appdir}}/Smith.app"
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
