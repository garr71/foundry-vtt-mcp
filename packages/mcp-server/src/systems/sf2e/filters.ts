/**
 * Starfinder 2e Filter Schemas
 */

import { z } from 'zod';

/**
 * SF2e creature traits (common subset)
 * SF2e uses the same trait system as PF2e with sci-fi additions
 */
export const SF2eCreatureTypes = [
  'aberration',
  'animal',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'fungus',
  'humanoid',
  'monitor',
  'ooze',
  'plant',
  'undead',
  // SF2e-specific
  'android',
  'robot',
  'tech',
  'incorporeal',
  'swarm'
] as const;

export type SF2eCreatureType = typeof SF2eCreatureTypes[number];

export const SF2eRarities = ['common', 'uncommon', 'rare', 'unique'] as const;
export type SF2eRarity = typeof SF2eRarities[number];

export const SF2eCreatureSizes = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type SF2eCreatureSize = typeof SF2eCreatureSizes[number];

/**
 * SF2e filter schema
 */
export const SF2eFiltersSchema = z.object({
  level: z.union([
    z.number().min(-1).max(30),
    z.object({
      min: z.number().min(-1).optional(),
      max: z.number().max(30).optional()
    })
  ]).optional(),
  creatureType: z.enum(SF2eCreatureTypes).optional(),
  traits: z.array(z.string()).optional(),
  rarity: z.enum(SF2eRarities).optional(),
  size: z.enum(SF2eCreatureSizes).optional(),
  hasSpells: z.boolean().optional()
});

export type SF2eFilters = z.infer<typeof SF2eFiltersSchema>;

/**
 * Check if a creature matches SF2e filters
 */
export function matchesSF2eFilters(creature: any, filters: SF2eFilters): boolean {
  if (filters.level !== undefined) {
    const level = creature.systemData?.level;
    if (level === undefined) return false;

    if (typeof filters.level === 'number') {
      if (level !== filters.level) return false;
    } else {
      const min = filters.level.min ?? -1;
      const max = filters.level.max ?? 30;
      if (level < min || level > max) return false;
    }
  }

  if (filters.creatureType) {
    const traits = creature.systemData?.traits;
    if (!Array.isArray(traits)) return false;
    const hasType = traits.some((t: string) =>
      t.toLowerCase() === filters.creatureType!.toLowerCase()
    );
    if (!hasType) return false;
  }

  if (filters.traits && filters.traits.length > 0) {
    const creatureTraits = creature.systemData?.traits;
    if (!Array.isArray(creatureTraits)) return false;
    const lower = creatureTraits.map((t: string) => t.toLowerCase());
    for (const required of filters.traits) {
      if (!lower.includes(required.toLowerCase())) return false;
    }
  }

  if (filters.rarity) {
    const rarity = creature.systemData?.rarity;
    if (!rarity || rarity.toLowerCase() !== filters.rarity.toLowerCase()) return false;
  }

  if (filters.size) {
    const size = creature.systemData?.size;
    if (!size || size.toLowerCase() !== filters.size.toLowerCase()) return false;
  }

  if (filters.hasSpells !== undefined) {
    const hasSpells = creature.systemData?.hasSpellcasting || false;
    if (hasSpells !== filters.hasSpells) return false;
  }

  return true;
}

/**
 * Human-readable filter description
 */
export function describeSF2eFilters(filters: SF2eFilters): string {
  const parts: string[] = [];

  if (filters.level !== undefined) {
    if (typeof filters.level === 'number') {
      parts.push(`Level ${filters.level}`);
    } else {
      parts.push(`Level ${filters.level.min ?? -1}-${filters.level.max ?? 30}`);
    }
  }

  if (filters.creatureType) parts.push(filters.creatureType);
  if (filters.rarity) parts.push(filters.rarity);
  if (filters.size) parts.push(filters.size);
  if (filters.traits && filters.traits.length > 0) {
    parts.push(`traits: ${filters.traits.join(', ')}`);
  }
  if (filters.hasSpells) parts.push('spellcaster');

  return parts.length > 0 ? parts.join(', ') : 'no filters';
}
