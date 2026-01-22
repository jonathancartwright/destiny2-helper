/**
 * Destiny Manifest Handler
 * Manages item definitions and lookups from the Destiny manifest
 */

import { BungieClient } from './client.js';
import { ApiResult } from '../types.js';

interface ItemDefinition {
  displayProperties: {
    name: string;
    description: string;
    icon: string;
  };
  itemTypeDisplayName: string;
  inventory: {
    tierType: number;
    tierTypeName: string;
  };
  classType: number;
  defaultDamageType: number;
}

export class ManifestManager {
  private client: BungieClient;
  private itemDefinitions: Map<number, ItemDefinition> = new Map();
  private manifestVersion: string | null = null;
  private isLoaded = false;

  constructor(client: BungieClient) {
    this.client = client;
  }

  /**
   * Load the manifest item definitions
   */
  async load(): Promise<ApiResult<void>> {
    const manifestResult = await this.client.getManifest();
    if (!manifestResult.success || !manifestResult.data) {
      return { success: false, error: manifestResult.error };
    }

    const manifest = manifestResult.data;
    this.manifestVersion = manifest.version;

    // Get the English item definition path
    const itemDefPath =
      manifest.jsonWorldComponentContentPaths?.en?.DestinyInventoryItemDefinition;

    if (!itemDefPath) {
      return {
        success: false,
        error: 'Could not find item definition path in manifest',
      };
    }

    try {
      const response = await fetch(`https://www.bungie.net${itemDefPath}`);
      const definitions = (await response.json()) as Record<string, ItemDefinition>;

      for (const [hash, def] of Object.entries(definitions)) {
        this.itemDefinitions.set(parseInt(hash), def);
      }

      this.isLoaded = true;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load manifest: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get an item definition by hash
   */
  getItemDefinition(itemHash: number): ItemDefinition | undefined {
    return this.itemDefinitions.get(itemHash);
  }

  /**
   * Get item name by hash
   */
  getItemName(itemHash: number): string {
    const def = this.itemDefinitions.get(itemHash);
    return def?.displayProperties.name ?? `Unknown Item (${itemHash})`;
  }

  /**
   * Get item type display name
   */
  getItemTypeName(itemHash: number): string {
    const def = this.itemDefinitions.get(itemHash);
    return def?.itemTypeDisplayName ?? 'Unknown';
  }

  /**
   * Get item tier name (Common, Rare, Legendary, Exotic)
   */
  getItemTierName(itemHash: number): string {
    const def = this.itemDefinitions.get(itemHash);
    return def?.inventory.tierTypeName ?? 'Unknown';
  }

  /**
   * Get item class restriction (Titan, Hunter, Warlock, or undefined for any)
   */
  getItemClassType(itemHash: number): number | undefined {
    const def = this.itemDefinitions.get(itemHash);
    // classType 3 means "all classes"
    return def?.classType !== 3 ? def?.classType : undefined;
  }

  /**
   * Check if manifest is loaded
   */
  get loaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Get manifest version
   */
  get version(): string | null {
    return this.manifestVersion;
  }

  /**
   * Get total loaded definitions count
   */
  get definitionCount(): number {
    return this.itemDefinitions.size;
  }
}
