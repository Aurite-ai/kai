# Architecture: Context Management System

**Date:** 2026-02-10
**Status:** Approved (implemented)
**Prior art:** [Technical spec (working doc)](../internal/designs/context-management-system.md), [Post-rebuild review](../internal/analyses/post-rebuild-review.md)

---

## Overview

The context management system is the core of Kai's MCP server. It provides three tools that form a two-stage knowledge pipeline: **learn** (ingest files → knowledge base) and **prepare/ask** (knowledge base → copilot context).

All domain logic lives in the `knowledge/` module under `apps/mcp/src/`. MCP tool handlers are thin wrappers that validate input, delegate to `knowledge/`, and format markdown responses.

---

## System Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              MCP Tool Handlers               │
                    │          thin wrappers, markdown output      │
                    ├────────────┬──────────────┬──────────────────┤
                    │ kai_    │ kai_      │ kai_          │
                    │ learn      │ prepare_     │ ask              │
                    │            │ context      │                  │
                    └──────┬─────┴──────┬───────┴────────┬─────────┘
                           │            │                │
                    ┌──────┴────────────┴────────────────┴─────────┐
                    │            knowledge/ module                  │
                    │                                               │
                    │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
                    │  │ agents/  │  │ storage/ │  │ surfacing/│  │
                    │  │          │  │          │  │           │  │
                    │  │ tools    │  │ types    │  │ context-  │  │
                    │  │ runner   │  │ service  │  │ writer    │  │
                    │  │ prompts  │  │ utils    │  │           │  │
                    │  └──────────┘  └──────────┘  └───────────┘  │
                    └──────────────────────────────────────────────┘
```

### Data Flow

```
                    ┌───────────────┐
  User files ──────►│ kai_learn  │──── Categorization Agent (Haiku) ────► ~/.kai/knowledge/*.mdc
                    └───────────────┘                                          (general or project-specific)

                    ┌───────────────────────┐
  Task desc. ──────►│ kai_prepare_context│──── Retrieval Agent (Haiku) ──► selects KB files
                    └───────────────────────┘         │                        (from general + current project)
                                                      ▼
                                               Context Writer ──► project/.kai/context-guide.md

                    ┌───────────────┐
  Question ────────►│ kai_ask    │──── Q&A Agent (Sonnet) ──► reads KB files ──► synthesized answer
                    └───────────────┘                            (from general + current project)
```

### Tool Roles

| Tool | When Called | Side Effects | Agent Model |
|------|------------|--------------|-------------|
| `kai_learn` | User shares files | Writes `.mdc` to KB, detects contradictions | Haiku (categorization) |
| `kai_prepare_context` | Task start (once) | Writes `.kai/context-guide.md` to project root | Haiku (retrieval) |
| `kai_ask` | Mid-task questions | None (read-only) | Sonnet (Q&A synthesis) |
| `kai_delete` | After user approval | Deletes `.mdc` from KB | None (direct operation) |

---

## Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Markdown + `<hints>` responses** for all tools | Steer copilot toward next actions. JSON blobs don't do this. |
| D2 | **Simplified metadata** — 6 fields: category, confidence, reasoning, title, summary, topics[] | Original agent extracted ~15 fields; storage silently dropped half. |
| D3 | **LLM-generated titles** | `filenameToTitle()` produced bad casing. LLM handles acronyms naturally. |
| D4 | **Flat storage directory** (no category subfolders) | Re-categorization doesn't orphan files. Flat reads are fast at ~1000 entries. |
| D5 | **`KAI_KNOWLEDGE_DIR` env var**, defaults to `~/.kai/knowledge/` | Flexible, design-aligned. |
| D6 | **Slug-based file naming** | Human-readable, debuggable. LLM titles make collisions rare. |
| D7 | **Natural language topics** | LLM produces readable phrases. Agents handle fuzzy matching. |
| D8 | **`.kai/context-guide.md` gets file paths** | Files stay in KB as source of truth. File paths shared so the copilot can read. |
| D9 | **`ask` searches KB directly**, not `.kai/context-guide.md` | If it's in the guide, copilot already has it. Ask handles what's *not* there. |
| D10 | **`ask` agent told which KB files are in guide** | Agent knows what copilot already has; avoids redundancy. |
| D11 | **Enriched `list_knowledge_files`** — summary + category + topics | Better agent decisions without separate search tool. |
| D12 | **Haiku for retrieval, Sonnet for Q&A** | Retrieval is file selection (cheap). Q&A is synthesis (needs quality). |
| D13 | **All agent models in `config.ts`** | Easy to swap without code changes. |
| D14 | **Overwrite `.kai/context-guide.md`** on each prepare_context call | Simple. Single file approach. |
| D15 | **Shared Anthropic client in ToolContext** | One client at server startup, injected into all handlers. |
| D16 | **`knowledge/` subfolder** grouping all KB logic | Clean separation: `tools/` = MCP interface, `knowledge/` = domain logic. |
| D17 | **Project-specific KB subfolders** using directory path hash | Isolates project context while maintaining shared general knowledge. |

---

## Knowledge Base Structure

### Storage Location

- **Default:** `~/.kai/knowledge/`
- **Override:** `KAI_KNOWLEDGE_DIR` environment variable
- **Layout:** Flat directory of `.mdc` files (markdown with YAML frontmatter) for general context, with project-specific subdirectories

### Project-Level Context

When files are uploaded that are project-specific, they are stored in a subfolder within the knowledge base:

```
~/.kai/knowledge/
├── general-file-1.mdc              # General context (applies to all projects)
├── general-file-2.mdc
├── org-context.mdc
├── user-context.mdc
└── a1b2c3/                         # Project-specific folder (hash of project path)
    ├── project-file-1.mdc
    └── project-file-2.mdc
```

**Project folder naming:** The subfolder name is a hash of the project directory path, ensuring:
- Unique identification of each project
- No path conflicts across different projects
- Consistent storage location for the same project

**Context retrieval behavior:**
- [`kai_prepare_context`](../design/tool-specifications.md#5-kai_prepare_context) and [`kai_ask`](../design/tool-specifications.md#7-kai_ask) fetch knowledge from:
  1. General context (files directly in `~/.kai/knowledge/`)
  2. Current project's subfolder (if it exists)
- Files from other projects are not included in context retrieval

### .mdc File Format

```yaml
---
type: knowledge
title: API Design Guidelines
summary: >
  REST API design standards covering naming conventions, error response format,
  and authentication requirements.
created_at: 2026-02-10T00:00:00Z
updated_at: 2026-02-10T00:00:00Z

source:
  file: api-guidelines.md
  path: /home/user/my-project/docs/api-guidelines.md
  project: /home/user/my-project

classification:
  category: policy
  confidence: 0.92
  reasoning: Contains organizational rules and constraints for API design
  topics:
    - API Design
    - REST Conventions
    - Authentication

status: active
---

[Original file content here]
```

### Classification Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `policy` | Business rules, constraints, standards | API guidelines, security policies |
| `requirement` | What the system must do | Feature specs, user stories |
| `reference` | Technical documentation | API specs, architecture docs |
| `decision` | Choices with rationale | Architecture decisions, trade-off analyses |
| `pattern` | Reusable approaches | Code patterns, config files |
| `context` | General background / unclear fit | Overviews, onboarding docs |

---

## Agent Infrastructure

### Shared Agent Runner

All three tools use an agentic loop via `run-agent.ts`:

```typescript
interface AgentConfig {
  model: string;                           // From config.ts
  systemPrompt: string;                    // Tool-specific
  tools: Tool[];                           // list + read + (optionally select/categorize)
  maxIterations: number;                   // Default 10
  maxTokens: number;                       // Default 2000
}
```

The runner handles message loop management, tool call routing, iteration counting, and stop condition detection. Tool-specific logic (what to do with results) stays in the tool handlers.

### Agent Tools (Shared)

Agent tools used across different MCP tools:

| Tool | Purpose | Used By | Output |
|------|---------|---------|--------|
| `list_knowledge_files` | Browse KB with summaries | learn, prepare_context, ask | Slug, title, category, summary, topics per entry |
| `read_knowledge_file` | Read full content by slug | learn, prepare_context, ask | `# {title}\n\n{content}` |
| `select_files_for_context` | Structured file selection | prepare_context | `[{slug, reason}]` |
| `categorize_file` | Structured classification | learn | Category, confidence, reasoning, title, summary, topics |
| `report_contradictions` | Report contradicting files | learn | `[{slug, explanation}]` |

### Context Writer

The surfacing module handles `.kai/context-guide.md` generation:

1. **Compile content** — For each selected slug: read `.mdc`
2. **Generate guide** — Single markdown file with navigation, file summaries, and full content
3. **Write file** — Output as `.kai/context-guide.md` in project root

---

## File Structure

```
apps/mcp/src/
├── config.ts                              # Models, server constants
├── index.ts                               # MCP server entry point, tool registration
│
├── knowledge/                             # All KB domain logic
│   ├── index.ts                           # Public exports (barrel)
│   ├── agents/
│   │   ├── index.ts
│   │   ├── knowledge-tools.ts             # Enriched list, read, select_files, categorize tools
│   │   ├── run-agent.ts                   # Shared agentic loop runner
│   │   └── prompts.ts                     # All agent system prompts
│   ├── storage/
│   │   ├── index.ts
│   │   ├── types.ts                       # KnowledgeEntry, classification, save input
│   │   ├── knowledge-storage.ts           # CRUD for .mdc files in KB directory
│   │   └── utils.ts                       # Slugify, frontmatter parsing, MDC generation
│   └── surfacing/
│       ├── index.ts
│       ├── context-writer.ts              # Write .kai/context-guide.md to project root
│       └── framework-copier.ts            # Copy framework templates (LangGraph/OpenAI)
│
├── templates/                             # VCK templates (bundled with MCP server)
│   ├── copilot-configs/                   # Copilot configuration templates
│   ├── frameworks/                        # Framework boilerplate (langgraph/, openai/)
│   └── knowledge-base/                    # KB seed files (langgraph-best-practices.mdc, openai-agents-overview.mdc)
│
├── tools/                                 # MCP tool handlers (thin wrappers)
│   ├── types.ts                           # ToolContext, MCPToolResponse, markdownResponse()
│   ├── learn.ts
│   ├── prepare-context.ts
│   ├── ask.ts
│   ├── delete.ts
│   ├── health-check.ts
│   └── initialize.ts
```

---

## Response Format

All tools return markdown with `<hints>` blocks for copilot steering:

```markdown
# Title

[Summary of what happened / was found]

## Structured Content

[Tables, lists, actionable information]

<hints>
- Specific actionable next step
- Another suggestion
</hints>
```

The `markdownResponse()` utility wraps markdown text into the MCP response format. Error states use `markdownResponse(text, true)` with the `isError` flag.

---

## References

- [Design: Tool Specifications](../design/tool-specifications.md) — Detailed tool input/output schemas
- [Design: Knowledge Architecture](../design/knowledge-architecture.md) — Two-stage knowledge flow design
- [Design: Product Overview](../design/README.md) — Product vision and core concepts
