# Integration Testing Log

Manual verification log for external service integrations. Update after testing each integration to ensure configurations remain valid and catch any API changes.

## Testing Summary

| Integration | Category | Last Tested | Status | Tester |
|-------------|----------|-------------|--------|--------|
| [slack](#slack) | Messaging | TBD | ⚪ Not tested | - |
| [discord](#discord) | Messaging | TBD | ⚪ Not tested | - |
| [supabase](#supabase) | Database | TBD | ⚪ Not tested | - |
| [postgresql](#postgresql) | Database | TBD | ⚪ Not tested | - |
| [openai](#openai) | AI | TBD | ⚪ Not tested | - |
| [anthropic](#anthropic) | AI | TBD | ⚪ Not tested | - |
| [stripe](#stripe) | Payment | TBD | ⚪ Not tested | - |
| [github](#github) | Developer | TBD | ⚪ Not tested | - |
| [notion](#notion) | Productivity | TBD | ⚪ Not tested | - |
| [jira](#jira) | Productivity | TBD | ⚪ Not tested | - |

**Status Legend:**
- ✅ Verified working
- ⚠️ Partial (some operations work)
- ❌ Broken (needs fix)
- ⚪ Not tested

---

## How to Test an Integration

### 1. Verify Credentials

```
kai_verify_integration(integration="<id>")
```

This checks:
- Required credentials exist in env/vault
- Credential format is valid
- Basic connection test (if supported)

### 2. Test Core Operations

Run the primary operations with test data:

```
kai_use_integration(
  integration="<id>",
  operation="<operation>",
  params={...}
)
```

### 3. Update This Log

After testing, update:
1. Summary table above with date and status
2. Integration's detailed section below with test details

---

## Detailed Test Records

### Slack

**Category:** Messaging  
**Credential Template:** `integration-templates.ts` → `slack`

#### Credentials Used
| Credential | Source | Notes |
|------------|--------|-------|
| `bot_token` | - | - |
| `webhook_url` | - | - |

#### Test Scenarios

| Operation | Test Date | Input | Expected Output | Actual Output | Status |
|-----------|-----------|-------|-----------------|---------------|--------|
| `send-message` | TBD | `{channel: "#test", text: "Test"}` | Message posted | - | ⚪ |
| `list-channels` | TBD | `{}` | Channel list returned | - | ⚪ |

#### Known Quirks
- (None documented yet)

---

### Discord

**Category:** Messaging  
**Credential Template:** `integration-templates.ts` → `discord`

#### Credentials Used
| Credential | Source | Notes |
|------------|--------|-------|
| `bot_token` | - | - |

#### Test Scenarios

| Operation | Test Date | Input | Expected Output | Actual Output | Status |
|-----------|-----------|-------|-----------------|---------------|--------|
| `send-message` | TBD | `{channel_id: "...", content: "Test"}` | Message posted | - | ⚪ |

#### Known Quirks
- (None documented yet)

---

### Supabase

**Category:** Database  
**Credential Template:** `integration-templates.ts` → `supabase`

#### Credentials Used
| Credential | Source | Notes |
|------------|--------|-------|
| `url` | - | - |
| `anon_key` | - | - |
| `service_role_key` | - | Optional |

#### Test Scenarios

| Operation | Test Date | Input | Expected Output | Actual Output | Status |
|-----------|-----------|-------|-----------------|---------------|--------|
| `query` | TBD | `{table: "test", select: "*"}` | Rows returned | - | ⚪ |
| `insert` | TBD | `{table: "test", data: {...}}` | Row inserted | - | ⚪ |

#### Known Quirks
- (None documented yet)

---

### PostgreSQL

**Category:** Database  
**Credential Template:** `integration-templates.ts` → `postgresql`

#### Credentials Used
| Credential | Source | Notes |
|------------|--------|-------|
| `database_url` | - | - |

#### Test Scenarios

| Operation | Test Date | Input | Expected Output | Actual Output | Status |
|-----------|-----------|-------|-----------------|---------------|--------|
| `query` | TBD | `{sql: "SELECT 1"}` | `[{?column?: 1}]` | - | ⚪ |

#### Known Quirks
- (None documented yet)

---

### OpenAI

**Category:** AI  
**Credential Template:** `integration-templates.ts` → `openai`

#### Credentials Used
| Credential | Source | Notes |
|------------|--------|-------|
| `api_key` | - | - |

#### Test Scenarios

| Operation | Test Date | Input | Expected Output | Actual Output | Status |
|-----------|-----------|-------|-----------------|---------------|--------|
| `chat-completion` | TBD | `{model: "gpt-4o-mini", messages: [...]}` | Completion returned | - | ⚪ |

#### Known Quirks
- (None documented yet)

---

### Anthropic

**Category:** AI  
**Credential Template:** `integration-templates.ts` → `anthropic`

#### Credentials Used
| Credential | Source | Notes |
|------------|--------|-------|
| `api_key` | - | - |

#### Test Scenarios

| Operation | Test Date | Input | Expected Output | Actual Output | Status |
|-----------|-----------|-------|-----------------|---------------|--------|
| `messages` | TBD | `{model: "claude-3-haiku", messages: [...]}` | Response returned | - | ⚪ |

#### Known Quirks
- (None documented yet)

---

### Stripe

**Category:** Payment  
**Credential Template:** `integration-templates.ts` → `stripe`

#### Credentials Used
| Credential | Source | Notes |
|------------|--------|-------|
| `secret_key` | - | Use test key `sk_test_...` |

#### Test Scenarios

| Operation | Test Date | Input | Expected Output | Actual Output | Status |
|-----------|-----------|-------|-----------------|---------------|--------|
| `list-customers` | TBD | `{limit: 10}` | Customer list | - | ⚪ |
| `create-payment-intent` | TBD | `{amount: 1000, currency: "usd"}` | PaymentIntent created | - | ⚪ |

#### Known Quirks
- Always use test mode keys (`sk_test_...`) for testing
- (None documented yet)

---

### GitHub

**Category:** Developer  
**Credential Template:** `integration-templates.ts` → `github`

#### Credentials Used
| Credential | Source | Notes |
|------------|--------|-------|
| `personal_access_token` | - | - |

#### Test Scenarios

| Operation | Test Date | Input | Expected Output | Actual Output | Status |
|-----------|-----------|-------|-----------------|---------------|--------|
| `list-repos` | TBD | `{per_page: 5}` | Repo list returned | - | ⚪ |
| `get-user` | TBD | `{}` | User info returned | - | ⚪ |

#### Known Quirks
- (None documented yet)

---

### Notion

**Category:** Productivity  
**Credential Template:** `integration-templates.ts` → `notion`

#### Credentials Used
| Credential | Source | Notes |
|------------|--------|-------|
| `api_key` | - | Internal integration token |

#### Test Scenarios

| Operation | Test Date | Input | Expected Output | Actual Output | Status |
|-----------|-----------|-------|-----------------|---------------|--------|
| `search` | TBD | `{query: "test"}` | Search results | - | ⚪ |
| `get-page` | TBD | `{page_id: "..."}` | Page content | - | ⚪ |

#### Known Quirks
- Integration must be shared with specific pages/databases to access them
- (None documented yet)

---

### Jira

**Category:** Productivity  
**Credential Template:** `integration-templates.ts` → `jira`

#### Credentials Used
| Credential | Source | Notes |
|------------|--------|-------|
| `email` | - | - |
| `api_token` | - | - |
| `domain` | - | - |

#### Test Scenarios

| Operation | Test Date | Input | Expected Output | Actual Output | Status |
|-----------|-----------|-------|-----------------|---------------|--------|
| `search-issues` | TBD | `{jql: "project = TEST"}` | Issue list | - | ⚪ |
| `get-issue` | TBD | `{issue_key: "TEST-1"}` | Issue details | - | ⚪ |

#### Known Quirks
- (None documented yet)

---

## Re-testing Guidelines

**When to re-test:**
- After changing credentials or vault configuration
- After modifying `integration-templates.ts`
- After updating integration execution code
- Monthly for critical integrations (Slack, OpenAI, etc.)
- After provider API updates/deprecations

**Priority order for testing:**
1. AI services (OpenAI, Anthropic) - core functionality
2. Messaging (Slack, Discord) - common use case
3. Databases (Supabase, PostgreSQL) - data operations
4. Others as needed
