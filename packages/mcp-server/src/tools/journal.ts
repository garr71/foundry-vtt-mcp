import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface JournalToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class JournalTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: JournalToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'JournalTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'show-journal-to-players',
        description:
          'Display a Foundry VTT journal entry or handout to all connected players AND the GM. ' +
          'Use mode "text" for journal pages and "image" for image handouts. ' +
          'Supports partial name matching — you do not need the exact name.',
        inputSchema: {
          type: 'object',
          properties: {
            journal: {
              type: 'string',
              description: 'Name or partial name of the journal entry to show.',
            },
            mode: {
              type: 'string',
              enum: ['text', 'image'],
              description: 'Display mode: "text" for journal text pages (default), "image" for image handouts.',
              default: 'text',
            },
          },
          required: ['journal'],
        },
      },
    ];
  }

  async handleShowJournalToPlayers(args: any): Promise<any> {
    const schema = z.object({
      journal: z.string(),
      mode: z.enum(['text', 'image']).default('text'),
    });

    const { journal, mode } = schema.parse(args);

    this.logger.info('Showing journal to players', { journal, mode });

    try {
      return await this.foundryClient.query('foundry-mcp-bridge.showJournalToPlayers', { journal, mode });
    } catch (error) {
      this.logger.error('Failed to show journal', error);
      throw new Error(
        `Failed to show journal: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
