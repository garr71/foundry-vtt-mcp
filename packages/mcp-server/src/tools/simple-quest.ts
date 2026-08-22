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
        name: 'get-timeline',
        description:
          'Read a Simple Quest timeline the way the module actually renders it, and report what will NOT appear. Simple Quest drops any event whose year falls in no era: the page still exists and every field reads back correctly, so nothing else reveals it. This tool lists those under "orphanedEvents" with the reason for each. Era containment is exclusive at the end (an event dated exactly on an eraEnd belongs to the NEXT era, not that one), and null compares as 0, so an era with no eraEnd covers nothing at or above year 0 and an event with no year is treated as year 0 rather than excluded. Also returns the six axis flags with the defaults Simple Quest itself applies, each page uuid for cross-links, layout warnings (an era with no eraEnd is sized as 0 minus eraStart, so it takes NEGATIVE height and can drag the whole axis to zero, at which point the columns collapse and the view stops scrolling; a negative era also drags the layout cursor BACKWARDS so every era after it is drawn on top of the ones before it; an era with no eraEnd DISPLAYS the next era start as its end and so looks bounded while capturing nothing; also zero-length eras, overlaps, and eras sized for events that never draw), the axis totalHeight and each era pixel band, and a playerView showing which events the party will not see because the era containing them is hidden. Read-only. A journal is a timeline only by living in the Timeline folder — there is no marker flag — so this reports inTimelineFolder too.',
        inputSchema: {
          type: 'object',
          properties: {
            journalId: {
              type: 'string',
              description: 'The timeline journal to read. Use this or "journalName".',
            },
            journalName: {
              type: 'string',
              description:
                'EXACT journal name, matched exactly and never as a substring. If neither this nor journalId is given and exactly one timeline journal exists, that one is read and "resolvedBy" says so; if several exist the call is refused and they are listed.',
            },
          },
        },
      },
      {
        name: 'set-timeline-config',
        description:
          'Set the axis settings on a Simple Quest timeline journal: scale, era abbreviations and content behaviour. These are journal-level settings, not page fields. ONLY the settings you name are written; anything omitted keeps its current value, so this never resets a timeline you have already tuned. Values are validated by hand because Simple Quest flags have no data model to check them against, and a wrong type is stored silently and then used in arithmetic. Call with only a journal identifier to read the settings currently in effect without writing anything. Use get-timeline to see the result on the axis.',
        inputSchema: {
          type: 'object',
          properties: {
            journalId: {
              type: 'string',
              description: 'The timeline journal. Use this or \"journalName\".',
            },
            journalName: {
              type: 'string',
              description:
                'EXACT journal name, never a substring. If neither identifier is given and exactly one timeline journal exists, that one is used; if several exist the call is refused and they are listed.',
            },
            timeScale: {
              type: 'number',
              description:
                'Pixels per year. Default 10. Must be at least 0.1 — Simple Quest floors it at 0.1 when rendering, so anything smaller would be stored but never used.',
            },
            dynamicTimeScale: {
              type: 'boolean',
              description:
                'Default false. When true, eras are sized by how many events they contain rather than by how many years they span.',
            },
            negativeAbb: {
              type: 'string',
              description:
                'Suffix for negative years. Default \"BC\". Empty is allowed and meaningful: Simple Quest falls back to a minus sign when it is blank.',
            },
            positiveAbb: {
              type: 'string',
              description: 'Suffix for positive years. Default \"AC\".',
            },
            showMinus: {
              type: 'boolean',
              description:
                'Default false. Print a minus sign on negative years in addition to the abbreviation.',
            },
            content: {
              type: 'string',
              description:
                'How era and event bodies show: \"always\" (default), \"toggleOff\" (collapsed, expandable) or \"toggleOn\" (expanded, collapsible).',
            },
          },
        },
      },
      {
        name: 'create-simple-quest-page',
        description:
          'Create one Simple Quest page (quest, lore, character, creature, faction, location, event, era, achievement). Call get-simple-quest-context first for the exact system field names. IMPORTANT — defaults are for PREP and deliberately differ from the Simple Quest module\'s own: the page is created hidden from players (ownership none on both journal and page), a quest page gets status -1 (Undiscovered) rather than the module default 0 (In Progress), and every objective in the body is marked secret. Pass visibleToPlayers: true to create it already visible, or reveal later with the visibility tool. Body prose goes in "text" as HTML; quest objectives are <li> items in that HTML. One page per call. For "event" and "era" pages the response carries a "timeline" block saying whether the page will actually render: an event whose year falls in no era is written successfully and NEVER drawn, so the write is not refused but the warning must be read.',
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
                'Type-specific fields, e.g. {"questGiver":"Aldern","difficulty":"Moderate"}. Validated against the live data model by key AND by value — unknown keys are refused by name, and so is any value the model would not store as sent (Foundry cleans before it validates, so year 1.5 would become 2 and year "abc" would be dropped, both silently). The refusal names the value it would have stored. Nothing is written either way. Omit "status" to get the prep default of -1.',
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
          'Update an existing Simple Quest page. System fields MERGE — fields you do not name keep their current values. Use this for prose and metadata (questGiver, difficulty, location, tags, block content). It will NOT touch objectiveState (use set-quest-progress) or ownership (use the visibility tool), and it refuses a body rewrite that would strand objective state, since Simple Quest keys objective checkboxes by a slug of the objective text. Appending new objectives is safe and allowed. Can also set page counters via "flags" (the @COUNT / @REPUTATION state). Returns which system fields changed and which did not. For "event" and "era" pages it also returns a "timeline" block saying whether the page will actually render after the change: moving an event out of every era, or an era off a year that other events depend on, succeeds silently in Simple Quest and the events simply stop being drawn.',
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
                'Partial system fields to merge, e.g. {"difficulty":"Severe"}. Unknown keys are refused by name, and so is any value the model would not store as sent — a non-integer year, an out-of-range number, an unparseable one. The refusal names what it would have stored. Nothing is written either way. Foundry "-=" unset syntax is refused.',
            },
            allowOrphanedObjectives: {
              type: 'boolean',
              description:
                'Only if you intend to lose objective state that a body rewrite would strand. Default false.',
              default: false,
            },
            flags: {
              type: 'object',
              description:
                'Simple Quest page flags to merge. Only "counters" is managed here: an object of counter id to number, backing the @COUNT and @REPUTATION enrichers in the page body, e.g. {"counters":{"supplies":7}}. Ids are free-form but must not contain "."; values must be finite numbers. Counters set per leaf, so ids you do not name keep their values and a counter cannot be removed by omitting it. Every value is read back after writing and success is refused if it did not take.',
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
      {
        name: 'set-journal-visibility',
        description:
          'Control what players can see on a Simple Quest page. Two INDEPENDENT axes: visibleToPlayers grants or revokes access to the page itself (set on both the journal and the page, because a player needs OBSERVER on the journal to see the page at all), while revealObjectives/hideObjectives redact individual objectives inside a page they can already open. A secret objective on a hidden page changes nothing, and a revealed objective on a hidden page is still invisible. Objectives are addressed by key, exact text, or index, or "all"; a selector matching nothing fails loudly. If you reveal an objective nested under one that is still secret, the response reports hiddenByAncestor — the ancestor is NOT revealed automatically, since that would also expose its other children.',
        inputSchema: {
          type: 'object',
          properties: {
            journalId: { type: 'string', description: 'Journal containing the page.' },
            pageId: {
              type: 'string',
              description:
                'The Simple Quest page. Required for objective reveals. If omitted, only journal ownership changes and the response lists pages that remain hidden.',
            },
            visibleToPlayers: {
              type: 'boolean',
              description:
                'true grants players OBSERVER on the journal and page; false revokes to NONE. Omit to leave access unchanged.',
            },
            revealObjectives: {
              description:
                'Objectives to un-secret: "all", or an array of keys, exact texts, or indices.',
              oneOf: [{ type: 'string' }, { type: 'array', items: { type: ['string', 'number'] } }],
            },
            hideObjectives: {
              description:
                'Objectives to make secret: "all", or an array of keys, texts, or indices.',
              oneOf: [{ type: 'string' }, { type: 'array', items: { type: ['string', 'number'] } }],
            },
          },
          required: ['journalId'],
        },
      },
    ];
  }

  async handleSetTimelineConfig(args: any): Promise<any> {
    this.logger.info('Writing Simple Quest timeline config', {
      journalId: args?.journalId,
      journalName: args?.journalName,
    });

    try {
      // Returned as-is, refusals included: a rejected value names the setting and says what
      // is allowed, and that message would not survive ErrorHandler.handleToolError.
      return await this.foundryClient.query('foundry-mcp-bridge.setTimelineConfig', {
        journalId: args?.journalId,
        journalName: args?.journalName,
        timeScale: args?.timeScale,
        dynamicTimeScale: args?.dynamicTimeScale,
        negativeAbb: args?.negativeAbb,
        positiveAbb: args?.positiveAbb,
        showMinus: args?.showMinus,
        content: args?.content,
      });
    } catch (error) {
      this.logger.error('Failed to write timeline config', error);
      throw new Error(
        `Failed to write timeline config: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleGetTimeline(args: any): Promise<any> {
    this.logger.info('Reading Simple Quest timeline', {
      journalId: args?.journalId,
      journalName: args?.journalName,
    });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.getTimeline', {
        journalId: args?.journalId,
        journalName: args?.journalName,
      });

      // A refusal is an answer — several timeline journals, or none. Returned as-is rather
      // than thrown, so the message survives ErrorHandler.handleToolError.
      return result;
    } catch (error) {
      this.logger.error('Failed to read timeline', error);
      throw new Error(
        `Failed to read timeline: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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
      flags: z.record(z.unknown()).optional(),
    });

    const request = schema.parse(args);

    this.logger.info('Updating Simple Quest page', {
      pageId: request.pageId,
      fields: Object.keys(request.system ?? {}),
      flagKeys: Object.keys(request.flags ?? {}),
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

  async handleSetJournalVisibility(args: any): Promise<any> {
    const selector = z.union([z.string(), z.array(z.union([z.string(), z.number()]))]);
    const schema = z.object({
      journalId: z.string().min(1),
      pageId: z.string().optional(),
      visibleToPlayers: z.boolean().optional(),
      revealObjectives: selector.optional(),
      hideObjectives: selector.optional(),
    });

    const request = schema.parse(args);

    this.logger.info('Setting Simple Quest visibility', {
      journalId: request.journalId,
      pageId: request.pageId,
      visibleToPlayers: request.visibleToPlayers,
      revealing: request.revealObjectives,
      hiding: request.hideObjectives,
    });

    try {
      const result = await this.foundryClient.query(
        'foundry-mcp-bridge.setJournalVisibility',
        request
      );

      // This tool changes what players see by definition, so its outcomes are logged in
      // full — including hiddenByAncestor, the case where the write succeeded and the
      // players still see nothing.
      if (result && result.success === false) {
        this.logger.info('Visibility change refused', { reason: result.reason });
      } else if (result?.hiddenByAncestor) {
        this.logger.warn('Objectives revealed in data but hidden by a secret ancestor', {
          hiddenByAncestor: result.hiddenByAncestor,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to set visibility', error);
      throw new Error(
        `Failed to set visibility: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
