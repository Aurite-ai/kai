/**
 * Integration Research Agent Tools
 *
 * Tools for the research agent to discover, analyze, and generate
 * connector manifests for any integration service.
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';
import type { ConnectorManifest } from '../types.js';
import type { ConnectorRegistry } from '../types.js';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/**
 * Tool for searching integration information on the web
 */
export const searchIntegrationInfoTool: Tool = {
  name: 'search_integration_info',
  description:
    'Search for API documentation, authentication methods, and endpoint information for a service. Returns relevant documentation snippets.',
  input_schema: {
    type: 'object' as const,
    properties: {
      service_name: {
        type: 'string',
        description: 'Name of the service (e.g., "Twilio", "Airtable", "Monday.com")',
      },
      search_type: {
        type: 'string',
        enum: ['api_docs', 'authentication', 'endpoints', 'rate_limits', 'openapi_spec', 'sdk'],
        description: 'What type of information to search for',
      },
    },
    required: ['service_name', 'search_type'],
  },
};

/**
 * Tool for fetching and parsing API documentation from a URL
 */
export const fetchApiDocsTool: Tool = {
  name: 'fetch_api_documentation',
  description:
    'Fetch and extract relevant information from an API documentation URL. Returns structured information about endpoints, authentication, etc.',
  input_schema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'URL of the API documentation page',
      },
      focus: {
        type: 'string',
        enum: ['authentication', 'endpoints', 'rate_limits', 'errors', 'overview', 'quickstart'],
        description: 'Which aspect to focus on extracting',
      },
    },
    required: ['url'],
  },
};

/**
 * Tool for parsing OpenAPI/Swagger specifications
 */
export const parseOpenApiTool: Tool = {
  name: 'parse_openapi_spec',
  description:
    'Parse an OpenAPI/Swagger specification and extract operations, authentication methods, and schemas. Returns structured connector information.',
  input_schema: {
    type: 'object' as const,
    properties: {
      spec_url: {
        type: 'string',
        description: 'URL to the OpenAPI spec (JSON or YAML)',
      },
      spec_content: {
        type: 'string',
        description: 'Or provide the raw OpenAPI spec content directly',
      },
      max_operations: {
        type: 'number',
        description: 'Maximum number of operations to extract (default: 10)',
      },
    },
    required: [],
  },
};

/**
 * Tool for generating a connector manifest from gathered information
 */
export const generateManifestTool: Tool = {
  name: 'generate_connector_manifest',
  description:
    'Generate a complete ConnectorManifest from the gathered integration information. Call this after you have collected enough information about the service.',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'Connector ID in kebab-case (e.g., "twilio", "airtable")',
      },
      displayName: {
        type: 'string',
        description: 'Human-readable name (e.g., "Twilio", "Airtable")',
      },
      description: {
        type: 'string',
        description: 'Brief description of what this connector does',
      },
      type: {
        type: 'string',
        enum: [
          'database',
          'api',
          'messaging',
          'storage',
          'crm',
          'analytics',
          'payment',
          'ai',
          'social',
          'developer',
          'productivity',
          'project_management',
          'custom',
        ],
        description: 'Integration category',
      },
      baseUrl: {
        type: 'string',
        description: 'Base URL for API calls (e.g., "https://api.twilio.com")',
      },
      auth: {
        type: 'object',
        description: 'Authentication configuration',
        properties: {
          method: {
            type: 'string',
            enum: ['api_key', 'bearer_token', 'basic_auth', 'oauth2', 'none'],
          },
          credentials: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                displayName: { type: 'string' },
                envVar: { type: 'string' },
                required: { type: 'boolean' },
                description: { type: 'string' },
                obtainFrom: { type: 'string' },
              },
              required: ['name', 'envVar'],
            },
          },
        },
        required: ['method', 'credentials'],
      },
      operations: {
        type: 'array',
        description: 'List of operations this connector supports (5-10 most common)',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
            path: { type: 'string' },
            params: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: ['string', 'number', 'boolean', 'object', 'array'],
                  },
                  required: { type: 'boolean' },
                  in: { type: 'string', enum: ['path', 'query', 'body', 'header'] },
                },
                required: ['name', 'type'],
              },
            },
          },
          required: ['name', 'description'],
        },
      },
      rateLimits: {
        type: 'object',
        description: 'Rate limit configuration',
        properties: {
          requests: { type: 'number' },
          window: { type: 'string' },
        },
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for discovery',
      },
      documentationUrl: {
        type: 'string',
        description: 'URL to official documentation',
      },
    },
    required: ['id', 'displayName', 'description', 'type', 'auth', 'operations'],
  },
};

/**
 * Tool for registering a connector in the registry
 */
export const registerConnectorTool: Tool = {
  name: 'register_connector',
  description:
    'Register the generated connector manifest in the local registry. This makes the connector available for use.',
  input_schema: {
    type: 'object' as const,
    properties: {
      manifest: {
        type: 'object',
        description:
          'The complete ConnectorManifest to register (from generate_connector_manifest)',
      },
    },
    required: ['manifest'],
  },
};

/**
 * Tool for listing existing connectors
 */
export const listConnectorsTool: Tool = {
  name: 'list_existing_connectors',
  description:
    'List connectors that are already registered. Use this to check if a connector already exists before creating a new one.',
  input_schema: {
    type: 'object' as const,
    properties: {
      filter_type: {
        type: 'string',
        enum: [
          'database',
          'api',
          'messaging',
          'storage',
          'crm',
          'analytics',
          'payment',
          'ai',
          'social',
          'developer',
          'productivity',
          'project_management',
          'custom',
        ],
        description: 'Filter by integration type',
      },
    },
    required: [],
  },
};

// =============================================================================
// TOOL GROUPS
// =============================================================================

/**
 * All tools available to the integration research agent
 */
export const integrationResearchTools: Tool[] = [
  searchIntegrationInfoTool,
  fetchApiDocsTool,
  parseOpenApiTool,
  generateManifestTool,
  registerConnectorTool,
  listConnectorsTool,
];

// =============================================================================
// INPUT VALIDATION SCHEMAS
// =============================================================================

export const searchIntegrationInfoInputSchema = z.object({
  service_name: z.string().min(1),
  search_type: z.enum([
    'api_docs',
    'authentication',
    'endpoints',
    'rate_limits',
    'openapi_spec',
    'sdk',
  ]),
});

export const fetchApiDocsInputSchema = z.object({
  url: z.string().url(),
  focus: z
    .enum(['authentication', 'endpoints', 'rate_limits', 'errors', 'overview', 'quickstart'])
    .optional(),
});

export const parseOpenApiInputSchema = z.object({
  spec_url: z.string().url().optional(),
  spec_content: z.string().optional(),
  max_operations: z.number().min(1).max(50).optional(),
});

export const generateManifestInputSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1),
  description: z.string().min(1),
  type: z.enum([
    'database',
    'api',
    'messaging',
    'storage',
    'crm',
    'analytics',
    'payment',
    'ai',
    'social',
    'developer',
    'productivity',
    'project_management',
    'custom',
  ]),
  baseUrl: z.string().url().optional(),
  auth: z.object({
    method: z.enum(['api_key', 'bearer_token', 'basic_auth', 'oauth2', 'none']),
    credentials: z.array(
      z.object({
        name: z.string(),
        displayName: z.string().optional(),
        envVar: z.string(),
        required: z.boolean().optional(),
        description: z.string().optional(),
        obtainFrom: z.string().optional(),
      })
    ),
  }),
  operations: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
      path: z.string().optional(),
      params: z
        .array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
            required: z.boolean().optional(),
            in: z.enum(['path', 'query', 'body', 'header']).optional(),
          })
        )
        .optional(),
    })
  ),
  rateLimits: z
    .object({
      requests: z.number(),
      window: z.string(),
    })
    .optional(),
  tags: z.array(z.string()).optional(),
  documentationUrl: z.string().url().optional(),
});

export const registerConnectorInputSchema = z.object({
  manifest: z.record(z.string(), z.unknown()),
});

export const listConnectorsInputSchema = z.object({
  filter_type: z
    .enum([
      'database',
      'api',
      'messaging',
      'storage',
      'crm',
      'analytics',
      'payment',
      'ai',
      'social',
      'developer',
      'productivity',
      'project_management',
      'custom',
    ])
    .optional(),
});

// =============================================================================
// TOOL EXECUTION CONTEXT
// =============================================================================

export interface ResearchToolContext {
  registry: ConnectorRegistry;
  webSearch?: (query: string) => Promise<WebSearchResult[]>;
  fetchUrl?: (url: string) => Promise<string>;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

// =============================================================================
// TOOL EXECUTION
// =============================================================================

/**
 * Execute an integration research tool
 */
export async function executeResearchTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ResearchToolContext
): Promise<string> {
  switch (toolName) {
    case 'search_integration_info': {
      const parseResult = searchIntegrationInfoInputSchema.safeParse(toolInput);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => i.message).join(', ');
        return `Invalid input: ${issues}`;
      }
      return executeSearchIntegrationInfo(parseResult.data, context);
    }

    case 'fetch_api_documentation': {
      const parseResult = fetchApiDocsInputSchema.safeParse(toolInput);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => i.message).join(', ');
        return `Invalid input: ${issues}`;
      }
      return executeFetchApiDocs(parseResult.data, context);
    }

    case 'parse_openapi_spec': {
      const parseResult = parseOpenApiInputSchema.safeParse(toolInput);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => i.message).join(', ');
        return `Invalid input: ${issues}`;
      }
      return executeParseOpenApi(parseResult.data, context);
    }

    case 'generate_connector_manifest': {
      const parseResult = generateManifestInputSchema.safeParse(toolInput);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => i.message).join(', ');
        return `Invalid input: ${issues}`;
      }
      return executeGenerateManifest(parseResult.data);
    }

    case 'register_connector': {
      const parseResult = registerConnectorInputSchema.safeParse(toolInput);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => i.message).join(', ');
        return `Invalid input: ${issues}`;
      }
      return executeRegisterConnector(parseResult.data.manifest as ConnectorManifest, context);
    }

    case 'list_existing_connectors': {
      const parseResult = listConnectorsInputSchema.safeParse(toolInput);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => i.message).join(', ');
        return `Invalid input: ${issues}`;
      }
      return executeListConnectors(parseResult.data, context);
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function executeSearchIntegrationInfo(
  input: z.infer<typeof searchIntegrationInfoInputSchema>,
  context: ResearchToolContext
): Promise<string> {
  const { service_name, search_type } = input;

  // Build search query based on type
  const queryMap: Record<string, string> = {
    api_docs: `${service_name} API documentation official`,
    authentication: `${service_name} API authentication method credentials`,
    endpoints: `${service_name} API endpoints reference`,
    rate_limits: `${service_name} API rate limits quotas`,
    openapi_spec: `${service_name} OpenAPI swagger specification JSON`,
    sdk: `${service_name} SDK client library`,
  };

  const query = queryMap[search_type] || `${service_name} API ${search_type}`;

  // Use web search if available
  if (context.webSearch) {
    try {
      const results = await context.webSearch(query);
      if (results.length === 0) {
        return `No search results found for "${query}". Try a different search type or check the service name.`;
      }

      const formatted = results
        .slice(0, 5)
        .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`)
        .join('\n\n');

      return `Search results for "${query}":\n\n${formatted}\n\nUse fetch_api_documentation to get details from any of these URLs.`;
    } catch (error) {
      return `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  // Fallback: Return common documentation patterns
  const commonPatterns = getCommonDocPatterns(service_name, search_type);
  return `Web search not available. Here are common documentation patterns for ${service_name}:\n\n${commonPatterns}\n\nYou can use fetch_api_documentation with any of these URLs, or use your knowledge about ${service_name} to generate the manifest.`;
}

async function executeFetchApiDocs(
  input: z.infer<typeof fetchApiDocsInputSchema>,
  context: ResearchToolContext
): Promise<string> {
  const { url, focus } = input;

  if (context.fetchUrl) {
    try {
      const content = await context.fetchUrl(url);
      // In real implementation, we'd parse HTML and extract relevant sections
      return `Documentation from ${url}:\n\n${content.slice(0, 5000)}${content.length > 5000 ? '\n\n[Content truncated...]' : ''}`;
    } catch (error) {
      return `Failed to fetch ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  // Fallback: Provide guidance
  return `URL fetching not available. Based on the URL pattern (${url}), use your knowledge to:\n\n1. Identify the authentication method (likely API key, OAuth, or Bearer token)\n2. List common operations for this type of service\n3. Generate a manifest with reasonable defaults\n\nFocus area: ${focus || 'general'}`;
}

async function executeParseOpenApi(
  input: z.infer<typeof parseOpenApiInputSchema>,
  _context: ResearchToolContext
): Promise<string> {
  const { spec_url, spec_content, max_operations = 10 } = input;

  if (!spec_url && !spec_content) {
    return 'Please provide either spec_url or spec_content';
  }

  // In real implementation, we'd fetch and parse the OpenAPI spec
  // For now, provide guidance
  return `OpenAPI parsing requested for: ${spec_url || 'provided content'}\n\nMax operations: ${max_operations}\n\nNote: Full OpenAPI parsing will be implemented. For now, use generate_connector_manifest with the information you've gathered.`;
}

function executeGenerateManifest(input: z.infer<typeof generateManifestInputSchema>): string {
  const now = new Date().toISOString();

  // Map auth method
  const authTypeMap: Record<string, string> = {
    api_key: 'api_key',
    bearer_token: 'bearer_token',
    basic_auth: 'basic_auth',
    oauth2: 'oauth2',
    none: 'none',
  };

  // Build the manifest
  const manifest: ConnectorManifest = {
    apiVersion: 'kai.io/v1',
    kind: 'Connector',
    metadata: {
      id: input.id,
      version: '1.0.0',
      displayName: input.displayName,
      description: input.description,
      vendor: 'discovered',
      tier: 'discovered',
      type: input.type,
      tags: input.tags || [],
      documentationUrl: input.documentationUrl,
    },
    spec: {
      connection: {
        authType: authTypeMap[input.auth.method] as
          | 'api_key'
          | 'bearer_token'
          | 'basic_auth'
          | 'oauth2'
          | 'none',
        credentials: input.auth.credentials.map((c) => ({
          name: c.name,
          displayName: c.displayName,
          type: 'secret' as const,
          required: c.required ?? true,
          description: c.description,
          envVar: c.envVar,
          obtainFrom: c.obtainFrom,
        })),
        baseUrl: input.baseUrl,
        baseUrlConfigurable: false,
      },
      capabilities: {
        read: input.operations.some((op) =>
          ['get', 'list', 'read', 'fetch', 'query', 'search'].some((v) =>
            op.name.toLowerCase().includes(v)
          )
        ),
        write: input.operations.some((op) =>
          ['create', 'send', 'post', 'update', 'put'].some((v) => op.name.toLowerCase().includes(v))
        ),
        delete: input.operations.some((op) => op.name.toLowerCase().includes('delete')),
        stream: false,
        webhook: false,
        batch: false,
        search: input.operations.some((op) => op.name.toLowerCase().includes('search')),
        sync: false,
      },
      operations: input.operations.map((op) => ({
        name: op.name,
        description: op.description,
        http: op.method && op.path ? { method: op.method, path: op.path } : undefined,
        params: (op.params || []).map((p) => ({
          name: p.name,
          description: p.description || '',
          type: p.type,
          required: p.required ?? true,
          in: p.in,
        })),
        idempotent: op.method === 'GET',
        retryable: true,
      })),
      rateLimits: input.rateLimits,
    },
    source: {
      method: 'research-agent',
      origin: input.documentationUrl,
      createdAt: now,
      updatedAt: now,
      confidence: 0.8,
    },
    status: 'draft',
  };

  return JSON.stringify(manifest, null, 2);
}

async function executeRegisterConnector(
  manifest: ConnectorManifest,
  context: ResearchToolContext
): Promise<string> {
  try {
    // Validate the manifest has required fields
    if (!manifest.metadata?.id || !manifest.spec?.operations) {
      return 'Invalid manifest: missing required fields (metadata.id or spec.operations)';
    }

    // Check if already exists
    const exists = await context.registry.exists(manifest.metadata.id);
    if (exists) {
      return `Connector "${manifest.metadata.id}" already exists. Use a different ID or update the existing connector.`;
    }

    // Update status to active
    const activeManifest = {
      ...manifest,
      status: 'active' as const,
    };

    // Register
    await context.registry.register(activeManifest);

    // Build credential instructions
    const credentialInstructions = manifest.spec.connection.credentials
      .map((c) => {
        const envVar =
          c.envVar ||
          `${manifest.metadata.id.toUpperCase().replace(/-/g, '_')}_${c.name.toUpperCase()}`;
        return `- **${c.displayName || c.name}**: \`${envVar}\`\n  ${c.obtainFrom || 'Obtain from service dashboard'}`;
      })
      .join('\n');

    // Build operation examples
    const operationExamples = manifest.spec.operations
      .slice(0, 3)
      .map((op) => `- \`${op.name}\`: ${op.description}`)
      .join('\n');

    return `✅ **Connector "${manifest.metadata.displayName}" registered successfully!**

**ID:** ${manifest.metadata.id}
**Type:** ${manifest.metadata.type}
**Auth Method:** ${manifest.spec.connection.authType}

## Required Credentials

${credentialInstructions}

## Available Operations (${manifest.spec.operations.length} total)

${operationExamples}

## Usage

\`\`\`
kai_use_integration(
  integration="${manifest.metadata.id}",
  operation="<operation-name>",
  params={...}
)
\`\`\`

Run \`kai_verify_integration\` after setting up credentials to test the connection.`;
  } catch (error) {
    return `Failed to register connector: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

async function executeListConnectors(
  input: z.infer<typeof listConnectorsInputSchema>,
  context: ResearchToolContext
): Promise<string> {
  try {
    const connectors = await context.registry.list(undefined, {
      type: input.filter_type as ConnectorManifest['metadata']['type'],
    });

    if (connectors.length === 0) {
      return input.filter_type
        ? `No connectors found with type "${input.filter_type}".`
        : 'No connectors registered yet.';
    }

    const formatted = connectors
      .map(
        (c) =>
          `- **${c.metadata.displayName}** (${c.metadata.id})\n  Type: ${c.metadata.type} | Tier: ${c.metadata.tier} | Status: ${c.status}\n  ${c.metadata.description}`
      )
      .join('\n\n');

    return `Registered connectors${input.filter_type ? ` (type: ${input.filter_type})` : ''}:\n\n${formatted}`;
  } catch (error) {
    return `Failed to list connectors: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getCommonDocPatterns(serviceName: string, searchType: string): string {
  const normalized = serviceName.toLowerCase().replace(/\s+/g, '');

  const patterns: string[] = [
    `https://docs.${normalized}.com/api`,
    `https://api.${normalized}.com/docs`,
    `https://developer.${normalized}.com`,
    `https://${normalized}.com/docs/api`,
    `https://www.${normalized}.com/developers`,
  ];

  if (searchType === 'openapi_spec') {
    patterns.push(
      `https://api.${normalized}.com/openapi.json`,
      `https://api.${normalized}.com/swagger.json`,
      `https://api.${normalized}.com/v1/openapi.yaml`
    );
  }

  return patterns.map((p) => `- ${p}`).join('\n');
}
