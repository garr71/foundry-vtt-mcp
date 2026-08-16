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
          'Set rollsOnly=true to filter to dice roll results only. ' +
          'Each message reports "author" (the user who sent it) and "speaker" (the actor or alias it was spoken as) ' +
          'independently, and either may be null: a null speaker means the message was posted with no actor attached ' +
          '(plain user chat or narration), NOT that the author spoke it. Do not infer one from the other. ' +
          'An "unresolvedActorId" field means the message references an actor that no longer exists in this world.',
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
              description:
                'If true, return only messages that contain dice roll results (default: false)',
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
      // `author` (the User who sent it) and `speaker` (the actor/alias it was spoken as) are
      // reported independently and may each be null. The old `?? msg.author` fallback made a
      // message with NO speaker indistinguishable from one spoken by its own author — which is
      // exactly the distinction a GM reading back the log needs, and it defeated the Phase 2
      // gate fixture. Let the caller see the absence.
      const base: any = {
        id: msg.id,
        time: msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : null,
        author: msg.author ?? null,
        speaker: msg.speaker?.alias ?? msg.speaker?.actor ?? null,
      };

      // Surface a speaker whose actor id no longer resolves, rather than dropping the trace.
      if (msg.speaker?.unresolvedActorId) {
        base.unresolvedActorId = msg.speaker.unresolvedActorId;
      }

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
