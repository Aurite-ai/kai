# Kai Advanced Documentation

This document covers advanced features and detailed tool reference for Kai.

---

## Integration Tools Reference

Kai can automatically detect and use external services found in your files.

### kai_discover_integration

Detects integrations (databases, APIs, services) in files you provide. Usually called automatically during `kai_learn`.

**Parameters:**

- `filePath` — Path to file containing connection strings, API keys, or service configs

**Returns:** List of detected integrations with type and connection details.

### kai_use_integration

Executes operations against a discovered integration.

**Parameters:**

- `integrationId` — ID of the integration (from discover or list)
- `operation` — What to do (e.g., "query", "list", "get")
- `params` — Operation-specific parameters

**Example:** After discovering a PostgreSQL database, call with `operation: "query"` and `params: { sql: "SELECT * FROM users LIMIT 10" }`.

### kai_verify_integration

Tests that an integration's credentials are valid and the service is reachable.

**Parameters:**

- `integrationId` — ID of the integration to verify

**Returns:** Connection status and any error details.

### kai_list_integrations

Lists all integrations discovered across your knowledge base.

**Returns:** Array of integrations with IDs, types, and status.

---

## Vault & Credentials

When Kai discovers sensitive values (API keys, connection strings, passwords), it stores them securely:

1. **Detection** — Automatic pattern matching identifies secrets in learned files
2. **Storage** — Secrets are stored in vault (1Password or environment variables)
3. **Reference** — Knowledge base files reference secrets by ID, not value
4. **Access** — Integration tools retrieve secrets at execution time

**Supported vault providers:**

- 1Password (recommended for teams)
- Environment variables (simpler setup)

Configure via `KAI_VAULT_PROVIDER` environment variable.

---

## Knowledge Base Structure

Kai organizes learned content into a structured knowledge base:

```
.kai/
├── knowledge/           # Processed knowledge files
│   ├── guidelines/      # Coding standards, style guides
│   ├── architecture/    # System design, patterns
│   ├── api/             # API documentation, schemas
│   └── reference/       # General reference material
├── integrations/        # Discovered service configs
└── context/             # Organization and user context
```

Files are classified automatically during `kai_learn` based on content analysis.

---

## Additional Tools

### kai_provide_context

Manually provides context to the knowledge base without file analysis. Useful for adding information that isn't in files.

**Parameters:**

- `content` — The context to add
- `category` — Optional category hint

---

## Complete Reference

For the full original documentation including all parameters, response formats, and edge cases, see [README-v1.md](README-v1.md).
