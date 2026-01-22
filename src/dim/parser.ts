/**
 * DIM Backup Parser
 * Parses DIM export files to extract loadouts, tags, and notes
 */

import { readFile } from 'fs/promises';
import { DIMBackup, DIMLoadout, DestinyClass, ApiResult } from '../types.js';

// DIM export file structure (simplified, based on DIM's actual export format)
interface DIMExportFile {
  'loadouts-v3.0'?: DIMLoadoutExport[];
  'tags-v1.0'?: DIMTagExport[];
  'item-annotations'?: DIMAnnotationExport[];
  settings?: Record<string, unknown>;
}

interface DIMLoadoutExport {
  id: string;
  name: string;
  classType: number;
  equipped: DIMLoadoutItem[];
  unequipped: DIMLoadoutItem[];
}

interface DIMLoadoutItem {
  id?: string; // Instance ID (may be missing for generic items)
  hash: number;
  amount?: number;
  socketOverrides?: Record<string, number>;
}

interface DIMTagExport {
  id: string; // Instance ID
  tag: 'favorite' | 'keep' | 'junk' | 'infuse' | 'archive';
}

interface DIMAnnotationExport {
  id: string; // Can be instance ID or hash
  tag?: string;
  notes?: string;
}

export class DIMParser {
  private backup: DIMBackup | null = null;

  /**
   * Load and parse a DIM backup file
   */
  async loadBackup(filePath: string): Promise<ApiResult<DIMBackup>> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as DIMExportFile;

      const backup = this.parseExport(data);
      this.backup = backup;

      return { success: true, data: backup };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load DIM backup: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Parse DIM export data
   */
  parseExport(data: DIMExportFile): DIMBackup {
    const loadouts: DIMLoadout[] = [];
    const tags = new Map<string, string>();
    const notes = new Map<string, string>();

    // Parse loadouts
    const loadoutData = data['loadouts-v3.0'] ?? [];
    for (const loadout of loadoutData) {
      const itemIds: string[] = [];

      // Collect instance IDs from equipped and unequipped items
      for (const item of [...loadout.equipped, ...loadout.unequipped]) {
        if (item.id) {
          itemIds.push(item.id);
        }
      }

      if (itemIds.length > 0) {
        loadouts.push({
          id: loadout.id,
          name: loadout.name,
          classType: loadout.classType as DestinyClass,
          itemIds,
        });
      }
    }

    // Parse tags (legacy format)
    const tagData = data['tags-v1.0'] ?? [];
    for (const tag of tagData) {
      tags.set(tag.id, tag.tag);
    }

    // Parse annotations (newer format)
    const annotationData = data['item-annotations'] ?? [];
    for (const annotation of annotationData) {
      if (annotation.tag) {
        tags.set(annotation.id, annotation.tag);
      }
      if (annotation.notes) {
        notes.set(annotation.id, annotation.notes);
      }
    }

    return { loadouts, tags, notes };
  }

  /**
   * Parse DIM export from JSON string
   */
  parseFromString(jsonContent: string): ApiResult<DIMBackup> {
    try {
      const data = JSON.parse(jsonContent) as DIMExportFile;
      const backup = this.parseExport(data);
      this.backup = backup;
      return { success: true, data: backup };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse DIM backup: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Check if an item is used in any loadout
   */
  isInLoadout(itemInstanceId: string): boolean {
    if (!this.backup) return false;
    return this.backup.loadouts.some((l) => l.itemIds.includes(itemInstanceId));
  }

  /**
   * Get all loadouts that use a specific item
   */
  getLoadoutsForItem(itemInstanceId: string): DIMLoadout[] {
    if (!this.backup) return [];
    return this.backup.loadouts.filter((l) =>
      l.itemIds.includes(itemInstanceId)
    );
  }

  /**
   * Get the tag for an item
   */
  getTag(itemInstanceId: string): string | undefined {
    return this.backup?.tags.get(itemInstanceId);
  }

  /**
   * Get the note for an item
   */
  getNote(itemInstanceId: string): string | undefined {
    return this.backup?.notes.get(itemInstanceId);
  }

  /**
   * Get all item IDs that are in any loadout
   */
  getAllLoadoutItemIds(): Set<string> {
    const ids = new Set<string>();
    if (!this.backup) return ids;

    for (const loadout of this.backup.loadouts) {
      for (const id of loadout.itemIds) {
        ids.add(id);
      }
    }
    return ids;
  }

  /**
   * Get all items tagged as 'favorite'
   */
  getFavoriteItemIds(): Set<string> {
    const ids = new Set<string>();
    if (!this.backup) return ids;

    for (const [id, tag] of this.backup.tags) {
      if (tag === 'favorite') {
        ids.add(id);
      }
    }
    return ids;
  }

  /**
   * Get all items tagged as 'junk'
   */
  getJunkItemIds(): Set<string> {
    const ids = new Set<string>();
    if (!this.backup) return ids;

    for (const [id, tag] of this.backup.tags) {
      if (tag === 'junk') {
        ids.add(id);
      }
    }
    return ids;
  }

  /**
   * Get all items tagged as 'keep'
   */
  getKeepItemIds(): Set<string> {
    const ids = new Set<string>();
    if (!this.backup) return ids;

    for (const [id, tag] of this.backup.tags) {
      if (tag === 'keep') {
        ids.add(id);
      }
    }
    return ids;
  }

  /**
   * Get summary of the loaded backup
   */
  getSummary(): {
    loadoutCount: number;
    taggedItemCount: number;
    notedItemCount: number;
    loadoutItemCount: number;
  } | null {
    if (!this.backup) return null;

    return {
      loadoutCount: this.backup.loadouts.length,
      taggedItemCount: this.backup.tags.size,
      notedItemCount: this.backup.notes.size,
      loadoutItemCount: this.getAllLoadoutItemIds().size,
    };
  }

  /**
   * Check if a backup is loaded
   */
  get loaded(): boolean {
    return this.backup !== null;
  }

  /**
   * Get the raw backup data
   */
  get data(): DIMBackup | null {
    return this.backup;
  }
}
