# Architecture: Integrations System

**Date:** 2026-02-27  
**Status:** Approved (implemented)  
**Prior art:** [Integration Testing Log](../reference/integration-testing-log.md)

---

## Overview

The integrations system enables Kai to discover, verify, and execute operations on external services (databases, APIs, messaging platforms, etc.). It follows a key principle: store **capabilities** (what a service can do) in integration descriptors, store **credentials** (secrets) in the vault.

All domain logic lives in the `integrations/` module under `apps/mcp/src/`. MCP tool handlers are thin wrappers that validate input, delegate to `integrations/`, and format markdown responses.

---

## System Architecture

```
                    ┌─────────────────────────────────────────────────────┐
                    │                MCP Tool Handlers                     │
                    │            thin wrappers, markdown output            │
                    ├───────────────┬──────────────────┬───────────────────┤
                    │ kai_list_  │ kai_use_      │ kai_verify_    │
                    │ integrations  │ integration      │ integration       │
                    └───────┬───────┴────────┬─────────┴─────────┬─────────┘
                            │                │                   │
                    ┌───────┴────────────────┴───────────────────┴─────────┐
                    │                 integrations/ module                  │
                    │                                                       │
                    │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
                    │  │ extraction/  │  │  storage/    │  │ execution/ │  │
                    │  │              │  │              │  │            │  │
                    │  │ patterns     │  │ CRUD         │  │ executor   │  │
                    │  │ 1password    │  │ merge        │  │ retry      │  │
                    │  │ LLM extract  │  │ summaries    │  │ circuit    │  │
                    │  └──────────────┘  └──────────────┘  │ breaker    │  │
                    │                                      └────────────┘  │
                    │  ┌──────────────┐  ┌──────────────┐                  │
                    │  │verification/ │  │ credential-  │                  │
                    │  │              │  │ prompts/     │                  │
                    │  │ verifier     │  │              │                  │
                    │  │ health checks│  │ templates    │                  │
                    │  └──────────────┘  │ prompts      │                  │
                    │                    └──────────────┘                  │
                    └──────────────────────────────────────────────────────┘
```

### Data Flow

```
                    ┌───────────────┐
  User files ──────►│ kai_learn  │──── Pattern Matching ────► ~/.kai/integrations/*.json
  (with service     └───────────────┘     + LLM Extraction
   mentions)                │
                           ▼
                    1Password refs (op://) ──► infer integration type ──► create descriptor

                    ┌─────────────────────────┐
  Integration ID ──►│ kai_verify_          │──► resolve credentials from vault
                    │ integration             │──► health check operation
                    └─────────────────────────┘         │
                                                       ▼
                                               update status: discovered → configured → verified

                    ┌─────────────────────────┐
  Operation ───────►│ kai_use_integration  │──► resolve credentials
  Params            └─────────────────────────┘──► circuit breaker check
                                                ──► execute with retry ──► result
```

### Tool Roles

| Tool | When Called | Side Effects | Key Operations |
|------|------------|--------------|----------------|
| `kai_list_integrations` | Browse available services | None (read-only) | List, filter by type/status |
| `kai_use_integration` | Execute operation on service | May update circuit breaker state | Credential resolution, retry, circuit breaker |
| `kai_verify_integration` | Test credentials work | Updates integration status | Health check, status update |

---

## Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Separate capabilities from credentials** | Descriptors store what's possible; vault stores how to access. Prevents secret leakage. |
| D2 | **Pattern-based + LLM extraction** | Patterns are fast (no API call); LLM handles custom services. |
| D3 | **25+ known integration patterns** | Cover common services (Slack, Stripe, PostgreSQL, etc.) without user configuration. |
| D4 | **1Password reference parsing** | `op://vault/item/field` URIs auto-discover integrations from existing secrets. |
| D5 | **Vault references, not values** | Credentials stored as `vault://env/SLACK_BOT_TOKEN`, resolved at execution time. |
| D6 | **JSON file per integration** | `~/.kai/integrations/{id}.json`. Human-readable, easy to debug. |
| D7 | **Merge logic for duplicates** | Same integration from multiple sources merges operations and vault refs. |
| D8 | **Circuit breaker pattern** | Prevents cascading failures. CLOSED → OPEN (after failures) → HALF_OPEN (recovery test). |
| D9 | **Exponential backoff with jitter** | Retries use increasing delays + randomization to avoid thundering herd. |
| D10 | **Retry presets** | `fast` (50ms), `standard` (100ms), `aggressive` (200ms), `rateLimited` (1s). |
| D11 | **Type-specific health checks** | Each integration type (database, messaging, etc.) has appropriate test operations. |
| D12 | **Credential templates** | `integration-templates.ts` provides env var names, example formats, where-to-get-it info. |
| D13 | **Status progression** | `discovered` → `configured` → `verified` → `error`. Clear lifecycle. |
| D14 | **Environment variables as default vault** | Simplest setup. Can upgrade to 1Password/HashiCorp later. |

---

## Integration Descriptor Structure

### Storage Location

- **Default:** `~/.kai/integrations/`
- **Layout:** One JSON file per integration: `{id}.json`

### Descriptor Format

```typescript
interface IntegrationDescriptor {
  id: string;                              // "postgresql", "slack"
  displayName: string;                     // "PostgreSQL Database"
  type: IntegrationType;                   // "database", "messaging", etc.
  description: string;
  
  operations: IntegrationOperation[];      // Available operations
  authentication: IntegrationAuth;         // Auth method + vault refs
  limits?: IntegrationLimits;              // Rate limits, quotas
  examples: UsageExample[];                // Example usage
  notes: string[];                         // Important info
  
  source: IntegrationSource;               // Where learned from
  status: "discovered" | "configured" | "verified" | "error";
  
  createdAt: string;                       // ISO timestamp
  updatedAt: string;
}
```

### Integration Types

| Type | Description | Examples |
|------|-------------|----------|
| `database` | SQL/NoSQL databases | PostgreSQL, MongoDB, Supabase |
| `api` | REST/GraphQL APIs | Custom APIs |
| `messaging` | Communication platforms | Slack, Discord, Gmail |
| `storage` | File/object storage | AWS S3, Google Drive |
| `crm` | Customer relationship | Salesforce, HubSpot |
| `payment` | Payment processing | Stripe, PayPal |
| `ai` | AI/ML services | OpenAI, Anthropic |
| `social` | Social platforms | LinkedIn, Twitter |
| `developer` | Dev tools | GitHub |
| `productivity` | Productivity tools | Notion, Jira |
| `analytics` | Analytics platforms | Mixpanel, Amplitude |
| `project_management` | Project tools | Jira, Asana |
| `custom` | Everything else | Custom integrations |

### Authentication Configuration

```typescript
interface IntegrationAuth {
  method: "api_key" | "oauth2" | "basic_auth" | "bearer_token" | "custom" | "none";
  requiredCredentials: string[];           // ["bot_token", "webhook_url"]
  vaultRefs: Record<string, string>;       // { bot_token: "vault://env/SLACK_BOT_TOKEN" }
  scopes?: string[];                       // OAuth scopes if applicable
}
```

---

## Supported Integrations

Kai includes 25+ built-in integration patterns. These are auto-detected when you run `kai_learn` on files mentioning these services.

### Databases (6 integrations)

| ID | Display Name | Auth Method | Required Credentials | Operations |
|----|--------------|-------------|---------------------|------------|
| `postgresql` | PostgreSQL Database | `basic_auth` | `database_url`, `password` | `query`, `execute` |
| `mysql` | MySQL Database | `basic_auth` | `host`, `username`, `password`, `database` | `query`, `execute`, `backup` |
| `mongodb` | MongoDB Database | `basic_auth` | `connection_string`, `password` | `find`, `insert` |
| `sqlite` | SQLite | `none` | `database_path` (optional) | `query`, `execute` |
| `supabase` | Supabase | `api_key` | `url`, `anon_key`, `service_role_key` | `query`, `insert`, `update`, `call-function` |
| `firebase` | Firebase | `api_key` | `api_key`, `project_id`, `service_account_key` | `get-doc`, `set-doc`, `query-collection`, `call-function` |

### AI Services (3 integrations)

| ID | Display Name | Auth Method | Required Credentials | Operations |
|----|--------------|-------------|---------------------|------------|
| `openai` | OpenAI | `api_key` | `api_key` | `chat-completion`, `embeddings` |
| `anthropic` | Anthropic | `api_key` | `api_key` | `messages` |
| `google-ai` | Google AI (Gemini) | `api_key` | `api_key` | `generate-content`, `embed-content`, `count-tokens` |

### Messaging (5 integrations)

| ID | Display Name | Auth Method | Required Credentials | Operations |
|----|--------------|-------------|---------------------|------------|
| `slack` | Slack | `bearer_token` | `bot_token`, `webhook_url` | `send-message`, `list-channels` |
| `discord` | Discord | `bearer_token` | `bot_token`, `client_id`, `client_secret` | `send-message`, `list-channels`, `create-webhook`, `send-webhook` |
| `microsoft-teams` | Microsoft Teams | `oauth2` | `client_id`, `client_secret`, `tenant_id` | `send-message`, `create-channel`, `list-teams` |
| `gmail` | Gmail | `oauth2` | `client_id`, `client_secret`, `refresh_token` | `send-email`, `list-messages` |
| `sendgrid` | SendGrid | `api_key` | `api_key` | `send-email` |

### Payment (2 integrations)

| ID | Display Name | Auth Method | Required Credentials | Operations |
|----|--------------|-------------|---------------------|------------|
| `stripe` | Stripe | `api_key` | `secret_key`, `publishable_key` | `create-payment-intent`, `list-customers` |
| `paypal` | PayPal | `oauth2` | `client_id`, `client_secret` | `create-payment`, `capture-payment`, `refund`, `get-transactions` |

### Storage (3 integrations)

| ID | Display Name | Auth Method | Required Credentials | Operations |
|----|--------------|-------------|---------------------|------------|
| `aws-s3` | AWS S3 | `api_key` | `access_key_id`, `secret_access_key` | `list-objects`, `get-object`, `put-object` |
| `google-drive` | Google Drive | `oauth2` | `client_id`, `client_secret`, `refresh_token` | `list-files`, `upload-file`, `download-file`, `create-folder` |
| `google-sheets` | Google Sheets | `oauth2` | `client_id`, `client_secret`, `refresh_token` | `get-values`, `update-values`, `append-row` |

### CRM (2 integrations)

| ID | Display Name | Auth Method | Required Credentials | Operations |
|----|--------------|-------------|---------------------|------------|
| `salesforce` | Salesforce | `oauth2` | `client_id`, `client_secret`, `refresh_token`, `instance_url` | `query`, `create-record`, `update-record` |
| `hubspot` | HubSpot | `api_key` | `api_key`, `access_token` | `get-contact`, `create-contact` |

### Developer Platforms (1 integration)

| ID | Display Name | Auth Method | Required Credentials | Operations |
|----|--------------|-------------|---------------------|------------|
| `github` | GitHub | `bearer_token` | `personal_access_token` | `list-repos`, `create-issue`, `get-pull-requests` |

### Social Platforms (2 integrations)

| ID | Display Name | Auth Method | Required Credentials | Operations |
|----|--------------|-------------|---------------------|------------|
| `linkedin` | LinkedIn | `oauth2` | `client_id`, `client_secret`, `access_token` | `get-profile`, `post-share`, `get-connections` |
| `twitter` | Twitter/X | `oauth2` | `api_key`, `api_secret`, `access_token`, `access_token_secret` | `post-tweet`, `search-tweets`, `get-user` |

### Productivity (2 integrations)

| ID | Display Name | Auth Method | Required Credentials | Operations |
|----|--------------|-------------|---------------------|------------|
| `notion` | Notion | `bearer_token` | `api_key` | `query-database`, `create-page`, `update-page` |
| `jira` | Jira | `basic_auth` | `email`, `api_token`, `domain` | `create-issue`, `get-issue`, `search-issues`, `transition-issue` |

### Summary by Category

| Category | Count | Integrations |
|----------|-------|--------------|
| **Databases** | 6 | PostgreSQL, MySQL, MongoDB, SQLite, Supabase, Firebase |
| **AI Services** | 3 | OpenAI, Anthropic, Google AI (Gemini) |
| **Messaging** | 5 | Slack, Discord, Microsoft Teams, Gmail, SendGrid |
| **Payment** | 2 | Stripe, PayPal |
| **Storage** | 3 | AWS S3, Google Drive, Google Sheets |
| **CRM** | 2 | Salesforce, HubSpot |
| **Developer** | 1 | GitHub |
| **Social** | 2 | LinkedIn, Twitter/X |
| **Productivity** | 2 | Notion, Jira |
| **Total** | **26** | |

---

## Execution Infrastructure

### Executor

The `IntegrationExecutor` orchestrates operation execution:

```typescript
class IntegrationExecutor {
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    // 1. Load integration descriptor
    // 2. Find operation
    // 3. Resolve credentials from vault
    // 4. Check circuit breaker
    // 5. Execute with retry
    // 6. Update status on success/failure
  }
}
```

### Circuit Breaker

Prevents repeated calls to failing services:

```
CLOSED ──(5 failures)──► OPEN ──(30s timeout)──► HALF_OPEN ──(2 successes)──► CLOSED
                           │                          │
                           └────────(1 failure)───────┘
```

| Config | Default | Description |
|--------|---------|-------------|
| `failureThreshold` | 5 | Failures before opening |
| `resetTimeoutMs` | 30000 | Time before testing recovery |
| `successThreshold` | 2 | Successes to close circuit |

### Retry Configuration

| Preset | Max Attempts | Initial Delay | Max Delay | Retryable Errors |
|--------|-------------|---------------|-----------|------------------|
| `fast` | 3 | 50ms | 500ms | CONNECTION_FAILED, TIMEOUT |
| `standard` | 3 | 100ms | 5000ms | CONNECTION_FAILED, TIMEOUT, RATE_LIMITED |
| `aggressive` | 5 | 200ms | 10000ms | CONNECTION_FAILED, TIMEOUT, RATE_LIMITED |
| `rateLimited` | 5 | 1000ms | 60000ms | RATE_LIMITED |
| `none` | 1 | 0ms | 0ms | (none) |

---

## Verification Infrastructure

### Verifier

The `IntegrationVerifier` tests that integrations work:

```typescript
class IntegrationVerifier {
  async verify(integrationId: string): Promise<VerificationResult> {
    // 1. Load integration descriptor
    // 2. Check credentials can be resolved
    // 3. Run health check operation
    // 4. Update integration status
  }
}
```

### Health Check Definitions

| Type | Operation | Params | Description |
|------|-----------|--------|-------------|
| `database` | `query` | `{sql: "SELECT 1"}` | Minimal query |
| `api` | `list` | `{limit: 1}` | Minimal list |
| `messaging` | `list-channels` | `{limit: 1}` | List channels |
| `storage` | `list-objects` | `{limit: 1}` | List objects |
| `crm` | `query` | `{query: "...LIMIT 1"}` | Minimal query |
| `ai` | `chat-completion` | `{messages: [...], max_tokens: 1}` | Minimal request |

---

## Credential Templates

Templates provide user-friendly setup instructions for each integration:

```typescript
interface CredentialRequirement {
  key: string;                  // "api_key"
  displayName: string;          // "API Key"
  description: string;          // "API key for OpenAI services"
  envVarName: string;           // "OPENAI_API_KEY"
  opPath: string;               // "op://vault/openai/api_key"
  exampleFormat: string;        // "sk-proj-xxxx..."
  obtainFrom: string;           // "https://platform.openai.com/api-keys"
  required: boolean;
}
```

When credentials are missing, `generateCredentialPrompt()` produces actionable markdown showing exactly what to set and where to get it.

---

## File Structure

```
apps/mcp/src/integrations/
├── types.ts                     # IntegrationDescriptor, IntegrationType, etc.
├── extraction.ts                # Pattern matching, 1Password parsing, LLM extraction
├── storage.ts                   # CRUD for ~/.kai/integrations/
├── integration-templates.ts     # CREDENTIAL_INFO for 25+ services
├── credential-prompts.ts        # Generate setup instructions
├── index.ts                     # Public exports (barrel)
│
├── execution/                   # Execute integration operations
│   ├── types.ts                 # ExecutionRequest, ExecutionResult, RetryConfig
│   ├── executor.ts              # Main IntegrationExecutor class
│   ├── circuit-breaker.ts       # CircuitBreaker, CircuitBreakerRegistry
│   ├── retry.ts                 # withRetry(), RETRY_PRESETS
│   ├── http-executor.ts         # HTTP/API execution
│   └── index.ts                 # Public exports
│
└── verification/                # Test integrations work
    ├── types.ts                 # VerificationResult, HealthCheckDefinition
    ├── verifier.ts              # IntegrationVerifier, health checks
    └── index.ts                 # Public exports

apps/mcp/src/tools/
├── list-integrations.ts         # kai_list_integrations handler
├── use-integration.ts           # kai_use_integration handler
└── verify-integration.ts        # kai_verify_integration handler
```

---

## Response Format

All tools return markdown with actionable information:

```markdown
# ✅ Operation Successful

**Integration:** slack
**Operation:** send-message
**Duration:** 342ms
**Attempts:** 1

## Result

\`\`\`json
{"ok": true, "channel": "C123", "ts": "1234567890.123456"}
\`\`\`
```

Error responses include troubleshooting tips:

```markdown
# ❌ Operation Failed

**Integration:** slack
**Error Code:** CREDENTIALS_NOT_FOUND

## Tip

Make sure the required credentials are set as environment variables or in your vault.
```

---

## References

- [Integration Testing Log](../reference/integration-testing-log.md) — Manual verification records
- [MCP README](../../apps/mcp/README.md) — Full MCP server documentation
- [Tool Specifications](../design/tool-specifications.md) — Tool input/output schemas
