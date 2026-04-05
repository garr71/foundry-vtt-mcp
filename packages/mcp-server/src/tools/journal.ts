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
        name: 'set-quest-visibility',
        description:
          'Show or hide a Simple Quest journal page from players by toggling its hidden flag. ' +
          'Requires the Simple Quest module to be active in Foundry.',
        inputSchema: {
          type: 'object',
          properties: {
            journalId: {
              type: 'string',
              description: 'ID of the journal entry containing the quest page.',
            },
            pageId: {
              type: 'string',
              description: 'ID of the specific quest page to show or hide.',
            },
            hidden: {
              type: 'boolean',
              description: 'true to hide the quest from players, false to reveal it.',
            },
          },
          required: ['journalId', 'pageId', 'hidden'],
        },
      },
      {
        name: 'send-chat-message',
        description:
          'Post a message to Foundry VTT chat, visible to all players and the GM. ' +
          'Use this for read-aloud flavor text, scene narration, NPC dialogue, and announcements. ' +
          'Optionally specify a speaker name (actor or alias) and whether to whisper GM-only.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The message text to post. Plain text or basic HTML.',
            },
            speaker: {
              type: 'string',
              description: 'Speaker name shown in chat. Use an actor name for NPC dialogue, or omit for GM narration.',
            },
            whisper: {
              type: 'boolean',
              description: 'If true, message is visible only to GM clients. Default: false (public).',
              default: false,
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'show-journal-to-players',
        description:
          'Display a Foundry VTT journal entry or a specific page within it to all connected players AND the GM. ' +
          'Omit "page" to show the whole journal. Provide "page" to open directly to that page in single-page view. ' +
          'Supports partial name matching for both journal and page.',
        inputSchema: {
          type: 'object',
          properties: {
            journal: {
              type: 'string',
              description: 'Name or partial name of the journal entry.',
            },
            page: {
              type: 'string',
              description: 'Optional: name or partial name of a specific page within the journal. Opens in single-page view showing only that page.',
            },
          },
          required: ['journal'],
        },
      },
    ];
  }

  async handleSetQuestVisibility(args: any): Promise<any> {
    const schema = z.object({
      journalId: z.string(),
      pageId: z.string(),
      hidden: z.boolean(),
    });

    const { journalId, pageId, hidden } = schema.parse(args);

    this.logger.info('Setting quest visibility', { journalId, pageId, hidden });

    try {
      return await this.foundryClient.query('foundry-mcp-bridge.setQuestVisibility', { journalId, pageId, hidden });
    } catch (error) {
      this.logger.error('Failed to set quest visibility', error);
      throw new Error(
        `Failed to set quest visibility: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleSendChatMessage(args: any): Promise<any> {
    const schema = z.object({
      content: z.string(),
      speaker: z.string().optional(),
      whisper: z.boolean().default(false),
    });

    const { content, speaker, whisper } = schema.parse(args);

    this.logger.info('Sending chat message', { speaker, whisper });

    try {
      return await this.foundryClient.query('foundry-mcp-bridge.sendChatMessage', { content, speaker, whisper });
    } catch (error) {
      this.logger.error('Failed to send chat message', error);
      throw new Error(
        `Failed to send chat message: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleShowJournalToPlayers(args: any): Promise<any> {
    const schema = z.object({
      journal: z.string(),
      page: z.string().optional(),
    });

    const { journal, page } = schema.parse(args);

    this.logger.info('Showing journal to players', { journal, page });

    try {
      return await this.foundryClient.query('foundry-mcp-bridge.showJournalToPlayers', { journal, page });
    } catch (error) {
      this.logger.error('Failed to show journal', error);
      throw new Error(
        `Failed to show journal: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
