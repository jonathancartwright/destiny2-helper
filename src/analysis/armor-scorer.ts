/**
 * Armor Scoring Engine
 * Evaluates armor pieces based on stat distributions and use cases
 */

import {
  InventoryItem,
  ArmorStats,
  ArmorSlot,
  DestinyClass,
  ARMOR_SLOT_NAMES,
  CLASS_NAMES,
} from '../types.js';

// Stat distribution profiles for different builds
export interface StatProfile {
  name: string;
  description: string;
  weights: {
    mobility: number;
    resilience: number;
    recovery: number;
    discipline: number;
    intellect: number;
    strength: number;
  };
}

// Predefined stat profiles for common builds
export const STAT_PROFILES: Record<string, StatProfile> = {
  pvp_hunter: {
    name: 'PvP Hunter',
    description: 'High mobility and recovery for Crucible',
    weights: { mobility: 1.5, resilience: 1.2, recovery: 1.3, discipline: 0.8, intellect: 0.7, strength: 0.5 },
  },
  pvp_titan: {
    name: 'PvP Titan',
    description: 'High resilience with recovery focus',
    weights: { mobility: 0.5, resilience: 1.5, recovery: 1.3, discipline: 0.8, intellect: 0.7, strength: 0.7 },
  },
  pvp_warlock: {
    name: 'PvP Warlock',
    description: 'Recovery focused with resilience',
    weights: { mobility: 0.5, resilience: 1.3, recovery: 1.5, discipline: 0.9, intellect: 0.7, strength: 0.5 },
  },
  pve_ability: {
    name: 'PvE Ability Spam',
    description: 'Maximum ability regeneration',
    weights: { mobility: 0.3, resilience: 1.0, recovery: 0.8, discipline: 1.5, intellect: 0.5, strength: 1.3 },
  },
  pve_balanced: {
    name: 'PvE Balanced',
    description: 'Well-rounded for general PvE',
    weights: { mobility: 0.5, resilience: 1.2, recovery: 1.0, discipline: 1.2, intellect: 0.6, strength: 0.8 },
  },
  gm_nightfall: {
    name: 'GM Nightfall',
    description: 'Survival focused with discipline',
    weights: { mobility: 0.3, resilience: 1.5, recovery: 1.2, discipline: 1.3, intellect: 0.5, strength: 0.5 },
  },
};

export interface ArmorScore {
  totalScore: number;
  profileScores: Map<string, number>;
  bestProfile: string;
  bestProfileScore: number;
  analysis: ArmorAnalysis;
}

export interface ArmorAnalysis {
  totalStats: number;
  hasSpike: boolean; // 20+ in any single stat
  hasSuperSpike: boolean; // 26+ in any single stat
  topStats: Array<{ stat: string; value: number }>;
  weakStats: Array<{ stat: string; value: number }>;
  isWellDistributed: boolean;
  artificeSlot: boolean;
}

export class ArmorScorer {
  private profiles: Map<string, StatProfile>;
  private customThresholds = {
    minTotalStats: 60,
    goodTotalStats: 65,
    excellentTotalStats: 68,
    spikeThreshold: 20,
    superSpikeThreshold: 26,
    weakStatThreshold: 6,
  };

  constructor() {
    this.profiles = new Map(Object.entries(STAT_PROFILES));
  }

  /**
   * Add a custom stat profile
   */
  addProfile(id: string, profile: StatProfile): void {
    this.profiles.set(id, profile);
  }

  /**
   * Score a piece of armor
   */
  scoreArmor(item: InventoryItem): ArmorScore | null {
    if (item.itemType !== 'armor' || !item.stats) {
      return null;
    }

    const analysis = this.analyzeStats(item.stats);
    const profileScores = new Map<string, number>();

    let bestProfile = '';
    let bestProfileScore = 0;

    for (const [id, profile] of this.profiles) {
      const score = this.calculateProfileScore(item.stats, profile);
      profileScores.set(id, score);

      if (score > bestProfileScore) {
        bestProfileScore = score;
        bestProfile = id;
      }
    }

    // Calculate overall score based on multiple factors
    const totalScore = this.calculateTotalScore(item.stats, analysis);

    return {
      totalScore,
      profileScores,
      bestProfile,
      bestProfileScore,
      analysis,
    };
  }

  /**
   * Analyze armor stats distribution
   */
  private analyzeStats(stats: ArmorStats): ArmorAnalysis {
    const statValues = [
      { stat: 'Mobility', value: stats.mobility },
      { stat: 'Resilience', value: stats.resilience },
      { stat: 'Recovery', value: stats.recovery },
      { stat: 'Discipline', value: stats.discipline },
      { stat: 'Intellect', value: stats.intellect },
      { stat: 'Strength', value: stats.strength },
    ];

    const sorted = [...statValues].sort((a, b) => b.value - a.value);
    const topStats = sorted.slice(0, 2);
    const weakStats = statValues.filter(
      (s) => s.value <= this.customThresholds.weakStatThreshold
    );

    const hasSpike = statValues.some(
      (s) => s.value >= this.customThresholds.spikeThreshold
    );
    const hasSuperSpike = statValues.some(
      (s) => s.value >= this.customThresholds.superSpikeThreshold
    );

    // Well distributed = no stat below 6 and reasonable spread
    const minStat = Math.min(...statValues.map((s) => s.value));
    const maxStat = Math.max(...statValues.map((s) => s.value));
    const isWellDistributed = minStat >= 6 && maxStat - minStat <= 15;

    return {
      totalStats: stats.total,
      hasSpike,
      hasSuperSpike,
      topStats,
      weakStats,
      isWellDistributed,
      artificeSlot: false, // Would need manifest data to determine
    };
  }

  /**
   * Calculate score for a specific stat profile
   */
  private calculateProfileScore(stats: ArmorStats, profile: StatProfile): number {
    const weights = profile.weights;

    const weightedSum =
      stats.mobility * weights.mobility +
      stats.resilience * weights.resilience +
      stats.recovery * weights.recovery +
      stats.discipline * weights.discipline +
      stats.intellect * weights.intellect +
      stats.strength * weights.strength;

    const totalWeight =
      weights.mobility +
      weights.resilience +
      weights.recovery +
      weights.discipline +
      weights.intellect +
      weights.strength;

    return Math.round((weightedSum / totalWeight) * 10) / 10;
  }

  /**
   * Calculate overall armor score
   */
  private calculateTotalScore(stats: ArmorStats, analysis: ArmorAnalysis): number {
    let score = 0;

    // Base score from total stats (0-40 points)
    if (stats.total >= this.customThresholds.excellentTotalStats) {
      score += 40;
    } else if (stats.total >= this.customThresholds.goodTotalStats) {
      score += 30;
    } else if (stats.total >= this.customThresholds.minTotalStats) {
      score += 20;
    } else {
      score += Math.max(0, (stats.total / this.customThresholds.minTotalStats) * 20);
    }

    // Spike bonus (0-30 points)
    if (analysis.hasSuperSpike) {
      score += 30;
    } else if (analysis.hasSpike) {
      score += 20;
    }

    // Distribution bonus (0-15 points)
    if (analysis.isWellDistributed) {
      score += 15;
    }

    // Penalty for weak stats (-5 points each, max -15)
    score -= Math.min(analysis.weakStats.length * 5, 15);

    // Bonus for high top stats (0-15 points)
    const topStatSum = analysis.topStats.reduce((sum, s) => sum + s.value, 0);
    if (topStatSum >= 45) {
      score += 15;
    } else if (topStatSum >= 40) {
      score += 10;
    } else if (topStatSum >= 35) {
      score += 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Compare two armor pieces
   */
  compareArmor(
    item1: InventoryItem,
    item2: InventoryItem
  ): {
    winner: InventoryItem | null;
    reason: string;
    score1: ArmorScore | null;
    score2: ArmorScore | null;
  } {
    const score1 = this.scoreArmor(item1);
    const score2 = this.scoreArmor(item2);

    if (!score1 && !score2) {
      return { winner: null, reason: 'Neither item has stats', score1, score2 };
    }
    if (!score1) {
      return { winner: item2, reason: 'First item has no stats', score1, score2 };
    }
    if (!score2) {
      return { winner: item1, reason: 'Second item has no stats', score1, score2 };
    }

    const scoreDiff = score1.totalScore - score2.totalScore;

    if (Math.abs(scoreDiff) < 5) {
      // Very close - check profile-specific scores
      const profile1Best = score1.bestProfileScore;
      const profile2Best = score2.bestProfileScore;

      if (profile1Best > profile2Best + 2) {
        return {
          winner: item1,
          reason: `Better for ${score1.bestProfile} builds (${profile1Best} vs ${profile2Best})`,
          score1,
          score2,
        };
      } else if (profile2Best > profile1Best + 2) {
        return {
          winner: item2,
          reason: `Better for ${score2.bestProfile} builds (${profile2Best} vs ${profile1Best})`,
          score1,
          score2,
        };
      }

      return {
        winner: null,
        reason: `Too close to call (${score1.totalScore} vs ${score2.totalScore})`,
        score1,
        score2,
      };
    }

    const winner = scoreDiff > 0 ? item1 : item2;
    const loser = scoreDiff > 0 ? item2 : item1;
    const winnerScore = scoreDiff > 0 ? score1 : score2;
    const loserScore = scoreDiff > 0 ? score2 : score1;

    return {
      winner,
      reason: `Higher overall score (${winnerScore.totalScore} vs ${loserScore.totalScore})`,
      score1,
      score2,
    };
  }

  /**
   * Generate a human-readable summary of an armor piece
   */
  generateSummary(item: InventoryItem, score: ArmorScore): string {
    const lines: string[] = [];

    const slotName = item.armorSlot ? ARMOR_SLOT_NAMES[item.armorSlot] : 'Unknown';
    const className = item.classType !== undefined ? CLASS_NAMES[item.classType] : 'Any';

    lines.push(`${item.name} (${slotName} - ${className})`);
    lines.push(`Overall Score: ${score.totalScore}/100`);
    lines.push(`Total Stats: ${score.analysis.totalStats}`);

    if (item.stats) {
      lines.push(
        `Stats: M${item.stats.mobility} R${item.stats.resilience} Rc${item.stats.recovery} D${item.stats.discipline} I${item.stats.intellect} S${item.stats.strength}`
      );
    }

    if (score.analysis.hasSuperSpike) {
      const spike = score.analysis.topStats[0];
      lines.push(`⭐ Super Spike: ${spike.stat} (${spike.value})`);
    } else if (score.analysis.hasSpike) {
      const spike = score.analysis.topStats[0];
      lines.push(`✓ Spike: ${spike.stat} (${spike.value})`);
    }

    const bestProfileName = this.profiles.get(score.bestProfile)?.name ?? score.bestProfile;
    lines.push(`Best for: ${bestProfileName} (${score.bestProfileScore})`);

    return lines.join('\n');
  }
}
