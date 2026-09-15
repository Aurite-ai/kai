---
name: verification
description: Verify agent code against organizational policies and best practices. Trigger this skill when the user says something like "verify my agent", "review agent code", "check compliance", "audit my agent", "check my agent against rules", or "validate agent implementation"
---

# Verify Agent

## Purpose

Verify agent code against business rules, security policies, and framework best practices from Kai's knowledge base. All analysis happens locally—code never leaves the user's machine.

## When to Use

Trigger this skill when the user asks to:
- "verify my agent"
- "review agent code"
- "check compliance"
- "audit my agent"
- "check my agent against rules"
- "validate agent implementation"

## Process

> **Note:** This skill assumes organizational and IT rules are already available in the conversation context from the `kai_prepare_context` call at conversation start (per CLAUDE.md rules).

### Step 1: Load Framework Best Practices

Check the `context-guide.md` for framework-specific best practices surfaced by `kai_prepare_context`:

These files define best practices, required patterns, and anti-patterns specific to that framework. Load and reference them during verification.

If framework best practices aren't available in `context/`, use the **documentation** skill (`.claude/skills/documentation/SKILL.md`) to search for relevant framework documentation.
### Step 2: Discover Agent Files

Locate agent implementation files in the project. Check these common locations:

**Directories:**
- `src/agent/`
- `agent/`
- `src/`
- Project root

**Key files to analyze:**
- `graph.py` - Main workflow/graph definition
- `tools.py` - Tool implementations
- `state.py` - State schema definitions
- `prompts.py` - Prompt templates
- `nodes.py` - Node function implementations
- `config.py` - Configuration and settings

Use `list_files` or similar to discover the actual structure, then read relevant files.

### Step 3: Verify Code Against Rules

Analyze the agent code against all available rules:

1. **Organizational rules** - Check code against company policies from conversation context
2. **IT/Security rules** - Check code against security requirements from conversation context
3. **Framework best practices** - Check code against patterns from the framework best practices in `context-guide.md`

For each rule, determine:
- ✅ **Pass** - Code complies with the rule
- ⚠️ **Warning** - Potential concern worth reviewing
- ❌ **Issue** - Clear violation that needs fixing

### Step 4: Generate Report

Output a structured verification report:

```markdown
# Agent Verification Report

**Project:** [project name or path]
**Date:** [current date]
**Files analyzed:** [list of files]

## Summary

✅ X checks passed | ⚠️ Y warnings | ❌ Z issues

## Findings

### ✅ Passing
- [Check name]: [Brief confirmation of compliance]

### ⚠️ Warnings
- [Check name]: [Description of concern]
  - **Location:** [file:line if applicable]
  - **Suggestion:** [How to address]

### ❌ Issues
- [Check name]: [Description of violation]
  - **Location:** [file:line]
  - **Rule:** [Which rule this violates]
  - **Fix:** [Specific remediation steps]

## Recommendations

1. [Priority recommendation based on findings]
2. [Additional improvements]
```

### Step 5: Export Report (Optional)

After presenting the report, ask the user:

> Would you like to save this verification report to a file?

If the user confirms, save the report to:

```
reports/verification/YYYY-MM-DD_HH-MM-SS.md
```

- Use the current date and time for the filename (e.g., `2026-02-10_15-28-32.md`)
- Create the `reports/verification/` directory if it doesn't exist
- Confirm the save location to the user after writing

## Notes

- **Privacy first:** All code analysis happens locally. Nothing is sent to external services.
- **Rules come from Kai:** The knowledge base provides organization-specific rules. Apply them as written.
- **Framework best practices:** Don't duplicate framework best practices here—reference files in `context-guide.md`.
- **Be specific:** Include file names and line numbers when reporting issues.
- **Explain the "why":** Help developers understand why each rule matters.
