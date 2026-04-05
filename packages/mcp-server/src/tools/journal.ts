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
