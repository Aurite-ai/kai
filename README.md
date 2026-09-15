<div align="center">
<h1>🌊 Kai</h1>
<p><strong>Your AI copilot's memory. Persistent context across sessions, projects, and teams.</strong></p>
<p>Give your coding agent the context it needs — automatically.</p>
<p>
<a href="https://github.com/Aurite-ai/kai/stargazers"><img src="https://img.shields.io/github/stars/Aurite-ai/kai?style=social" alt="GitHub stars"></a>
<a href="https://www.npmjs.com/package/@aurite-ai/kai"><img src="https://img.shields.io/npm/v/@aurite-ai/kai" alt="npm version"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
<a href="https://github.com/Aurite-ai/kai/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
<a href="https://github.com/Aurite-ai/kai/commits"><img src="https://img.shields.io/github/last-commit/Aurite-ai/kai" alt="Last commit"></a>
</p>
<p>Works with <strong>Claude Code</strong> · more copilots coming soon</p>
</div>

---

## The Problem

Every time you start a new conversation with your AI copilot, it forgets everything.

- 🔄 You repeat the same context about your project, your team, your standards
- 🤷 The copilot makes mistakes you've already corrected in past sessions
- 📄 Your policies, specs, and business rules sit in files the copilot never sees
- 🧠 Decisions and rationale from past conversations are lost forever

Copilots are powerful — but they have amnesia.

## The Solution

Kai gives your copilot a persistent memory that grows smarter over time.

| Without Kai | With Kai |
|---|---|
| Copilot starts fresh every session | Copilot remembers what it learned |
| You repeat context manually | Context surfaces automatically |
| Knowledge lives in your head | Knowledge lives in a structured KB |
| Decisions are forgotten | Decisions persist across sessions |

**How it works:** Kai runs as an [MCP server](https://modelcontextprotocol.io/) alongside your copilot. You teach it your context once — policies, specs, decisions, patterns — and it proactively surfaces relevant information when you need it.

> 🔒 All data stays local. Your code and context never leave your machine.

---

## Quickstart (Claude Code)

**Step 1:** Add Kai to Claude Code

```bash
claude mcp add kai -s user -e ANTHROPIC_API_KEY="your-anthropic-api-key" -- npx @aurite-ai/kai
```

> **Scope options:**
> - `-s project` — Config stored for current project only
> - `-s user` — Config stored globally (available across all projects)

**Step 2:** In any project, tell your copilot:

> **"Set up Kai"**

This deploys copilot rules and runs onboarding. The copilot asks a few questions to understand your context — this only happens once.

**Step 3:** Start teaching it your context:

> **"learn ~/Downloads/api-guidelines.pdf"**
>
> **"learn the docs/ folder"**

**Step 4:** Start working — Kai surfaces the right context automatically.

> **"build a customer support agent"**
>
> Kai feeds your copilot your API conventions, auth patterns, and related context. No reminders needed.

<details>
<summary>📦 More installation options (npm global, Docker, from source)</summary>

<br>

**npm (Global Install)**

```bash
npm install -g @aurite-ai/kai
```

Configure your MCP client to use `kai-mcp` as the command.

**npx (No Install)**

```bash
npx @aurite-ai/kai
```

**Docker**

```bash
docker pull kai/mcp
docker run -i kai/mcp
```

**From Source**

```bash
git clone https://github.com/Aurite-ai/kai.git
cd kai
pnpm install
pnpm --filter @aurite-ai/kai build
pnpm --filter @aurite-ai/kai bundle
```

</details>

---

## What It Looks Like

You teach Kai your company's context:

> "learn ~/docs/api-guidelines.pdf"
>
> "learn the docs/ folder"

Later, you start a task:

> "build a customer support agent"

Kai automatically surfaces the relevant context to your copilot:

- ✅ Your API conventions and auth patterns
- ✅ Customer data models and access policies
- ✅ Error handling and response format standards
- ✅ Related endpoints already in the codebase

Your copilot builds it right the first time — no reminders needed.

---

## How It Works

```
┌────────────────────────────────────────────────────────────────┐
│  YOU                          COPILOT                  KAI     │
│                                                                 │
│  "set up Kai"     ─────────►  deploys rules  ─────►  .kai/    │
│                               asks questions          stores    │
│                                                       context   │
│                                                                 │
│  "learn these docs" ───────►  kai_learn      ─────►  knowledge │
│                                                       base      │
│                                                                 │
│  "build feature X" ────────►  kai_prepare    ─────►  surfaces  │
│                               _context                relevant  │
│                                                       files     │
└────────────────────────────────────────────────────────────────┘
```

---

> 💡 **If Kai saves you from repeating yourself, consider [giving it a ⭐](https://github.com/Aurite-ai/kai/stargazers).** It helps others discover the project.

---

## Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Quickstart](#quickstart-claude-code)
- [What It Looks Like](#what-it-looks-like)
- [How It Works](#how-it-works)
- [How It Compares](#how-it-compares)
- [Features](#features)
- [Available Tools](#available-tools)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## How It Compares

| Feature | Kai | Copilot Memory | RAG Tools | Manual Context |
|---|---|---|---|---|
| Persists across sessions | ✅ | Partial | ✅ | ❌ |
| Learns from files & conversations | ✅ | ❌ | Files only | N/A |
| Proactive context surfacing | ✅ | ❌ | Query-based | ❌ |
| Auto-classifies knowledge | ✅ | ❌ | ❌ | Manual |
| Works across projects | ✅ | ❌ | Varies | ❌ |
| Zero-config for copilot | ✅ | ✅ | ❌ | ❌ |
| Data stays local | ✅ | ❌ | Varies | ✅ |

Kai is not a replacement for built-in copilot memory — it's what copilot memory should have been.

---

## Features

- 🌊 **Knowledge Base** — Store, categorize, and retrieve context from markdown files
- 🎯 **Smart Context Surfacing** — Automatically surface relevant knowledge for your task
- 🔗 **Integration Management** — Discover, verify, and use external service integrations
- 🔐 **Secure Credential Vault** — Store and manage secrets with multiple provider support
- 📊 **Usage Tracking** — Monitor token consumption and costs per project
- 🚀 **Onboarding System** — Guided setup for organization and project context

## Available Tools

| Tool | Description |
|------|-------------|
| `kai_initialize` | Deploys copilot rules, runs onboarding |
| `kai_learn` | Adds files to knowledge base with classification |
| `kai_prepare_context` | Surfaces relevant knowledge for a task |
| `kai_ask` | Quick Q&A against the knowledge base |
| `kai_delete` | Remove outdated files from the knowledge base |
| `kai_provide_context` | Store org or user context in the knowledge base |
| `kai_usage` | View token usage and cost summary for the project |
| `kai_list_integrations` | List all discovered integrations and their status |
| `kai_use_integration` | Execute operations on discovered integrations |
| `kai_verify_integration` | Verify integration credentials and connectivity |
| `health_check` | Verify MCP server connectivity |

---

## Documentation

**For Users:**
- [MCP Server Documentation](apps/mcp/README.md) — Installation, tools, configuration
- [Advanced Documentation](apps/mcp/docs/ADVANCED.md) — Integrations, vault, KB structure

**For Contributors:**
- [Product Design](docs/design/README.md) — Core concepts, tool specifications
- [Architecture: Repository Infrastructure](docs/architecture/01-repository-infrastructure.md)
- [Architecture: Context Management System](docs/architecture/02-context-management-system.md)

---

## Contributing

We welcome contributions of all kinds!

- 🐛 **Found a bug?** [Open an issue](https://github.com/Aurite-ai/kai/issues)
- 💡 **Have an idea?** [Open a feature request](https://github.com/Aurite-ai/kai/issues/new)
- 🔧 **Want to contribute code?** [Open a PR](https://github.com/Aurite-ai/kai/pulls)

<details>
<summary>🛠️ Developer Setup</summary>

<br>

**Prerequisites**

- Node.js 18+
- pnpm 9+

**Quick Start**

```bash
# Install dependencies
pnpm install

# Set up environment
cp apps/mcp/.env.example apps/mcp/.env

# Build workspace packages
pnpm build

# Run tests
pnpm test
```

**Scripts**

| Command          | Description                        |
| ---------------- | ---------------------------------- |
| `pnpm build`     | Build all packages (via Turborepo) |
| `pnpm test`      | Run all tests across workspace     |
| `pnpm lint`      | Lint codebase (Biome)              |
| `pnpm lint:fix`  | Lint and auto-fix issues           |
| `pnpm format`    | Format codebase (Biome)            |
| `pnpm typecheck` | Type-check all packages            |
| `pnpm clean`     | Remove build artifacts and caches  |

**Testing CLI**

| Command              | Description                                |
| -------------------- | ------------------------------------------ |
| `pnpm kai-test`      | Run testing CLI                            |
| `pnpm test:create`   | Create a test project from a scenario      |
| `pnpm test:list`     | List available scenarios and test projects |
| `pnpm test:collect`  | Collect results from a test session        |

**Project Structure**

```
kai/
├── apps/
│   └── mcp/                # MCP server (stdio) — context management tools
│       ├── src/
│       │   ├── knowledge/  # Knowledge base domain logic (agents, storage, surfacing)
│       │   ├── integrations/   # External service integration management
│       │   ├── vault/      # Secure credential management
│       │   ├── usage/      # Token usage and cost tracking
│       │   └── tools/      # MCP tool handlers
│       └── templates/      # Project initialization templates
├── packages/
│   ├── testing/            # QA testing infrastructure (scenarios + CLI)
│   └── vck-templates/      # Copilot configuration templates
└── docs/                   # Documentation
```

</details>

---

## License

MIT
