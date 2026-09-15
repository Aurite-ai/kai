# Kai MCP - User Journey

**Status:** Final
**Date:** 2026-02-05
**Parent:** [README.md](./README.md)

---

## Overview

This document illustrates how a "vibe coder" uses Kai MCP from Day 1 through ongoing development. The user is a non-developer employee building AI agents (LangGraph or OpenAI Agents SDK) with Claude Code - capable of describing what they want but not experienced with coding conventions or patterns.

---

## Day 1: Starting Fresh

### Scenario

Sarah works in customer success. She wants to build an AI agent that answers customer questions using the company's documentation. She's used ChatGPT but never built software.

### The Journey

```
┌──────────────────────────────────────────────────────────────────────────────┐
│   SARAH'S FIRST SESSION                                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Sarah: "I want to build a customer support agent that can answer           │
│           questions from our docs"                                           │
│                                                                              │
│   Claude Code recognizes new project intent                                  │
│                                                                              │
│           ↓                                                                  │
│                                                                              │
│   kai_initialize(                                                         │
│     project_name="support-agent",                                            │
│     description="AI agent that answers customer questions from company docs" │
│   )                                                                          │
│                                                                              │
│           ↓                                                                  │
│                                                                              │
│   Created:                                                                   │
│   support-agent/                                                             │
│   ├── CLAUDE.md              ← Project instructions                          │
│   ├── .mcp.json              ← Kai MCP connection                         │
│   ├── .claude/               ← Copilot configuration                         │
│   │   ├── settings.json      ← Editor settings                               │
│   │   ├── rules/             ← Behavior rules (use .kai/context-guide.md, etc.)   │
│   │   └── skills/            ← Sub-agent capabilities                        │
│   ├── .kai/context-guide.md       ← Knowledge guide with curated patterns         │
│   └── src/agent/             ← Boilerplate structure                         │
│       ├── graph.py                                                           │
│       ├── state.py                                                           │
│       └── tools.py                                                           │
│                                                                              │
│   Claude Code reads CLAUDE.md, sees instructions to read .kai/context-guide.md    │
│   Reads .kai/context-guide.md, finds curated LangGraph patterns                   │
│   Starts building with guidance - not from scratch!                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What Sarah Experiences

1. **She asks Claude Code what she wants in plain English**
2. **Project appears with structure and guidance** - not an empty folder
3. **Claude Code starts building** using the curated patterns
4. **Sarah doesn't need to understand the structure** - Claude does

### Why This Works

- `kai_initialize` creates a working environment immediately
- Curated LangGraph patterns provide real guidance (not placeholders)
- CLAUDE.md instructs the copilot how to use the project
- Sarah sees progress, not blank screens

---

## Day 1 (continued): Adding Company Knowledge

### Scenario

Sarah has company API guidelines and wants the agent to follow them.

### The Journey

```
┌──────────────────────────────────────────────────────────────────────────────┐
│   ADDING EXISTING KNOWLEDGE                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Sarah: "Here's our API design guidelines, make sure the agent follows them"│
│                                                                              │
│   Claude Code recognizes user providing reference material                   │
│                                                                              │
│           ↓                                                                  │
│                                                                              │
│   kai_learn(                                                              │
│     paths=["~/Downloads/api-guidelines.pdf"],                                │
│     description="Company API design standards"                               │
│   )                                                                          │
│                                                                              │
│           ↓                                                                  │
│                                                                              │
│   Kai agents:                                                             │
│   1. Read and extract content from PDF                                       │
│   2. Classify as "policy" - API design standards                             │
│   3. Store in ~/.kai/knowledge/uuid-abc.mdc                               │
│   4. NOT written to .kai/context-guide.md yet (that's prepare_context's job)      │
│                                                                              │
│   Response:                                                                  │
│   ┌─────────────────────────────────────────────────────────────┐            │
│   │ # Context Received                                          │            │
│   │                                                             │            │
│   │ Added **API Design Standards** to knowledge base:           │            │
│   │ - REST naming conventions                                   │            │
│   │ - Error response format                                     │            │
│   │ - Authentication requirements                               │            │
│   │                                                             │            │
│   │ <hints>                                                     │            │
│   │ - This will be surfaced when you work on API-related tasks  │            │
│   │ - Use kai_prepare_context to get relevant context        │            │
│   │ </hints>                                                    │            │
│   └─────────────────────────────────────────────────────────────┘            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What Sarah Experiences

1. **She drags a file into the chat** and says "use this"
2. **Kai acknowledges** it understood the content
3. **She continues working** - the knowledge is now available

### Why This Works

- Minimal friction - just share the file
- Automatic classification - Sarah doesn't choose categories
- Knowledge is stored globally, available across projects
- Two-stage model means it surfaces when relevant, not always

---

## Week 1: Working on a Task

### Scenario

Sarah wants to add a search feature to her agent. She's done some work but needs to continue.

### The Journey

```
┌──────────────────────────────────────────────────────────────────────────────┐
│   STARTING A TASK                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Sarah: "I want to add search so the agent can find relevant docs"          │
│                                                                              │
│   Claude Code knows this is a new task, calls prepare_context first          │
│                                                                              │
│           ↓                                                                  │
│                                                                              │
│   kai_prepare_context(                                                    │
│     task="Add search capability to find relevant documentation"              │
│   )                                                                          │
│                                                                              │
│           ↓                                                                  │
│                                                                              │
│   Kai agents search ~/.kai/ for relevant knowledge:                    │
│   - API Design Standards (policy) - matches because building API             │
│   - LangGraph tool patterns (curated) - matches because adding tool          │
│   - Previous search decision (if any) - matches by topic                     │
│                                                                              │
│   Surfaces to project/.kai/context-guide.md                                       │
│                                                                              │
│   Response:                                                                  │
│   ┌─────────────────────────────────────────────────────────────┐            │
│   │ # Context Ready                                             │            │
│   │                                                             │            │
│   │ Surfaced relevant knowledge for: "Add search capability"    │            │
│   │                                                             │            │
│   │ ## Relevant Context                                         │            │
│   │ - **API Design Standards** - Your API endpoints should...   │            │
│   │ - **LangGraph Tool Patterns** - Tools should be defined...  │            │
│   │                                                             │            │
│   │ <hints>                                                     │            │
│   │ - Read .kai/context-guide.md for full navigation                 │            │
│   │ - API standards apply to any endpoints you create           │            │
│   │ - Use kai_ask if you need clarification mid-task         │            │
│   │ </hints>                                                    │            │
│   └─────────────────────────────────────────────────────────────┘            │
│                                                                              │
│   Claude Code reads .kai/context-guide.md, sees what's available                  │
│   Reads relevant sections based on task needs                                │
│   Implements search tool following patterns AND API standards                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What Sarah Experiences

1. **She describes what she wants** in plain English
2. **Claude Code pauses briefly** to get context
3. **Claude Code starts building** with awareness of her company standards
4. **The search tool follows API guidelines** without her having to remind

### Why This Works

- `kai_prepare_context` happens automatically at task start
- Relevant knowledge surfaces based on task description
- Claude Code reads `.kai/context-guide.md` like any other file
- Company policies are followed without Sarah managing them

---

## Week 2: Getting Help Mid-Task

### Scenario

Sarah is debugging an error and wants quick guidance without disrupting her flow.

### The Journey

```
┌──────────────────────────────────────────────────────────────────────────────┐
│   QUICK QUESTION                                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Sarah: "The search returns errors sometimes, do we have guidelines         │
│           for error handling?"                                               │
│                                                                              │
│   Claude Code needs quick answer, uses kai_ask                            │
│                                                                              │
│           ↓                                                                  │
│                                                                              │
│   kai_ask(                                                                │
│     question="What are our error handling guidelines for API responses?"     │
│   )                                                                          │
│                                                                              │
│           ↓                                                                  │
│                                                                              │
│   Kai searches:                                                           │
│   1. First: project/.kai/context-guide.md (already surfaced)                      │
│   2. Then: ~/.kai/ knowledge base (full search)                           │
│                                                                              │
│   Response:                                                                  │
│   ┌─────────────────────────────────────────────────────────────┐            │
│   │ # Error Handling Guidelines                                 │            │
│   │                                                             │            │
│   │ From **API Design Standards** (.kai/context-guide.md):          │            │
│   │                                                             │            │
│   │ ## Standard Error Format                                    │            │
│   │ ```json                                                     │            │
│   │ {                                                           │            │
│   │   "error": "SearchFailed",                                  │            │
│   │   "message": "Human-readable description",                  │            │
│   │   "code": "SEARCH_001"                                      │            │
│   │ }                                                           │            │
│   │ ```                                                         │            │
│   │                                                             │            │
│   │ <hints>                                                     │            │
│   │ - Full details in .kai/context-guide.md (API Standards section)  │            │
│   │ - All errors should use this format                         │            │
│   │ </hints>                                                    │            │
│   └─────────────────────────────────────────────────────────────┘            │
│                                                                              │
│   Claude Code applies the standard format immediately                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What Sarah Experiences

1. **She asks a question naturally** as part of conversation
2. **Gets a direct answer** with the relevant standard
3. **Claude Code applies it** without further prompting
4. **Flow isn't disrupted** - no need to search docs herself

### Why This Works

- `kai_ask` provides quick answers from existing knowledge
- Checks `.kai/context-guide.md` first (already task-relevant)
- Falls back to full knowledge base
- Includes source reference for transparency

---

## Week 2: Pre-Commit Review

### Scenario

Sarah is ready to commit her changes and wants to verify they follow company standards.

### The Journey

```
┌──────────────────────────────────────────────────────────────────────────────┐
│   REVIEW BEFORE COMMIT                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Sarah: "Let's review this before I commit"                                 │
│                                                                              │
│   Claude Code invokes the verification skill (configured by Kai)          │
│                                                                              │
│           ↓                                                                  │
│                                                                              │
│   The skill checks files against:                                            │
│   1. .kai/context-guide.md patterns and policies (already surfaced)               │
│   2. ~/.kai/ knowledge base patterns                                      │
│                                                                              │
│   Result:                                                                    │
│   ┌─────────────────────────────────────────────────────────────┐            │
│   │ # Review: src/agent/tools.py                                │            │
│   │                                                             │            │
│   │ ## ✅ Follows Patterns                                      │            │
│   │ - Tool decorator pattern used correctly                     │            │
│   │ - Async/await for external calls                            │            │
│   │ - State updates follow LangGraph conventions                │            │
│   │                                                             │            │
│   │ ## ⚠️ Suggestions                                           │            │
│   │                                                             │            │
│   │ **Error format differs from standard** (line 45)            │            │
│   │ Your code returns: `{"error": "failed"}`                    │            │
│   │ Standard requires: `{"error": "...", "message": "...", ...}`│            │
│   └─────────────────────────────────────────────────────────────┘            │
│                                                                              │
│   Claude Code offers to fix the issue                                        │
│   Sarah approves, change is made, code is committed                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What Sarah Experiences

1. **She asks for review** before committing
2. **Gets specific feedback** on pattern compliance
3. **Issue is caught** that she wouldn't have noticed
4. **Fix is quick** - Claude knows what the standard is

### Why This Works

- Verification skill checks against accumulated knowledge
- Finds specific deviations from established patterns
- Provides actionable feedback, not vague warnings
- Sarah's code quality improves without her memorizing standards

---

## Month 2: Knowledge Accumulates

### Scenario

Sarah has been working for a month. The knowledge base has grown from her sessions.

### What's Different Now

```
┌──────────────────────────────────────────────────────────────────────────────┐
│   KNOWLEDGE BASE AFTER 1 MONTH                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ~/.kai/knowledge/                                                       │
│   │                                                                          │
│   ├── uuid-001.mdc    (Day 1: API Design Standards - policy)                 │
│   ├── uuid-002.mdc    (Day 3: Security requirements - policy)                │
│   ├── uuid-003.mdc    (Week 1: Search implementation decision - decision)    │
│   ├── uuid-004.mdc    (Week 1: Error handling pattern - pattern)             │
│   ├── uuid-005.mdc    (Week 2: Database schema - reference)                  │
│   ├── uuid-006.mdc    (Week 2: Rate limiting decision - decision)            │
│   ├── uuid-007.mdc    (Week 3: Authentication flow - pattern)                │
│   ├── uuid-008.mdc    (Week 4: Customer feedback handling - requirement)     │
│   └── ...                                                                    │
│                                                                              │
│   ~/.kai/conversations/                                                   │
│   │                                                                          │
│   ├── session-001.mdc (Built initial search tool)                            │
│   ├── session-002.mdc (Fixed error handling)                                 │
│   ├── session-003.mdc (Added authentication)                                 │
│   └── ...             (Each session's decisions preserved)                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### New Team Member Joins

```
┌──────────────────────────────────────────────────────────────────────────────┐
│   ALEX JOINS THE PROJECT                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Alex: "I need to add a feedback collection feature"                        │
│                                                                              │
│           ↓                                                                  │
│                                                                              │
│   kai_prepare_context(                                                    │
│     task="Add customer feedback collection feature"                          │
│   )                                                                          │
│                                                                              │
│           ↓                                                                  │
│                                                                              │
│   Kai surfaces (from Sarah's accumulated knowledge):                      │
│   - API Design Standards (how to build endpoints)                            │
│   - Customer feedback handling requirements (what's needed)                  │
│   - Authentication flow pattern (how users are identified)                   │
│   - Error handling pattern (consistency)                                     │
│   - Previous decision: "We store feedback in Postgres" (from session-005)    │
│                                                                              │
│   Alex gets context Sarah built over a month - instantly                     │
│   Doesn't need to ask "how do we do X here?"                                 │
│   Follows same patterns without coordination overhead                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What Sarah & Alex Experience

1. **Sarah's knowledge accumulates** as she works - no extra effort
2. **Alex gets onboarded instantly** - relevant context surfaces
3. **Consistency happens automatically** - same patterns, same standards
4. **Questions are answered before asked** - proactive surfacing

### Why This Works

- Knowledge base grows through normal work
- `kai_sync` (when implemented) captures conversation decisions
- `kai_prepare_context` surfaces what's relevant per task
- New team members benefit from accumulated knowledge

---

## Summary: The Kai Experience

### For Sarah (Day 1 → Month 2)

| Time | Experience | Kai Contribution |
|------|------------|---------------------|
| **Day 1** | Empty folder → working project | Curated patterns, structure |
| **Day 1** | Share company docs | Store in knowledge base |
| **Week 1** | Start new task | Surface relevant context |
| **Week 1** | Quick question | Instant answers from knowledge |
| **Week 2** | Pre-commit check | Pattern compliance review |
| **Month 2** | Onboard Alex | Accumulated knowledge transfers |

### The Key Insight

Sarah never:
- Organized a knowledge base
- Tagged or categorized documents
- Searched for relevant context
- Wrote documentation
- Memorized coding standards

Yet her project has:
- Consistent patterns
- Documented decisions
- Transferable knowledge
- Team-ready context

**Kai's agents do the organizing. Sarah does the building.**

---

## Tool Usage Patterns

### When Each Tool Is Called

| User Intent | Tool/Skill | Frequency |
|-------------|------------|-----------|
| "Start a new project" | `kai_initialize` | Once per project |
| "Here's our X document" | `kai_learn` | When sharing files |
| "I want to build X" | `kai_prepare_context` | Start of each task |
| "Do we have guidelines for X?" | `kai_ask` | Mid-task questions |
| "Review this before commit" | Verification skill | Before commits |
| "Save what we learned" | `kai_sync` | End of session |

### Copilot Decision Flow

```
                          USER SAYS SOMETHING
                                 │
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
         "New project"    "Build X"        "Here's a file"
                │                │                │
                ▼                ▼                ▼
        kai_initialize kai_prepare    kai_learn
                               _context
                                 │
                                 ▼
                         [Claude works]
                                 │
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
         "Question?"      "Review this"    "End of session"
                │                │                │
                ▼                ▼                ▼
           kai_ask     Verification      kai_sync
                             skill
```

---

## Changelog

- v1.0 (2026-02-05): Initial user journey specification
- v1.1 (2026-02-05): Updated project structure to include copilot configuration files
- v2.0 (2026-02-05): Promoted to docs/design/; updated links and status to Final
- v2.1 (2026-02-09): Renamed kai_setup → kai_initialize; replaced kai_review with verification skill
