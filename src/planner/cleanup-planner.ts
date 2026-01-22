/**
 * Vault Cleanup Planner
 * Generates safe cleanup recommendations with DIM build protection
 */

import {
  InventoryItem,
  CleanupPlan,
  CleanupRecommendation,
  ProtectionRules,
  ItemLocation,
  ItemTier,
  Character,
} from '../types.js';
import { DIMParser } from '../dim/parser.js';
import { ArmorScorer } from '../analysis/armor-scorer.js';
import { DuplicateFinder, DuplicateGroup } from '../analysis/duplicate-finder.js';

const DEFAULT_PROTECTION_RULES: ProtectionRules = {
  protectDIMLoadouts: true,
  protectLockedItems: true,
  protectMasterworked: true,
  protectExotics: true,
  protectHighStatArmor: true,
  highStatThreshold: 65,
  customProtectedIds: [],
};

export interface CleanupPlannerConfig {
  protectionRules: ProtectionRules;
  includeCharacterInventory: boolean;
  onlyVault: boolean;
}

export class CleanupPlanner {
  private dimParser: DIMParser;
  private armorScorer: ArmorScorer;
  private duplicateFinder: DuplicateFinder;
  private protectionRules: ProtectionRules;
  private config: CleanupPlannerConfig;

  constructor(
    dimParser: DIMParser,
    config: Partial<CleanupPlannerConfig> = {}
  ) {
    this.dimParser = dimParser;
    this.armorScorer = new ArmorScorer();
    this.duplicateFinder = new DuplicateFinder();
    this.protectionRules = config.protectionRules ?? DEFAULT_PROTECTION_RULES;
    this.config = {
      protectionRules: this.protectionRules,
      includeCharacterInventory: config.includeCharacterInventory ?? false,
      onlyVault: config.onlyVault ?? true,
    };
  }

  /**
   * Generate a cleanup plan for the given inventory
   */
  generatePlan(items: InventoryItem[]): CleanupPlan {
    // Filter items based on config
    const targetItems = items.filter((item) => {
      if (this.config.onlyVault && item.location !== ItemLocation.Vault) {
        return false;
      }
      // Only analyze weapons and armor
      return item.itemType === 'weapon' || item.itemType === 'armor';
    });

    const recommendations: CleanupRecommendation[] = [];

    for (const item of targetItems) {
      const recommendation = this.analyzeItem(item, targetItems);
      recommendations.push(recommendation);
    }

    // Sort: JUNK first, then REVIEW, then KEEP
    recommendations.sort((a, b) => {
      const order = { JUNK: 0, REVIEW: 1, KEEP: 2 };
      return order[a.action] - order[b.action];
    });

    const summary = {
      totalAnalyzed: recommendations.length,
      keep: recommendations.filter((r) => r.action === 'KEEP').length,
      review: recommendations.filter((r) => r.action === 'REVIEW').length,
      junk: recommendations.filter((r) => r.action === 'JUNK').length,
      protectedItems: recommendations.filter((r) => r.protectedBy && r.protectedBy.length > 0).length,
    };

    return {
      generatedAt: new Date(),
      summary,
      recommendations,
    };
  }

  /**
   * Analyze a single item and generate a recommendation
   */
  private analyzeItem(
    item: InventoryItem,
    allItems: InventoryItem[]
  ): CleanupRecommendation {
    const protectedBy: string[] = [];
    const reasons: string[] = [];

    // Check protection rules
    if (this.protectionRules.protectDIMLoadouts && this.dimParser.loaded) {
      const loadouts = this.dimParser.getLoadoutsForItem(item.itemInstanceId);
      if (loadouts.length > 0) {
        protectedBy.push(`DIM Loadouts: ${loadouts.map((l) => l.name).join(', ')}`);
      }
    }

    if (this.protectionRules.protectLockedItems && item.isLocked) {
      protectedBy.push('Locked in game');
    }

    if (this.protectionRules.protectMasterworked && item.isMasterworked) {
      protectedBy.push('Masterworked');
    }

    if (this.protectionRules.protectExotics && item.tier === ItemTier.Exotic) {
      protectedBy.push('Exotic item');
    }

    if (this.protectionRules.customProtectedIds.includes(item.itemInstanceId)) {
      protectedBy.push('Custom protection');
    }

    // Check DIM tags
    if (this.dimParser.loaded) {
      const tag = this.dimParser.getTag(item.itemInstanceId);
      if (tag === 'favorite') {
        protectedBy.push('DIM Favorite');
      } else if (tag === 'keep') {
        protectedBy.push('DIM Keep tag');
      } else if (tag === 'junk') {
        reasons.push('Tagged as junk in DIM');
      }
    }

    // If item is protected, it's always KEEP
    if (protectedBy.length > 0) {
      return {
        item,
        action: 'KEEP',
        reason: `Protected: ${protectedBy.join(', ')}`,
        protectedBy,
      };
    }

    // Analyze based on item type
    if (item.itemType === 'armor') {
      return this.analyzeArmor(item, allItems, reasons);
    } else {
      return this.analyzeWeapon(item, allItems, reasons);
    }
  }

  /**
   * Analyze armor piece
   */
  private analyzeArmor(
    item: InventoryItem,
    allItems: InventoryItem[],
    existingReasons: string[]
  ): CleanupRecommendation {
    const reasons = [...existingReasons];
    let score: number | undefined;

    // Score the armor
    const armorScore = this.armorScorer.scoreArmor(item);
    if (armorScore) {
      score = armorScore.totalScore;

      // Check high stat protection
      if (
        this.protectionRules.protectHighStatArmor &&
        item.stats &&
        item.stats.total >= this.protectionRules.highStatThreshold
      ) {
        return {
          item,
          action: 'KEEP',
          reason: `High stat armor (${item.stats.total} total)`,
          score,
          protectedBy: [`High stats: ${item.stats.total} total`],
        };
      }

      // Evaluate based on score
      if (score >= 75) {
        reasons.push(`Excellent armor score: ${score}/100`);
        return { item, action: 'KEEP', reason: reasons.join('. '), score };
      } else if (score >= 50) {
        reasons.push(`Decent armor score: ${score}/100`);
        // Check if there's a better duplicate
        const hasBetterDupe = this.hasBetterDuplicate(item, allItems);
        if (hasBetterDupe) {
          reasons.push('Better duplicate exists');
          return { item, action: 'REVIEW', reason: reasons.join('. '), score };
        }
        return { item, action: 'KEEP', reason: reasons.join('. '), score };
      } else if (score >= 30) {
        reasons.push(`Below average armor score: ${score}/100`);
        return { item, action: 'REVIEW', reason: reasons.join('. '), score };
      } else {
        reasons.push(`Poor armor score: ${score}/100`);
        return { item, action: 'JUNK', reason: reasons.join('. '), score };
      }
    }

    // No stats available
    reasons.push('Unable to score (no stats)');
    return { item, action: 'REVIEW', reason: reasons.join('. ') };
  }

  /**
   * Analyze weapon
   */
  private analyzeWeapon(
    item: InventoryItem,
    allItems: InventoryItem[],
    existingReasons: string[]
  ): CleanupRecommendation {
    const reasons = [...existingReasons];

    // Check for duplicates
    const duplicates = allItems.filter(
      (i) => i.itemHash === item.itemHash && i.itemInstanceId !== item.itemInstanceId
    );

    if (duplicates.length === 0) {
      reasons.push('Only copy of this weapon');
      return { item, action: 'KEEP', reason: reasons.join('. ') };
    }

    // Check if this is the best duplicate
    const allCopies = [item, ...duplicates];
    const sorted = allCopies.sort((a, b) => {
      // Prefer masterworked
      if (a.isMasterworked !== b.isMasterworked) {
        return a.isMasterworked ? -1 : 1;
      }
      // Then locked
      if (a.isLocked !== b.isLocked) {
        return a.isLocked ? -1 : 1;
      }
      // Then highest power
      return b.powerLevel - a.powerLevel;
    });

    const bestCopy = sorted[0];

    if (bestCopy.itemInstanceId === item.itemInstanceId) {
      reasons.push(`Best copy among ${allCopies.length} duplicates`);
      return { item, action: 'KEEP', reason: reasons.join('. ') };
    } else {
      reasons.push(`Duplicate (${duplicates.length} others exist)`);
      reasons.push('Not the best copy');
      return { item, action: 'JUNK', reason: reasons.join('. ') };
    }
  }

  /**
   * Check if there's a better duplicate of this armor piece
   */
  private hasBetterDuplicate(
    item: InventoryItem,
    allItems: InventoryItem[]
  ): boolean {
    const duplicates = allItems.filter(
      (i) =>
        i.itemHash === item.itemHash &&
        i.itemInstanceId !== item.itemInstanceId &&
        i.itemType === 'armor'
    );

    if (duplicates.length === 0) return false;

    const itemScore = this.armorScorer.scoreArmor(item);
    if (!itemScore) return false;

    for (const dupe of duplicates) {
      const dupeScore = this.armorScorer.scoreArmor(dupe);
      if (dupeScore && dupeScore.totalScore > itemScore.totalScore + 10) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all items recommended as JUNK
   */
  getJunkItems(plan: CleanupPlan): InventoryItem[] {
    return plan.recommendations
      .filter((r) => r.action === 'JUNK')
      .map((r) => r.item);
  }

  /**
   * Get items that need review
   */
  getReviewItems(plan: CleanupPlan): InventoryItem[] {
    return plan.recommendations
      .filter((r) => r.action === 'REVIEW')
      .map((r) => r.item);
  }

  /**
   * Generate a transfer plan to move junk to a specific character
   */
  generateTransferPlan(
    plan: CleanupPlan,
    targetCharacterId: string
  ): Array<{ itemInstanceId: string; itemHash: number }> {
    const junkItems = this.getJunkItems(plan);

    return junkItems
      .filter((item) => item.location === ItemLocation.Vault)
      .map((item) => ({
        itemInstanceId: item.itemInstanceId,
        itemHash: item.itemHash,
      }));
  }

  /**
   * Format the cleanup plan for display
   */
  formatPlan(plan: CleanupPlan): string {
    const lines: string[] = [];

    lines.push('# Vault Cleanup Plan');
    lines.push(`Generated: ${plan.generatedAt.toISOString()}`);
    lines.push('');
    lines.push('## Summary');
    lines.push(`- Total analyzed: ${plan.summary.totalAnalyzed}`);
    lines.push(`- Keep: ${plan.summary.keep}`);
    lines.push(`- Review: ${plan.summary.review}`);
    lines.push(`- Junk: ${plan.summary.junk}`);
    lines.push(`- Protected items: ${plan.summary.protectedItems}`);
    lines.push('');

    if (plan.summary.junk > 0) {
      lines.push('## JUNK (Safe to Dismantle)');
      for (const rec of plan.recommendations.filter((r) => r.action === 'JUNK')) {
        const stats = rec.item.stats ? ` [${rec.item.stats.total} stats]` : '';
        lines.push(`- ${rec.item.name}${stats}`);
        lines.push(`  Reason: ${rec.reason}`);
      }
      lines.push('');
    }

    if (plan.summary.review > 0) {
      lines.push('## REVIEW (Need Manual Decision)');
      for (const rec of plan.recommendations.filter((r) => r.action === 'REVIEW')) {
        const stats = rec.item.stats ? ` [${rec.item.stats.total} stats]` : '';
        lines.push(`- ${rec.item.name}${stats}`);
        lines.push(`  Reason: ${rec.reason}`);
      }
      lines.push('');
    }

    lines.push('## KEEP');
    lines.push(`${plan.summary.keep} items protected or high quality`);

    return lines.join('\n');
  }

  /**
   * Update protection rules
   */
  updateProtectionRules(rules: Partial<ProtectionRules>): void {
    this.protectionRules = { ...this.protectionRules, ...rules };
    this.config.protectionRules = this.protectionRules;
  }
}
