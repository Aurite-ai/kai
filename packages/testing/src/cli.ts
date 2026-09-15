#!/usr/bin/env node
/**
 * Kai Testing CLI
 *
 * Commands for VCK quality testing:
 * - create  - Assemble a test project from VCK template + scenario
 * - list    - Show available scenarios and existing projects
 * - collect - Gather results after a copilot session
 */

import { Command } from 'commander';
import { collectCommand } from './commands/collect.js';
import { createCommand } from './commands/create.js';
import { listCommand } from './commands/list.js';

const program = new Command();

program.name('kai-test').description('CLI for VCK quality testing').version('0.0.0');

// create - Assemble project from VCK template + scenario
program
  .command('create [scenario]')
  .description('Create a test project from a scenario template')
  .option('-n, --name <name>', 'Custom project folder name')
  .action(async (scenario: string | undefined, options: { name?: string }) => {
    await createCommand({ scenario, name: options.name });
  });

// list - Show available scenarios and existing projects
program
  .command('list')
  .description('List available scenarios and existing test projects')
  .action(async () => {
    await listCommand();
  });

// collect - Gather results after copilot session
program
  .command('collect <project>')
  .description('Collect results from a completed test project')
  .option('-t, --tester <name>', 'Tester name for metadata', 'Anonymous')
  .action(async (project: string, options: { tester: string }) => {
    await collectCommand({ project, tester: options.tester });
  });

// Parse arguments and run
program.parse();
