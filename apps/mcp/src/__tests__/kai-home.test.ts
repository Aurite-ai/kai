import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let fakeHome = '';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => fakeHome };
});

const { getKaiHomeDir, getKnowledgeDir, readEnv } = await import('../kai-home.js');
const { EnvVaultProvider } = await import('../vault/env-provider.js');

describe('kai-home', () => {
  beforeEach(async () => {
    fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'kai-home-'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await fs.rm(fakeHome, { recursive: true, force: true });
  });

  describe('getKaiHomeDir', () => {
    it('defaults to ~/.kai when nothing exists', () => {
      expect(getKaiHomeDir()).toBe(path.join(fakeHome, '.kai'));
    });

    it('falls back to legacy ~/.kahuna when only it exists', async () => {
      await fs.mkdir(path.join(fakeHome, '.kahuna'));
      expect(getKaiHomeDir()).toBe(path.join(fakeHome, '.kahuna'));
    });

    it('prefers ~/.kai when both exist', async () => {
      await fs.mkdir(path.join(fakeHome, '.kahuna'));
      await fs.mkdir(path.join(fakeHome, '.kai'));
      expect(getKaiHomeDir()).toBe(path.join(fakeHome, '.kai'));
    });
  });

  describe('readEnv', () => {
    it('prefers KAI_* over legacy KAHUNA_*', () => {
      vi.stubEnv('KAI_TEST_VALUE', 'new');
      vi.stubEnv('KAHUNA_TEST_VALUE', 'old');
      expect(readEnv('KAI_TEST_VALUE')).toBe('new');
    });

    it('falls back to legacy KAHUNA_*', () => {
      vi.stubEnv('KAHUNA_TEST_VALUE', 'old');
      expect(readEnv('KAI_TEST_VALUE')).toBe('old');
    });
  });

  describe('getKnowledgeDir', () => {
    it('honors legacy KAHUNA_KNOWLEDGE_DIR', () => {
      vi.stubEnv('KAHUNA_KNOWLEDGE_DIR', '/legacy/knowledge');
      expect(getKnowledgeDir()).toBe('/legacy/knowledge');
    });
  });

  describe('EnvVaultProvider legacy secrets', () => {
    it('reads KAHUNA_* secrets from a legacy ~/.kahuna/.env', async () => {
      await fs.mkdir(path.join(fakeHome, '.kahuna'));
      await fs.writeFile(path.join(fakeHome, '.kahuna', '.env'), 'KAHUNA_GMAIL_TOKEN=abc\n');

      const vault = new EnvVaultProvider();
      expect(await vault.getSecret('gmail/token')).toBe('abc');
      expect(await vault.listSecrets()).toContain('gmail/token');
    });

    it('replaces a legacy KAHUNA_* secret with KAI_* on write', async () => {
      await fs.mkdir(path.join(fakeHome, '.kahuna'));
      const envPath = path.join(fakeHome, '.kahuna', '.env');
      await fs.writeFile(envPath, 'KAHUNA_GMAIL_TOKEN=abc\n');

      const vault = new EnvVaultProvider();
      await vault.setSecret('gmail/token', 'xyz');

      const content = await fs.readFile(envPath, 'utf-8');
      expect(content).toContain('KAI_GMAIL_TOKEN=xyz');
      expect(content).not.toContain('KAHUNA_GMAIL_TOKEN');
    });
  });
});
