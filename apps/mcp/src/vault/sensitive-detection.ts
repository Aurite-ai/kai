/**
 * Sensitive Data Detection
 *
 * Detects credentials, API keys, passwords, and other sensitive data
 * in file content. Used during kai_learn to prevent secrets from
 * being stored in the knowledge base.
 *
 * Features:
 * - Regex pattern matching for known secret formats
 * - Entropy filtering to reduce false positives (real secrets are random)
 * - Common placeholder detection (e.g., "your-key-here", "example")
 * - Optional LLM verification for uncertain matches
 *
 * See: docs/design/secure-integrations.md
 */

import { MODELS } from '../config.js';

/**
 * Confidence level for sensitive data detection
 */
export type DetectionConfidence = 'high' | 'medium' | 'low';

/**
 * Type of sensitive data detected
 */
export type SensitiveDataType =
  | 'openai_api_key'
  | 'anthropic_api_key'
  | 'google_api_key'
  | 'aws_access_key'
  | 'aws_secret_key'
  | 'slack_bot_token'
  | 'slack_webhook'
  | 'github_token'
  | 'stripe_api_key'
  | 'sendgrid_api_key'
  | 'oauth_client_secret'
  | 'oauth_refresh_token'
  | 'oauth_access_token'
  | 'database_url'
  | 'database_password'
  | 'jwt_secret'
  | 'private_key'
  | 'generic_api_key'
  | 'generic_password'
  | 'generic_secret'
  | 'bearer_token'
  | '1password_reference';

/**
 * A pattern for detecting sensitive data
 */
interface SensitivePattern {
  type: SensitiveDataType;
  pattern: RegExp;
  confidence: DetectionConfidence;
  description: string;
  /** Which capture group contains the actual secret (0 = full match) */
  valueGroup?: number;
  /** Suggested vault path prefix */
  vaultPathPrefix: string;
}

/**
 * Result of detecting sensitive data in content
 */
export interface SensitiveDataMatch {
  type: SensitiveDataType;
  confidence: DetectionConfidence;
  description: string;
  /** The actual secret value (handle with care!) */
  value: string;
  /** Position in the original content */
  position: { start: number; end: number };
  /** Suggested path for storing in vault */
  suggestedVaultPath: string;
  /** Masked version for display (e.g., "sk-****...abc") */
  maskedValue: string;
}

/**
 * Result of redacting sensitive data from content
 */
export interface RedactionResult {
  /** Content with sensitive data replaced by placeholders */
  redactedContent: string;
  /** List of detected sensitive data matches */
  matches: SensitiveDataMatch[];
  /** Whether any sensitive data was found */
  hasSensitiveData: boolean;
}

/**
 * Patterns for detecting sensitive data
 *
 * Ordered by specificity - more specific patterns first.
 * Each pattern includes a confidence level and description.
 */
const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // ============ HIGH CONFIDENCE - Known API key formats ============

  // OpenAI
  {
    type: 'openai_api_key',
    pattern: /\b(sk-[a-zA-Z0-9]{32,})\b/g,
    confidence: 'high',
    description: 'OpenAI API key',
    valueGroup: 1,
    vaultPathPrefix: 'openai',
  },

  // Anthropic
  {
    type: 'anthropic_api_key',
    pattern: /\b(sk-ant-[a-zA-Z0-9-]{32,})\b/g,
    confidence: 'high',
    description: 'Anthropic API key',
    valueGroup: 1,
    vaultPathPrefix: 'anthropic',
  },

  // Google
  {
    type: 'google_api_key',
    pattern: /\b(AIza[a-zA-Z0-9_-]{35})\b/g,
    confidence: 'high',
    description: 'Google API key',
    valueGroup: 1,
    vaultPathPrefix: 'google',
  },

  // AWS Access Key
  {
    type: 'aws_access_key',
    pattern: /\b(AKIA[A-Z0-9]{16})\b/g,
    confidence: 'high',
    description: 'AWS Access Key ID',
    valueGroup: 1,
    vaultPathPrefix: 'aws',
  },

  // AWS Secret Key (40 chars, base64-ish)
  {
    type: 'aws_secret_key',
    pattern:
      /(?:aws[_-]?secret[_-]?(?:access[_-]?)?key|secret[_-]?key)\s*[=:]\s*["']?([a-zA-Z0-9/+=]{40})["']?/gi,
    confidence: 'high',
    description: 'AWS Secret Access Key',
    valueGroup: 1,
    vaultPathPrefix: 'aws',
  },

  // Slack Bot Token
  {
    type: 'slack_bot_token',
    pattern: /\b(xoxb-[a-zA-Z0-9-]+)\b/g,
    confidence: 'high',
    description: 'Slack Bot Token',
    valueGroup: 1,
    vaultPathPrefix: 'slack',
  },

  // Slack Webhook URL
  {
    type: 'slack_webhook',
    pattern: /(https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+)/g,
    confidence: 'high',
    description: 'Slack Webhook URL',
    valueGroup: 1,
    vaultPathPrefix: 'slack',
  },

  // GitHub Token
  {
    type: 'github_token',
    pattern: /\b(gh[pousr]_[a-zA-Z0-9]{36,})\b/g,
    confidence: 'high',
    description: 'GitHub Personal Access Token',
    valueGroup: 1,
    vaultPathPrefix: 'github',
  },

  // Stripe API Key
  {
    type: 'stripe_api_key',
    pattern: /\b(sk_(?:live|test)_[a-zA-Z0-9]{24,})\b/g,
    confidence: 'high',
    description: 'Stripe API key',
    valueGroup: 1,
    vaultPathPrefix: 'stripe',
  },

  // SendGrid API Key
  {
    type: 'sendgrid_api_key',
    pattern: /\b(SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43})\b/g,
    confidence: 'high',
    description: 'SendGrid API key',
    valueGroup: 1,
    vaultPathPrefix: 'sendgrid',
  },

  // ============ HIGH CONFIDENCE - Database URLs ============

  // PostgreSQL URL with password
  {
    type: 'database_url',
    pattern: /(postgres(?:ql)?:\/\/[^:]+:[^@]+@[^\s"']+)/gi,
    confidence: 'high',
    description: 'PostgreSQL connection string',
    valueGroup: 1,
    vaultPathPrefix: 'database',
  },

  // MySQL URL with password
  {
    type: 'database_url',
    pattern: /(mysql:\/\/[^:]+:[^@]+@[^\s"']+)/gi,
    confidence: 'high',
    description: 'MySQL connection string',
    valueGroup: 1,
    vaultPathPrefix: 'database',
  },

  // MongoDB URL with password
  {
    type: 'database_url',
    pattern: /(mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^\s"']+)/gi,
    confidence: 'high',
    description: 'MongoDB connection string',
    valueGroup: 1,
    vaultPathPrefix: 'database',
  },

  // ============ HIGH CONFIDENCE - Private Keys ============

  // RSA/DSA/EC Private Key
  {
    type: 'private_key',
    pattern:
      /(-----BEGIN (?:RSA |DSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |DSA |EC )?PRIVATE KEY-----)/g,
    confidence: 'high',
    description: 'Private key',
    valueGroup: 1,
    vaultPathPrefix: 'keys',
  },

  // ============ MEDIUM CONFIDENCE - Pattern-based detection ============

  // OAuth client_secret
  {
    type: 'oauth_client_secret',
    pattern: /client[_-]?secret["']?\s*[=:]\s*["']([^"'\s]{16,})["']/gi,
    confidence: 'medium',
    description: 'OAuth client secret',
    valueGroup: 1,
    vaultPathPrefix: 'oauth',
  },

  // OAuth refresh_token
  {
    type: 'oauth_refresh_token',
    pattern: /refresh[_-]?token["']?\s*[=:]\s*["']([^"'\s]{20,})["']/gi,
    confidence: 'medium',
    description: 'OAuth refresh token',
    valueGroup: 1,
    vaultPathPrefix: 'oauth',
  },

  // OAuth access_token
  {
    type: 'oauth_access_token',
    pattern: /access[_-]?token["']?\s*[=:]\s*["']([^"'\s]{20,})["']/gi,
    confidence: 'medium',
    description: 'OAuth access token',
    valueGroup: 1,
    vaultPathPrefix: 'oauth',
  },

  // Bearer token in headers
  {
    type: 'bearer_token',
    pattern: /Bearer\s+([a-zA-Z0-9._-]{20,})/gi,
    confidence: 'medium',
    description: 'Bearer token',
    valueGroup: 1,
    vaultPathPrefix: 'auth',
  },

  // JWT Secret
  {
    type: 'jwt_secret',
    pattern: /jwt[_-]?secret["']?\s*[=:]\s*["']([^"'\s]{16,})["']/gi,
    confidence: 'medium',
    description: 'JWT secret',
    valueGroup: 1,
    vaultPathPrefix: 'auth',
  },

  // Generic api_key pattern
  {
    type: 'generic_api_key',
    pattern: /(?:api[_-]?key|apikey)["']?\s*[=:]\s*["']([^"'\s]{16,})["']/gi,
    confidence: 'medium',
    description: 'API key',
    valueGroup: 1,
    vaultPathPrefix: 'api',
  },

  // Generic password pattern
  {
    type: 'generic_password',
    pattern: /(?:password|passwd|pwd)["']?\s*[=:]\s*["']([^"'\s]{8,})["']/gi,
    confidence: 'medium',
    description: 'Password',
    valueGroup: 1,
    vaultPathPrefix: 'auth',
  },

  // Generic secret pattern
  {
    type: 'generic_secret',
    pattern: /(?:secret|secret[_-]?key)["']?\s*[=:]\s*["']([^"'\s]{16,})["']/gi,
    confidence: 'medium',
    description: 'Secret',
    valueGroup: 1,
    vaultPathPrefix: 'secrets',
  },

  // Database password
  {
    type: 'database_password',
    pattern: /(?:db[_-]?password|database[_-]?password)["']?\s*[=:]\s*["']([^"'\s]{8,})["']/gi,
    confidence: 'medium',
    description: 'Database password',
    valueGroup: 1,
    vaultPathPrefix: 'database',
  },

  // ============ SPECIAL - 1Password References (not redacted, just recognized) ============

  // 1Password reference (op://vault/item/field)
  {
    type: '1password_reference',
    pattern: /(op:\/\/[^\s"']+)/g,
    confidence: 'high',
    description: '1Password secret reference',
    valueGroup: 1,
    vaultPathPrefix: '1password',
  },
];

/**
 * Detect 1Password references in content
 *
 * Returns all op:// references found without treating them as secrets to redact.
 * These are already secure references that should be preserved as-is.
 */
export function detect1PasswordReferences(content: string): Array<{
  reference: string;
  position: { start: number; end: number };
}> {
  const refs: Array<{ reference: string; position: { start: number; end: number } }> = [];
  const pattern = /(op:\/\/[^\s"']+)/g;

  let match = pattern.exec(content);
  while (match !== null) {
    refs.push({
      reference: match[1],
      position: { start: match.index, end: match.index + match[0].length },
    });
    match = pattern.exec(content);
  }

  return refs;
}

/**
 * Check if content contains 1Password references
 */
export function has1PasswordReferences(content: string): boolean {
  return /op:\/\/[^\s"']+/.test(content);
}

/**
 * Extract vault references from content
 *
 * Finds both op:// (1Password) and vault:// references in content.
 * Returns parsed references with their positions.
 */
export function extractVaultReferences(content: string): Array<{
  type: 'op' | 'vault';
  reference: string;
  position: { start: number; end: number };
}> {
  const refs: Array<{
    type: 'op' | 'vault';
    reference: string;
    position: { start: number; end: number };
  }> = [];

  // Find op:// references
  const opPattern = /(op:\/\/[^\s"']+)/g;
  let match = opPattern.exec(content);
  while (match !== null) {
    refs.push({
      type: 'op',
      reference: match[1],
      position: { start: match.index, end: match.index + match[0].length },
    });
    match = opPattern.exec(content);
  }

  // Find vault:// references
  const vaultPattern = /(vault:\/\/[^\s"']+)/g;
  match = vaultPattern.exec(content);
  while (match !== null) {
    refs.push({
      type: 'vault',
      reference: match[1],
      position: { start: match.index, end: match.index + match[0].length },
    });
    match = vaultPattern.exec(content);
  }

  return refs.sort((a, b) => a.position.start - b.position.start);
}

// =============================================================================
// ENTROPY FILTERING - Reduce False Positives
// =============================================================================

/**
 * Common placeholder patterns that are definitely NOT real secrets
 * These are frequently found in documentation, examples, and templates
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  // Explicit placeholder indicators
  /your[-_]?(api[-_]?)?key[-_]?here/i,
  /your[-_]?secret[-_]?here/i,
  /your[-_]?password[-_]?here/i,
  /your[-_]?token[-_]?here/i,
  /insert[-_]?(your[-_]?)?(api[-_]?)?key/i,
  /replace[-_]?with[-_]?(your[-_]?)?(api[-_]?)?key/i,
  /put[-_]?(your[-_]?)?(api[-_]?)?key/i,
  /add[-_]?(your[-_]?)?(api[-_]?)?key/i,
  /enter[-_]?(your[-_]?)?(api[-_]?)?key/i,

  // Example/test/demo indicators
  /^example[-_]?/i,
  /[-_]?example$/i,
  /^test[-_]?/i,
  /[-_]?test$/i,
  /^demo[-_]?/i,
  /[-_]?demo$/i,
  /^sample[-_]?/i,
  /[-_]?sample$/i,
  /^fake[-_]?/i,
  /[-_]?fake$/i,
  /^dummy[-_]?/i,
  /[-_]?dummy$/i,
  /^mock[-_]?/i,
  /[-_]?mock$/i,
  /^placeholder/i,

  // Common default/change-me patterns
  /^changeme/i,
  /^change[-_]?me/i,
  /^fixme/i,
  /^todo/i,
  /^xxx+$/i,
  /^yyy+$/i,
  /^zzz+$/i,
  /^\*+$/,
  /^\.+$/,

  // Sequential/keyboard patterns (only if they form the entire value or are very short)
  /^(abcdefg|xyz12345|qwerty|asdfgh|1234567890|0000000|1111111)$/i,

  // Documentation patterns
  /^sk[-_]?proj[-_]?[A-Z]+$/i, // Fake OpenAI format
  /^\$\{.*\}$/, // Template variables
  /^<.*>$/, // XML-style placeholders
  /^\[.*\]$/, // Bracket placeholders
];

/**
 * Check if a value matches common placeholder patterns
 */
export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Calculate Shannon entropy of a string
 *
 * Higher entropy = more randomness = more likely to be a real secret
 * Real API keys typically have entropy > 4.0
 * Placeholders like "your-key-here" have entropy ~3.0-3.5
 *
 * @param str The string to analyze
 * @returns Entropy value (0-8 for ASCII, higher = more random)
 */
export function calculateEntropy(str: string): number {
  if (str.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const char of str) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Minimum entropy thresholds by secret type
 * Some secret types have lower entropy by design (e.g., passwords can be phrases)
 */
const ENTROPY_THRESHOLDS: Partial<Record<SensitiveDataType, number>> = {
  // High-confidence patterns have strict prefix matching, so lower entropy OK
  openai_api_key: 3.5, // sk-... prefix is distinctive enough
  anthropic_api_key: 3.5, // sk-ant-... prefix is distinctive enough
  google_api_key: 3.5, // AIza... prefix is distinctive enough
  aws_access_key: 3.0, // AKIA... prefix is distinctive enough
  github_token: 3.5, // gh[pousr]_... prefix is distinctive enough
  stripe_api_key: 3.5, // sk_live/test_... prefix is distinctive enough

  // Medium-confidence patterns need higher entropy to filter placeholders
  generic_api_key: 4.0,
  generic_password: 3.2, // Passwords can be passphrases (lower entropy)
  generic_secret: 4.0,
  oauth_client_secret: 4.0,
  oauth_refresh_token: 4.0,
  oauth_access_token: 4.0,
  bearer_token: 4.0,
  jwt_secret: 3.8,
  database_password: 3.2, // Can be passphrases

  // Default for unspecified types
};

const DEFAULT_ENTROPY_THRESHOLD = 3.5;

/**
 * Get the entropy threshold for a secret type
 */
function getEntropyThreshold(type: SensitiveDataType): number {
  return ENTROPY_THRESHOLDS[type] ?? DEFAULT_ENTROPY_THRESHOLD;
}

/**
 * Check if a detected value is likely a real secret (not a placeholder)
 *
 * Uses multiple heuristics:
 * 1. Placeholder pattern matching (quick rejection)
 * 2. Entropy analysis (real secrets are random)
 *
 * @param value The detected secret value
 * @param type The type of secret detected
 * @param confidence The confidence level of the detection
 * @returns true if likely a real secret, false if likely a placeholder
 */
export function isLikelyRealSecret(
  value: string,
  type: SensitiveDataType,
  confidence: DetectionConfidence
): boolean {
  // Always trust high-confidence patterns with strict format prefixes
  // (e.g., sk-, AKIA, gh[pousr]_) - these are unlikely to be placeholders
  if (confidence === 'high') {
    // Still check for obvious placeholders even in high-confidence
    if (isPlaceholder(value)) {
      return false;
    }
    return true;
  }

  // For medium/low confidence, apply stricter checks

  // Quick rejection: common placeholder patterns
  if (isPlaceholder(value)) {
    return false;
  }

  // Entropy check: real secrets are random
  const entropy = calculateEntropy(value);
  const threshold = getEntropyThreshold(type);

  if (entropy < threshold) {
    return false;
  }

  // Additional heuristics for specific types
  // Check for repeating patterns (not random)
  if (hasRepeatingPattern(value)) {
    return false;
  }

  return true;
}

/**
 * Check if a string has obvious repeating patterns
 * e.g., "abcabcabc" or "123123123"
 */
function hasRepeatingPattern(str: string): boolean {
  if (str.length < 6) return false;

  // Check for 2-4 character patterns that repeat
  for (let patternLen = 2; patternLen <= 4; patternLen++) {
    if (str.length % patternLen === 0) {
      const pattern = str.slice(0, patternLen);
      const repeated = pattern.repeat(str.length / patternLen);
      if (repeated === str) {
        return true;
      }
    }
  }

  return false;
}

// =============================================================================
// LLM VERIFICATION - For Uncertain Cases
// =============================================================================

/**
 * Result of LLM verification
 */
export type LLMVerificationResult =
  | 'real_secret'
  | 'placeholder'
  | 'documentation_example'
  | 'unknown';

/**
 * Options for LLM verification
 */
export interface LLMVerificationOptions {
  /** The Anthropic client to use for verification */
  anthropic: {
    messages: {
      create: (params: {
        model: string;
        max_tokens: number;
        messages: Array<{ role: string; content: string }>;
      }) => Promise<{ content: Array<{ text: string }> }>;
    };
  };
  /** Model to use for verification */
  model?: string;
}

/**
 * Prompt template for LLM-based secret verification
 */
const VERIFICATION_PROMPT = `You are a security expert analyzing potential secrets found in code/configuration files.

Given the following context, determine if the detected value is a REAL secret or a FALSE POSITIVE (placeholder/example).

DETECTION:
- Type: {{type}}
- Value (masked): {{maskedValue}}
- Surrounding context: {{context}}

CLASSIFICATION OPTIONS:
1. real_secret - This appears to be an actual credential that should be protected
2. placeholder - This is a placeholder like "your-key-here", "changeme", etc.
3. documentation_example - This is an example in documentation/comments
4. unknown - Cannot determine with confidence

IMPORTANT: Real secrets are typically:
- High entropy (random-looking)
- Not containing words like "example", "test", "your", "change"
- Not in obvious documentation/comment context

Respond with ONLY one word: real_secret, placeholder, documentation_example, or unknown`;

/**
 * Verify a potential secret using LLM
 *
 * This is a more expensive check that should only be used for:
 * - Medium confidence detections that pass entropy filter
 * - Cases where heuristics are uncertain
 *
 * @param match The sensitive data match to verify
 * @param context Surrounding content for context
 * @param options LLM verification options
 * @returns Classification result
 */
export async function verifySecretWithLLM(
  match: SensitiveDataMatch,
  context: string,
  options: LLMVerificationOptions
): Promise<LLMVerificationResult> {
  const { anthropic, model = MODELS.llmVerification } = options;

  // Build the prompt
  const prompt = VERIFICATION_PROMPT.replace('{{type}}', match.type)
    .replace('{{maskedValue}}', match.maskedValue)
    .replace('{{context}}', context.slice(0, 500)); // Limit context length

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 20,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = response.content[0]?.text?.trim().toLowerCase();

    // Parse response
    if (result?.includes('real_secret')) return 'real_secret';
    if (result?.includes('placeholder')) return 'placeholder';
    if (result?.includes('documentation')) return 'documentation_example';
    return 'unknown';
  } catch (error) {
    // If LLM fails, default to treating it as potentially real (safer)
    console.warn('LLM verification failed, defaulting to unknown:', error);
    return 'unknown';
  }
}

/**
 * Batch verify multiple matches with LLM
 * More efficient than individual calls
 */
export async function verifySecretsWithLLM(
  matches: SensitiveDataMatch[],
  content: string,
  options: LLMVerificationOptions
): Promise<Map<SensitiveDataMatch, LLMVerificationResult>> {
  const results = new Map<SensitiveDataMatch, LLMVerificationResult>();

  // Process in sequence to avoid rate limits
  for (const match of matches) {
    // Get surrounding context
    const contextStart = Math.max(0, match.position.start - 100);
    const contextEnd = Math.min(content.length, match.position.end + 100);
    const context = content.slice(contextStart, contextEnd);

    const result = await verifySecretWithLLM(match, context, options);
    results.set(match, result);
  }

  return results;
}

// =============================================================================
// DETECTION OPTIONS
// =============================================================================

/**
 * Options for sensitive data detection
 */
export interface DetectionOptions {
  /** Whether to apply entropy filtering (default: true) */
  useEntropyFilter?: boolean;
  /** Whether to use LLM verification for uncertain cases (default: false) */
  useLLMVerification?: boolean;
  /** LLM options if useLLMVerification is true */
  llmOptions?: LLMVerificationOptions;
  /** Minimum confidence level to include (default: 'medium') */
  minConfidence?: DetectionConfidence;
}

/**
 * Mask a sensitive value for safe display
 * e.g., "sk-abc123xyz789" -> "sk-abc***789"
 */
function maskValue(value: string): string {
  if (value.length <= 8) {
    return '****';
  }

  // Show first 4 and last 3 characters
  const prefix = value.slice(0, 4);
  const suffix = value.slice(-3);
  return `${prefix}***${suffix}`;
}

/**
 * Generate a suggested vault path for a detected secret
 */
function generateVaultPath(type: SensitiveDataType, prefix: string, index: number): string {
  // Convert type to a reasonable key name
  const keyName = type.replace(/_/g, '-').replace(/^generic-/, '');

  return index === 0 ? `${prefix}/${keyName}` : `${prefix}/${keyName}-${index + 1}`;
}

/**
 * Detect sensitive data in content (raw - no filtering)
 *
 * Internal function that scans content for known patterns.
 * Use detectSensitiveData() for filtered results.
 */
function detectSensitiveDataRaw(content: string): SensitiveDataMatch[] {
  const matches: SensitiveDataMatch[] = [];
  const seenPositions = new Set<string>();

  // Track counts per type for unique vault paths
  const typeCounts = new Map<string, number>();

  for (const pattern of SENSITIVE_PATTERNS) {
    // Reset regex state (important for global regexes)
    pattern.pattern.lastIndex = 0;

    let match = pattern.pattern.exec(content);
    while (match !== null) {
      const fullMatch = match[0];
      const value = pattern.valueGroup ? match[pattern.valueGroup] : fullMatch;
      const start = match.index;
      const end = start + fullMatch.length;

      // Skip if we've already matched this position
      const posKey = `${start}-${end}`;
      if (!seenPositions.has(posKey)) {
        seenPositions.add(posKey);

        // Get unique index for this type
        const typeKey = `${pattern.vaultPathPrefix}/${pattern.type}`;
        const typeIndex = typeCounts.get(typeKey) ?? 0;
        typeCounts.set(typeKey, typeIndex + 1);

        matches.push({
          type: pattern.type,
          confidence: pattern.confidence,
          description: pattern.description,
          value,
          position: { start, end },
          suggestedVaultPath: generateVaultPath(pattern.type, pattern.vaultPathPrefix, typeIndex),
          maskedValue: maskValue(value),
        });
      }

      match = pattern.pattern.exec(content);
    }
  }

  // Sort by position
  return matches.sort((a, b) => a.position.start - b.position.start);
}

/**
 * Detect sensitive data in content
 *
 * Scans content for known patterns of credentials, API keys, and secrets.
 * Applies entropy filtering by default to reduce false positives.
 * Returns all matches with position, value, and suggested vault path.
 *
 * @param content The content to scan
 * @param options Detection options (default: entropy filtering enabled)
 */
export function detectSensitiveData(
  content: string,
  options: DetectionOptions = {}
): SensitiveDataMatch[] {
  const { useEntropyFilter = true, minConfidence = 'medium' } = options;

  // Get raw matches
  let matches = detectSensitiveDataRaw(content);

  // Apply confidence filter
  matches = filterByConfidence(matches, minConfidence);

  // Apply entropy filtering to reduce false positives
  if (useEntropyFilter) {
    matches = matches.filter((match) =>
      isLikelyRealSecret(match.value, match.type, match.confidence)
    );
  }

  return matches;
}

/**
 * Detect sensitive data with async LLM verification for uncertain cases
 *
 * This is more thorough but slower due to LLM calls.
 * Use when accuracy is more important than speed.
 *
 * @param content The content to scan
 * @param options Detection options with LLM config
 */
export async function detectSensitiveDataWithLLM(
  content: string,
  options: DetectionOptions & { llmOptions: LLMVerificationOptions }
): Promise<SensitiveDataMatch[]> {
  const { useEntropyFilter = true, minConfidence = 'medium', llmOptions } = options;

  // Get raw matches
  let matches = detectSensitiveDataRaw(content);

  // Apply confidence filter
  matches = filterByConfidence(matches, minConfidence);

  // Apply entropy filtering first (fast)
  if (useEntropyFilter) {
    matches = matches.filter((match) =>
      isLikelyRealSecret(match.value, match.type, match.confidence)
    );
  }

  // For remaining medium-confidence matches, use LLM verification
  const mediumConfidenceMatches = matches.filter((m) => m.confidence === 'medium');

  if (mediumConfidenceMatches.length > 0) {
    const verificationResults = await verifySecretsWithLLM(
      mediumConfidenceMatches,
      content,
      llmOptions
    );

    // Filter out matches that LLM classified as not real secrets
    matches = matches.filter((match) => {
      if (match.confidence === 'high') return true; // Keep high confidence

      const llmResult = verificationResults.get(match);
      if (!llmResult) return true; // Keep if not verified

      // Only keep if LLM says real_secret or unknown (conservative)
      return llmResult === 'real_secret' || llmResult === 'unknown';
    });
  }

  return matches;
}

/**
 * Redact sensitive data from content
 *
 * Replaces detected secrets with vault reference placeholders.
 * Returns the redacted content and list of matches.
 */
export function redactSensitiveData(content: string): RedactionResult {
  const matches = detectSensitiveData(content);

  if (matches.length === 0) {
    return {
      redactedContent: content,
      matches: [],
      hasSensitiveData: false,
    };
  }

  // Replace from end to preserve positions
  let redacted = content;
  for (const match of [...matches].reverse()) {
    const placeholder = `[REDACTED: vault://env/${match.suggestedVaultPath}]`;
    redacted =
      redacted.slice(0, match.position.start) + placeholder + redacted.slice(match.position.end);
  }

  return {
    redactedContent: redacted,
    matches,
    hasSensitiveData: true,
  };
}

/**
 * Check if content contains any sensitive data
 *
 * Quick check without extracting all matches.
 */
export function hasSensitiveData(content: string): boolean {
  for (const pattern of SENSITIVE_PATTERNS) {
    pattern.pattern.lastIndex = 0;
    if (pattern.pattern.test(content)) {
      return true;
    }
  }
  return false;
}

/**
 * Filter matches by confidence level
 */
export function filterByConfidence(
  matches: SensitiveDataMatch[],
  minConfidence: DetectionConfidence
): SensitiveDataMatch[] {
  const confidenceOrder: DetectionConfidence[] = ['high', 'medium', 'low'];
  const minIndex = confidenceOrder.indexOf(minConfidence);

  return matches.filter((m) => {
    const matchIndex = confidenceOrder.indexOf(m.confidence);
    return matchIndex <= minIndex;
  });
}
