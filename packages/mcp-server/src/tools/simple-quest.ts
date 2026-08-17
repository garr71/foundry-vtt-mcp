import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface SimpleQuestToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/**
 * Simple Quest integration (Phase 7a).
 *
 * Simple Quest is the campaign's living layer: what happened at the table, plus light prep
 * on places, factions and timeline. Premium adventure modules ship their own adorned
 * journals; those are read-only source material and are never written to. See
 * docs/V14_MIGRATION_PLAN.md, Phase 7a.
 */
export class SimpleQuestTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: SimpleQuestToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'SimpleQuestTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'get-simple-quest-context',
        description:
          'Read the Simple Quest module\'s live page schemas and folder layout. Call this before creating or updating Simple Quest pages: it returns the exact system field names each page type accepts, read from the running data model, so field names never have to be guessed. Returns the 11 page types (quest, lore, character, creature, faction, location, event, era, achievement, map, investigation) with their fields, plus the special directories (root, quests, party, timeline, achievements) and the tab folders under root. Read-only. Note that "hidden" fields such as objectiveState are writable despite being absent from the module\'s own config UI.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  async handleGetSimpleQuestContext(_args: any): Promise<any> {
    this.logger.info('Reading Simple Quest context');

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.getSimpleQuestContext', {});

      // `available: false` is an answer, not a failure — the module may simply not be
      // installed. Passed through as-is rather than thrown, so the reason survives
      // ErrorHandler.handleToolError, which replaces every thrown message with a template.
      if (result && result.available === false) {
        this.logger.info('Simple Quest is not available', { reason: result.reason });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to read Simple Quest context', error);
      throw new Error(
        `Failed to read Simple Quest context: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}
