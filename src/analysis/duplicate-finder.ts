/**
 * Duplicate Finder
 * Identifies duplicate items and recommends which to keep
 */

import { InventoryItem, ArmorSlot, DestinyClass, ARMOR_SLOT_NAMES } from '../types.js';
import { ArmorScorer, ArmorScore } from './armor-scorer.js';

export interface DuplicateGroup {
  itemHash: number;
  name: string;
  slot?: ArmorSlot;
  classType?: DestinyClass;
  items: InventoryItem[];
  recommendation: DuplicateRecommendation;
}

export interface DuplicateRecommendation {
  keep: InventoryItem[];
  discard: InventoryItem[];
  review: InventoryItem[];
  reasoning: string;
}

export interface DuplicateFinderOptions {
  includeWeapons: boolean;
  includeArmor: boolean;
  minDuplicates: number; // Minimum count to be considered duplicates
  keepCount: number; // How many of each item to keep
}

const DEFAULT_OPTIONS: DuplicateFinderOptions = {
  includeWeapons: true,
  includeArmor: true,
  minDuplicates: 2,
  keepCount: 1,
};

export class DuplicateFinder {
  private scorer: ArmorScorer;
  private options: DuplicateFinderOptions;

  constructor(options: Partial<DuplicateFinderOptions> = {}) {
    this.scorer = new ArmorScorer();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Find all duplicate items in the inventory
   */
  findDuplicates(items: InventoryItem[]): DuplicateGroup[] {
    const groups = new Map<string, InventoryItem[]>();

    for (const item of items) {
      // Filter by type
      if (item.itemType === 'weapon' && !this.options.includeWeapons) continue;
      if (item.itemType === 'armor' && !this.options.includeArmor) continue;
      if (item.itemType === 'other') continue;

      // Group by item hash (same item type)
      const key = item.itemHash.toString();
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }

    // Filter to only groups with duplicates
    const duplicateGroups: DuplicateGroup[] = [];

    for (const [hash, groupItems] of groups) {
      if (groupItems.length < this.options.minDuplicates) continue;

      const firstItem = groupItems[0];
      const recommendation = this.generateRecommendation(groupItems);

      duplicateGroups.push({
        itemHash: parseInt(hash),
        name: firstItem.name,
        slot: firstItem.armorSlot,
        classType: firstItem.classType,
        items: groupItems,
        recommendation,
      });
    }

    // Sort by number of duplicates (most first)
    return duplicateGroups.sort((a, b) => b.items.length - a.items.length);
  }

  /**
   * Generate recommendation for which duplicates to keep
   */
  private generateRecommendation(items: InventoryItem[]): DuplicateRecommendation {
    const itemType = items[0].itemType;

    if (itemType === 'armor') {
      return this.recommendArmor(items);
    } else {
      return this.recommendWeapons(items);
    }
  }

  /**
   * Recommend which armor pieces to keep
   */
  private recommendArmor(items: InventoryItem[]): DuplicateRecommendation {
    // Score all items
    const scored: Array<{ item: InventoryItem; score: ArmorScore | null }> = items.map(
      (item) => ({
        item,
        score: this.scorer.scoreArmor(item),
      })
    );

    // Separate by scoring ability
    const withScores = scored.filter((s) => s.score !== null);
    const withoutScores = scored.filter((s) => s.score === null);

    // Sort by score (highest first)
    withScores.sort((a, b) => (b.score?.totalScore ?? 0) - (a.score?.totalScore ?? 0));

    const keep: InventoryItem[] = [];
    const discard: InventoryItem[] = [];
    const review: InventoryItem[] = [];
    const reasons: string[] = [];

    // Keep the best one(s)
    for (let i = 0; i < Math.min(this.options.keepCount, withScores.length); i++) {
      const { item, score } = withScores[i];
      keep.push(item);
      reasons.push(
        `Keep ${item.name} (score: ${score?.totalScore}, stats: ${item.stats?.total})`
      );
    }

    // Process remaining scored items
    for (let i = this.options.keepCount; i < withScores.length; i++) {
      const { item, score } = withScores[i];
      const bestScore = withScores[0].score;

      // If significantly worse, recommend discard
      if (bestScore && score && bestScore.totalScore - score.totalScore > 15) {
        discard.push(item);
        reasons.push(
          `Discard ${item.name} (score: ${score.totalScore}, significantly worse than best)`
        );
      } else if (score && score.totalScore >= 60) {
        // Still good, put in review
        review.push(item);
        reasons.push(
          `Review ${item.name} (score: ${score.totalScore}, may be useful for specific builds)`
        );
      } else {
        discard.push(item);
        reasons.push(`Discard ${item.name} (score: ${score?.totalScore ?? 0}, low quality)`);
      }
    }

    // Items without scores go to review
    for (const { item } of withoutScores) {
      review.push(item);
      reasons.push(`Review ${item.name} (no stats available)`);
    }

    // Factor in protection status
    const protectedKeep: InventoryItem[] = [];
    const unprotectedDiscard: InventoryItem[] = [];

    for (const item of discard) {
      if (item.isLocked || item.isMasterworked) {
        review.push(item);
        reasons.push(
          `Moved ${item.name} to review (${item.isLocked ? 'locked' : 'masterworked'})`
        );
      } else {
        unprotectedDiscard.push(item);
      }
    }

    return {
      keep: [...keep, ...protectedKeep],
      discard: unprotectedDiscard,
      review,
      reasoning: reasons.join('\n'),
    };
  }

  /**
   * Recommend which weapons to keep
   */
  private recommendWeapons(items: InventoryItem[]): DuplicateRecommendation {
    // For weapons, prioritize: masterworked > locked > highest power
    const sorted = [...items].sort((a, b) => {
      // Masterworked first
      if (a.isMasterworked !== b.isMasterworked) {
        return a.isMasterworked ? -1 : 1;
      }
      // Then locked
      if (a.isLocked !== b.isLocked) {
        return a.isLocked ? -1 : 1;
      }
      // Then by power level
      return b.powerLevel - a.powerLevel;
    });

    const keep = sorted.slice(0, this.options.keepCount);
    const remaining = sorted.slice(this.options.keepCount);

    const discard: InventoryItem[] = [];
    const review: InventoryItem[] = [];

    for (const item of remaining) {
      if (item.isLocked || item.isMasterworked) {
        review.push(item);
      } else {
        discard.push(item);
      }
    }

    const reasoning = [
      `Keep ${keep.map((i) => `${i.name} (PL: ${i.powerLevel}${i.isMasterworked ? ', MW' : ''})`).join(', ')}`,
      discard.length > 0
        ? `Discard ${discard.length} lower-priority duplicates`
        : '',
      review.length > 0
        ? `Review ${review.length} items (locked or masterworked)`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    return { keep, discard, review, reasoning };
  }

  /**
   * Get summary of all duplicates
   */
  getSummary(groups: DuplicateGroup[]): {
    totalGroups: number;
    totalDuplicates: number;
    totalDiscard: number;
    totalReview: number;
    bySlot: Map<ArmorSlot, number>;
  } {
    const bySlot = new Map<ArmorSlot, number>();
    let totalDuplicates = 0;
    let totalDiscard = 0;
    let totalReview = 0;

    for (const group of groups) {
      totalDuplicates += group.items.length - 1; // Don't count the one we keep
      totalDiscard += group.recommendation.discard.length;
      totalReview += group.recommendation.review.length;

      if (group.slot) {
        bySlot.set(group.slot, (bySlot.get(group.slot) ?? 0) + group.items.length);
      }
    }

    return {
      totalGroups: groups.length,
      totalDuplicates,
      totalDiscard,
      totalReview,
      bySlot,
    };
  }

  /**
   * Format duplicate group for display
   */
  formatGroup(group: DuplicateGroup): string {
    const lines: string[] = [];
    const slotName = group.slot ? ARMOR_SLOT_NAMES[group.slot] : '';

    lines.push(`\n## ${group.name} ${slotName ? `(${slotName})` : ''} - ${group.items.length} copies`);
    lines.push('');

    if (group.recommendation.keep.length > 0) {
      lines.push('**KEEP:**');
      for (const item of group.recommendation.keep) {
        const stats = item.stats ? ` [${item.stats.total} total]` : '';
        const flags = [
          item.isLocked ? '🔒' : '',
          item.isMasterworked ? '⭐' : '',
        ].filter(Boolean).join('');
        lines.push(`  - ${item.itemInstanceId}${stats} ${flags}`);
      }
    }

    if (group.recommendation.discard.length > 0) {
      lines.push('**DISCARD:**');
      for (const item of group.recommendation.discard) {
        const stats = item.stats ? ` [${item.stats.total} total]` : '';
        lines.push(`  - ${item.itemInstanceId}${stats}`);
      }
    }

    if (group.recommendation.review.length > 0) {
      lines.push('**REVIEW:**');
      for (const item of group.recommendation.review) {
        const stats = item.stats ? ` [${item.stats.total} total]` : '';
        const flags = [
          item.isLocked ? '🔒' : '',
          item.isMasterworked ? '⭐' : '',
        ].filter(Boolean).join('');
        lines.push(`  - ${item.itemInstanceId}${stats} ${flags}`);
      }
    }

    return lines.join('\n');
  }
}
