/**
 * Credential Prompting Utilities
 *
 * Provides clear, actionable guidance for users when credentials are missing.
 * Works with all supported integrations to show:
 * - Exact environment variable names
 * - 1Password reference paths
 * - Example values and where to get them
 */

import { CREDENTIAL_INFO, type CredentialRequirement } from './integration-templates.js';
import type { IntegrationDescriptor } from './types.js';

// Re-export for consumers who import from this file
export type { CredentialRequirement } from './integration-templates.js';

/**
 * Get detailed credential requirements for an integration
 */
export function getCredentialRequirements(
  integrationId: string,
  requiredCredentials: string[]
): CredentialRequirement[] {
  const integrationInfo = CREDENTIAL_INFO[integrationId] ?? {};

  return requiredCredentials.map((key) => {
    const info = integrationInfo[key] ?? {};
    const uppercaseIntegration = integrationId.toUpperCase().replace(/-/g, '_');
    const uppercaseKey = key.toUpperCase().replace(/-/g, '_');

    return {
      key,
      displayName:
        info.displayName ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: info.description ?? `Credential: ${key}`,
      envVarName: info.envVarName ?? `${uppercaseIntegration}_${uppercaseKey}`,
      opPath: `op://vault/${integrationId}/${key}`,
      exampleFormat: info.exampleFormat ?? '********',
      obtainFrom: info.obtainFrom ?? 'Check the service documentation',
      required: info.required !== false,
    };
  });
}

/**
 * Generate a markdown prompt for missing credentials
 */
export function generateCredentialPrompt(
  integration: IntegrationDescriptor,
  missingCredentials: string[]
): string {
  const requirements = getCredentialRequirements(integration.id, missingCredentials);

  let markdown = `# ⚠️ Missing Credentials for ${integration.displayName}

The following credentials are required but not found:

`;

  for (const req of requirements) {
    markdown += `## ${req.displayName}${req.required ? ' (Required)' : ' (Optional)'}

${req.description}

**How to provide:**

| Method | Value |
|--------|-------|
| Environment Variable | \`${req.envVarName}\` |
| 1Password Reference | \`${req.opPath}\` |
| Example Format | \`${req.exampleFormat}\` |

📍 **Where to get it:** ${req.obtainFrom}

---

`;
  }

  markdown += `## Quick Setup Options

### Option 1: Environment Variables

Add to your \`.env\` file or export in your shell:

\`\`\`bash
${requirements.map((r) => `export ${r.envVarName}="your_${r.key}_here"`).join('\n')}
\`\`\`

### Option 2: 1Password References

Use 1Password references in your configuration:

\`\`\`bash
${requirements.map((r) => `${r.envVarName}="${r.opPath}"`).join('\n')}
\`\`\`

### Option 3: Provide via kai_learn

You can also teach Kai about these credentials by running:

\`\`\`
kai_learn("Your ${integration.displayName} credentials: [paste config or describe setup]")
\`\`\`

After providing credentials, run \`kai_verify_integration("${integration.id}")\` to verify the setup.
`;

  return markdown;
}

/**
 * Check which credentials are missing from environment
 */
export function checkMissingCredentials(
  integrationId: string,
  requiredCredentials: string[]
): { found: string[]; missing: string[] } {
  const found: string[] = [];
  const missing: string[] = [];

  for (const key of requiredCredentials) {
    const requirements = getCredentialRequirements(integrationId, [key]);
    const envVarName = requirements[0]?.envVarName;

    // Check various possible env var names
    const possibleNames = [
      envVarName,
      envVarName?.toLowerCase(),
      `${integrationId.toUpperCase()}_${key.toUpperCase()}`,
      key.toUpperCase(),
    ].filter(Boolean);

    const isFound = possibleNames.some((name) => name && process.env[name]);

    if (isFound) {
      found.push(key);
    } else {
      missing.push(key);
    }
  }

  return { found, missing };
}

/**
 * Generate a summary of integration credential status
 */
export function generateCredentialStatusSummary(integrations: IntegrationDescriptor[]): string {
  let markdown = `# 🔐 Integration Credential Status

| Integration | Status | Found | Missing |
|-------------|--------|-------|---------|
`;

  for (const integration of integrations) {
    const { found, missing } = checkMissingCredentials(
      integration.id,
      integration.authentication.requiredCredentials
    );

    const status = missing.length === 0 ? '✅' : found.length > 0 ? '⚠️' : '❌';
    markdown += `| ${integration.displayName} | ${status} | ${found.length} | ${missing.length} |\n`;
  }

  const totalMissing = integrations.reduce(
    (acc, i) =>
      acc + checkMissingCredentials(i.id, i.authentication.requiredCredentials).missing.length,
    0
  );

  if (totalMissing > 0) {
    markdown += `
---

**${totalMissing} credentials missing.** Use \`kai_verify_integration("<id>")\` for setup instructions.
`;
  } else {
    markdown += `
---

✅ **All integrations have credentials configured!**
`;
  }

  return markdown;
}
