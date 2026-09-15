/**
 * Verify Integration Tool
 *
 * MCP tool for verifying that integrations are correctly configured
 * and can connect to their external services.
 */

import { generateCredentialPrompt } from '../integrations/credential-prompts.js';
import { loadIntegration } from '../integrations/storage.js';
import { createVerifier } from '../integrations/verification/index.js';
import { type MCPToolResponse, type ToolContext, markdownResponse } from './types.js';

/**
 * Tool definition for MCP registration
 */
export const verifyIntegrationToolDefinition = {
  name: 'kai_verify_integration',
  description: `Verify that an integration is correctly configured and can connect.

Use this tool to test if an integration is working before using it. 
Checks that credentials are available and attempts a simple operation to verify connectivity.

Can verify a single integration or all discovered integrations.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      integration: {
        type: 'string',
        description: 'Integration ID to verify (omit to verify all integrations)',
      },
      skipConnectionTest: {
        type: 'boolean',
        description: 'Skip actual connection test, just verify credentials exist (default: false)',
      },
    },
    required: [],
  },
};

/**
 * Handler for verify integration tool
 */
export async function verifyIntegrationToolHandler(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<MCPToolResponse> {
  const integrationId = args.integration as string | undefined;
  const skipConnectionTest = (args.skipConnectionTest as boolean) ?? false;

  try {
    // Create verifier with environment variables as secrets
    const secrets = new Map<string, string>();

    for (const [key, value] of Object.entries(process.env)) {
      if (value) {
        const lowerKey = key.toLowerCase();
        secrets.set(lowerKey, value);
        secrets.set(lowerKey.replace(/_/g, '/'), value);
        secrets.set(key, value);
      }
    }

    const verifier = createVerifier(secrets, { skipConnectionTest });

    if (integrationId) {
      // Verify single integration
      const result = await verifier.verify(integrationId);

      const statusIcon = result.success ? '✅' : '❌';
      const credIcon = result.details.credentialsResolved ? '✅' : '❌';
      const connIcon = result.details.connectionSuccess ? '✅' : '❌';

      let markdown = `# ${statusIcon} Verification: ${integrationId}

**Status:** ${result.status}
**Message:** ${result.message}
**Duration:** ${result.duration}ms

## Details

| Check | Result |
|-------|--------|
| Credentials | ${credIcon} ${result.details.credentialsResolved ? 'Resolved' : 'Missing'} |
| Connection | ${connIcon} ${result.details.connectionSuccess ? 'Success' : 'Failed'} |`;

      if (result.details.missingCredentials.length > 0) {
        // Load the integration to get full details for credential prompting
        const integration = await loadIntegration(integrationId);

        if (integration) {
          // Generate detailed credential prompt
          const credentialPrompt = generateCredentialPrompt(
            integration,
            result.details.missingCredentials
          );
          markdown += `\n\n${credentialPrompt}`;
        } else {
          markdown += `

## Missing Credentials

${result.details.missingCredentials.map((c) => `- \`${c}\``).join('\n')}

**Tip:** Set these credentials as environment variables or in your vault.`;
        }
      }

      if (result.details.connectionError) {
        markdown += `

## Connection Error

\`\`\`
${result.details.connectionError}
\`\`\``;
      }

      if (result.details.testOperation) {
        markdown += `

## Test Operation

- **Operation:** ${result.details.testOperation}
- **Success:** ${result.details.testOperationSuccess ? 'Yes' : 'No'}`;

        if (result.details.testResponse) {
          markdown += `
- **Response:** ${result.details.testResponse}`;
        }
      }

      return markdownResponse(markdown);
    }

    // Verify all integrations
    const summary = await verifier.verifyAll();

    if (summary.total === 0) {
      return markdownResponse(`# Integration Verification

*No integrations discovered yet.*

Use \`kai_learn\` on files that describe your external services to discover integrations.`);
    }

    const statusIcon = (status: string) => {
      switch (status) {
        case 'healthy':
          return '✅';
        case 'degraded':
          return '⚠️';
        case 'unhealthy':
          return '❌';
        default:
          return '❓';
      }
    };

    const resultIcon = (success: boolean) => (success ? '✅' : '❌');

    const markdown = `# ${statusIcon(summary.overallStatus)} Integration Verification

**Overall Status:** ${summary.overallStatus}
**Total Integrations:** ${summary.total}

## Summary

| Metric | Count |
|--------|-------|
| ✅ Verified | ${summary.verified} |
| 🔧 Configured | ${summary.configured} |
| ❌ Errors | ${summary.errors} |

## Results

| Integration | Status | Message |
|-------------|--------|---------|
${summary.results.map((r) => `| ${r.integrationId} | ${resultIcon(r.success)} ${r.status} | ${r.message.slice(0, 50)}${r.message.length > 50 ? '...' : ''} |`).join('\n')}

${
  summary.errors > 0
    ? `
## Errors

The following integrations have issues:

${summary.results
  .filter((r) => r.status === 'error')
  .map((r) => `- **${r.integrationId}:** ${r.message}`)
  .join('\n')}

Use \`kai_verify_integration(integration: "<id>")\` for detailed error information.
`
    : ''
}`;

    return markdownResponse(markdown);
  } catch (error) {
    return markdownResponse(
      `Error verifying integrations: ${error instanceof Error ? error.message : String(error)}`,
      true
    );
  }
}

/**
 * Export the tool definition and handler together
 */
export const verifyIntegrationTool = {
  definition: verifyIntegrationToolDefinition,
  handler: verifyIntegrationToolHandler,
};
