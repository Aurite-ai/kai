/**
 * Use Integration Tool
 *
 * MCP tool for executing operations on discovered integrations.
 * This is the "action" part of Kai - actually using the integrations.
 *
 * Supports dry_run mode to preview requests without executing them.
 */

import {
  DEFAULT_HTTP_OPERATION_CONFIGS,
  buildAuthHeaders,
  buildPathFromTemplate,
  buildUrl,
} from '../integrations/execution/http-executor.js';
import { createSimpleExecutor } from '../integrations/execution/index.js';
import { loadIntegration } from '../integrations/storage.js';
import { type MCPToolResponse, type ToolContext, markdownResponse } from './types.js';

/**
 * Tool definition for MCP registration
 */
export const useIntegrationToolDefinition = {
  name: 'kai_use_integration',
  description: `Execute an operation on a discovered integration.

Use this tool to interact with external services (APIs, databases, etc.) that Kai has learned about. 
The integration must first be discovered using kai_learn on files that describe it.

Examples:
- Query a database: integration="postgresql", operation="query", params={sql: "SELECT * FROM users"}
- Send a message: integration="slack", operation="send-message", params={channel: "#general", text: "Hello"}
- Call an API: integration="openai", operation="chat-completion", params={messages: [...]}

The tool handles:
- Credential resolution from vault
- Retry logic with exponential backoff
- Circuit breaker to prevent cascading failures
- Request/response logging`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      integration: {
        type: 'string',
        description: 'The integration ID to use (e.g., "postgresql", "slack", "openai")',
      },
      operation: {
        type: 'string',
        description: 'The operation to perform (e.g., "query", "send-message", "chat-completion")',
      },
      params: {
        type: 'object',
        description: 'Parameters for the operation (varies by integration and operation)',
        additionalProperties: true,
      },
      timeout: {
        type: 'number',
        description: 'Optional timeout in milliseconds (default: 30000)',
      },
      skipRetry: {
        type: 'boolean',
        description: 'Optional: skip retry logic (default: false)',
      },
      dry_run: {
        type: 'boolean',
        description:
          'Optional: preview the request without executing it (default: false). ' +
          'Shows the exact URL, headers, and body that would be sent.',
      },
    },
    required: ['integration', 'operation'],
  },
};

/**
 * Handler for use integration tool
 */
export async function useIntegrationToolHandler(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<MCPToolResponse> {
  const integrationId = args.integration as string;
  const operation = args.operation as string;
  const params = (args.params as Record<string, unknown>) ?? {};
  const timeout = args.timeout as number | undefined;
  const skipRetry = args.skipRetry as boolean | undefined;
  const dryRun = args.dry_run as boolean | undefined;

  if (!integrationId) {
    return markdownResponse('Error: integration ID is required', true);
  }

  if (!operation) {
    return markdownResponse('Error: operation is required', true);
  }

  // =========================================================================
  // DRY RUN MODE
  // =========================================================================
  if (dryRun) {
    return handleDryRun(integrationId, operation, params);
  }

  try {
    // Create executor with vault provider that uses environment variables
    const secrets = new Map<string, string>();

    // Load all relevant environment variables
    for (const [key, value] of Object.entries(process.env)) {
      if (value) {
        // Store with multiple path formats for flexibility
        const lowerKey = key.toLowerCase();
        secrets.set(lowerKey, value);
        secrets.set(lowerKey.replace(/_/g, '/'), value);
        secrets.set(key, value);
      }
    }

    const executor = createSimpleExecutor(secrets);

    // Execute the operation
    const result = await executor.execute({
      integrationId,
      operation,
      params,
      timeout,
      skipRetry,
    });

    if (result.success) {
      return markdownResponse(`# ✅ Operation Successful

**Integration:** ${integrationId}
**Operation:** ${operation}
**Duration:** ${result.meta.duration}ms
**Attempts:** ${result.meta.attempts}

## Result

\`\`\`json
${JSON.stringify(result.data, null, 2)}
\`\`\``);
    }

    // Operation failed
    let errorTips = '';
    if (result.errorCode === 'CREDENTIALS_NOT_FOUND') {
      errorTips = `
## Tip

Make sure the required credentials are set as environment variables or in your vault.
Check the integration's required credentials and ensure they're available.`;
    } else if (result.errorCode === 'CIRCUIT_OPEN') {
      errorTips = `
## Tip

The circuit breaker is open due to repeated failures. Wait for the circuit to recover or reset it manually.`;
    }

    return markdownResponse(
      `# ❌ Operation Failed

**Integration:** ${integrationId}
**Operation:** ${operation}
**Error Code:** ${result.errorCode}
**Duration:** ${result.meta.duration}ms
**Attempts:** ${result.meta.attempts}

## Error

${result.error}${errorTips}`,
      true
    );
  } catch (error) {
    return markdownResponse(
      `Error executing integration operation: ${error instanceof Error ? error.message : String(error)}`,
      true
    );
  }
}

// =============================================================================
// DRY RUN HANDLER
// =============================================================================

/**
 * Handle dry run mode - show what WOULD be sent without executing
 */
async function handleDryRun(
  integrationId: string,
  operationName: string,
  params: Record<string, unknown>
): Promise<MCPToolResponse> {
  try {
    // Load integration descriptor
    const integration = await loadIntegration(integrationId);

    if (!integration) {
      return markdownResponse(
        `# 🔍 Dry Run Failed

**Integration not found:** ${integrationId}

Make sure the integration has been discovered using \`kai_discover_integration\` or exists in the built-in integrations.`,
        true
      );
    }

    // Find the operation
    const operation = integration.operations.find((op) => op.name === operationName);

    if (!operation) {
      const availableOps = integration.operations.map((op) => op.name).join(', ');
      return markdownResponse(
        `# 🔍 Dry Run Failed

**Operation not found:** ${operationName}

**Available operations:** ${availableOps}`,
        true
      );
    }

    // Resolve credentials (show which ones are configured)
    const credentials: Record<string, string> = {};
    const missingCreds: string[] = [];

    for (const credKey of integration.authentication.requiredCredentials) {
      // Try multiple env var formats
      const envKey = credKey.toUpperCase().replace(/[/-]/g, '_');
      const value = process.env[envKey];
      if (value) {
        credentials[credKey] = value;
      } else {
        missingCreds.push(credKey);
      }
    }

    // Get base URL
    const baseUrl =
      credentials.base_url ?? credentials.baseUrl ?? credentials.url ?? '<base_url_required>';

    // Determine HTTP config for this operation
    const opConfig = DEFAULT_HTTP_OPERATION_CONFIGS[operationName] ?? {
      method: 'POST',
      pathTemplate: `/${operationName}`,
      bodyParams: Object.keys(params),
    };

    // Build path
    const path = buildPathFromTemplate(opConfig.pathTemplate, params);

    // Build query parameters
    const query: Record<string, string | number | boolean> = {};
    if (opConfig.queryParams) {
      for (const key of opConfig.queryParams) {
        if (params[key] !== undefined) {
          query[key] = params[key] as string | number | boolean;
        }
      }
    }

    // Build body
    let body: unknown;
    if (opConfig.bodyParams && ['POST', 'PUT', 'PATCH'].includes(opConfig.method)) {
      if (opConfig.bodyParams.length === 1 && opConfig.bodyParams[0] === 'data' && params.data) {
        body = params.data;
      } else {
        body = {};
        for (const key of opConfig.bodyParams) {
          if (params[key] !== undefined) {
            (body as Record<string, unknown>)[key] = params[key];
          }
        }
      }
    }

    // Build URL
    const url = buildUrl(baseUrl, path, Object.keys(query).length > 0 ? query : undefined);

    // Build auth headers (with masked credentials)
    const authHeaders = buildAuthHeaders(integration.authentication.method, credentials);
    const maskedAuthHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(authHeaders)) {
      maskedAuthHeaders[key] = `${value.substring(0, 10)}***${value.substring(value.length - 4)}`;
    }

    // Build response
    const credentialStatus =
      missingCreds.length > 0
        ? `⚠️ **Missing credentials:** ${missingCreds.join(', ')}`
        : '✅ All credentials configured';

    return markdownResponse(`# 🔍 Dry Run - Request Preview

> **No actual API call was made**

## Request Details

**Method:** \`${opConfig.method}\`
**URL:** \`${url}\`

### Headers

\`\`\`json
${JSON.stringify(
  {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...maskedAuthHeaders,
  },
  null,
  2
)}
\`\`\`

### Body

${body ? `\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\`` : '_No body for this request_'}

## Credential Status

${credentialStatus}

**Auth Method:** ${integration.authentication.method}
**Required Credentials:** ${integration.authentication.requiredCredentials.join(', ')}

## To Execute

Remove \`dry_run=true\` to execute this request:

\`\`\`
kai_use_integration(
  integration="${integrationId}",
  operation="${operationName}",
  params=${JSON.stringify(params)}
)
\`\`\``);
  } catch (error) {
    return markdownResponse(
      `# 🔍 Dry Run Error

${error instanceof Error ? error.message : String(error)}`,
      true
    );
  }
}

/**
 * Export the tool definition and handler together
 */
export const useIntegrationTool = {
  definition: useIntegrationToolDefinition,
  handler: useIntegrationToolHandler,
};
