# Test Scenarios for Coding Copilot Evaluation

This directory contains test scenarios at three complexity levels designed to evaluate coding copilot configurations for AI agent development.

## Purpose

These scenarios test a copilot's ability to:
1. **Discover requirements** through natural conversation with non-technical users
2. **Execute technical implementation** based on gathered requirements
3. **Make appropriate design decisions** at varying complexity levels

## Scenarios

| Scenario | Key Testing Focus |
|----------|-------------------|
| [Customer Support Agent](./customer-support-agent/) | Tool usage, file security, basic agent patterns |
| [Stock Market Reporter](./stock-market-reporter/) | 3rd party API auth, tool selection, output formatting |
| [SEO Analysis Reporter](./seo-analysis-reporter/) | Complex integrations, design decisions, LLM-assisted analysis |

## Document Structure

Each scenario contains:

- **`project-context.md`** - Project context file for the copilot (copied to test project root)
- **`requirements.md`** - Full internal requirements document (what we evaluate against)
- **`user-prompts.md`** - Natural language prompts a non-technical user would say (what we give the copilot)
- **`evaluation-criteria.md`** - Rubric for judging copilot performance
- **`knowledge-base/`** - (optional) Business context files visible to the copilot

## Testing Methodology

### The Gap Test

The core evaluation tests the gap between:
- **User prompts**: Vague, natural language requests
- **Requirements**: Detailed technical specifications

A good copilot should:
1. Ask clarifying questions to uncover hidden requirements
2. Guide the user through necessary decisions
3. Implement a solution that satisfies the full requirements

### Evaluation Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  User Prompt    │────▶│    Copilot      │────▶│  Implementation │
│  (vague)        │     │  Conversation   │     │  (code)         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                               ┌─────────────────────────────────────┐
                               │  Evaluate Against Requirements.md   │
                               │  Using Evaluation-Criteria.md       │
                               └─────────────────────────────────────┘
```

## Scenario Progression

### Customer Support Agent (Foundation)
- Single tool type (file reading)
- Clear security boundary (designated folder)
- Straightforward conversation flow
- Tests: basic agent patterns, security awareness

### Stock Market Reporter (Integration)
- External API integration (Yahoo Finance)
- API key configuration guidance
- Mixed tool/non-tool output (markdown doesn't need tools)
- Tests: auth handling, knowing when NOT to use tools

### SEO Analysis Reporter (Architecture)
- Multiple complex APIs (Google, DataForSEO, Perplexity)
- Design decisions required (how to structure analysis)
- LLM-in-the-loop for analysis
- Tests: integration complexity, architectural judgment

## Usage

### Creating a Test Project

Use the CLI to create an isolated test environment:

```bash
pnpm kai-test create customer-support-agent
```

This combines:
- Framework scaffold (from `templates/frameworks/langgraph/`)
- Copilot config (from `templates/copilot-configs/claude-code/.claude/`)
- Scenario context (project-context.md and knowledge-base/ from the scenario folder)

### Manual Testing Flow

1. Create test project with the CLI
2. Follow setup instructions printed by the CLI
3. Start copilot session (e.g., `claude`)
4. Give copilot the initial prompt from `user-prompts.md`
5. Respond naturally to copilot questions using guidance notes
6. Evaluate final result against `requirements.md` using `evaluation-criteria.md`

### For Automated Testing (Future)

These documents will feed into:
- **User Agent**: Uses `user-prompts.md` to simulate developer
- **Judge Agent**: Uses `requirements.md` + `evaluation-criteria.md` to evaluate
