# Smith ADE (Agentic Development Environment)

[![CI](https://github.com/jeeyo/smith/actions/workflows/ci.yml/badge.svg)](https://github.com/jeeyo/smith/actions/workflows/ci.yml)
[![Release](https://github.com/jeeyo/smith/actions/workflows/release.yml/badge.svg)](https://github.com/jeeyo/smith/actions/workflows/release.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Smith ADE is a high-performance, API-first **Cooperative Agentic Development Environment** packaged as a cross-platform desktop application using **Electron**. It provides dual-layer persistent memory powered by the official **Vectorize Hindsight** daemon, real-time multi-agent orchestration, interactive human-in-the-loop clarifications, dynamic model discovery, and cost telemetry.

![Smith ADE Desktop Interface](docs/images/screenshot_left_sidebar_chat_list.png)

---

## 🌟 Key Features

- 🖥️ **Cross-Platform Electron Desktop App**: Single-window desktop experience with native lifecycle management, hardware acceleration, and integrated background server supervision.
- 🗂️ **Collapsible Left Sidebar**: Clean, dedicated chat session management with real-time search, Git worktree branch badges, active session indicators, one-click deletion, and collapsible icon view.
- ⚙️ **Application-Level Configuration Hub**: In-app configuration dashboard (`SettingsView`) to customize executable paths for **Claude Code**, **Google Antigravity**, **OpenCode**, **Codex**, and **Astral `uv`/`uvx`**, alongside **Vectorize Hindsight** provider selection (`openai`, `anthropic`, `gemini`, `ollama`), masked API keys, and workspace defaults with live on-disk path verification.
- 🧠 **Embedded Vectorize Hindsight Daemon**: Zero-friction embedded memory engine using `@vectorize-io/hindsight-all` and `uvx hindsight-embed`, providing persistent bank storage, cross-session episodic memory, facts, and anti-patterns.
- 🤖 **Goal Orchestrator & Multi-Agent Swarms**: Autonomous orchestrator backed by real agent harnesses (Claude Code, Antigravity, OpenCode, Codex) with support for parallel multi-worker execution.
- 💬 **Interactive Human-In-The-Loop**: Native support for agent questionnaires (`ask_question`), interactive decision prompts, and unified chat streaming.
- ⚡ **Dual-Layer Memory**: High-speed in-memory short-term cache combined with long-term semantic knowledge banks.
- 📊 **Real-Time Telemetry & Costs**: Live token usage, financial expenditure breakdown, and active agent execution tracing.
- 📖 **Interactive OpenAPI Documentation**: Embedded Swagger UI available at `/api/docs` with live REST endpoints.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v22+
- [Astral `uv`](https://docs.astral.sh/uv/) (required for Hindsight daemon and Python-based tool runtimes)
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/jeeyo/smith.git
cd smith

# Install dependencies
npm install
```

### Running in Development

```bash
# Run web client + server in development mode
npm run dev

# Or launch the full Electron desktop app with live reload
npm run electron:dev
```

### Running Test Suite

```bash
# Run all unit, integration, and configuration tests
npm test
```

### Packaging Desktop Installers

```bash
# Full build and packaging for current OS
npm run electron:dist

# Pack unpacked directory without installer
npm run electron:pack
```

The output packages will be located in the `release/` directory.

---

## 🏛️ Architecture Overview

```mermaid
flowchart TD
    subgraph Electron ["Electron Host"]
        Main["Main Process (main.ts)"]
        Preload["Preload Bridge (preload.ts)"]
        Renderer["React 19 + Tailwind UI"]
        Sidebar["Collapsible Left Sidebar (Sidebar.tsx)"]
        SettingsView["Application Configuration (SettingsView.tsx)"]
        GoalChat["Single Goal Chat (GoalChat.tsx)"]
    end

    subgraph Backend ["Embedded Express & WebSocket Server (Port 4100)"]
        API["REST API & WebSocket Broadcast"]
        Orchestrator["Goal Orchestrator"]
        Discovery["Model & Agent Discovery"]
        CostEngine["Cost & Token Engine"]
        ConfigEngine["Config Engine (~/.smith/config.json)"]
    end

    subgraph Hindsight ["Vectorize Hindsight Engine (Port 8888)"]
        HSDaemon["Embedded uvx Hindsight Daemon"]
        HSClient["@vectorize-io/hindsight-client"]
        MemoryBank["SQLite / Vector Knowledge Bank"]
    end

    Main --> Backend
    Main --> HSDaemon
    Renderer --> Preload
    Preload --> API
    Renderer --> Sidebar
    Renderer --> SettingsView
    Renderer --> GoalChat
    API --> ConfigEngine
    Backend --> HSClient
    HSClient --> HSDaemon
    HSDaemon --> MemoryBank
```

For more details, see:
- [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [User Manual](docs/USER_MANUAL.md)

---

## 🔄 CI / CD Workflows

- **CI (`.github/workflows/ci.yml`)**: Automatically triggers on all pull/merge requests and pushes to `main`. Installs dependencies with `uv`, builds all targets, and runs the Vitest test suite.
- **Automated Releases (`.github/workflows/release.yml`)**: Triggers on every semantic tag push matching `vX.X.X` (e.g., `v1.0.0`). Extracts the semantic version, builds multi-platform installers (Windows `.exe`/`.zip`, Linux `.AppImage`/`.tar.gz`, macOS `.dmg`/`.zip`), and publishes a GitHub Release with auto-generated release notes and attached binary artifacts.

---

## 📜 License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
