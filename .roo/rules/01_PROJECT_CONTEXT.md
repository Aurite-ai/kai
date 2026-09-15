# Kai - Project Context

## Overview

You are working in the **Kai 2.0** repository. Following these rules is CRITICAL for maintaining code quality, consistency, and effective development.

**Kai** is a context management platform that helps coding copilots succeed with complex tasks. The primary interface is an **MCP server** that provides tools for sending context, retrieving relevant information, and verifying results. Behind the MCP tools, a **Knowledge Base** of organized markdown files (written by agents, for agents) grows and improves over time.

**Core Components:**

- **MCP Server** - Local stdio server providing tools for copilots (send_context, get_context, verify_results, etc.)
- **Knowledge Base** - Organized markdown documentation maintained by specialized agents
- **Agent Pipeline** - Categorization and processing agents that transform raw files into structured knowledge
- **VCK Templates** - Static copilot configurations and framework rules (Vibe Code Kits)

**Architecture:** The MCP server runs locally and handles file reading/writing. Agents and knowledge base logic will eventually live in a cloud API, but for now development focuses on getting the MCP tools working with local agents.

**Technology Stack:** TypeScript/Node.js monorepo (pnpm + Turborepo) with MCP server (stdio) as the primary runtime.

**Development Stage:** Kai 2.0 is a complete rebuild from scratch, currently in early infrastructure phase. Backwards compatibility is **never** required. Focus on clean, simple code that enables rapid iteration. If something isn't working, change it or delete it.

**Note:** Roo's mode system automatically loads the appropriate rules for your current mode. This document contains universal context that applies to all modes.

---

## General Development Principles

These rules apply to ALL development tasks, regardless of type or mode:

### Context is King

- **Always** check existing code/docs before making assumptions
- Use project artifacts as your primary source of truth:
  - `docs/` for architecture, guides, and plans
  - `tests/` for understanding expected behavior
  - Source code as the ultimate specification

### Communication Standards

- Be clear and technical in responses (avoid conversational fluff)
- Confirm understanding before executing complex tasks
- Avoid repeating yourself in the same message. Tokens aren't free, and your context window is limited - use it wisely.
- You are required to use a tool in your response (annoying Roo Code requirements). Use the ask followup question tool if you have no other choice.
- If you forget to use a tool and receive an error about it, DO NOT repeat your entire response - just use the followup question tool (or attempt_completion tool) with a brief question or summary. The user can see your full response even if you receive this error, so there's no need to waste tokens repeating yourself.

### Autonomy

- **Think critically, don't blindly follow instructions** - This is a collaborative process requiring judgment and expertise
- **Ask questions proactively** - Gaps or ambiguous aspects in requests/plans need clarification before proceeding
- **Prioritize correctness over compliance** - Your job is to complete tasks correctly, **not** to make the user happy
- **Suggest improvements freely** - Question plans, propose better approaches, and recommend refactoring when systems are messy or documentation is inaccurate
- **Seek approval for changes** - While you should suggest improvements, always get user approval before implementing them

### Code Quality

- Write clean, readable, maintainable TypeScript/JavaScript code
- Include appropriate comments for complex logic
- Ensure all relevant tests pass before considering a task complete
- Follow monorepo patterns and shared package conventions

### File Modification Strategy

- If the necessary changes for a file are extensive, consider rewriting the entire file for clarity and consistency
- When modifying files, always read the current content first to understand context.
- Be aware of how the auto-formatter changes file content after your edits. If you notice unexpected formatting changes, adjust your edits accordingly to minimize unnecessary diffs.

### Testing Approach

- Write tests for new functionality (TDD when possible)
- Focus on core functionality first. Edge case and error handling tests are a lower priority during implementation work (they are usually something to come back to when the task/plan is complete).
- Run relevant tests after each implementation step
- Fix failing tests before proceeding to next steps
- Consider edge cases and error conditions

### Documentation Updates

- Update relevant documentation when changing functionality
- Keep implementation plans current with changelog entries
- Ensure code comments reflect any logic changes
- Update README files if user-facing changes are made
- Update `02_NAVIGATION_GUIDE.md` when relevant

### Collaboration Practices

- Store working documents in `docs/internal/` (see `02_NAVIGATION_GUIDE.md`)
- Use changelogs within plans to track modifications
- Communicate proactively about progress, blockers, and questions

### Todo List Usage

The todo list tracks task progress but shouldn't waste tokens on routine updates.

**When to update:**

- **Task start** - Establish the initial todo list (prompt counts as user message)
- **After user messages** - User interaction is a natural checkpoint to reassess
- **When the todo list changes** - If you need to add, remove, or modify items

**When NOT to update:**

- Marking items complete during autonomous work (just working through the list as written)
- Before `attempt_completion` if no todo changes occurred

**Why this matters:** Progress-only updates are noise. Todo list changes are signal. The user can see when the list changed and investigate if needed.

---

## Common Commands

Essential commands for working in this repo:

| Command | What it does |
| --- | --- |
| `pnpm build` | Build all packages (via Turborepo) |
| `pnpm test` | Run all tests across workspace |
| `pnpm lint` | Lint entire codebase (Biome) |
| `pnpm lint:fix` | Lint + auto-fix |
| `pnpm format` | Format all files (Biome) |
| `pnpm typecheck` | Type-check all packages |
| `pnpm clean` | Remove all build artifacts and caches |

### MCP Server (`apps/mcp/`)

| Command | What it does |
| --- | --- |
| `pnpm --filter @aurite-ai/kai build` | Build MCP server |
| `pnpm --filter @aurite-ai/kai dev` | Run MCP server in watch mode (`tsx watch`) |
| `pnpm --filter @aurite-ai/kai start` | Run built MCP server (`node dist/index.js`) |
| `pnpm --filter @aurite-ai/kai test` | Run MCP tests (Vitest) |
| `pnpm --filter @aurite-ai/kai test:watch` | Run MCP tests in watch mode |
| `pnpm --filter @aurite-ai/kai typecheck` | Type-check MCP server only |

### Tips

- The MCP server uses **stdio** transport — it reads/writes JSON-RPC over stdin/stdout. Use `dev` for local development; connect via an MCP client (e.g., Roo Code, Claude Desktop).
- Environment config: copy `apps/mcp/.env.example` → `apps/mcp/.env`
- The `--filter` flag targets a specific workspace package by name.

---

## Remember

The goal is effective collaboration and quality code, not bureaucratic process. These rules exist to help achieve that goal, not hinder it.
