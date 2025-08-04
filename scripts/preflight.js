#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { execSync } from 'child_process';
import chalk from 'chalk';

const steps = [
  { name: 'clean', command: 'npm run clean' },
  { name: 'install', command: 'npm ci' },
  { name: 'format', command: 'npm run format' },
  { name: 'lint', command: 'npm run lint:ci' },
  { name: 'build', command: 'npm run build' },
  { name: 'typecheck', command: 'npm run typecheck' },
  { name: 'test', command: 'npm run test:preflight' },
];

console.log(chalk.blue('🚀 Starting preflight checks...'));

for (const step of steps) {
  process.stdout.write(chalk.yellow(`Running: ${step.name}... `));
  try {
    execSync(step.command, { stdio: 'pipe', encoding: 'utf-8' });
    process.stdout.write(chalk.green('✅ Success\n'));
  } catch (error) {
    process.stdout.write(chalk.red('❌ Error\n'));
    console.error(
      chalk.red('----------------- ERROR OUTPUT -----------------'),
    );
    console.error(error.stdout);
    console.error(error.stderr);
    console.error(chalk.red('----------------------------------------------'));
    console.error(chalk.red(`Preflight check failed at step: "${step.name}"`));
    process.exit(1);
  }
}

console.log(chalk.green.bold('\n🎉 All preflight checks passed successfully!'));
