/**
 * Starfinder 2e Index Builder
 *
 * Builds enhanced creature index from Foundry compendiums.
 * Runs in Foundry's browser context, not Node.js.
 */

import type { IndexBuilder, SF2eCreatureIndex } from '../types.js';

declare const ui: any;

// Size normalization: sf2e uses same short codes as pf2e
const SIZE_MAP: Record<string, string> = {
  tiny: 'tiny',
  sm: 'small',
  med: 'medium',
  lg: 'large',
  huge: 'huge',
  grg: 'gargantuan'
};

// Primary creature trait categories for type extraction
const CREATURE_TRAITS = [
  'aberration', 'animal', 'beast', 'celestial', 'construct',
  'dragon', 'elemental', 'fey', 'fiend', 'fungus', 'humanoid',
  'monitor', 'ooze', 'plant', 'undead',
  'android', 'robot', 'incorporeal', 'swarm'
];

export class SF2eIndexBuilder implements IndexBuilder {
  private moduleId: string;

  constructor(moduleId: string = 'foundry-mcp-bridge') {
    this.moduleId = moduleId;
  }

  getSystemId() {
    return 'sf2e' as const;
  }

  async buildIndex(packs: any[], force = false): Promise<SF2eCreatureIndex[]> {
    const startTime = Date.now();
    let progressNotification: any = null;
    let totalErrors = 0;

    try {
      const actorPacks = packs.filter(pack => pack.metadata.type === 'Actor');
      const creatures: SF2eCreatureIndex[] = [];

      console.log(`[${this.moduleId}] Starting SF2e creature index from ${actorPacks.length} packs...`);
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(`Starting SF2e creature index from ${actorPacks.length} packs...`);
      }

      let current = 0;
      for (const pack of actorPacks) {
        current++;
        if (progressNotification && typeof ui !== 'undefined') progressNotification.remove();
        if (typeof ui !== 'undefined' && ui.notifications) {
          progressNotification = ui.notifications.info(
            `Building SF2e index: Pack ${current}/${actorPacks.length} (${pack.metadata.label})...`
          );
        }

        const result = await this.extractDataFromPack(pack);
        creatures.push(...result.creatures);
        totalErrors += result.errors;
      }

      if (progressNotification && typeof ui !== 'undefined') progressNotification.remove();

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const errorText = totalErrors > 0 ? ` (${totalErrors} errors)` : '';
      const msg = `SF2e creature index complete! ${creatures.length} creatures in ${elapsed}s${errorText}`;
      console.log(`[${this.moduleId}] ${msg}`);
      if (typeof ui !== 'undefined' && ui.notifications) ui.notifications.info(msg);

      return creatures;

    } catch (error) {
      if (progressNotification && typeof ui !== 'undefined') progressNotification.remove();
      const msg = `Failed to build SF2e index: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[${this.moduleId}] ${msg}`);
      if (typeof ui !== 'undefined' && ui.notifications) ui.notifications.error(msg);
      throw error;
    }
  }

  async extractDataFromPack(pack: any): Promise<{ creatures: SF2eCreatureIndex[]; errors: number }> {
    const creatures: SF2eCreatureIndex[] = [];
    let errors = 0;

    try {
      const documents = await pack.getDocuments();
      for (const doc of documents) {
        try {
          if (doc.type !== 'npc' && doc.type !== 'character') continue;
          const result = this.extractCreatureData(doc, pack);
          if (result) {
            creatures.push(result.creature);
            errors += result.errors;
          }
        } catch (err) {
          console.warn(`[${this.moduleId}] Failed to extract ${doc.name}:`, err);
          errors++;
        }
      }
    } catch (err) {
      console.warn(`[${this.moduleId}] Failed to load ${pack.metadata.label}:`, err);
      errors++;
    }

    return { creatures, errors };
  }

  extractCreatureData(doc: any, pack: any): { creature: SF2eCreatureIndex; errors: number } | null {
    try {
      const system = doc.system || {};

      const level = Number(system.details?.level?.value ?? 0) || 0;

      const traitsValue = system.traits?.value || [];
      const traits = Array.isArray(traitsValue) ? traitsValue : [];

      const primaryType = traits.find((t: string) =>
        CREATURE_TRAITS.includes(t.toLowerCase())
      )?.toLowerCase() || 'unknown';

      const rarity = system.traits?.rarity || 'common';

      const rawSize = system.traits?.size?.value || 'med';
      const size = SIZE_MAP[rawSize.toLowerCase()] || 'medium';

      const hitPoints = system.attributes?.hp?.max || 0;
      const armorClass = system.attributes?.ac?.value || 10;

      const spellcasting = system.spellcasting || {};
      const hasSpellcasting = Object.keys(spellcasting).length > 0;

      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img,
          system: 'sf2e',
          systemData: {
            level,
            traits,
            primaryType,
            size,
            rarity,
            hasSpellcasting,
            hitPoints,
            armorClass
          }
        },
        errors: 0
      };

    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to extract data from ${doc.name}:`, error);
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img || '',
          system: 'sf2e',
          systemData: {
            level: 0,
            traits: [],
            primaryType: 'unknown',
            size: 'medium',
            rarity: 'common',
            hasSpellcasting: false,
            hitPoints: 1,
            armorClass: 10
          }
        },
        errors: 1
      };
    }
  }
}
