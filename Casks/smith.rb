cask "smith" do
  arch arm: "arm64", intel: "x64"

  version "0.1.1"
  sha256 arm:   "d82b0775a04e66a22a7967bf77a68e162dc67efa9a1aa5d4f4bb7f24b25a2a33",
         intel: "d82b0775a04e66a22a7967bf77a68e162dc67efa9a1aa5d4f4bb7f24b25a2a33"

  url "https://github.com/jeeyo/smith/releases/download/v#{version}/Smith-#{version}-#{arch}.dmg"
  name "Smith"
  desc "Smith"
  homepage "https://github.com/jeeyo/smith"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :catalina"

  app "Smith.app"
  binary "#{appdir}/Smith.app/Contents/MacOS/Smith", target: "smith"

  zap trash: [
    "~/.smith",
    "~/Library/Application Support/Smith",
    "~/Library/Application Support/smith",
    "~/Library/Preferences/com.jeeyo.smith.plist",
    "~/Library/Saved Application State/com.jeeyo.smith.savedState",
  ]
end
