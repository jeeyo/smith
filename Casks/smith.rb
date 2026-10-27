cask "smith" do
  arch arm: "aarch64", intel: "x64"

  version "0.2.1"
  sha256 arm:   "59ca104a4268d8b9086ea3cfcbdb2cebde8c06289425f6b4e20a88ee7a0198d7",
         intel: "36c878b02ce944af6f9388c5179e7f67e3082dc6e768451f1a6a4c235e88691c"

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
