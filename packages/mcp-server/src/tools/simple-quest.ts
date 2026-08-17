import { z } from 'zod';
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
      {
        name: 'create-simple-quest-page',
        description:
          'Create one Simple Quest page (quest, lore, character, creature, faction, location, event, era, achievement). Call get-simple-quest-context first for the exact system field names. IMPORTANT — defaults are for PREP and deliberately differ from the Simple Quest module\'s own: the page is created hidden from players (ownership none on both journal and page), a quest page gets status -1 (Undiscovered) rather than the module default 0 (In Progress), and every objective in the body is marked secret. Pass visibleToPlayers: true to create it already visible, or reveal later with the visibility tool. Body prose goes in "text" as HTML; quest objectives are <li> items in that HTML. One page per call.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description:
                'Page type, fully qualified, e.g. "simple-quest.quest" or "simple-quest.lore".',
            },
            name: { type: 'string', description: 'Page name.' },
            text: {
              type: 'string',
              description:
                'Page body as HTML. For a quest, each objective is an <li>; nested <ul> makes sub-objectives.',
            },
            system: {
              type: 'object',
              description:
                'Type-specific fields, e.g. {"questGiver":"Aldern","difficulty":"Moderate"}. Validated against the live data model — unknown keys are refused by name and nothing is written. Omit "status" to get the prep default of -1.',
            },
            journalId: {
              type: 'string',
              description: 'Add the page to this existing journal. Use this or "folder".',
            },
            folder: {
              type: 'string',
              description:
                'Journal folder id or EXACT name (e.g. "Quests") to create a new journal in. Get folder names from get-simple-quest-context.',
            },
            journalName: {
              type: 'string',
              description:
                'Name for the new journal when using "folder". Defaults to the page name.',
            },
            visibleToPlayers: {
              type: 'boolean',
              description:
                'If true, players get OBSERVER on both the journal and the page. Default false (prep: hidden).',
              default: false,
            },
            secretObjectives: {
              type: 'boolean',
              description:
                'Quest pages only. If true (default), every objective in the body starts secret so it can be revealed as earned. Set false to create them all visible.',
              default: true,
            },
          },
          required: ['type', 'name'],
        },
      },
      {
        name: 'update-simple-quest-page',
        description:
          'Update an existing Simple Quest page. System fields MERGE — fields you do not name keep their current values. Use this for prose and metadata (questGiver, difficulty, location, tags, block content). It will NOT touch objectiveState (use set-quest-progress) or ownership (use the visibility tool), and it refuses a body rewrite that would strand objective state, since Simple Quest keys objective checkboxes by a slug of the objective text. Appending new objectives is safe and allowed. Returns which system fields changed and which did not.',
        inputSchema: {
          type: 'object',
          properties: {
            journalId: { type: 'string', description: 'Journal containing the page.' },
            pageId: { type: 'string', description: 'Page to update. Get ids from list-journals.' },
            name: { type: 'string', description: 'New page name (optional).' },
            text: {
              type: 'string',
              description:
                'Replacement body HTML (optional). On a quest page, rewriting or reordering existing <li> objectives is refused when it would strand stored state; appending is fine.',
            },
            system: {
              type: 'object',
              description:
                'Partial system fields to merge, e.g. {"difficulty":"Severe"}. Unknown keys are refused by name and nothing is written. Foundry "-=" unset syntax is refused.',
            },
            allowOrphanedObjectives: {
              type: 'boolean',
              description:
                'Only if you intend to lose objective state that a body rewrite would strand. Default false.',
              default: false,
            },
          },
          required: ['journalId', 'pageId'],
        },
      },
      {
        name: 'set-quest-progress',
        description:
          'Record what happened at the table on a Simple Quest quest page: set the quest status, tick objectives checked/failed/unchecked, and append new objectives. Objectives are addressed by key, exact text, or index — a selector matching nothing fails loudly rather than guessing. Objective state is read-modify-write, so ticking one never disturbs the others. Appending adds top-level objectives only; nesting under an existing objective is refused because it would re-key the parent and strand its checkbox.',
        inputSchema: {
          type: 'object',
          properties: {
            journalId: { type: 'string', description: 'Journal containing the quest page.' },
            pageId: { type: 'string', description: 'The simple-quest.quest page.' },
            status: {
              type: 'string',
              description:
                'Quest status: "undiscovered" (-1), "in-progress" (0), "completed" (1) or "failed" (2). Numbers accepted too.',
            },
            objectives: {
              type: 'array',
              description:
                'Objectives to tick. Each needs a state plus one of key, text, or index.',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: 'Objective key from the manifest.' },
                  text: { type: 'string', description: 'Exact objective text.' },
                  index: { type: 'number', description: 'Objective index, document order.' },
                  state: {
                    type: 'string',
                    description: '"checked", "failed" or "unchecked" (or 1 / 2 / 0).',
                  },
                },
                required: ['state'],
              },
            },
            appendObjectives: {
              type: 'array',
              items: { type: 'string' },
              description:
                'New objectives to add, as plain text (markup is not accepted — it could re-key existing objectives). Appended at the top level; existing objectives keep their state.',
            },
          },
          required: ['journalId', 'pageId'],
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

  async handleCreateSimpleQuestPage(args: any): Promise<any> {
    const schema = z.object({
      type: z.string().min(1),
      name: z.string().min(1),
      text: z.string().optional(),
      system: z.record(z.unknown()).optional(),
      journalId: z.string().optional(),
      folder: z.string().optional(),
      journalName: z.string().optional(),
      visibleToPlayers: z.boolean().default(false),
      secretObjectives: z.boolean().default(true),
    });

    const request = schema.parse(args);

    this.logger.info('Creating Simple Quest page', {
      type: request.type,
      name: request.name,
      target: request.journalId ?? request.folder,
      visibleToPlayers: request.visibleToPlayers,
    });

    try {
      const result = await this.foundryClient.query(
        'foundry-mcp-bridge.createSimpleQuestPage',
        request
      );

      // Refusals arrive as { success: false, message, rejected? } and are passed straight
      // through. Throwing would route them into ErrorHandler.handleToolError, which
      // substitutes a generic template — and for a schema rejection the message IS the
      // documentation, since it names the bad keys and lists the real ones.
      if (result && result.success === false) {
        this.logger.info('Simple Quest page creation refused', {
          message: result.message,
          rejected: result.rejected,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to create Simple Quest page', error);
      throw new Error(
        `Failed to create Simple Quest page: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleUpdateSimpleQuestPage(args: any): Promise<any> {
    const schema = z.object({
      journalId: z.string().min(1),
      pageId: z.string().min(1),
      name: z.string().optional(),
      text: z.string().optional(),
      system: z.record(z.unknown()).optional(),
      allowOrphanedObjectives: z.boolean().default(false),
    });

    const request = schema.parse(args);

    this.logger.info('Updating Simple Quest page', {
      pageId: request.pageId,
      fields: Object.keys(request.system ?? {}),
      rewritingBody: request.text !== undefined,
    });

    try {
      const result = await this.foundryClient.query(
        'foundry-mcp-bridge.updateSimpleQuestPage',
        request
      );

      // Refusals carry the reason and, for an orphan refusal, the current objective list —
      // returned rather than thrown so none of that is replaced by a generic template.
      if (result && result.success === false) {
        this.logger.info('Simple Quest page update refused', {
          reason: result.reason,
          rejected: result.rejected ?? result.strandedKeys,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to update Simple Quest page', error);
      throw new Error(
        `Failed to update Simple Quest page: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleSetQuestProgress(args: any): Promise<any> {
    const schema = z.object({
      journalId: z.string().min(1),
      pageId: z.string().min(1),
      status: z.union([z.string(), z.number()]).optional(),
      objectives: z
        .array(
          z.object({
            key: z.string().optional(),
            text: z.string().optional(),
            index: z.number().optional(),
            state: z.union([z.string(), z.number()]),
          })
        )
        .optional(),
      appendObjectives: z.array(z.string()).optional(),
    });

    const request = schema.parse(args);

    this.logger.info('Setting quest progress', {
      pageId: request.pageId,
      status: request.status,
      objectiveCount: request.objectives?.length ?? 0,
      appending: request.appendObjectives?.length ?? 0,
    });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.setQuestProgress', request);

      // An unmatched selector comes back as a refusal listing every available objective —
      // returned rather than thrown so that list survives ErrorHandler.handleToolError.
      if (result && result.success === false) {
        this.logger.info('Quest progress refused', { reason: result.reason });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to set quest progress', error);
      throw new Error(
        `Failed to set quest progress: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
