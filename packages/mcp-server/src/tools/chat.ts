import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface ChatToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class ChatTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: ChatToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'ChatTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'read-chat',
        description:
          'Read recent Foundry VTT chat messages, including roll results, player actions, and GM narration. ' +
          'Use this to check the outcome of rolls without needing them relayed verbally. ' +
          'Set rollsOnly=true to filter to dice roll results only.',
        inputSchema: {
          type: 'object',
          properties: {
            count: {
              type: 'number',
              description: 'Number of recent messages to return (default: 20, max: 100)',
              default: 20,
            },
            rollsOnly: {
              type: 'boolean',
              description: 'If true, return only messages that contain dice roll results (default: false)',
              default: false,
            },
          },
        },
      },
    ];
  }

  async handleReadChat(args: any): Promise<any> {
    const schema = z.object({
      count: z.number().int().min(1).max(100).default(20),
      rollsOnly: z.boolean().default(false),
    });

    const { count, rollsOnly } = schema.parse(args);

    this.logger.info('Reading chat messages', { count, rollsOnly });

    try {
      const data = await this.foundryClient.query('foundry-mcp-bridge.getRecentChat', {
        count,
        rollsOnly,
      });

      return this.formatChatResponse(data);
    } catch (error) {
      this.logger.error('Failed to read chat', error);
      throw new Error(
        `Failed to read chat: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private formatChatResponse(data: any): any {
    const messages: any[] = data.messages ?? [];

    if (messages.length === 0) {
      return {
        total: 0,
        rollsOnly: data.rollsOnly,
        messages: [],
        summary: 'No messages found.',
      };
    }

    const formatted = messages.map((msg: any) => {
      const base: any = {
        id: msg.id,
        time: msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : null,
        author: msg.author,
        speaker: msg.speaker?.alias ?? msg.speaker?.actor ?? msg.author,
      };

      if (msg.flavor) {
        base.flavor = msg.flavor;
      }

      if (msg.isRoll && msg.rolls.length > 0) {
        base.rolls = msg.rolls.map((r: any) => ({
          formula: r.formula,
          total: r.total,
        }));
      }

      if (msg.content) {
        base.content = msg.content;
      }

      if (msg.whisper) {
        base.whisper = true;
      }

      return base;
    });

    const rollCount = messages.filter((m: any) => m.isRoll).length;

    return {
      total: messages.length,
      rollsOnly: data.rollsOnly,
      rollsInBatch: rollCount,
      messages: formatted,
    };
  }
}
