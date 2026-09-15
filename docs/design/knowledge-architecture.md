# Kai MCP - Knowledge Architecture

**Status:** Final
**Date:** 2026-02-05
**Parent:** [README.md](./README.md)

---

## Overview

Kai maintains a **global knowledge base** at `~/.kai/` that stores classified files from all projects. When a copilot needs context for a task, Kai surfaces relevant entries from the knowledge base to the project's `.kai/context-guide.md` file.

### Two-Stage Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           KNOWLEDGE FLOW                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   STAGE 1: LEARN                                                             │
│   ──────────────                                                             │
│                                                                              │
│   User files ────► kai_learn ────► ~/.kai/                             │
│   (policies, specs,                   (classified, stored)                   │
│    conversations)                                                            │
│                                                                              │
│   - Files are classified by type                                             │
│   - Metadata added (source, date, project)                                   │
│   - Stored in knowledge base                                                 │
│   - NOT written to project .kai/context-guide.md yet                              │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   STAGE 2: PREPARE                                                           │
│   ────────────────                                                           │
│                                                                              │
│   Task description ────► kai_prepare_context ────► .kai/context-guide.md       │
│                                                       (task-relevant)        │
│                                                                              │
│   - Searches knowledge base for relevant entries                             │
│   - Surfaces subset to project's .kai/context-guide.md                            │
│   - Copilot reads .kai/context-guide.md during task                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Principle: Separation of Storage and Surfacing

| Stage | Tool | What Happens | Output Location |
|-------|------|--------------|-----------------|
| **Learn** | `kai_learn` | Classify and store | `~/.kai/` |
| **Prepare** | `kai_prepare_context` | Search and surface | `project/.kai/context-guide.md` |

---

## Knowledge Base: ~/.kai/

The global knowledge base lives at `~/.kai/`. This folder is:
- **Persistent** - Survives across sessions
- **Global** - Shared across all projects
- **Hidden** - User doesn't interact directly

### Folder Structure

```
~/.kai/
├── config.json               # Global Kai configuration
├── state.json                # Processing state, sync tracking
│
├── knowledge/                # Classified knowledge entries (.mdc files)
│   ├── [general-file-1].mdc  # General context (applies to all projects)
│   ├── [general-file-2].mdc
│   ├── org-context.mdc       # Organization context
│   ├── user-context.mdc      # User context
│   │
│   └── [project-hash]/       # Project-specific knowledge (hash of project directory path)
│       ├── [file-1].mdc      # Files specific to this project
│       └── [file-2].mdc
│
├── conversations/            # Processed conversation summaries (.mdc files)
│   ├── [session-id-1].mdc
│   ├── [session-id-2].mdc
│   └── ...
│
└── prepared/                 # Staged context for projects (future)
    └── [project-hash]/       # Prepared context ready to copy
        └── ...
```

### Project-Level Context

When files are uploaded that are project-specific, they are stored in a subfolder within the knowledge base named with the hash of the project directory path:

**Storage behavior:**
- **General context:** Files that apply across all projects (policies, standards, org/user context) are stored directly in `~/.kai/knowledge/`
- **Project-specific context:** Files that are specific to a particular project are stored in `~/.kai/knowledge/[project-hash]/`

**Retrieval behavior:**
- Tools like [`kai_prepare_context`](./tool-specifications.md#5-kai_prepare_context) and [`kai_ask`](./tool-specifications.md#7-kai_ask) only fetch knowledge from:
  1. General context (files directly in `~/.kai/knowledge/`)
  2. The current project's subfolder (if it exists)
- Files from other projects are not included in context retrieval

**Benefits:**
- **Isolation:** Project-specific knowledge doesn't pollute context for other projects
- **Shared knowledge:** General policies and standards remain accessible to all projects
- **Scalability:** Knowledge base can grow across many projects without context bloat

### .mdc Format (Markdown with Context)

All knowledge entries use the `.mdc` format - a single file combining YAML frontmatter metadata with markdown content. This is simpler than folder+JSON and consistent with how conversation logs are stored.

**Example knowledge entry:** `~/.kai/knowledge/uuid-1234.mdc`

```markdown
---
id: uuid-1234
type: policy
title: API Design Guidelines
source:
  file: /path/to/original/api-guidelines.md
  project: customer-support-agent
  date: 2026-02-05T14:30:00Z
classification:
  category: policy
  subcategory: api-design
  tags:
    - rest
    - api
    - guidelines
  confidence: 0.92
status: active
---

# API Design Guidelines

**Original file:** /projects/support-agent/docs/api-guidelines.md

## Summary

REST API design standards for the organization.

## Key Points

- Use resource nouns, not verbs
- Standard error response format
- JWT authentication required
- Rate limiting: 100 req/min

## Full Content

[Original file content or reference]
```

### Classification Categories

MVP categories (agents determine during learn):

| Category | Description | Examples |
|----------|-------------|----------|
| **policy** | Business rules, constraints, organizational standards, domain knowledge | API guidelines, security policies, business plans |
| **requirement** | Requirements, specifications, user stories, acceptance criteria | PRDs, user stories, feature specs |
| **reference** | Technical documentation, API specs, architecture docs, schemas | API docs, database schemas, architecture diagrams |
| **decision** | Decision records, rationale, trade-off analyses | ADRs, design decisions, technology choices |
| **pattern** | Source code, implementation patterns, reusable examples, config files | Python files, TypeScript files, config templates |
| **context** | General background, overviews, onboarding docs, or unclear fit | README files, onboarding docs, project overviews |
| **integration** | Data sources, external services, APIs, tools, connectors, authentication methods, workflows | Gmail setup, HubSpot API, database connections, Slack webhooks |

### Integration Detection (Cross-Category)

**Integration metadata is extracted from ANY file where external systems are mentioned** - not just `integration` category files. This is crucial for:
- Auto-generating tool scaffolding in VCKs
- Surfacing relevant integrations during `kai_prepare_context`
- Enabling "Connector Discovery" - when users describe their needs in any context, Kai identifies what connections are required

**When to use `integration` category:**
- Use when the PRIMARY purpose of the file is describing integrations, connectors, data sources, or external services
- Example: A dedicated "integrations.md" file listing all external systems, API connection docs, database setup guides

**When integrations are extracted from other categories:**
- A `policy` file about customer support that mentions "send email via Gmail" → Gmail captured as connected service
- A `reference` API doc that describes HubSpot integration → HubSpot captured as data source
- A `pattern` file that imports Stripe SDK → Stripe captured as connected service

**Integration Metadata Structure:**

| Field | Description | Example Values |
|-------|-------------|----------------|
| **triggers** | What starts the workflow | webhook, schedule, manual, event, api-call |
| **dataSources** | Where data comes from | database, api, crm, spreadsheet, email |
| **outputs** | Where results/actions go | email, notification, api-call, database-write |
| **aiTasks** | What AI needs to do | generate-email, analyze-sentiment, classify-ticket |
| **authentication** | How to connect to systems | oauth2, api-key, basic-auth, jwt |
| **connectedServices** | All external services mentioned | Gmail, HubSpot, PostgreSQL, Slack |

**Example Integration Entry:**

```markdown
---
type: knowledge
title: Customer Pickup Notification Workflow
summary: Gmail-based notification system triggered by web form when customer orders are ready
created_at: 2026-02-09T14:30:00Z
updated_at: 2026-02-09T14:30:00Z
source:
  file: /path/to/original/notification-workflow.md
  project: customer-support-agent
  path: docs/workflows
classification:
  category: integration
  confidence: 0.95
  reasoning: File describes external service connections and workflow automation
  topics:
    - gmail
    - notification
    - email-automation
    - webhook
    - postgresql
status: active
---

# Customer Pickup Notification Workflow

## Connected Services
- **Gmail** - OAuth2 authentication for sending emails
- **PostgreSQL** - API key authentication for customer database

## Triggers
- Manual trigger via web form when worker enters customer name

## Data Sources
- Customer database: emails and order notes

## Outputs
- Personalized pickup notification email via Gmail

## AI Tasks
- Generate personalized email content using customer notes and order history

## Authentication
| Service | Method |
|---------|--------|
| Gmail | OAuth2 |
| Customer DB | API Key |

## Usage for Agents
This integration enables agents to:
- Look up customer contact information
- Generate personalized notification emails
- Send automated communications when orders are ready
```

---

## Project Context: .kai/context-guide.md

Each project has a `.kai/context-guide.md` file that receives surfaced knowledge.

### Folder Structure

```
project/
└── .kai/context-guide.md
```

### How .kai/context-guide.md Gets Populated

`kai_prepare_context` populates `.kai/context-guide.md` with task-relevant entries:

1. **Receives** task description
2. **Searches** `~/.kai/knowledge/` for relevant entries
3. **Generates** `.kai/context-guide.md` with navigation

### README.md Format

```markdown
# Context for: Add rate limiting to the search tool

Surfaced from Kai knowledge base on 2026-02-05.

## Relevant Context

| File | Why Relevant |
|------|--------------|
| [api-guidelines.md](./api-guidelines.md) | Contains rate limiting requirements |
| [error-handling.md](./error-handling.md) | Error handling patterns to follow |
| [search-decision.md](./search-decision.md) | Existing search implementation context |

## Getting Started

1. Review the API guidelines for rate limiting requirements
2. Follow error handling patterns for rate limit errors
3. Consider existing search implementation when adding rate limiting

---

*Prepared by Kai | Use `kai_ask` for additional questions*
```

---

## Tool Interactions

### Tool Categories

| Category | Tools | Data Flow |
|----------|-------|-----------|
| **Building KB** | learn, sync | Files → ~/.kai |
| **Environment** | initialize, prepare_context | ~/.kai → .kai/context-guide.md |
| **Assistance** | ask | .kai/context-guide.md + ~/.kai → response |

### kai_initialize (Environment)

**Creates:**
- `project/.kai/context-guide.md` (minimal initial version)

**Does not create:** Knowledge base entries (that's `kai_learn`)

> **Note:** Verification/review functionality is handled by a copilot skill rather than an MCP tool. See [copilot-configuration.md](./copilot-configuration.md).

### kai_learn (Building KB)

**Reads:**
- User-provided files/folders (recursive)
- Current project directory path (for determining storage location)

**Writes to ~/.kai/:**
- New `.mdc` file in `knowledge/[slug].mdc` (general context)
- OR `knowledge/[project-hash]/[slug].mdc` (project-specific context)
- YAML frontmatter with classification metadata
- Markdown content below frontmatter

**Storage location determined by:**
- File content and context (agent determines if project-specific or general)
- Project path hash for project-specific files

**Does NOT write to:** `project/.kai/context-guide.md`

### kai_prepare_context (Environment)

**Reads:**
- Task description
- `~/.kai/knowledge/` entries (general context)
- `~/.kai/knowledge/[project-hash]/` entries (current project's context)
- `~/.kai/conversations/` summaries

**Writes to project/.kai/context-guide.md:**
- Surfaced knowledge entries from general and current project context

### kai_ask (Assistance)

**Reads (in order):**
1. `project/.kai/context-guide.md` (if exists) - checked first
2. `~/.kai/knowledge/` (general context) - fallback/additional
3. `~/.kai/knowledge/[project-hash]/` (current project's context) - fallback/additional

**Writes:** Nothing (returns text response)

### kai_sync (Building KB)

**Reads:**
- Conversation logs
- Git diff (future)

**Writes to ~/.kai/:**
- Processed conversations to `conversations/`
- Extracted knowledge to `knowledge/`

---

## Classification Flow (MVP)

For `kai_learn`, the MVP classification process:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        CLASSIFICATION FLOW                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   1. RECEIVE FILE                                                            │
│      └── Get file path + optional description                                │
│                                                                              │
│   2. READ CONTENT                                                            │
│      └── Load file, detect format (md, txt, code, etc.)                      │
│                                                                              │
│   3. CLASSIFY (heuristics first, LLM if needed)                              │
│      ├── Check filename patterns (policy, spec, requirements)                │
│      ├── Check content patterns (headings, structure)                        │
│      └── Use LLM for ambiguous cases                                         │
│                                                                              │
│   4. EXTRACT METADATA                                                        │
│      ├── Title (from content or filename)                                    │
│      ├── Tags (from content analysis)                                        │
│      └── Summary (LLM-generated if needed)                                   │
│                                                                              │
│   5. STORE                                                                   │
│      └── Write single .mdc file to ~/.kai/knowledge/[uuid].mdc            │
│          (YAML frontmatter + markdown content)                               │
│                                                                              │
│                                                                              │
│   6. REPORT                                                                  │
│      └── Return summary of what was learned                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Surfacing Flow (MVP)

For `kai_prepare_context`, the MVP surfacing process:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SURFACING FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. RECEIVE TASK                                                           │
│      └── Get task description + optional file hints                         │
│                                                                             │
│   2. PARSE INTENT                                                           │
│      ├── Extract keywords                                                   │
│      ├── Identify topic areas                                               │
│      └── Note file references                                               │
│                                                                             │
│   3. SEARCH KNOWLEDGE BASE                                                  │
│      ├── Scan ~/.kai/knowledge/ metadata                                 │
│      ├── Score relevance by:                                                │
│      │   ├── Tag matches                                                    │
│      │   ├── Category matches                                               │
│      │   ├── Title/content keyword matches                                  │
│      │   └── Project relevance (same project = higher)                      │
│      └── Rank results                                                       │
│                                                                             │
│   4. SELECT TOP N                                                           │
│      └── Take most relevant entries (configurable, default: 5-10)           │
│                                                                             │
│   5. SURFACE TO .kai/context-guide.md                                            │
│      ├── Clear .kai/context-guide.md (task-specific, replaced each task)         │
│      ├── Store paths to relevant entries in .kai/context-guide.md                │
│                                                                             │
│   6. REPORT                                                                 │
│      └── Return summary of what was surfaced                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Evolution Path

The knowledge architecture evolves from simple to sophisticated:

### Phase 1: Classify and Copy (MVP)

**kai_learn:**
- Accept files
- Basic category classification
- Store original content with metadata

**kai_prepare_context:**
- Accept task description
- Simple keyword search on metadata/content
- Compile relevant entries into .kai/context-guide.md
- Generate navigation and section headers

**Value:** Files are organized and searchable. Context is surfaced per-task.

### Phase 2: Agent-Enhanced Content

**kai_learn improvements:**
- Agents rewrite files into structured markdown
- Extract key points, summaries
- Normalize format for consistency

**kai_prepare_context improvements:**
- Agents synthesize new documents from multiple sources
- Pull relevant portions from several files into one context doc
- Prepare context in `~/.kai/prepared/`, then copy to project

**Value:** Context is higher quality, more focused.

### Phase 3: Intelligent Knowledge Management

- Semantic search (embeddings)
- Automatic relationship detection
- Conflict/duplicate resolution
- Staleness tracking
- Knowledge graph

**Value:** Knowledge base becomes truly intelligent.

---

## MVP Scope

### Build First

1. **Knowledge base structure**
   - `~/.kai/knowledge/` folder structure
   - `~/.kai/conversations/` for processed conversation logs
   - `metadata.json` format
   - Basic file storage

2. **Classification (kai_learn)**
   - Accept files
   - Basic category classification (heuristics)
   - Store original content with metadata

3. **Surfacing (kai_prepare_context)**
   - Accept task description
   - Simple keyword search
   - Compile relevant entries into .kai/context-guide.md
   - Generate navigation and section headers

4. **Conversation integration**
   - Processed conversation logs (existing format) are searchable
   - Surfaced when relevant to task

---

## Design Decisions

### Why Global Knowledge Base (~/.kai) with Project Subfolders?

**Decision:** Store knowledge globally at `~/.kai/` with project-specific subfolders for project-scoped context.

**Rationale:**
- **Shared knowledge:** General policies and patterns apply across projects
- **Project isolation:** Project-specific files don't pollute context for other projects
- **Avoids duplication:** Common knowledge stored once, accessible to all projects
- **Scalability:** Knowledge base can grow across many projects without context bloat
- **Simpler retrieval:** Tools automatically fetch general + current project context

### Why Separate Learn from Prepare?

**Decision:** Two-stage process: learn (store) then prepare (surface).

**Rationale:**
- Not everything learned is relevant to every task
- Surfacing can be task-specific
- Knowledge base grows over time
- Prepare can be smart about what's relevant

### Why Single File Instead of Multiple Files?

**Decision:** Generate single `.kai/context-guide.md` file rather than multiple files.

**Rationale:**
- Copilots read files directly
- No dependency on Kai at read time
- Context is portable (can be committed)
- Simpler debugging

### Why .mdc Format Over Folder+JSON?

**Decision:** Use single `.mdc` files (markdown with YAML frontmatter) instead of folders with separate `metadata.json` and `content.md`.

**Rationale:**
- **Simpler structure** - One file instead of two
- **Consistent** - Same format for knowledge entries and conversation logs
- **Self-contained** - Metadata and content together
- **Standard format** - YAML frontmatter is widely understood
- **Easier debugging** - Can read/edit with any text editor

---

## Conversation Log Format

Processed conversation logs use the same `.mdc` format, stored in `~/.kai/conversations/`.

**Example:** `~/.kai/conversations/c1e44692-bca2-4899-974e-cd272d8ea936.mdc`

```markdown
---
title: Build TechFlow AI Customer Support Agent
session_id: c1e44692-bca2-4899-974e-cd272d8ea936
source: /path/to/original.jsonl
date: 2026-01-29
task_type: implementation
outcome: completed
confidence: 0.95
---

# Build TechFlow AI Customer Support Agent

## Summary

[What was accomplished in this session]

## Decisions Made

1. **Decision title** - Rationale
2. **Another decision** - Rationale

## Files Created

- /path/to/file1.md
- /path/to/file2.py

## Files Modified

- /path/to/existing1.py
- /path/to/existing2.py

---
*Generated by Kai conversation processor*
```

**Key frontmatter fields:**
- `task_type`: implementation, design, debugging, research, refactoring
- `outcome`: completed, blocked, in-progress, abandoned
- `confidence`: How confident the processor is in the summary

---

## Open Questions

1. **Multi-project knowledge:** Should knowledge be tagged by project? Global search or project-scoped?

2. **Prepared staging:** Should context be prepared in `~/.kai/prepared/` first, then copied?

## Resolved Questions

**Context regeneration (resolved):** When preparing context for a new task:
- **Overwrite** `.kai/context-guide.md` - Entire file is regenerated each time
- This ensures task context is always fresh and relevant

---

## Changelog

- v1.0 (2026-02-05): Initial knowledge architecture specification
- v2.0 (2026-02-05): Revised to two-stage model: learn → ~/.kai, prepare → .kai/context-guide.md
- v2.1 (2026-02-05): Added evolution path, conversation log format, prepared staging
- v2.2 (2026-02-05): Tool categories; assistance tools use .kai/context-guide.md + KB; learn accepts folders
- v2.3 (2026-02-05): Changed to .mdc format (YAML frontmatter + markdown) instead of folder+JSON
- v2.4 (2026-02-05): Fixed Tool Interactions to use .mdc; resolved context merging question
- v3.0 (2026-02-05): Promoted to docs/design/; updated links and status to Final
- v3.1 (2026-02-09): Renamed kai_setup → kai_initialize; removed kai_review (now skill-based)
- v3.2 (2026-02-09): Added `integration` category for data sources, tools, and external services; aligned categories with implementation
- v3.3 (2026-03-09): Added project-level context with hashed subfolders; updated storage and retrieval behavior
