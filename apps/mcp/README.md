# @aurite-ai/kai

**Kai is your AI copilot's memory.**

Without Kai, your AI copilot starts fresh every conversation. With Kai, it remembers what it's learned, finds relevant context for each task, and works more effectively across your projects.

---

## Quick Start (Claude Code)

### Step 1: Add Kai

```bash
claude mcp add kai -s user -e ANTHROPIC_API_KEY="your-anthropic-api-key" -- npx @aurite-ai/kai
```

> **Scope options:**
> - `-s project` — Config stored for current project only
> - `-s user` — Config stored globally (available across all projects)

### Step 2: Set Up Kai

In each new project, restart Claude Code and say:

> **"Set up Kai"**

This deploys copilot rules to your project and runs first-time onboarding. The copilot will ask a few questions to understand your organization and project context—this only happens once, then Kai remembers.

### Step 3: Teach Kai Your Context

Share files from anywhere on your system:

> **"learn ~/Downloads/business-policies.pdf"**

Or share entire folders:

> **"learn the docs/ folder"**

Kai classifies and stores everything in its knowledge base. This context persists across sessions and projects.

### Step 4: Start Building

When you start a task, Kai automatically surfaces relevant context:

> **"build a customer support agent"**

Kai finds the relevant policies, examples, and patterns you've taught it.

Use `/mcp` in Claude Code to verify the server is connected.

---

## Tool Reference

| Tool                          | What It Does                           | Example                         |
| ----------------------------- | -------------------------------------- | ------------------------------- |
| `kai_initialize`              | Deploys copilot rules, runs onboarding | "Set up Kai"                    |
| `kai_learn`                   | Adds files to knowledge base           | "Learn the docs/ folder"        |
| `kai_prepare_context`         | Surfaces relevant knowledge for a task | "Build a search feature"        |
| `kai_ask`                     | Quick Q&A against the knowledge base   | "What's our API format?"        |
| `kai_delete`                  | Removes files from knowledge base      | "Remove the outdated API doc"   |
| `kai_usage`                   | Shows token usage and costs            | "Show my Kai usage"             |
| `kai_discover_integration`    | Detects services in your files         | (auto-detected during learn)    |
| `kai_use_integration`         | Calls discovered integrations          | "Query the PostgreSQL database" |

<details>
<summary>🔌 Integration Workflow</summary>

When you `learn` files containing API keys or service configs, Kai automatically:

1. Detects integrations (databases, APIs, etc.)
2. Stores credentials securely in vault
3. Makes integrations available for your agent to use

Example: After learning a file with PostgreSQL connection strings, you can say:

> "Query the users table"

</details>

**Additional tools:** `kai_provide_context`, `kai_verify_integration`, `kai_list_integrations`. See [Advanced Documentation](https://github.com/Aurite-ai/kai/blob/main/apps/mcp/docs/ADVANCED.md) for complete reference.

---

## Other Installation Methods

### npm (Global Install)

```bash
npm install -g @aurite-ai/kai
```

Configure your MCP client to use `kai-mcp` as the command.

### npx (No Install)

```bash
npx @aurite-ai/kai
```

### Docker

```bash
docker pull kai/mcp
docker run -i kai/mcp
```

### From Source

```bash
git clone https://github.com/Aurite-ai/kai.git
cd kai
pnpm install
pnpm --filter @aurite-ai/kai build
pnpm --filter @aurite-ai/kai bundle
```

---

## Configuration

### API Key

Kai requires an `ANTHROPIC_API_KEY` for AI-powered tools. Set it in your MCP config:

```json
{
  "mcpServers": {
    "kai": {
      "command": "npx",
      "args": ["@aurite-ai/kai"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

**Config file locations:**

- Claude Code (project): `.mcp.json`
- Claude Code (global): `~/.claude/settings.json`

### Environment Variables

```bash
# Required for AI-powered tools
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Custom knowledge base location
KAI_KNOWLEDGE_DIR=/path/to/custom/knowledge
```

---

## Troubleshooting

### "Missing ANTHROPIC_API_KEY" Error

1. Check your MCP config has the `env` block with `ANTHROPIC_API_KEY`
2. Verify the key starts with `sk-ant-`
3. Restart Claude Code after config changes

### Tools Not Appearing

1. Check `/mcp` in Claude Code to verify connection
2. Try `npx @aurite-ai/kai --version` to confirm package access
3. Check config JSON syntax

### "Organization Context Required"

Run onboarding: say **"Set up Kai"** to your copilot.

---

## Development

```bash
pnpm --filter @aurite-ai/kai dev          # Watch mode
pnpm --filter @aurite-ai/kai test         # Run tests
pnpm --filter @aurite-ai/kai typecheck    # Type-check
pnpm --filter @aurite-ai/kai bundle       # Production bundle
```

---

## License

MIT
