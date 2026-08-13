import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface CombatToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class CombatTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: CombatToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'CombatTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'get-combat-tracker',
        description:
          'Read the active combat encounter: current round, whose turn it is, initiative order, and whether each combatant is defeated or hidden. Returns an empty result when no combat is active.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  async handleGetCombatTracker(_args: any): Promise<any> {
    this.logger.info('Getting active combat tracker');

    try {
      const data = await this.foundryClient.query('foundry-mcp-bridge.getActiveCombat');

      if (!data.active && data.combatants === undefined) {
        return {
          active: false,
          message: 'No combat encounter is currently active.',
        };
      }

      return this.formatCombatResponse(data);
    } catch (error) {
      this.logger.error('Failed to get combat tracker', error);
      throw new Error(
        `Failed to get combat tracker: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private formatCombatResponse(data: any): any {
    if (!data.active) {
      return {
        active: false,
        message: data.combatants?.length
          ? `Combat is set up but not yet started. ${data.combatants.length} combatant(s) are queued.`
          : 'No combat encounter is currently active.',
        combatants: data.combatants ?? [],
      };
    }

    const turnOrder = (data.combatants ?? []).map((c: any, index: number) => ({
      position: index + 1,
      id: c.id,
      name: c.name,
      initiative: c.hasRolledInitiative ? c.initiative : 'not rolled',
      isCurrentTurn: c.isCurrentTurn,
      defeated: c.defeated,
      hidden: c.hidden || c.tokenHidden,
      disposition: c.disposition,
    }));

    return {
      active: true,
      scene: data.scene,
      round: data.round,
      currentTurn: data.currentTurn
        ? {
            name: data.currentTurn.name,
            initiative: data.currentTurn.initiative,
          }
        : null,
      turnOrder,
      summary: {
        totalCombatants: data.totalCombatants,
        defeated: turnOrder.filter((c: any) => c.defeated).length,
        stillFighting: turnOrder.filter((c: any) => !c.defeated).length,
        awaitingInitiative: turnOrder.filter((c: any) => c.initiative === 'not rolled').length,
      },
    };
  }
}
