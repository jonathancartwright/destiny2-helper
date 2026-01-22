/**
 * Core type definitions for Destiny 2 Vault Curator
 */

// Bungie API membership types
export enum BungieMembershipType {
  None = 0,
  TigerXbox = 1,
  TigerPsn = 2,
  TigerSteam = 3,
  TigerBlizzard = 4,
  TigerStadia = 5,
  TigerEgs = 6,
  TigerDemon = 10,
  BungieNext = 254,
  All = -1,
}

// Item bucket locations
export enum ItemLocation {
  Unknown = 0,
  Inventory = 1,
  Vault = 2,
  Vendor = 3,
  Postmaster = 4,
}

// Destiny item tiers
export enum ItemTier {
  Unknown = 0,
  Currency = 1,
  Basic = 2,
  Common = 3,
  Rare = 4,
  Legendary = 5,
  Exotic = 6,
}

// Armor stat types
export enum ArmorStat {
  Mobility = 2996146975,
  Resilience = 392767087,
  Recovery = 1943323491,
  Discipline = 1735777505,
  Intellect = 144602215,
  Strength = 4244567218,
}

export const ARMOR_STAT_NAMES: Record<number, string> = {
  [ArmorStat.Mobility]: 'Mobility',
  [ArmorStat.Resilience]: 'Resilience',
  [ArmorStat.Recovery]: 'Recovery',
  [ArmorStat.Discipline]: 'Discipline',
  [ArmorStat.Intellect]: 'Intellect',
  [ArmorStat.Strength]: 'Strength',
};

// Armor slot types
export enum ArmorSlot {
  Helmet = 3448274439,
  Gauntlets = 3551918588,
  Chest = 14239492,
  Legs = 20886954,
  ClassItem = 1585787867,
}

export const ARMOR_SLOT_NAMES: Record<number, string> = {
  [ArmorSlot.Helmet]: 'Helmet',
  [ArmorSlot.Gauntlets]: 'Gauntlets',
  [ArmorSlot.Chest]: 'Chest Armor',
  [ArmorSlot.Legs]: 'Leg Armor',
  [ArmorSlot.ClassItem]: 'Class Item',
};

// Character classes
export enum DestinyClass {
  Titan = 0,
  Hunter = 1,
  Warlock = 2,
  Unknown = 3,
}

export const CLASS_NAMES: Record<number, string> = {
  [DestinyClass.Titan]: 'Titan',
  [DestinyClass.Hunter]: 'Hunter',
  [DestinyClass.Warlock]: 'Warlock',
  [DestinyClass.Unknown]: 'Unknown',
};

// Core item representation
export interface InventoryItem {
  itemInstanceId: string;
  itemHash: number;
  name: string;
  itemType: 'weapon' | 'armor' | 'other';
  tier: ItemTier;
  location: ItemLocation;
  characterId?: string;
  isEquipped: boolean;
  isLocked: boolean;
  isMasterworked: boolean;
  powerLevel: number;

  // Armor-specific
  armorSlot?: ArmorSlot;
  classType?: DestinyClass;
  stats?: ArmorStats;

  // Weapon-specific
  damageType?: number;
  weaponType?: string;
}

// Armor stats breakdown
export interface ArmorStats {
  mobility: number;
  resilience: number;
  recovery: number;
  discipline: number;
  intellect: number;
  strength: number;
  total: number;
}

// Character representation
export interface Character {
  characterId: string;
  classType: DestinyClass;
  light: number;
  emblemPath?: string;
}

// Vault/inventory summary
export interface VaultSummary {
  totalItems: number;
  weapons: number;
  armor: number;
  other: number;
  vaultCapacity: number;
  vaultUsedPercent: number;
}

// Cleanup recommendation
export interface CleanupRecommendation {
  item: InventoryItem;
  action: 'KEEP' | 'REVIEW' | 'JUNK';
  reason: string;
  score?: number;
  protectedBy?: string[]; // e.g., ['DIM Loadout: PvP Build', 'Masterworked']
}

// Cleanup plan
export interface CleanupPlan {
  generatedAt: Date;
  summary: {
    totalAnalyzed: number;
    keep: number;
    review: number;
    junk: number;
    protectedItems: number;
  };
  recommendations: CleanupRecommendation[];
}

// DIM loadout reference
export interface DIMLoadout {
  id: string;
  name: string;
  classType: DestinyClass;
  itemIds: string[]; // item instance IDs
}

// DIM backup structure (simplified)
export interface DIMBackup {
  loadouts: DIMLoadout[];
  tags: Map<string, string>; // itemInstanceId -> tag
  notes: Map<string, string>; // itemInstanceId -> note
}

// Protection rules configuration
export interface ProtectionRules {
  protectDIMLoadouts: boolean;
  protectLockedItems: boolean;
  protectMasterworked: boolean;
  protectExotics: boolean;
  protectHighStatArmor: boolean;
  highStatThreshold: number; // e.g., 65 total stats
  customProtectedIds: string[];
}

// Transfer request
export interface TransferRequest {
  itemInstanceId: string;
  targetCharacterId: string; // or 'vault'
  itemHash: number;
  stackSize?: number;
}

// API response wrapper
export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
