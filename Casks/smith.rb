cask "smith" do
  arch arm: "aarch64", intel: "x64"

  version "0.4.0"
  sha256 arm:   "f2f06347b87455806901a92bc6e649b6b983a9d42daa73be7894bd52ca95964d",
         intel: "2c57f9754d24e0c667fbaa70e4aefc6e1fc5a17093d963b6a0a37419db952bae"

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
