/**
 * Starfinder 2e System Adapter
 *
 * Implements SystemAdapter for Starfinder 2nd Edition.
 * SF2e shares most of its data structure with PF2e but adds
 * sci-fi skills (Computers, Piloting) and removes alignment.
 */

import type { SystemAdapter, SystemMetadata, SystemCreatureIndex, SF2eCreatureIndex } from '../types.js';
import { SF2eFiltersSchema, matchesSF2eFilters, describeSF2eFilters, type SF2eFilters } from './filters.js';

// Primary creature trait categories
const CREATURE_TRAITS = [
  'aberration', 'animal', 'beast', 'celestial', 'construct',
  'dragon', 'elemental', 'fey', 'fiend', 'fungus', 'humanoid',
  'monitor', 'ooze', 'plant', 'undead',
  'android', 'robot', 'incorporeal', 'swarm'
];

export class SF2eAdapter implements SystemAdapter {
  getMetadata(): SystemMetadata {
    return {
      id: 'sf2e',
      name: 'sf2e',
      displayName: 'Starfinder 2nd Edition',
      version: '1.0.0',
      description: 'Support for Starfinder 2e with Level, traits, rarity, and sci-fi skills (Computers, Piloting)',
      supportedFeatures: {
        creatureIndex: true,
        characterStats: true,
        spellcasting: true,
        powerLevel: true
      }
    };
  }

  canHandle(systemId: string): boolean {
    return systemId.toLowerCase() === 'sf2e';
  }

  extractCreatureData(doc: any, pack: any): { creature: SystemCreatureIndex; errors: number } | null {
    throw new Error('extractCreatureData should be called from SF2eIndexBuilder, not the adapter');
  }

  getFilterSchema() {
    return SF2eFiltersSchema;
  }

  matchesFilters(creature: SystemCreatureIndex, filters: Record<string, any>): boolean {
    const validated = SF2eFiltersSchema.safeParse(filters);
    if (!validated.success) return false;
    return matchesSF2eFilters(creature, validated.data as SF2eFilters);
  }

  getDataPaths(): Record<string, string | null> {
    return {
      level: 'system.details.level.value',
      creatureType: 'system.traits.value',
      traits: 'system.traits.value',
      size: 'system.traits.size.value',
      rarity: 'system.traits.rarity',
      hitPoints: 'system.attributes.hp',
      armorClass: 'system.attributes.ac.value',
      abilities: 'system.abilities',
      skills: 'system.skills',
      perception: 'system.perception',
      saves: 'system.saves',
      // SF2e removed alignment
      alignment: null,
      challengeRating: null,
      legendaryActions: null,
      legendaryResistances: null,
      spells: null
    };
  }

  formatCreatureForList(creature: SystemCreatureIndex): any {
    const sf2eCreature = creature as SF2eCreatureIndex;
    const formatted: any = {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      pack: {
        id: creature.packName,
        label: creature.packLabel
      }
    };

    if (sf2eCreature.systemData) {
      const stats: any = {};

      if (sf2eCreature.systemData.level !== undefined) stats.level = sf2eCreature.systemData.level;

      if (sf2eCreature.systemData.traits && sf2eCreature.systemData.traits.length > 0) {
        stats.traits = sf2eCreature.systemData.traits;
        const primaryType = sf2eCreature.systemData.traits.find((t: string) =>
          CREATURE_TRAITS.includes(t.toLowerCase())
        );
        if (primaryType) stats.creatureType = primaryType;
      }

      if (sf2eCreature.systemData.rarity) stats.rarity = sf2eCreature.systemData.rarity;
      if (sf2eCreature.systemData.size) stats.size = sf2eCreature.systemData.size;
      if (sf2eCreature.systemData.hitPoints) stats.hitPoints = sf2eCreature.systemData.hitPoints;
      if (sf2eCreature.systemData.armorClass) stats.armorClass = sf2eCreature.systemData.armorClass;
      if (sf2eCreature.systemData.hasSpellcasting) stats.spellcaster = true;

      if (Object.keys(stats).length > 0) formatted.stats = stats;
    }

    if (creature.img) formatted.hasImage = true;

    return formatted;
  }

  formatCreatureForDetails(creature: SystemCreatureIndex): any {
    const sf2eCreature = creature as SF2eCreatureIndex;
    const formatted = this.formatCreatureForList(creature);

    if (sf2eCreature.systemData) {
      formatted.detailedStats = {
        level: sf2eCreature.systemData.level,
        traits: sf2eCreature.systemData.traits,
        size: sf2eCreature.systemData.size,
        rarity: sf2eCreature.systemData.rarity,
        hitPoints: sf2eCreature.systemData.hitPoints,
        armorClass: sf2eCreature.systemData.armorClass,
        hasSpellcasting: sf2eCreature.systemData.hasSpellcasting
      };
    }

    if (creature.img) formatted.img = creature.img;

    return formatted;
  }

  describeFilters(filters: Record<string, any>): string {
    const validated = SF2eFiltersSchema.safeParse(filters);
    if (!validated.success) return 'invalid filters';
    return describeSF2eFilters(validated.data as SF2eFilters);
  }

  getPowerLevel(creature: SystemCreatureIndex): number | undefined {
    const sf2eCreature = creature as SF2eCreatureIndex;
    return sf2eCreature.systemData?.level;
  }

  extractCharacterStats(actorData: any): any {
    const system = actorData.system || {};
    const stats: any = {};

    stats.name = actorData.name;
    stats.type = actorData.type;

    // Level
    const level = system.details?.level?.value;
    if (level !== undefined) stats.level = Number(level);

    // Hit Points
    const hp = system.attributes?.hp;
    if (hp) {
      stats.hitPoints = {
        current: hp.value ?? 0,
        max: hp.max ?? 0,
        temp: hp.temp ?? 0
      };
    }

    // Armor Class
    const ac = system.attributes?.ac?.value;
    if (ac !== undefined) stats.armorClass = ac;

    // Dying / Doomed / Wounded
    const dying = system.attributes?.dying;
    const doomed = system.attributes?.doomed;
    const wounded = system.attributes?.wounded;
    if (dying || doomed || wounded) {
      stats.conditions = {
        dying: dying?.value ?? 0,
        dyingMax: dying?.max ?? 4,
        doomed: doomed?.value ?? 0,
        wounded: wounded?.value ?? 0
      };
    }

    // Abilities (str, dex, con, int, wis, cha)
    if (system.abilities) {
      stats.abilities = {};
      for (const [key, ability] of Object.entries(system.abilities)) {
        const a = ability as any;
        stats.abilities[key] = { modifier: a.mod ?? 0 };
      }
    }

    // Skills — includes SF2e-specific: computers, piloting
    if (system.skills) {
      stats.skills = {};
      for (const [key, skill] of Object.entries(system.skills)) {
        const s = skill as any;
        stats.skills[key] = {
          label: s.label ?? key,
          modifier: s.totalModifier ?? s.value ?? 0,
          attribute: s.attribute ?? null
        };
      }
    }

    // Perception
    if (system.perception) {
      stats.perception = {
        modifier: system.perception.totalModifier ?? system.perception.mod ?? 0
      };
    }

    // Saves
    if (system.saves) {
      stats.saves = {};
      for (const [key, save] of Object.entries(system.saves)) {
        const s = save as any;
        stats.saves[key] = { modifier: s.value ?? s.totalModifier ?? 0 };
      }
    }

    // Resources (focus points, mythic points — sf2e specific)
    if (system.resources) {
      const resources: any = {};
      const focus = system.resources.focus;
      if (focus && focus.max > 0) {
        resources.focusPoints = { current: focus.value ?? 0, max: focus.max };
      }
      const mythic = system.resources.mythicPoints;
      if (mythic && mythic.max > 0) {
        resources.mythicPoints = { current: mythic.value ?? 0, max: mythic.max };
      }
      if (Object.keys(resources).length > 0) stats.resources = resources;
    }

    // Class DC
    const classDC = system.attributes?.classDC?.value;
    if (classDC) stats.classDC = classDC;

    // NPC-specific fields
    if (actorData.type === 'npc') {
      const traits = system.traits?.value || [];
      if (Array.isArray(traits) && traits.length > 0) {
        stats.traits = traits;
        const primaryType = traits.find((t: string) =>
          CREATURE_TRAITS.includes(t.toLowerCase())
        );
        if (primaryType) stats.creatureType = primaryType;
      }

      const size = system.traits?.size?.value;
      if (size) stats.size = size;

      const rarity = system.traits?.rarity;
      if (rarity) stats.rarity = rarity;

      const alliance = system.details?.alliance;
      if (alliance) stats.alliance = alliance;
    }

    // Spellcasting
    const spellcasting = system.spellcasting || {};
    if (Object.keys(spellcasting).length > 0) {
      stats.spellcasting = { hasSpells: true };
    }

    return stats;
  }
}
