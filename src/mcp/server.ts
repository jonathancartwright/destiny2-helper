/**
 * MCP Server Implementation
 * Main server that exposes Destiny 2 vault management tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { BungieClient, ManifestManager } from '../bungie/index.js';
import { DIMParser } from '../dim/index.js';
import { ArmorScorer, DuplicateFinder } from '../analysis/index.js';
import { CleanupPlanner } from '../planner/index.js';
import {
  InventoryItem,
  CleanupPlan,
  ItemLocation,
  Character,
  VaultSummary,
} from '../types.js';
import { toolSchemas } from './tools.js';

export class VaultCuratorServer {
  private server: Server;
  private bungieClient: BungieClient | null = null;
  private manifestManager: ManifestManager | null = null;
  private dimParser: DIMParser;
  private armorScorer: ArmorScorer;
  private duplicateFinder: DuplicateFinder;
  private cleanupPlanner: CleanupPlanner | null = null;

  // Cached data
  private inventory: InventoryItem[] = [];
  private characters: Character[] = [];
  private currentPlan: CleanupPlan | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'destiny2-vault-curator',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.dimParser = new DIMParser();
    this.armorScorer = new ArmorScorer();
    this.duplicateFinder = new DuplicateFinder();

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = Object.entries(toolSchemas).map(([_, schema]) => ({
        name: schema.name,
        description: schema.description,
        inputSchema: this.zodToJsonSchema(schema.inputSchema),
      }));

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.handleToolCall(name, args ?? {});
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'destiny_configure':
        return this.configure(args as z.infer<typeof toolSchemas.configure.inputSchema>);

      case 'destiny_load_dim_backup':
        return this.loadDimBackup(args as z.infer<typeof toolSchemas.loadDimBackup.inputSchema>);

      case 'destiny_dim_summary':
        return this.getDimSummary();

      case 'destiny_get_inventory':
        return this.getInventory(args as z.infer<typeof toolSchemas.getInventory.inputSchema>);

      case 'destiny_vault_summary':
        return this.getVaultSummary();

      case 'destiny_get_characters':
        return this.getCharacters();

      case 'destiny_analyze_armor':
        return this.analyzeArmor(args as z.infer<typeof toolSchemas.analyzeArmor.inputSchema>);

      case 'destiny_find_duplicates':
        return this.findDuplicates(args as z.infer<typeof toolSchemas.findDuplicates.inputSchema>);

      case 'destiny_compare_armor':
        return this.compareArmor(args as z.infer<typeof toolSchemas.compareArmor.inputSchema>);

      case 'destiny_generate_cleanup_plan':
        return this.generateCleanupPlan(
          args as z.infer<typeof toolSchemas.generateCleanupPlan.inputSchema>
        );

      case 'destiny_get_junk_items':
        return this.getJunkItems();

      case 'destiny_transfer_item':
        return this.transferItem(args as z.infer<typeof toolSchemas.transferItem.inputSchema>);

      case 'destiny_move_junk_to_character':
        return this.moveJunkToCharacter(
          args as z.infer<typeof toolSchemas.moveJunkToCharacter.inputSchema>
        );

      case 'destiny_set_item_locked':
        return this.setItemLocked(args as z.infer<typeof toolSchemas.setItemLocked.inputSchema>);

      case 'destiny_search_items':
        return this.searchItems(args as z.infer<typeof toolSchemas.searchItems.inputSchema>);

      case 'destiny_check_build_safety':
        return this.checkBuildSafety(
          args as z.infer<typeof toolSchemas.checkBuildSafety.inputSchema>
        );

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // Tool implementations

  private async configure(
    args: z.infer<typeof toolSchemas.configure.inputSchema>
  ): Promise<string> {
    this.bungieClient = new BungieClient({
      apiKey: args.apiKey,
      accessToken: args.accessToken,
      membershipType: args.membershipType,
      membershipId: args.membershipId,
    });

    this.manifestManager = new ManifestManager(this.bungieClient);

    // If no membership info provided, try to get it from the API
    if (!args.membershipType || !args.membershipId) {
      if (args.accessToken) {
        const userResult = await this.bungieClient.getCurrentUser();
        if (userResult.success && userResult.data) {
          this.bungieClient.updateConfig({
            membershipType: userResult.data.membershipType,
            membershipId: userResult.data.membershipId,
          });
          return `Configured successfully. Detected membership: ${userResult.data.membershipType}/${userResult.data.membershipId}`;
        }
      }
    }

    // Initialize cleanup planner with DIM parser
    this.cleanupPlanner = new CleanupPlanner(this.dimParser);

    return 'Bungie API configured successfully';
  }

  private async loadDimBackup(
    args: z.infer<typeof toolSchemas.loadDimBackup.inputSchema>
  ): Promise<string> {
    if (args.jsonContent) {
      const result = this.dimParser.parseFromString(args.jsonContent);
      if (!result.success) {
        throw new Error(result.error);
      }
    } else if (args.filePath) {
      const result = await this.dimParser.loadBackup(args.filePath);
      if (!result.success) {
        throw new Error(result.error);
      }
    } else {
      throw new Error('Either filePath or jsonContent must be provided');
    }

    const summary = this.dimParser.getSummary();
    return `DIM backup loaded: ${summary?.loadoutCount ?? 0} loadouts, ${summary?.taggedItemCount ?? 0} tagged items, ${summary?.loadoutItemCount ?? 0} items in loadouts`;
  }

  private getDimSummary(): unknown {
    if (!this.dimParser.loaded) {
      return { loaded: false, message: 'No DIM backup loaded' };
    }

    const summary = this.dimParser.getSummary();
    return {
      loaded: true,
      ...summary,
      loadouts: this.dimParser.data?.loadouts.map((l) => ({
        name: l.name,
        classType: l.classType,
        itemCount: l.itemIds.length,
      })),
    };
  }

  private async getInventory(
    args: z.infer<typeof toolSchemas.getInventory.inputSchema>
  ): Promise<unknown> {
    if (!this.bungieClient) {
      throw new Error('Bungie API not configured. Call destiny_configure first.');
    }

    // Load manifest if requested
    if (args.includeManifest && this.manifestManager && !this.manifestManager.loaded) {
      const manifestResult = await this.manifestManager.load();
      if (!manifestResult.success) {
        console.error('Failed to load manifest:', manifestResult.error);
      }
    }

    const result = await this.bungieClient.getFullInventory();
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to fetch inventory');
    }

    this.inventory = result.data;

    // Enrich with manifest names if available
    if (this.manifestManager?.loaded) {
      for (const item of this.inventory) {
        item.name = this.manifestManager.getItemName(item.itemHash);
      }
    }

    return {
      totalItems: this.inventory.length,
      weapons: this.inventory.filter((i) => i.itemType === 'weapon').length,
      armor: this.inventory.filter((i) => i.itemType === 'armor').length,
      vaultItems: this.inventory.filter((i) => i.location === ItemLocation.Vault).length,
    };
  }

  private getVaultSummary(): VaultSummary {
    const vaultItems = this.inventory.filter((i) => i.location === ItemLocation.Vault);

    return {
      totalItems: vaultItems.length,
      weapons: vaultItems.filter((i) => i.itemType === 'weapon').length,
      armor: vaultItems.filter((i) => i.itemType === 'armor').length,
      other: vaultItems.filter((i) => i.itemType === 'other').length,
      vaultCapacity: 600, // Current Destiny 2 vault capacity
      vaultUsedPercent: Math.round((vaultItems.length / 600) * 100),
    };
  }

  private async getCharacters(): Promise<Character[]> {
    if (!this.bungieClient) {
      throw new Error('Bungie API not configured');
    }

    const result = await this.bungieClient.getCharacters();
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to fetch characters');
    }

    this.characters = result.data;
    return this.characters;
  }

  private analyzeArmor(
    args: z.infer<typeof toolSchemas.analyzeArmor.inputSchema>
  ): unknown {
    const item = this.inventory.find((i) => i.itemInstanceId === args.itemInstanceId);
    if (!item) {
      throw new Error(`Item not found: ${args.itemInstanceId}`);
    }

    if (item.itemType !== 'armor') {
      throw new Error('Item is not armor');
    }

    const score = this.armorScorer.scoreArmor(item);
    if (!score) {
      throw new Error('Unable to score armor (no stats)');
    }

    return {
      item: {
        name: item.name,
        instanceId: item.itemInstanceId,
        stats: item.stats,
        isLocked: item.isLocked,
        isMasterworked: item.isMasterworked,
      },
      score: score.totalScore,
      analysis: score.analysis,
      bestProfile: score.bestProfile,
      bestProfileScore: score.bestProfileScore,
      summary: this.armorScorer.generateSummary(item, score),
    };
  }

  private findDuplicates(
    args: z.infer<typeof toolSchemas.findDuplicates.inputSchema>
  ): unknown {
    const finder = new DuplicateFinder({
      includeWeapons: args.includeWeapons ?? true,
      includeArmor: args.includeArmor ?? true,
      minDuplicates: args.minDuplicates ?? 2,
    });

    const groups = finder.findDuplicates(this.inventory);
    const summary = finder.getSummary(groups);

    return {
      summary,
      groups: groups.slice(0, 20).map((g) => ({
        name: g.name,
        itemHash: g.itemHash,
        count: g.items.length,
        keep: g.recommendation.keep.length,
        discard: g.recommendation.discard.length,
        review: g.recommendation.review.length,
        reasoning: g.recommendation.reasoning,
      })),
    };
  }

  private compareArmor(
    args: z.infer<typeof toolSchemas.compareArmor.inputSchema>
  ): unknown {
    const item1 = this.inventory.find((i) => i.itemInstanceId === args.itemInstanceId1);
    const item2 = this.inventory.find((i) => i.itemInstanceId === args.itemInstanceId2);

    if (!item1) throw new Error(`Item not found: ${args.itemInstanceId1}`);
    if (!item2) throw new Error(`Item not found: ${args.itemInstanceId2}`);

    const comparison = this.armorScorer.compareArmor(item1, item2);

    return {
      winner: comparison.winner
        ? {
            name: comparison.winner.name,
            instanceId: comparison.winner.itemInstanceId,
          }
        : null,
      reason: comparison.reason,
      item1Score: comparison.score1?.totalScore,
      item2Score: comparison.score2?.totalScore,
    };
  }

  private generateCleanupPlan(
    args: z.infer<typeof toolSchemas.generateCleanupPlan.inputSchema>
  ): unknown {
    if (!this.cleanupPlanner) {
      this.cleanupPlanner = new CleanupPlanner(this.dimParser);
    }

    // Update protection rules if provided
    this.cleanupPlanner.updateProtectionRules({
      protectLockedItems: args.protectLockedItems ?? true,
      protectMasterworked: args.protectMasterworked ?? true,
      protectExotics: args.protectExotics ?? true,
      highStatThreshold: args.highStatThreshold ?? 65,
    });

    this.currentPlan = this.cleanupPlanner.generatePlan(this.inventory);

    return {
      summary: this.currentPlan.summary,
      formattedPlan: this.cleanupPlanner.formatPlan(this.currentPlan),
    };
  }

  private getJunkItems(): unknown {
    if (!this.currentPlan) {
      throw new Error('No cleanup plan generated. Call destiny_generate_cleanup_plan first.');
    }

    const junkRecs = this.currentPlan.recommendations.filter((r) => r.action === 'JUNK');

    return {
      count: junkRecs.length,
      items: junkRecs.map((r) => ({
        name: r.item.name,
        instanceId: r.item.itemInstanceId,
        itemHash: r.item.itemHash,
        reason: r.reason,
        stats: r.item.stats,
      })),
    };
  }

  private async transferItem(
    args: z.infer<typeof toolSchemas.transferItem.inputSchema>
  ): Promise<string> {
    if (!this.bungieClient) {
      throw new Error('Bungie API not configured');
    }

    const result = await this.bungieClient.transferItem({
      itemInstanceId: args.itemInstanceId,
      itemHash: args.itemHash,
      targetCharacterId: args.targetCharacterId,
    });

    if (!result.success) {
      throw new Error(result.error ?? 'Transfer failed');
    }

    return `Item transferred successfully to ${args.targetCharacterId === 'vault' ? 'vault' : 'character'}`;
  }

  private async moveJunkToCharacter(
    args: z.infer<typeof toolSchemas.moveJunkToCharacter.inputSchema>
  ): Promise<unknown> {
    if (!this.bungieClient) {
      throw new Error('Bungie API not configured');
    }

    if (!this.currentPlan || !this.cleanupPlanner) {
      throw new Error('No cleanup plan generated');
    }

    const junkItems = this.cleanupPlanner.getJunkItems(this.currentPlan);
    const vaultJunk = junkItems.filter((i) => i.location === ItemLocation.Vault);
    const toMove = vaultJunk.slice(0, args.maxItems ?? 10);

    const results: Array<{ item: string; success: boolean; error?: string }> = [];

    for (const item of toMove) {
      const result = await this.bungieClient.transferItem({
        itemInstanceId: item.itemInstanceId,
        itemHash: item.itemHash,
        targetCharacterId: args.characterId,
      });

      results.push({
        item: item.name,
        success: result.success,
        error: result.error,
      });

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const successful = results.filter((r) => r.success).length;
    return {
      moved: successful,
      failed: results.length - successful,
      details: results,
    };
  }

  private async setItemLocked(
    args: z.infer<typeof toolSchemas.setItemLocked.inputSchema>
  ): Promise<string> {
    if (!this.bungieClient) {
      throw new Error('Bungie API not configured');
    }

    const result = await this.bungieClient.setLockState(
      args.itemInstanceId,
      args.characterId,
      args.locked
    );

    if (!result.success) {
      throw new Error(result.error ?? 'Failed to set lock state');
    }

    return `Item ${args.locked ? 'locked' : 'unlocked'} successfully`;
  }

  private searchItems(
    args: z.infer<typeof toolSchemas.searchItems.inputSchema>
  ): unknown {
    let results = [...this.inventory];

    if (args.name) {
      const searchLower = args.name.toLowerCase();
      results = results.filter((i) => i.name.toLowerCase().includes(searchLower));
    }

    if (args.itemType) {
      results = results.filter((i) => i.itemType === args.itemType);
    }

    if (args.inVault !== undefined) {
      results = results.filter(
        (i) => (i.location === ItemLocation.Vault) === args.inVault
      );
    }

    if (args.isLocked !== undefined) {
      results = results.filter((i) => i.isLocked === args.isLocked);
    }

    if (args.minStats !== undefined) {
      results = results.filter((i) => i.stats && i.stats.total >= args.minStats!);
    }

    if (args.maxStats !== undefined) {
      results = results.filter((i) => i.stats && i.stats.total <= args.maxStats!);
    }

    return {
      count: results.length,
      items: results.slice(0, 50).map((i) => ({
        name: i.name,
        instanceId: i.itemInstanceId,
        itemType: i.itemType,
        stats: i.stats,
        isLocked: i.isLocked,
        isMasterworked: i.isMasterworked,
        location: i.location === ItemLocation.Vault ? 'vault' : 'character',
      })),
    };
  }

  private checkBuildSafety(
    args: z.infer<typeof toolSchemas.checkBuildSafety.inputSchema>
  ): unknown {
    const item = this.inventory.find((i) => i.itemInstanceId === args.itemInstanceId);
    if (!item) {
      throw new Error(`Item not found: ${args.itemInstanceId}`);
    }

    const inLoadouts = this.dimParser.getLoadoutsForItem(args.itemInstanceId);
    const tag = this.dimParser.getTag(args.itemInstanceId);
    const note = this.dimParser.getNote(args.itemInstanceId);

    const isSafe =
      inLoadouts.length === 0 &&
      tag !== 'favorite' &&
      tag !== 'keep' &&
      !item.isLocked &&
      !item.isMasterworked;

    return {
      item: {
        name: item.name,
        instanceId: item.itemInstanceId,
      },
      safeToDismantle: isSafe,
      reasons: [
        inLoadouts.length > 0
          ? `Used in ${inLoadouts.length} DIM loadout(s): ${inLoadouts.map((l) => l.name).join(', ')}`
          : null,
        tag ? `DIM tag: ${tag}` : null,
        note ? `Has DIM note` : null,
        item.isLocked ? 'Item is locked' : null,
        item.isMasterworked ? 'Item is masterworked' : null,
      ].filter(Boolean),
      loadouts: inLoadouts.map((l) => l.name),
      dimTag: tag,
      dimNote: note,
    };
  }

  // Utility methods

  private zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
    // Simple conversion for basic types - in production use zod-to-json-schema
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodType = value as z.ZodTypeAny;
      const isOptional = zodType.isOptional();

      if (!isOptional) {
        required.push(key);
      }

      // Extract inner type if optional
      const innerType = isOptional ? (zodType as z.ZodOptional<z.ZodTypeAny>).unwrap() : zodType;

      properties[key] = this.zodTypeToJsonSchema(innerType);
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  private zodTypeToJsonSchema(zodType: z.ZodTypeAny): Record<string, unknown> {
    if (zodType instanceof z.ZodString) {
      return { type: 'string', description: zodType.description };
    }
    if (zodType instanceof z.ZodNumber) {
      return { type: 'number', description: zodType.description };
    }
    if (zodType instanceof z.ZodBoolean) {
      return { type: 'boolean', description: zodType.description };
    }
    if (zodType instanceof z.ZodEnum) {
      return { type: 'string', enum: zodType.options, description: zodType.description };
    }
    return { type: 'string' };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Destiny 2 Vault Curator MCP server running on stdio');
  }
}
