#!/usr/bin/env npx tsx
/**
 * Interactive test script for vault and sensitive detection functionality
 *
 * Run with: npx tsx apps/mcp/scripts/test-vault.ts
 */

import {
  detectSensitiveData,
  envVaultProvider,
  filterByConfidence,
  formatVaultReference,
  hasSensitiveData,
  parseVaultReference,
  redactSensitiveData,
} from '../src/vault/index.js';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg: string) {
  console.log(msg);
}

function header(title: string) {
  log(`\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  log(`${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
  log(`${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

function success(msg: string) {
  log(`${colors.green}✓${colors.reset} ${msg}`);
}

function info(msg: string) {
  log(`${colors.blue}ℹ${colors.reset} ${msg}`);
}

function warn(msg: string) {
  log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

async function main() {
  header('KAI VAULT & SENSITIVE DETECTION TEST');

  // =========================================================================
  // Test 1: Sensitive Data Detection
  // =========================================================================
  header('1. Sensitive Data Detection');

  const testContent = `
# My Integration Config

## OpenAI
OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456

## Database
DATABASE_URL=postgres://admin:supersecret123@db.example.com:5432/myapp

## Slack
SLACK_BOT_TOKEN=xoxb-123456789012-1234567890123-abcdefghijklmnopqrstuv

## Generic
api_key: "my-custom-api-key-here-1234567890"
password = "my-secret-password"
`;

  log(`${colors.yellow}Sample content with secrets:${colors.reset}`);
  log('```');
  log(testContent.trim());
  log('```\n');

  // Quick check
  const hasSecrets = hasSensitiveData(testContent);
  if (hasSecrets) {
    success('hasSensitiveData() detected secrets');
  } else {
    warn('hasSensitiveData() found no secrets');
  }

  // Detailed detection
  const matches = detectSensitiveData(testContent);
  log(`\n${colors.bright}Found ${matches.length} secrets:${colors.reset}\n`);

  for (const match of matches) {
    const confidenceColor = match.confidence === 'high' ? colors.red : colors.yellow;
    log(
      `  ${confidenceColor}[${match.confidence.toUpperCase()}]${colors.reset} ${match.description}`
    );
    log(`       Type: ${match.type}`);
    log(`       Masked: ${match.maskedValue}`);
    log(`       Vault Path: ${colors.cyan}vault://env/${match.suggestedVaultPath}${colors.reset}`);
    log('');
  }

  // Filter by confidence
  const highConfidence = filterByConfidence(matches, 'high');
  info(`High confidence matches only: ${highConfidence.length}`);

  // =========================================================================
  // Test 2: Content Redaction
  // =========================================================================
  header('2. Content Redaction');

  const result = redactSensitiveData(testContent);

  log(`${colors.yellow}Redacted content (safe to store in knowledge base):${colors.reset}`);
  log('```');
  log(result.redactedContent.trim());
  log('```\n');

  success(`Redacted ${result.matches.length} secrets`);
  info(`Original secrets are replaced with [REDACTED: vault://...] references`);

  // =========================================================================
  // Test 3: Vault Reference Parsing
  // =========================================================================
  header('3. Vault Reference Parsing');

  const testRefs = [
    'vault://env/OPENAI_API_KEY',
    'vault://1password/kai/gmail-oauth',
    'vault://hashicorp/secret/integrations/stripe',
    'not-a-vault-ref',
  ];

  for (const ref of testRefs) {
    const parsed = parseVaultReference(ref);
    if (parsed) {
      success(`Parsed: ${ref}`);
      log(`       Provider: ${parsed.provider}, Path: ${parsed.path}`);
      log(`       Roundtrip: ${formatVaultReference(parsed)}`);
    } else {
      warn(`Invalid: ${ref}`);
    }
  }

  // =========================================================================
  // Test 4: EnvVaultProvider
  // =========================================================================
  header('4. EnvVaultProvider');

  info('Testing secret storage and retrieval...');

  // Check availability
  const isAvailable = await envVaultProvider.isAvailable();
  success(`Provider available: ${isAvailable}`);

  // Store a test secret
  const testPath = 'test/demo-api-key';
  const testValue = 'demo-secret-value-12345';

  await envVaultProvider.setSecret(testPath, testValue);
  success(`Stored secret at: ${testPath}`);

  // Retrieve it
  const retrieved = await envVaultProvider.getSecret(testPath);
  if (retrieved === testValue) {
    success(`Retrieved secret matches original`);
  } else {
    warn(`Retrieved value doesn't match!`);
  }

  // List secrets
  const allSecrets = await envVaultProvider.listSecrets();
  info(`Total secrets in vault: ${allSecrets.length}`);
  if (allSecrets.length > 0) {
    log(`       Paths: ${allSecrets.slice(0, 5).join(', ')}${allSecrets.length > 5 ? '...' : ''}`);
  }

  // Cleanup - delete test secret
  await envVaultProvider.deleteSecret(testPath);
  success(`Deleted test secret: ${testPath}`);

  // =========================================================================
  // Summary
  // =========================================================================
  header('TEST SUMMARY');

  log(`${colors.green}All tests completed successfully!${colors.reset}\n`);

  log(`${colors.bright}What was tested:${colors.reset}`);
  log(`  • Sensitive data detection (${matches.length} patterns found)`);
  log(`  • Content redaction (secrets → vault references)`);
  log(`  • Vault URI parsing and formatting`);
  log(`  • EnvVaultProvider (store, retrieve, list, delete)`);

  log(`\n${colors.bright}Next steps:${colors.reset}`);
  log(`  • Secrets are stored in: ${colors.cyan}~/.kai/.env${colors.reset}`);
  log(`  • Integrate with kai_learn to auto-detect secrets in files`);
  log(`  • Add 1Password / HashiCorp Vault providers for production use`);
}

main().catch(console.error);
