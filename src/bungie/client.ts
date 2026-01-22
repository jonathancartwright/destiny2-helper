/**
 * Bungie API Client
 * Handles authentication and API requests to Bungie.net
 */

import {
  ApiResult,
  BungieMembershipType,
  Character,
  DestinyClass,
  InventoryItem,
  ItemLocation,
  ItemTier,
  ArmorStats,
  ArmorSlot,
  TransferRequest,
} from '../types.js';

const BUNGIE_API_BASE = 'https://www.bungie.net/Platform';

interface BungieApiResponse<T> {
  Response: T;
  ErrorCode: number;
  ThrottleSeconds: number;
  ErrorStatus: string;
  Message: string;
}

export interface BungieClientConfig {
  apiKey: string;
  accessToken?: string;
  membershipType?: BungieMembershipType;
  membershipId?: string;
}

export class BungieClient {
  private config: BungieClientConfig;
  private manifestCache: Map<string, unknown> = new Map();

  constructor(config: BungieClientConfig) {
    this.config = config;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {
      'X-API-Key': this.config.apiKey,
      'Content-Type': 'application/json',
    };

    if (this.config.accessToken) {
      headers['Authorization'] = `Bearer ${this.config.accessToken}`;
    }

    try {
      const response = await fetch(`${BUNGIE_API_BASE}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers },
      });

      const json = (await response.json()) as BungieApiResponse<T>;

      if (json.ErrorCode !== 1) {
        return {
          success: false,
          error: `Bungie API Error: ${json.Message} (${json.ErrorStatus})`,
        };
      }

      return { success: true, data: json.Response };
    } catch (error) {
      return {
        success: false,
        error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get the current user's Bungie.net membership info
   */
  async getCurrentUser(): Promise<
    ApiResult<{ membershipType: BungieMembershipType; membershipId: string }>
  > {
    const result = await this.request<{
      destinyMemberships: Array<{
        membershipType: number;
        membershipId: string;
        displayName: string;
      }>;
      primaryMembershipId?: string;
    }>('/User/GetMembershipsForCurrentUser/');

    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }

    const memberships = result.data.destinyMemberships;
    if (memberships.length === 0) {
      return { success: false, error: 'No Destiny memberships found' };
    }

    // Prefer primary membership, otherwise use first one
    const primary =
      memberships.find(
        (m) => m.membershipId === result.data!.primaryMembershipId
      ) || memberships[0];

    return {
      success: true,
      data: {
        membershipType: primary.membershipType as BungieMembershipType,
        membershipId: primary.membershipId,
      },
    };
  }

  /**
   * Get the Destiny manifest for item definitions
   */
  async getManifest(): Promise<ApiResult<{ version: string; jsonWorldComponentContentPaths: Record<string, Record<string, string>> }>> {
    return this.request('/Destiny2/Manifest/');
  }

  /**
   * Get all characters for the current profile
   */
  async getCharacters(): Promise<ApiResult<Character[]>> {
    if (!this.config.membershipType || !this.config.membershipId) {
      return { success: false, error: 'Membership info not configured' };
    }

    const result = await this.request<{
      characters: {
        data: Record<
          string,
          {
            characterId: string;
            classType: number;
            light: number;
            emblemPath: string;
          }
        >;
      };
    }>(
      `/Destiny2/${this.config.membershipType}/Profile/${this.config.membershipId}/?components=200`
    );

    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }

    const characters: Character[] = Object.values(
      result.data.characters.data
    ).map((c) => ({
      characterId: c.characterId,
      classType: c.classType as DestinyClass,
      light: c.light,
      emblemPath: c.emblemPath,
    }));

    return { success: true, data: characters };
  }

  /**
   * Get full inventory (vault + all characters)
   */
  async getFullInventory(): Promise<ApiResult<InventoryItem[]>> {
    if (!this.config.membershipType || !this.config.membershipId) {
      return { success: false, error: 'Membership info not configured' };
    }

    // Components: 102 = ProfileInventories (vault), 201 = CharacterInventories,
    // 205 = CharacterEquipment, 300 = ItemInstances, 304 = ItemStats, 305 = ItemSockets
    const result = await this.request<{
      profileInventory: { data: { items: RawInventoryItem[] } };
      characterInventories: { data: Record<string, { items: RawInventoryItem[] }> };
      characterEquipment: { data: Record<string, { items: RawInventoryItem[] }> };
      itemComponents: {
        instances: { data: Record<string, ItemInstance> };
        stats: { data: Record<string, { stats: Record<string, { value: number }> }> };
      };
    }>(
      `/Destiny2/${this.config.membershipType}/Profile/${this.config.membershipId}/?components=102,201,205,300,304`
    );

    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }

    const items: InventoryItem[] = [];
    const instances = result.data.itemComponents.instances.data;
    const statsData = result.data.itemComponents.stats.data;

    // Process vault items
    for (const rawItem of result.data.profileInventory.data.items) {
      const item = this.processRawItem(rawItem, instances, statsData, ItemLocation.Vault);
      if (item) items.push(item);
    }

    // Process character inventories and equipment
    for (const [characterId, inventory] of Object.entries(
      result.data.characterInventories.data
    )) {
      for (const rawItem of inventory.items) {
        const item = this.processRawItem(
          rawItem,
          instances,
          statsData,
          ItemLocation.Inventory,
          characterId,
          false
        );
        if (item) items.push(item);
      }
    }

    for (const [characterId, equipment] of Object.entries(
      result.data.characterEquipment.data
    )) {
      for (const rawItem of equipment.items) {
        const item = this.processRawItem(
          rawItem,
          instances,
          statsData,
          ItemLocation.Inventory,
          characterId,
          true
        );
        if (item) items.push(item);
      }
    }

    return { success: true, data: items };
  }

  private processRawItem(
    rawItem: RawInventoryItem,
    instances: Record<string, ItemInstance>,
    statsData: Record<string, { stats: Record<string, { value: number }> }>,
    location: ItemLocation,
    characterId?: string,
    isEquipped = false
  ): InventoryItem | null {
    const instanceId = rawItem.itemInstanceId;
    if (!instanceId) return null; // Skip non-instanced items (materials, etc.)

    const instance = instances[instanceId];
    if (!instance) return null;

    // Determine item type based on bucket hash
    const itemType = this.getItemType(rawItem.bucketHash);
    if (itemType === 'other') return null; // Skip non-weapon/armor for now

    // Get armor stats if applicable
    let stats: ArmorStats | undefined;
    if (itemType === 'armor' && statsData[instanceId]) {
      stats = this.extractArmorStats(statsData[instanceId].stats);
    }

    return {
      itemInstanceId: instanceId,
      itemHash: rawItem.itemHash,
      name: `Item ${rawItem.itemHash}`, // Will be resolved from manifest
      itemType,
      tier: (instance.quality?.currentProgress ?? 0) > 0 ? ItemTier.Legendary : ItemTier.Rare,
      location,
      characterId,
      isEquipped,
      isLocked: rawItem.state === 1,
      isMasterworked: (instance.energy?.energyCapacity ?? 0) >= 10,
      powerLevel: instance.primaryStat?.value ?? 0,
      armorSlot: itemType === 'armor' ? this.getArmorSlot(rawItem.bucketHash) : undefined,
      stats,
    };
  }

  private getItemType(bucketHash: number): 'weapon' | 'armor' | 'other' {
    // Weapon bucket hashes
    const weaponBuckets = [
      1498876634, // Kinetic
      2465295065, // Energy
      953998645, // Power
    ];

    // Armor bucket hashes
    const armorBuckets = [
      3448274439, // Helmet
      3551918588, // Gauntlets
      14239492, // Chest
      20886954, // Legs
      1585787867, // Class Item
    ];

    if (weaponBuckets.includes(bucketHash)) return 'weapon';
    if (armorBuckets.includes(bucketHash)) return 'armor';
    return 'other';
  }

  private getArmorSlot(bucketHash: number): ArmorSlot | undefined {
    const slotMap: Record<number, ArmorSlot> = {
      3448274439: ArmorSlot.Helmet,
      3551918588: ArmorSlot.Gauntlets,
      14239492: ArmorSlot.Chest,
      20886954: ArmorSlot.Legs,
      1585787867: ArmorSlot.ClassItem,
    };
    return slotMap[bucketHash];
  }

  private extractArmorStats(
    stats: Record<string, { value: number }>
  ): ArmorStats {
    const getStatValue = (hash: number): number => {
      return stats[hash.toString()]?.value ?? 0;
    };

    const mobility = getStatValue(2996146975);
    const resilience = getStatValue(392767087);
    const recovery = getStatValue(1943323491);
    const discipline = getStatValue(1735777505);
    const intellect = getStatValue(144602215);
    const strength = getStatValue(4244567218);

    return {
      mobility,
      resilience,
      recovery,
      discipline,
      intellect,
      strength,
      total: mobility + resilience + recovery + discipline + intellect + strength,
    };
  }

  /**
   * Transfer an item between vault and character
   */
  async transferItem(request: TransferRequest): Promise<ApiResult<void>> {
    if (!this.config.membershipType || !this.config.membershipId) {
      return { success: false, error: 'Membership info not configured' };
    }

    const isToVault = request.targetCharacterId === 'vault';

    return this.request('/Destiny2/Actions/Items/TransferItem/', {
      method: 'POST',
      body: JSON.stringify({
        itemReferenceHash: request.itemHash,
        stackSize: request.stackSize ?? 1,
        transferToVault: isToVault,
        itemId: request.itemInstanceId,
        characterId: isToVault ? undefined : request.targetCharacterId,
        membershipType: this.config.membershipType,
      }),
    });
  }

  /**
   * Set the locked state of an item
   */
  async setLockState(
    itemInstanceId: string,
    characterId: string,
    locked: boolean
  ): Promise<ApiResult<void>> {
    if (!this.config.membershipType) {
      return { success: false, error: 'Membership info not configured' };
    }

    return this.request('/Destiny2/Actions/Items/SetLockState/', {
      method: 'POST',
      body: JSON.stringify({
        state: locked,
        itemId: itemInstanceId,
        characterId,
        membershipType: this.config.membershipType,
      }),
    });
  }

  /**
   * Update configuration with new tokens/membership info
   */
  updateConfig(updates: Partial<BungieClientConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Raw item structure from Bungie API
interface RawInventoryItem {
  itemHash: number;
  itemInstanceId?: string;
  bucketHash: number;
  state: number;
}

interface ItemInstance {
  primaryStat?: { value: number };
  quality?: { currentProgress: number };
  energy?: { energyCapacity: number };
}
