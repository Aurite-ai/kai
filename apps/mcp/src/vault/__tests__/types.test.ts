/**
 * Tests for vault types and utilities
 */

import { describe, expect, it } from 'vitest';
import {
  formatVaultReference,
  isValidProvider,
  isVaultReference,
  parseVaultReference,
} from '../types.js';

describe('parseVaultReference', () => {
  it('parses env provider references', () => {
    const result = parseVaultReference('vault://env/OPENAI_API_KEY');
    expect(result).toEqual({
      provider: 'env',
      path: 'OPENAI_API_KEY',
    });
  });

  it('parses 1password references', () => {
    const result = parseVaultReference('vault://1password/kai/gmail-oauth');
    expect(result).toEqual({
      provider: '1password',
      path: 'kai/gmail-oauth',
    });
  });

  it('parses hashicorp vault references', () => {
    const result = parseVaultReference('vault://hashicorp/secret/integrations/gmail');
    expect(result).toEqual({
      provider: 'hashicorp',
      path: 'secret/integrations/gmail',
    });
  });

  it('parses AWS Secrets Manager references', () => {
    const result = parseVaultReference('vault://aws/my-secret');
    expect(result).toEqual({
      provider: 'aws',
      path: 'my-secret',
    });
  });

  it('parses GCP Secret Manager references', () => {
    const result = parseVaultReference('vault://gcp/projects/my-project/secrets/my-secret');
    expect(result).toEqual({
      provider: 'gcp',
      path: 'projects/my-project/secrets/my-secret',
    });
  });

  it('returns null for invalid URIs', () => {
    expect(parseVaultReference('not-a-vault-uri')).toBeNull();
    expect(parseVaultReference('http://example.com')).toBeNull();
    expect(parseVaultReference('vault://')).toBeNull();
    expect(parseVaultReference('vault://env')).toBeNull();
    expect(parseVaultReference('')).toBeNull();
  });

  it('returns null for unknown providers', () => {
    expect(parseVaultReference('vault://unknown/path')).toBeNull();
  });
});

describe('formatVaultReference', () => {
  it('formats env provider references', () => {
    const result = formatVaultReference({
      provider: 'env',
      path: 'OPENAI_API_KEY',
    });
    expect(result).toBe('vault://env/OPENAI_API_KEY');
  });

  it('formats 1password references', () => {
    const result = formatVaultReference({
      provider: '1password',
      path: 'kai/gmail-oauth',
    });
    expect(result).toBe('vault://1password/kai/gmail-oauth');
  });

  it('round-trips with parseVaultReference', () => {
    const original = 'vault://hashicorp/secret/integrations/gmail';
    const parsed = parseVaultReference(original);
    expect(parsed).not.toBeNull();
    if (parsed) {
      const formatted = formatVaultReference(parsed);
      expect(formatted).toBe(original);
    }
  });
});

describe('isValidProvider', () => {
  it('returns true for valid providers', () => {
    expect(isValidProvider('env')).toBe(true);
    expect(isValidProvider('1password')).toBe(true);
    expect(isValidProvider('hashicorp')).toBe(true);
    expect(isValidProvider('aws')).toBe(true);
    expect(isValidProvider('gcp')).toBe(true);
  });

  it('returns false for invalid providers', () => {
    expect(isValidProvider('unknown')).toBe(false);
    expect(isValidProvider('')).toBe(false);
    expect(isValidProvider('azure')).toBe(false);
  });
});

describe('isVaultReference', () => {
  it('returns true for valid vault reference objects', () => {
    expect(isVaultReference({ $ref: 'vault://env/SECRET' })).toBe(true);
    expect(isVaultReference({ $ref: 'vault://1password/kai/key' })).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isVaultReference(null)).toBe(false);
    expect(isVaultReference(undefined)).toBe(false);
    expect(isVaultReference('string')).toBe(false);
    expect(isVaultReference(123)).toBe(false);
    expect(isVaultReference({})).toBe(false);
    expect(isVaultReference({ $ref: 'not-a-vault-uri' })).toBe(false);
    expect(isVaultReference({ $ref: 123 })).toBe(false);
    expect(isVaultReference({ ref: 'vault://env/SECRET' })).toBe(false);
  });
});
