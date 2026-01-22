/**
 * MCP Tool Definitions
 * Defines all available tools for the Destiny 2 Vault Curator
 */

import { z } from 'zod';

export const toolSchemas = {
  // Authentication & Setup
  configure: {
    name: 'destiny_configure',
    description: 'Configure the Bungie API connection with API key and optional OAuth tokens',
    inputSchema: z.object({
      apiKey: z.string().describe('Bungie API key from bungie.net/developer'),
      accessToken: z.string().optional().describe('OAuth access token (optional, enables write operations)'),
      membershipType: z.number().optional().describe('Destiny membership type (1=Xbox, 2=PSN, 3=Steam, etc.)'),
      membershipId: z.string().optional().describe('Destiny membership ID'),
    }),
  },

  // DIM Integration
  loadDimBackup: {
    name: 'destiny_load_dim_backup',
    description: 'Load a DIM backup file to enable build protection. Items in DIM loadouts will be protected from cleanup recommendations.',
    inputSchema: z.object({
      filePath: z.string().optional().describe('Path to DIM backup JSON file'),
      jsonContent: z.string().optional().describe('Raw JSON content of DIM backup (alternative to filePath)'),
    }),
  },

  getDimSummary: {
    name: 'destiny_dim_summary',
    description: 'Get a summary of loaded DIM data including loadout count and tagged items',
    inputSchema: z.object({}),
  },

  // Inventory Operations
  getInventory: {
    name: 'destiny_get_inventory',
    description: 'Fetch the full inventory from Bungie API including vault and all characters',
    inputSchema: z.object({
      includeManifest: z.boolean().optional().describe('Also load item names from manifest (slower but provides names)'),
    }),
  },

  getVaultSummary: {
    name: 'destiny_vault_summary',
    description: 'Get a summary of vault contents including item counts by type',
    inputSchema: z.object({}),
  },

  getCharacters: {
    name: 'destiny_get_characters',
    description: 'Get all characters for the current account',
    inputSchema: z.object({}),
  },

  // Analysis Operations
  analyzeArmor: {
    name: 'destiny_analyze_armor',
    description: 'Analyze a specific armor piece and get its score and stat breakdown',
    inputSchema: z.object({
      itemInstanceId: z.string().describe('The instance ID of the armor piece to analyze'),
    }),
  },

  findDuplicates: {
    name: 'destiny_find_duplicates',
    description: 'Find duplicate items in the vault and get recommendations on which to keep',
    inputSchema: z.object({
      includeWeapons: z.boolean().optional().describe('Include weapons in duplicate search'),
      includeArmor: z.boolean().optional().describe('Include armor in duplicate search'),
      minDuplicates: z.number().optional().describe('Minimum copies to be considered duplicates (default: 2)'),
    }),
  },

  compareArmor: {
    name: 'destiny_compare_armor',
    description: 'Compare two armor pieces and get a recommendation on which is better',
    inputSchema: z.object({
      itemInstanceId1: z.string().describe('Instance ID of first armor piece'),
      itemInstanceId2: z.string().describe('Instance ID of second armor piece'),
    }),
  },

  // Cleanup Planning
  generateCleanupPlan: {
    name: 'destiny_generate_cleanup_plan',
    description: 'Generate a full vault cleanup plan with KEEP/REVIEW/JUNK recommendations. Respects DIM loadout protection.',
    inputSchema: z.object({
      protectLockedItems: z.boolean().optional().describe('Protect items locked in game (default: true)'),
      protectMasterworked: z.boolean().optional().describe('Protect masterworked items (default: true)'),
      protectExotics: z.boolean().optional().describe('Protect exotic items (default: true)'),
      highStatThreshold: z.number().optional().describe('Minimum total stats to auto-protect armor (default: 65)'),
    }),
  },

  getJunkItems: {
    name: 'destiny_get_junk_items',
    description: 'Get all items recommended as junk from the most recent cleanup plan',
    inputSchema: z.object({}),
  },

  // Transfer Operations
  transferItem: {
    name: 'destiny_transfer_item',
    description: 'Transfer an item between vault and character. Requires OAuth authentication.',
    inputSchema: z.object({
      itemInstanceId: z.string().describe('Instance ID of item to transfer'),
      itemHash: z.number().describe('Item hash (definition ID)'),
      targetCharacterId: z.string().describe('Target character ID, or "vault" to move to vault'),
    }),
  },

  moveJunkToCharacter: {
    name: 'destiny_move_junk_to_character',
    description: 'Move all junk items from vault to a specific character for easy dismantling. Requires OAuth.',
    inputSchema: z.object({
      characterId: z.string().describe('Character ID to move junk items to'),
      maxItems: z.number().optional().describe('Maximum number of items to move (default: 10)'),
    }),
  },

  // Item Management
  setItemLocked: {
    name: 'destiny_set_item_locked',
    description: 'Lock or unlock an item. Requires OAuth authentication.',
    inputSchema: z.object({
      itemInstanceId: z.string().describe('Instance ID of item'),
      characterId: z.string().describe('Character ID where item is located'),
      locked: z.boolean().describe('True to lock, false to unlock'),
    }),
  },

  // Utility
  searchItems: {
    name: 'destiny_search_items',
    description: 'Search inventory for items matching criteria',
    inputSchema: z.object({
      name: z.string().optional().describe('Search by item name (partial match)'),
      itemType: z.enum(['weapon', 'armor']).optional().describe('Filter by item type'),
      minStats: z.number().optional().describe('Minimum total stats (armor only)'),
      maxStats: z.number().optional().describe('Maximum total stats (armor only)'),
      inVault: z.boolean().optional().describe('Only search vault'),
      isLocked: z.boolean().optional().describe('Filter by locked status'),
    }),
  },

  checkBuildSafety: {
    name: 'destiny_check_build_safety',
    description: 'Check if an item is safe to dismantle (not used in any DIM builds)',
    inputSchema: z.object({
      itemInstanceId: z.string().describe('Instance ID of item to check'),
    }),
  },
};

export type ToolName = keyof typeof toolSchemas;
