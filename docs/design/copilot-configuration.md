# Kai MCP - Copilot Configuration

**Status:** Final (awaiting expansion)
**Date:** 2026-02-05
**Parent:** [README.md](./README.md)

---

## Overview

When `kai_initialize` initializes a project, it creates configuration files that teach the copilot how to work with Kai and follow structured agent development practices.

**MVP Scope:** Static files copied from templates. Future versions may customize based on project context.

---

## Configuration Files

| File/Folder | Purpose |
|-------------|---------|
| `CLAUDE.md` | Project-level instructions for Claude Code |
| `.mcp.json` | MCP server configuration (connects Kai) |
| `.claude/settings.json` | Claude Code editor settings |
| `.claude/settings.local.json` | Local settings overrides (gitignored) |
| `.claude/rules/` | Copilot rules enforcing structured process |
| `.claude/skills/` | Situational rules + settings; sub-agent spawning |

---

## File Descriptions

### CLAUDE.md

The primary instruction file that Claude Code reads at session start.

**Purpose:**
- Orient the copilot to the project structure
- Direct copilot to read `.kai/context-guide.md` for knowledge
- Instruct when/how to use Kai MCP tools

**MVP Content:** Static template explaining project structure and Kai tool usage.

### .mcp.json

MCP server configuration file.

**Purpose:**
- Configure Kai MCP server connection
- Enable copilot to call Kai tools

**MVP Content:** Standard Kai MCP configuration.

### .claude/settings.json

Claude Code settings for the project.

**Purpose:**
- Project-specific editor/copilot settings
- Committed to git for team consistency

**MVP Content:** Default settings appropriate for agent development (LangGraph or OpenAI Agents SDK).

### .claude/settings.local.json

Local overrides for settings.

**Purpose:**
- User-specific preferences (gitignored)
- API keys, paths, etc.

**MVP Content:** Template with placeholder values.

### .claude/rules/

Copilot rules that enforce structured development.

**Purpose:**
- Guide copilot behavior (when to use context, how to approach tasks)
- Enforce patterns like "check .kai/context-guide.md before implementing"
- Static best practices for agent development

**MVP Content:** Rules directing copilot to:
- Read `.kai/context-guide.md` at task start
- Use `kai_prepare_context` before implementation
- Use `kai_ask` for mid-task questions
- Invoke verification skill before commits

### .claude/skills/

Situational rules and sub-agent capabilities.

**Purpose:**
- Enable copilot to spawn specialized sub-agents
- Task-specific behavior modifications
- Advanced workflows (design → implement → review)

**MVP Content:** Basic skills for common workflows.

---

## Relationship to Knowledge Base

The copilot configuration and knowledge base work together but are distinct:

| Aspect | Copilot Config | Knowledge Base |
|--------|----------------|----------------|
| **Location** | Project root (`.claude/`, `CLAUDE.md`) | `~/.kai/` and `.kai/context-guide.md` |
| **Purpose** | How copilot behaves | What copilot knows |
| **Scope** | Per-project | Global + per-task |
| **Dynamic?** | Static (MVP) | Dynamic (learns, surfaces) |

**How they interact:**
1. Rules tell copilot to **read** `.kai/context-guide.md`
2. Rules tell copilot **when** to call Kai tools
3. Kai tools **populate** `.kai/context-guide.md` with relevant knowledge
4. Copilot **uses** surfaced knowledge during tasks

---

## MVP Scope

**Build first:**
- Static template files for all configuration
- Basic CLAUDE.md with Kai instructions
- Standard .mcp.json configuration
- Essential rules for context usage

**Future enhancements:**
- Project-specific customization based on description
- Dynamic rules based on learned patterns
- User preference learning
- Team-specific configurations

---

## Open Questions

1. **Rule specifics:** What exact rules should be included in MVP?
2. **Skills structure:** What skills are needed for initial release?
3. **Customization triggers:** What project attributes should influence config?
4. **Team sync:** How do team-specific configs propagate?

*Note: This document is intentionally minimal. Expand after team discussion on configuration requirements.*

---

## Changelog

- v1.0 (2026-02-05): Initial specification (placeholder for team input)
- v2.0 (2026-02-05): Promoted to docs/design/; updated links and status
- v2.1 (2026-02-09): Renamed kai_setup → kai_initialize; replaced kai_review with verification skill
