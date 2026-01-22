#!/usr/bin/env node
/**
 * Destiny 2 Vault Curator MCP Server
 *
 * An intelligent vault management assistant for Destiny 2 that:
 * - Analyzes armor stats and provides scoring
 * - Identifies duplicate items
 * - Generates cleanup plans with build protection
 * - Integrates with DIM backup for loadout awareness
 * - Transfers items between vault and characters
 *
 * Usage:
 *   npx destiny2-vault-curator
 *
 * Or add to Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "destiny2": {
 *         "command": "npx",
 *         "args": ["destiny2-vault-curator"]
 *       }
 *     }
 *   }
 */

import { VaultCuratorServer } from './mcp/server.js';

async function main(): Promise<void> {
  const server = new VaultCuratorServer();
  await server.run();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
