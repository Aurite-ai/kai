# Architecture: Repository Infrastructure

**Date:** 2025-01-30 (updated 2026-02-10)
**Status:** Approved

## Overview

This document defines the repository infrastructure for Kai 2.0, covering directory structure, package management, TypeScript configuration, code quality tooling, and development workflows.

---

## Summary of Decisions

| Area                   | Decision                              |
| ---------------------- | ------------------------------------- |
| **Monorepo**           | Yes - shared packages across apps     |
| **Package Manager**    | pnpm 9.x with workspaces             |
| **Monorepo Tooling**   | pnpm workspaces + minimal Turborepo  |
| **Linting/Formatting** | Biome (replaces ESLint + Prettier)   |
| **Primary App**        | `apps/mcp/` (MCP server, stdio)      |
| **Package Scope**      | `@aurite-ai/*`                       |
| **Shared Packages**    | Multiple under `packages/`           |
| **TypeScript**         | Simple extends pattern, strict mode  |

---

## 1. Directory Structure

```
kai/
├── .github/                    # GitHub Actions (future)
├── .roo/                       # Copilot rules and mode configs
├── .vscode/
│   ├── settings.json          # Editor settings
│   └── extensions.json        # Recommended extensions
├── apps/
│   └── mcp/                   # MCP server (stdio) for coding copilots
│       ├── src/
│       │   ├── knowledge/     # KB domain logic (agents, storage, surfacing)
│       │   ├── tools/         # MCP tool handlers
│       │   ├── config.ts      # Model IDs, server constants
│       │   └── index.ts       # Server entry point
│       ├── templates/         # VCK templates (bundled with MCP server)
│       │   ├── copilot-configs/   # Copilot configuration templates
│       │   ├── frameworks/        # Framework boilerplate templates
│       │   └── knowledge-base/    # KB seed files
│       ├── .env.example
│       ├── package.json
│       ├── tsconfig.json
│       └── vitest.config.ts
├── packages/
│   └── testing/               # QA testing infrastructure (scenarios + CLI)
├── docs/                      # Documentation
├── biome.json                 # Linting + formatting config
├── tsconfig.base.json         # Shared TypeScript settings
├── turbo.json                 # Turborepo task config
├── pnpm-workspace.yaml        # Workspace definition
├── package.json               # Root scripts, shared devDeps
├── pnpm-lock.yaml             # Lockfile (auto-generated)
├── .gitignore
└── README.md
```

---

## 2. pnpm Workspace Configuration

### `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### Package Naming Convention

- Scope: `@aurite-ai`
- Apps: `@aurite-ai/kai`
- Packages: `@aurite-ai/kai-testing`

### Workspace Dependencies

Use `workspace:*` protocol for internal dependencies:

```json
{
  "dependencies": {
    "@aurite-ai/kai-file-router": "workspace:*"
  }
}
```

---

## 3. Turborepo Configuration

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "start": {
      "dependsOn": ["build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

**Why Turbo:** Provides explicit task dependency graph and caching. Minimal config, easy to remove if not needed.

---

## 4. TypeScript Configuration

### Architecture: Project References

TypeScript project references enable the IDE to understand cross-package dependencies without requiring a build step. This architecture uses:

- **`tsconfig.base.json`** - Shared compiler options (strict, target, lib, etc.)
- **`tsconfig.json`** (root) - Project references for IDE navigation
- **Per-package `tsconfig.json`** - Extends base, adds `composite: true`, references dependencies

### Base Config: `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true
  }
}
```

### Key Decisions

| Setting                    | Value     | Rationale                                  |
| -------------------------- | --------- | ------------------------------------------ |
| `composite`                | `true`    | Enables project references for IDE support |
| `strict`                   | `true`    | Modern TypeScript standard                 |
| `noUncheckedIndexedAccess` | `false`   | Matches current codebase, can enable later |
| `moduleResolution`         | `bundler` | Extensionless imports across packages      |

---

## 5. Biome Configuration

### `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "es5",
      "semicolons": "always"
    }
  }
}
```

### Formatting Decisions

| Setting         | Value    | Rationale                     |
| --------------- | -------- | ----------------------------- |
| Line width      | 100      | Wider for LLM prompts in code |
| Quotes          | Single   | TypeScript convention         |
| Semicolons      | Always   | Explicit, avoids ASI issues   |
| Trailing commas | `es5`    | Objects/arrays only           |
| Indent          | 2 spaces | Standard                      |

---

## 6. VS Code Integration

### `.vscode/settings.json`

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "editor.codeActionsOnSave": {
    "source.organizeImports.biome": "explicit"
  }
}
```

### `.vscode/extensions.json`

```json
{
  "recommendations": ["biomejs.biome"]
}
```

---

## Open Questions for Future Design Phases

1. **Testing Strategy** - Vitest configuration and patterns across packages
2. **CI/CD** - GitHub Actions workflow
3. **Cloud API** - When agents/KB move to a hosted service

---

## References

- [Research: Repository Structure](../internal/research/01-repo-structure.md)
- [Research: TypeScript Tooling](../internal/research/02-typescript-tooling.md)
