/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Compatibility CLI utility for packaged applications.
 * OpenScience no longer requires an app-level WebUI password.
 */

// Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}i${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}OK${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}ERR${colors.reset} ${msg}`),
  warning: (msg: string) => console.log(`${colors.yellow}WARN${colors.reset} ${msg}`),
  highlight: (msg: string) => console.log(`${colors.cyan}${colors.bright}${msg}${colors.reset}`),
};

export function resolveResetPasswordUsername(argv: string[]): string {
  const resetPasswordIndex = argv.indexOf('--resetpass');
  if (resetPasswordIndex === -1) {
    return 'admin';
  }

  const argsAfterCommand = argv.slice(resetPasswordIndex + 1);
  return argsAfterCommand.find((arg) => !arg.startsWith('--')) || 'admin';
}

export async function resetPasswordCLI(username: string): Promise<void> {
  log.info(`Target user: ${username}`);
  log.success('OpenScience WebUI uses no app-level login.');
  log.info('Open the WebUI URL directly; no password reset is required.');
}
