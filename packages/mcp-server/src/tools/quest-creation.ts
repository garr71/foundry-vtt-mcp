import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';
import { ErrorHandler } from '../utils/error-handler.js';

export interface QuestCreationToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/**
 * Foundry's src-backed core page types — the ones whose body is a file path rather than
 * prose (`common/documents/journal-entry-page.mjs` L32 lists all four core types; `text` is
 * the fourth). Module-defined subtypes are never in this set: they keep their body in the
 * core `text.content`, which is why searching only `type === 'text'` missed all of them.
 *
 * Deliberately mirrored from `SRC_BACKED_PAGE_TYPES` in the foundry-module package rather
 * than shared: the two packages have no common runtime, and three strings behind a comment
 * is cheaper than a shared-package import for a value that has not changed since v10.
 */
const SRC_BACKED_PAGE_TYPES = new Set(['image', 'video', 'pdf']);

// Quest creation types
interface QuestJournalRequest {
  questTitle: string;
  questDescription: string;
  questType?:
    | 'main'
    | 'side'
    | 'personal'
    | 'mystery'
    | 'fetch'
    | 'escort'
    | 'kill'
    | 'collection'
    | undefined;
  difficulty?: 'easy' | 'medium' | 'hard' | 'deadly' | undefined;
  location?: string | undefined;
  questGiver?: string | undefined;
  npcName?: string | undefined;
  rewards?: string | undefined;
}

interface QuestJournalResult {
  journalId: string;
  journalName: string;
  content: string;
  success: boolean;
}

export class QuestCreationTools {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor(options: QuestCreationToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger;
    this.errorHandler = new ErrorHandler(this.logger);
  }

  /**
   * Get all tool definitions for MCP registration
   */
  getToolDefinitions() {
    return [
      {
        name: 'create-quest-journal',
        description:
          'Create a new quest journal entry with AI-generated content based on natural language description',
        inputSchema: {
          type: 'object',
          properties: {
            questTitle: {
              type: 'string',
              description: 'The title of the quest',
            },
            questDescription: {
              type: 'string',
              description: 'Detailed description of what the quest should accomplish',
            },
            questType: {
              type: 'string',
              enum: [
                'main',
                'side',
                'personal',
                'mystery',
                'fetch',
                'escort',
                'kill',
                'collection',
              ],
              description: 'Type of quest (optional)',
            },
            difficulty: {
              type: 'string',
              enum: ['easy', 'medium', 'hard', 'deadly'],
              description: 'Quest difficulty level (optional)',
            },
            location: {
              type: 'string',
              description: 'Where the quest takes place (optional)',
            },
            questGiver: {
              type: 'string',
              description: 'Name of the NPC who gives this quest to the party (optional)',
            },
            npcName: {
              type: 'string',
              description:
                'Name of key NPC this quest involves - could be antagonist, ally, or target (optional)',
            },
            rewards: {
              type: 'string',
              description: 'Quest rewards description (optional)',
            },
            additionalPages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Page name (e.g. "Player Handout", "GM Notes")',
                  },
                  content: { type: 'string', description: 'HTML content for this page' },
                },
                required: ['name', 'content'],
              },
              description:
                'Optional additional pages to create alongside the main quest page. Use for multi-page journals with separate sections like Player Handout, GM Notes, etc.',
            },
            folderName: {
              type: 'string',
              description:
                'Optional folder name to organize the journal into. The folder is created automatically if it does not exist.',
            },
          },
          required: ['questTitle', 'questDescription'],
        },
      },
      {
        name: 'link-quest-to-npc',
        description: 'Link an existing quest journal to an NPC in the world',
        inputSchema: {
          type: 'object',
          properties: {
            journalId: {
              type: 'string',
              description: 'ID of the quest journal entry',
            },
            npcName: {
              type: 'string',
              description: 'Name of the NPC to link to the quest',
            },
            relationship: {
              type: 'string',
              enum: ['quest_giver', 'target', 'ally', 'enemy', 'contact'],
              description: 'Relationship between NPC and quest',
            },
          },
          required: ['journalId', 'npcName', 'relationship'],
        },
      },
      {
        name: 'update-quest-journal',
        description:
          'Update an existing quest journal with new progress information. By default updates the FIRST text page. Use pageId to target a specific page, or newPageName to create a new page.\n\nFor Foundry VTT v13 ProseMirror editor compatibility:\n\n✅ USE QUEST-STYLE HTML: Match create-quest-journal formatting\n✅ OR USE PLAIN TEXT: Will be wrapped in <p> tags with line breaks as <br>\n❌ DO NOT USE MARKDOWN: **bold**, *italic*, # headers will be stripped to plain text\n\nQuest-style HTML examples:\n• Sections: "<h2 class=\\"spaced\\">New Discovery</h2>"\n• GM Notes: "<div class=\\"gmnote\\"><p>GM info here</p></div>"\n• Player Info: "<div class=\\"readaloud\\"><p>Player-facing content</p></div>"\n• Plain text: "The party discovered the secret chamber"\n• Avoid: "**The party** discovered the *secret chamber*" (Markdown will be stripped)',
        inputSchema: {
          type: 'object',
          properties: {
            journalId: {
              type: 'string',
              description: 'ID of the quest journal to update',
            },
            newContent: {
              type: 'string',
              description:
                'Content to add using quest-style HTML or plain text. Quest HTML classes: <h2 class="spaced">Section</h2>, <div class="gmnote"><p>GM info</p></div>, <div class="readaloud"><p>Player content</p></div>, <div class="grid-2">Two columns</div>. Plain text gets wrapped in <p> tags. Markdown will be stripped.',
            },
            updateType: {
              type: 'string',
              enum: ['progress', 'completion', 'failure', 'modification'],
              description: 'Type of update being made',
            },
            pageId: {
              type: 'string',
              description:
                'ID of a specific page to update. If omitted, updates the first text page. Get page IDs from list-journals.',
            },
            newPageName: {
              type: 'string',
              description:
                'If provided (without pageId), creates a new page with this name instead of updating an existing one.',
            },
            pageType: {
              type: 'string',
              description:
                'Page type for a new page (only with newPageName). Defaults to "text". Module-defined subtypes are allowed, e.g. "simple-quest.lore". An unknown type is refused with the list of available types.',
            },
            pageSystem: {
              type: 'object',
              description:
                'Type-specific system fields for a new page (only with newPageName), e.g. {"questGiver":"Aldern"}. Validated against the live data model: unknown keys are refused BY NAME and nothing is written, because Foundry would otherwise discard them silently and report success. Page body text goes in newContent, not here.',
            },
            replaceContent: {
              type: 'boolean',
              description:
                'If true, REPLACES the entire page content instead of appending. Use this when you need to edit existing text (fix typos, rewrite sections, insert mid-page). Read the page first with list-journals to get the current HTML, modify it, then write back the full content. Refused on Simple Quest quest pages, which would lose their objective state. Default: false (append).',
              default: false,
            },
          },
          required: ['journalId', 'newContent', 'updateType'],
        },
      },
      {
        name: 'list-journals',
        description:
          "List all journal entries, or read a specific journal/page. Without parameters: lists all journals with their pages (id, name, type). With journalId: reads the journal's first text page content and shows all available pages. With journalId + pageId: reads a specific page's full content.",
        inputSchema: {
          type: 'object',
          properties: {
            filterQuests: {
              type: 'boolean',
              description: 'Only show journals that appear to be quest-related (default: false)',
            },
            includeContent: {
              type: 'boolean',
              description: 'Include journal content preview (default: false)',
            },
            journalId: {
              type: 'string',
              description:
                "If provided, read this journal's content instead of listing all journals. Returns full page content and a list of all pages in the journal.",
            },
            pageId: {
              type: 'string',
              description:
                "If provided with journalId, read this specific page's content. Get page IDs from the pages array returned when listing journals or reading a journal.",
            },
          },
        },
      },
      {
        name: 'search-journals',
        description:
          'Search through all pages of all journal entries for specific content or keywords. Covers text pages and module-defined page subtypes (e.g. Simple Quest pages); image, video and PDF pages are excluded from content search because their body is a file path, not prose. Returns which specific page matched, so you can read it with list-journals using journalId + pageId.',
        inputSchema: {
          type: 'object',
          properties: {
            searchQuery: {
              type: 'string',
              description: 'Text to search for in journal entries',
            },
            searchType: {
              type: 'string',
              enum: ['title', 'content', 'both'],
              description: 'Where to search (default: both)',
            },
          },
          required: ['searchQuery'],
        },
      },
    ];
  }

  /**
   * Handle create quest journal request
   */
  async handleCreateQuestJournal(args: any): Promise<any> {
    try {
      // Validate arguments
      const requestSchema = z.object({
        questTitle: z.string().min(1, 'Quest title is required'),
        questDescription: z.string().min(1, 'Quest description is required'),
        questType: z
          .enum(['main', 'side', 'personal', 'mystery', 'fetch', 'escort', 'kill', 'collection'])
          .optional(),
        difficulty: z.enum(['easy', 'medium', 'hard', 'deadly']).optional(),
        location: z.string().optional(),
        questGiver: z.string().optional(),
        npcName: z.string().optional(),
        rewards: z.string().optional(),
        additionalPages: z
          .array(
            z.object({
              name: z.string().min(1),
              content: z.string().min(1),
            })
          )
          .optional(),
        folderName: z.string().optional(),
      });

      const request = requestSchema.parse(args);

      // Generate formatted quest content
      const questContent = this.generateQuestContent(request);

      // Create journal entry via Foundry client
      const result = await this.foundryClient.query('foundry-mcp-bridge.createJournalEntry', {
        name: request.questTitle,
        content: questContent,
        additionalPages: request.additionalPages,
        ...(request.folderName ? { folderName: request.folderName } : {}),
      });

      if (!result || result.error) {
        throw new Error(result?.error || 'Failed to create quest journal');
      }

      return {
        success: true,
        journalId: result.id,
        journalName: result.name,
        pageCount: result.pageCount || 1,
        content: questContent,
        message: `Quest "${request.questTitle}" created successfully with ${result.pageCount || 1} page(s)`,
      };
    } catch (error) {
      this.errorHandler.handleToolError(error, 'create-quest-journal', 'quest creation');
    }
  }

  /**
   * Handle link quest to NPC request
   */
  async handleLinkQuestToNPC(args: any): Promise<any> {
    try {
      const requestSchema = z.object({
        journalId: z.string().min(1, 'Journal ID is required'),
        npcName: z.string().min(1, 'NPC name is required'),
        relationship: z.enum(['quest_giver', 'target', 'ally', 'enemy', 'contact']),
      });

      const request = requestSchema.parse(args);

      // Get journal content first
      const journalResult = await this.foundryClient.query('foundry-mcp-bridge.getJournalContent', {
        journalId: request.journalId,
      });

      if (!journalResult || journalResult.error) {
        throw new Error('Journal not found');
      }

      // Add NPC relationship information to journal
      const updatedContent = this.addNPCLinkToJournal(
        journalResult.content,
        request.npcName,
        request.relationship
      );

      // Update journal with NPC link
      const updateResult = await this.foundryClient.query(
        'foundry-mcp-bridge.updateJournalContent',
        {
          journalId: request.journalId,
          content: updatedContent,
        }
      );

      if (!updateResult || updateResult.error) {
        throw new Error('Failed to update journal with NPC link');
      }

      return {
        success: true,
        message: `Linked ${request.npcName} to quest as ${request.relationship.replace('_', ' ')}`,
      };
    } catch (error) {
      this.errorHandler.handleToolError(error, 'link-quest-to-npc', 'linking quest to NPC');
    }
  }

  // REMOVED: analyze-campaign-context tool - was causing too many debugging issues
  // Enhanced creature index is still available for other tools that need monster detection

  /**
   * Handle update quest journal request
   */
  async handleUpdateQuestJournal(args: any): Promise<any> {
    try {
      const requestSchema = z.object({
        journalId: z.string().min(1, 'Journal ID is required'),
        newContent: z.string().min(1, 'New content is required'),
        updateType: z.enum(['progress', 'completion', 'failure', 'modification']),
        pageId: z.string().optional(),
        newPageName: z.string().optional(),
        pageType: z.string().optional(),
        pageSystem: z.record(z.unknown()).optional(),
        replaceContent: z.boolean().default(false),
      });

      const request = requestSchema.parse(args);

      // Auto-convert Markdown to plain text with warning (don't block)
      request.newContent = this.convertMarkdownToPlainText(request.newContent);

      // If creating a new page, skip the read-modify-write cycle
      if (request.newPageName) {
        // A typed page carries its own structure; the quest-update HTML wrapper is for plain
        // text pages, so leave the caller's content alone when they asked for a subtype.
        const formattedContent =
          request.pageType && request.pageType !== 'text'
            ? request.newContent
            : this.formatNewPageContent(request.newContent, request.updateType);

        const result = await this.foundryClient.query('foundry-mcp-bridge.updateJournalContent', {
          journalId: request.journalId,
          content: formattedContent,
          newPageName: request.newPageName,
          type: request.pageType,
          system: request.pageSystem,
        });

        if (!result) {
          throw new Error('Failed to create new journal page');
        }

        // A schema rejection is a policy outcome, not an exception. Returned rather than
        // thrown because ErrorHandler.handleToolError replaces the message with a generic
        // template — and here the message IS the deliverable: it names the bad keys and
        // lists the real ones. Throwing it would erase exactly the part worth reading.
        if (!result.success && result.rejected) {
          this.logger.info('Rejected typed page creation: keys not in live schema', {
            journalId: request.journalId,
            pageType: request.pageType,
            rejected: result.rejected,
          });
          return {
            success: false,
            refused: true,
            reason: 'unknown-system-keys',
            rejected: result.rejected,
            accepted: result.accepted,
            message: result.message,
          };
        }

        if (result.error || !result.success) {
          throw new Error(result?.error || 'Failed to create new journal page');
        }

        return {
          success: true,
          updateType: request.updateType,
          message: `New page "${request.newPageName}" created in journal`,
          pageId: result.pageId,
          pageName: result.pageName,
          pageType: result.pageType,
          verified: true,
        };
      }

      // Replace mode: write newContent directly as the full page content (no read-modify-append)
      if (request.replaceContent) {
        // Simple Quest quest pages store objective state in system.objectiveState, keyed by a
        // slug derived from each objective's <li> text at render time. Rewriting text.content
        // changes those derived keys, orphaning every stored entry: checkboxes and secrets all
        // reset, with no error and a success response. Refuse rather than corrupt.
        // Only reachable with an explicit pageId — without one, updateJournalContent targets the
        // first page of type 'text', which an SQ quest page never is.
        if (request.pageId) {
          const target = await this.foundryClient.query(
            'foundry-mcp-bridge.getJournalPageContent',
            {
              journalId: request.journalId,
              pageId: request.pageId,
            }
          );

          if (this.isSimpleQuestQuestPage(target?.type)) {
            // Return rather than throw. This is a deliberate policy decision, not an exceptional
            // condition, and the method's catch routes every throw through
            // ErrorHandler.handleToolError, which discards the message and substitutes a generic
            // "unexpected error" template. A refusal that reads like a crash is worse than no
            // refusal: the Phase 5 gate could not tell the guard firing from the tool breaking.
            // Structured refusals match the precedent in queries.ts ({ error, success: false }).
            this.logger.info('Refused replaceContent on a Simple Quest quest page', {
              journalId: request.journalId,
              pageId: request.pageId,
              pageType: target.type,
            });

            return {
              success: false,
              refused: true,
              reason: 'simple-quest-objective-state',
              pageId: request.pageId,
              pageName: target?.name ?? null,
              pageType: target.type,
              message:
                `Refused: page "${target?.name ?? request.pageId}" is a Simple Quest quest page ` +
                `(type: ${target.type}). Replacing its content would reset every objective ` +
                `checkbox, because Simple Quest derives objective state keys from the objective ` +
                `text itself. Nothing was modified. Edit the page in Foundry instead, or read ` +
                `it with list-journals — the reader returns its body and an objective manifest.`,
            };
          }
        }

        const result = await this.foundryClient.query('foundry-mcp-bridge.updateJournalContent', {
          journalId: request.journalId,
          content: request.newContent,
          pageId: request.pageId,
        });

        if (!result || result.error || !result.success) {
          throw new Error(result?.error || 'Failed to replace journal content');
        }

        return {
          success: true,
          updateType: request.updateType,
          message: `Page content replaced in journal`,
          pageId: result.pageId,
          pageName: result.pageName,
          verified: true,
          replaceContent: true,
        };
      }

      // Append mode (default): read current content, format the update, append
      let currentContent: string;
      if (request.pageId) {
        const pageResult = await this.foundryClient.query(
          'foundry-mcp-bridge.getJournalPageContent',
          {
            journalId: request.journalId,
            pageId: request.pageId,
          }
        );
        if (!pageResult || pageResult.error) {
          throw new Error(`Page not found: ${request.pageId}`);
        }

        // These pages are readable now (Phase 7a.0a), so this is no longer "there is nothing to
        // append to" — it is a scope refusal. This tool appends quest-update HTML shaped for a
        // plain text page; a module-defined subtype keeps structured state alongside its body
        // that this path knows nothing about. Simple Quest pages get their own writers in 7a.
        // Still returned rather than thrown: ErrorHandler.handleToolError discards the message,
        // and the Phase 5 gate could not tell the guard firing from the tool breaking.
        if (pageResult.type && pageResult.type !== 'text') {
          this.logger.info('Append not possible: page type is not readable as text', {
            journalId: request.journalId,
            pageId: request.pageId,
            pageType: pageResult.type,
          });

          return {
            success: false,
            refused: true,
            reason: 'unreadable-page-type',
            pageId: request.pageId,
            pageName: pageResult.name ?? null,
            pageType: pageResult.type,
            message:
              `Cannot append to page "${pageResult.name ?? request.pageId}": its type is ` +
              `"${pageResult.type}", not "text". This tool writes quest-update HTML shaped for ` +
              `plain text pages and would ignore the structured state a module subtype keeps ` +
              `alongside its body. Nothing was modified. The page is readable — list-journals ` +
              `returns its content.` +
              (this.isSimpleQuestQuestPage(pageResult.type)
                ? ' Simple Quest quest pages must be edited through Simple Quest itself; ' +
                  'replaceContent is refused on them as well, because it would reset every ' +
                  'objective checkbox.'
                : ''),
          };
        }

        currentContent = pageResult.content;
      } else {
        const currentJournal = await this.foundryClient.query(
          'foundry-mcp-bridge.getJournalContent',
          {
            journalId: request.journalId,
          }
        );
        if (!currentJournal || currentJournal.error) {
          throw new Error(
            `Journal not found: ${currentJournal?.error || 'Journal ID may be invalid'}`
          );
        }
        currentContent = currentJournal.content;
      }

      if (!currentContent) {
        throw new Error('Journal/page exists but has no content to update');
      }

      // Format the update based on type
      // For specific page updates, use append-style since the page may not have quest HTML structure
      let updatedContent: string;
      if (request.pageId) {
        const formattedNew = this.formatUpdateContentForFoundry(request.newContent);
        updatedContent = currentContent + formattedNew;
      } else {
        updatedContent = this.formatQuestUpdate(
          currentContent,
          request.newContent,
          request.updateType
        );
      }

      // Update the journal
      const result = await this.foundryClient.query('foundry-mcp-bridge.updateJournalContent', {
        journalId: request.journalId,
        content: updatedContent,
        pageId: request.pageId,
      });

      if (!result) {
        throw new Error('Failed to update quest journal: No response from Foundry');
      }

      if (result.error) {
        throw new Error(`Failed to update quest journal: ${result.error}`);
      }

      if (!result.success) {
        throw new Error('Failed to update quest journal: Update operation returned failure');
      }

      // Verify the update by reading the content back
      let verifyContent: string;
      if (request.pageId) {
        const verifyResult = await this.foundryClient.query(
          'foundry-mcp-bridge.getJournalPageContent',
          {
            journalId: request.journalId,
            pageId: request.pageId,
          }
        );
        verifyContent = verifyResult?.content || '';
      } else {
        const verifyResult = await this.foundryClient.query(
          'foundry-mcp-bridge.getJournalContent',
          {
            journalId: request.journalId,
          }
        );
        verifyContent = verifyResult?.content || '';
      }

      // Check if verification content contains the formatted update rather than raw content
      const verificationPassed =
        verifyContent &&
        (verifyContent.length > currentContent.length || // Content grew
          verifyContent !== currentContent || // Content changed
          verifyContent.includes(request.newContent) || // Raw content found
          verifyContent.includes('Progress Update') || // Progress update section found
          verifyContent.includes('Quest Complete') || // Completion section found
          verifyContent.includes('Quest Failed')); // Failure section found

      if (!verificationPassed) {
        throw new Error(
          `Journal update verification failed: Content was not updated as expected. Original length: ${currentContent.length}, New length: ${verifyContent?.length || 0}`
        );
      }

      return {
        success: true,
        updateType: request.updateType,
        message: `Quest journal updated with ${request.updateType}`,
        pageId: result.pageId,
        pageName: result.pageName,
        verified: true,
        details: `Content successfully updated and verified. Content length changed from ${currentContent.length} to ${verifyContent.length} characters.`,
        updatedContent: verifyContent,
      };
    } catch (error) {
      this.errorHandler.handleToolError(error, 'update-quest-journal', 'journal update');
    }
  }

  /**
   * Handle list journals request
   */
  async handleListJournals(args: any): Promise<any> {
    try {
      const requestSchema = z.object({
        filterQuests: z.boolean().optional().default(false),
        includeContent: z.boolean().optional().default(false),
        journalId: z.string().optional(),
        pageId: z.string().optional(),
      });

      const request = requestSchema.parse(args);

      // Mode: Read a specific page
      if (request.journalId && request.pageId) {
        const pageResult = await this.foundryClient.query(
          'foundry-mcp-bridge.getJournalPageContent',
          {
            journalId: request.journalId,
            pageId: request.pageId,
          }
        );

        if (!pageResult || pageResult.error) {
          throw new Error(pageResult?.error || 'Page not found');
        }

        return {
          success: true,
          mode: 'page',
          journalId: request.journalId,
          page: pageResult,
        };
      }

      // Mode: Read a specific journal (first page + page manifest)
      if (request.journalId) {
        const journalContent = await this.foundryClient.query(
          'foundry-mcp-bridge.getJournalContent',
          {
            journalId: request.journalId,
          }
        );

        if (!journalContent || journalContent.error) {
          throw new Error(journalContent?.error || 'Journal not found');
        }

        return {
          success: true,
          mode: 'journal',
          journalId: request.journalId,
          content: journalContent.content,
          currentPage: journalContent.currentPage,
          allPages: journalContent.allPages,
          pageCount: journalContent.pageCount,
          note: journalContent.note,
        };
      }

      // Mode: List all journals
      const journals = await this.foundryClient.query('foundry-mcp-bridge.listJournals', {});

      if (!journals || journals.error) {
        throw new Error('Failed to retrieve journals');
      }

      let filteredJournals = journals;

      // Filter for quest-related journals if requested
      if (request.filterQuests) {
        filteredJournals = journals.filter((journal: any) => this.isQuestRelated(journal.name));
      }

      // Include content if requested
      if (request.includeContent) {
        for (const journal of filteredJournals) {
          try {
            const content = await this.foundryClient.query('foundry-mcp-bridge.getJournalContent', {
              journalId: journal.id,
            });
            journal.contentPreview = content?.content?.substring(0, 150) + '...' || '';
          } catch (error) {
            journal.contentPreview = 'Error loading content';
          }
        }
      }

      return {
        success: true,
        mode: 'list',
        journals: filteredJournals,
        total: filteredJournals.length,
        filtered: request.filterQuests,
      };
    } catch (error) {
      this.errorHandler.handleToolError(error, 'list-journals', 'journal listing');
    }
  }

  /**
   * Handle search journals request
   */
  async handleSearchJournals(args: any): Promise<any> {
    try {
      const requestSchema = z.object({
        searchQuery: z.string().min(1, 'Search query is required'),
        searchType: z.enum(['title', 'content', 'both']).optional().default('both'),
      });

      const request = requestSchema.parse(args);

      // Get all journals (now includes page metadata)
      const journals = await this.foundryClient.query('foundry-mcp-bridge.listJournals', {});

      if (!journals || journals.error) {
        throw new Error('Failed to retrieve journals');
      }

      const searchResults = [];
      const query = request.searchQuery.toLowerCase();
      let pagesRead = 0;
      let pagesFailed = 0;
      let firstPageError: string | null = null;

      for (const journal of journals) {
        let matches = false;
        const matchInfo: any = {
          id: journal.id,
          name: journal.name,
          pageCount: journal.pageCount || 0,
          matchType: [],
          matchedPages: [],
        };

        // Search title
        if (request.searchType === 'title' || request.searchType === 'both') {
          if (journal.name.toLowerCase().includes(query)) {
            matches = true;
            matchInfo.matchType.push('title');
          }
        }

        // Search content across ALL pages
        if (request.searchType === 'content' || request.searchType === 'both') {
          const pages = journal.pages || [];
          for (const page of pages) {
            // Was `page.type !== 'text'`, which made every module-defined subtype
            // unsearchable — including every Simple Quest page this phase creates.
            // Skip only the src-backed core types: their "content" is a file path, so
            // matching it would return image assets for a prose query. Mirrors
            // SRC_BACKED_PAGE_TYPES in data-access.ts, which resolves the same split.
            if (SRC_BACKED_PAGE_TYPES.has(page.type)) continue;
            pagesRead++;
            try {
              const pageContent = await this.foundryClient.query(
                'foundry-mcp-bridge.getJournalPageContent',
                {
                  journalId: journal.id,
                  pageId: page.id,
                }
              );

              if (pageContent?.content?.toLowerCase().includes(query)) {
                matches = true;
                if (!matchInfo.matchType.includes('content')) {
                  matchInfo.matchType.push('content');
                }
                matchInfo.matchedPages.push({
                  pageId: page.id,
                  pageName: page.name,
                  contentSnippet: this.extractSnippet(pageContent.content, request.searchQuery),
                });
              }
            } catch (error) {
              // Count the miss, do not just swallow it. Upstream skipped silently, so a
              // dead Foundry connection produced "0 results" with every read having
              // failed — indistinguishable from "nothing matched", which mid-session
              // reads as "it is not in the journals". Found exactly that way while
              // gating 0c.
              pagesFailed++;
              if (!firstPageError) {
                firstPageError = error instanceof Error ? error.message : String(error);
              }
            }
          }
        }

        if (matches) {
          searchResults.push(matchInfo);
        }
      }

      // Every page read failed: that is an outage, not an empty result set. Reported as a
      // failure rather than as zero matches, because the two are indistinguishable to the
      // caller and the wrong one gets read as "it is not in the journals". Returned, not
      // thrown — handleToolError would discard the counts and the underlying message.
      if (pagesRead > 0 && pagesFailed === pagesRead) {
        this.logger.warn('Journal content search failed on every page', {
          pagesRead,
          firstPageError,
        });
        return {
          success: false,
          searchQuery: request.searchQuery,
          searchType: request.searchType,
          results: [],
          totalMatches: 0,
          pagesRead,
          pagesFailed,
          message:
            `Search could not read any of the ${pagesRead} candidate pages, so this is NOT ` +
            `a "no results" answer — nothing was actually searched. Foundry is most likely ` +
            `disconnected; check the bridge and retry. First error: ${firstPageError}`,
        };
      }

      return {
        success: true,
        searchQuery: request.searchQuery,
        searchType: request.searchType,
        results: searchResults,
        totalMatches: searchResults.length,
        pagesRead,
        // Present only when it happened, so a clean search stays quiet, but a partial one
        // can never be mistaken for a complete one.
        ...(pagesFailed > 0
          ? {
              pagesFailed,
              partial: true,
              message:
                `${pagesFailed} of ${pagesRead} pages could not be read and were not ` +
                `searched; results may be incomplete. First error: ${firstPageError}`,
            }
          : {}),
      };
    } catch (error) {
      this.errorHandler.handleToolError(error, 'search-journals', 'journal search');
    }
  }

  /**
   * Generate formatted quest content from request (HTML for Foundry v13 ProseMirror)
   * Uses professional styling that mimics Lost Mine of Phandelver templates
   */
  private generateQuestContent(request: QuestJournalRequest): string {
    // Build the HTML body content using professional template fragments
    const htmlBody = this.buildStyledQuestContent(request);

    // Wrap in styled template
    return this.createStyledJournal(request.questTitle, htmlBody);
  }

  /**
   * Create a professional styled journal with CSS that mimics Lost Mine of Phandelver
   */
  private createStyledJournal(title: string, htmlBody: string): string {
    return `
    <section class="mcp-journal">
      <style>
        .mcp-journal { --ink:#222; --muted:#666; --paper:#f8f5f2; --gm:#f2f2f2; --accent:#b33; --rule:#ddd; font-size:14px; line-height:1.6; color:var(--ink); }
        .mcp-journal .wrap { max-width: 980px; margin: 0 auto; padding: 8px 12px 24px; }
        .mcp-journal h1 { font-size: 28px; letter-spacing: .5px; text-align: center; margin: 8px 0 6px; }
        .mcp-journal .orn { height: 10px; border: 0; border-top: 2px solid var(--rule); margin: 8px auto 16px; width: 60%; }
        .mcp-journal h2 { font-size: 20px; margin: 18px 0 6px; }
        .mcp-journal h3 { font-size: 16px; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: .04em; }
        .mcp-journal p.lead { font-size: 15px; color: var(--muted); margin: 0 0 10px; }
        .mcp-journal .readaloud { background: var(--paper); border-left: 4px solid var(--accent); padding: 10px 12px; margin: 12px 0; }
        .mcp-journal .gmnote { background: var(--gm); border-left: 4px solid #444; padding: 10px 12px; margin: 12px 0; }
        .mcp-journal ul { margin: 6px 0 10px 18px; }
        .mcp-journal .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px 24px; }
        .mcp-journal img { max-width: 100%; height: auto; border-radius: 2px; }
        .mcp-journal .meta { font-size: 12px; color: var(--muted); margin: 4px 0 12px; }
        .mcp-journal table { border-collapse: collapse; width: 100%; }
        .mcp-journal table th, .mcp-journal table td { border-bottom: 1px solid var(--rule); padding: 6px 4px; text-align: left; }
        .mcp-journal .spaced { margin-top: 14px; }
      </style>

      <div class="wrap">
        <h1>${title}</h1>
        <hr class="orn"/>

        ${htmlBody}
      </div>
    </section>`;
  }

  /**
   * Build professional quest content using template fragments
   */
  private buildStyledQuestContent(request: QuestJournalRequest): string {
    let htmlBody = '';

    // Lead paragraph with quest summary
    htmlBody += `<p class="lead">${request.questDescription}</p>`;

    // Background section (if we have enough detail to warrant it)
    if (request.location || request.questGiver || request.npcName) {
      htmlBody += '<h2>Background</h2>';
      let backgroundText = this.generateBackgroundText(request);
      htmlBody += `<p>${backgroundText}</p>`;
    }

    // Quest details in two-column layout
    if (
      request.questType ||
      request.difficulty ||
      request.location ||
      request.npcName ||
      request.rewards
    ) {
      htmlBody += '<div class="grid-2">';

      // Left column - Quest Details
      htmlBody += '<div><h3>Quest Details</h3><ul>';

      if (request.questType) {
        htmlBody += `<li><strong>Type:</strong> ${request.questType.charAt(0).toUpperCase() + request.questType.slice(1)} Quest</li>`;
      }

      if (request.difficulty) {
        htmlBody += `<li><strong>Difficulty:</strong> ${request.difficulty.charAt(0).toUpperCase() + request.difficulty.slice(1)}</li>`;
      }

      if (request.location) {
        htmlBody += `<li><strong>Location:</strong> ${request.location}</li>`;
      }

      if (request.questGiver) {
        htmlBody += `<li><strong>Quest Giver:</strong> ${request.questGiver}</li>`;
      }

      if (request.npcName) {
        htmlBody += `<li><strong>Key NPC:</strong> ${request.npcName}</li>`;
      }

      htmlBody += '</ul></div>';

      // Right column - Rewards & Status
      htmlBody += '<div><h3>Rewards & Status</h3><ul>';

      if (request.rewards) {
        htmlBody += `<li><strong>Rewards:</strong> ${request.rewards}</li>`;
      }

      htmlBody += `<li><strong>Status:</strong> Active</li>`;
      htmlBody += `<li><strong>Created:</strong> ${new Date().toLocaleDateString()}</li>`;

      htmlBody += '</ul></div>';
      htmlBody += '</div>'; // Close grid-2
    }

    // Adventure Hook section with proper quest giver logic
    htmlBody += '<h2 class="spaced">Adventure Hook</h2>';
    htmlBody += '<div class="readaloud">';

    const hookText = this.generateAdventureHook(request);
    htmlBody += hookText;
    htmlBody += '</div>';

    // GM Notes section with specific guidance
    htmlBody += '<div class="gmnote">';
    let gmNotes = '<p><strong>GM Notes:</strong> ';

    if (request.difficulty) {
      gmNotes += `This ${request.difficulty} difficulty quest `;
    } else {
      gmNotes += 'This quest ';
    }

    if (request.questType) {
      gmNotes += `is designed as a ${request.questType} quest. `;
    }

    gmNotes +=
      "Adjust encounters, NPCs, and obstacles to match your party's level and campaign tone. ";

    if (request.location) {
      gmNotes += `Consider the specific details of ${request.location} in your world. `;
    }

    if (request.rewards) {
      gmNotes +=
        "The specified rewards can be modified to better fit your campaign's economy and progression.";
    } else {
      gmNotes +=
        "Consider appropriate rewards based on the quest's difficulty and your party's level.";
    }

    gmNotes += '</p>';
    htmlBody += gmNotes;
    htmlBody += '</div>';

    // Quest Objectives section with intelligent objectives
    htmlBody += '<h2 class="spaced">Quest Objectives</h2>';
    htmlBody += '<ul>';

    const objectives = this.generateQuestObjectives(request);
    objectives.forEach(objective => {
      htmlBody += `<li>${objective}</li>`;
    });

    htmlBody += '</ul>';

    // Progress tracking section
    htmlBody += '<h2 class="spaced">Progress Notes</h2>';
    htmlBody += '<div class="gmnote">';
    htmlBody +=
      '<p><strong>GM Note:</strong> Use this section to track quest progress, player decisions, and any modifications made during gameplay.</p>';
    htmlBody += '</div>';

    return htmlBody;
  }

  /**
   * Add NPC link information to journal content (HTML for Foundry v13 ProseMirror)
   * Maintains professional styling by adding to the grid layout
   */
  private addNPCLinkToJournal(content: string, npcName: string, relationship: string): string {
    const relationshipText = relationship.replace('_', ' ');

    // Look for existing Related NPCs section in the grid
    if (content.includes('<h3>Related NPCs</h3>')) {
      // Add to existing NPC list
      return content.replace(
        '</ul></div></div>',
        `<li><strong>${npcName}:</strong> ${relationshipText}</li></ul></div></div>`
      );
    } else {
      // Find the end of the right column in the grid and add NPC section
      if (content.includes('<h3>Rewards & Status</h3>')) {
        const npcSection = `<li><strong>Related NPCs:</strong></li><li><strong>${npcName}:</strong> ${relationshipText}</li>`;
        return content.replace('</ul></div></div>', `${npcSection}</ul></div></div>`);
      } else {
        // If no grid exists, add a new GM note section for NPCs
        const npcSection = `<div class="gmnote"><p><strong>Related NPCs:</strong> ${npcName} (${relationshipText})</p></div>`;
        return content.replace('</div></section>', npcSection + '</div></section>');
      }
    }
  }

  // REMOVED: Campaign analysis quest generation methods

  // REMOVED: performReconnaissance method - was only used by campaign analysis

  // REMOVED: All campaign analysis helper methods - these were only used by the removed tool

  /**
   * Format quest update based on type (HTML for Foundry v13 ProseMirror)
   * Maintains professional styling by adding updates with proper section headings
   */
  /**
   * Is this page a Simple Quest *quest* page, i.e. one whose objective state is keyed by
   * objective text and would therefore be orphaned by a wholesale content rewrite?
   *
   * Deliberately narrow. Simple Quest 5.x ships twelve page subtypes, but only `quest` carries
   * `system.objectiveState`; the rest keep their data in typed system fields that a text.content
   * rewrite does not touch. A guard that refuses more than it must trains callers to work around it.
   *
   * This predicate is the seam for Phase 7a, which replaces the refusal with real key remapping.
   */
  private isSimpleQuestQuestPage(pageType: string | undefined): boolean {
    return pageType === 'simple-quest.quest';
  }

  /**
   * Format content for a brand new page (no existing content to append to)
   */
  private formatNewPageContent(newContent: string, updateType: string): string {
    const timestamp = new Date().toLocaleDateString();
    const formattedContent = this.formatUpdateContentForFoundry(newContent);
    const hasCustomHeading = /<h[1-6][^>]*>.*<\/h[1-6]>/i.test(newContent);

    if (hasCustomHeading) {
      return `<section class="mcp-journal">${formattedContent}</section>`;
    }

    let heading = '';
    switch (updateType) {
      case 'progress':
        heading = `<h2 class="spaced">Progress Update - ${timestamp}</h2>`;
        break;
      case 'completion':
        heading = `<h2 class="spaced">Quest Completed - ${timestamp}</h2>`;
        break;
      case 'failure':
        heading = `<h2 class="spaced">Quest Failed - ${timestamp}</h2>`;
        break;
      case 'modification':
        heading = `<h2 class="spaced">Quest Modified - ${timestamp}</h2>`;
        break;
    }

    return `<section class="mcp-journal">${heading}<div class="gmnote">${formattedContent}</div></section>`;
  }

  private formatQuestUpdate(
    currentContent: string,
    newContent: string,
    updateType: string
  ): string {
    const timestamp = new Date().toLocaleDateString();
    const formattedContent = this.formatUpdateContentForFoundry(newContent);
    let updateSection = '';

    // Check if content already has custom headings (like "<h2>The Thorned Grove</h2>")
    const hasCustomHeading = /<h[1-6][^>]*>.*<\/h[1-6]>/i.test(newContent);

    if (hasCustomHeading) {
      // Content already has themed sections - insert directly as peer sections
      // This allows custom headings like "<h2>The Thorned Grove</h2>" to be main sections
      updateSection = formattedContent;
    } else {
      // Create styled update section with generic headings
      switch (updateType) {
        case 'progress':
          updateSection = `<h2 class="spaced">Progress Update - ${timestamp}</h2><div class="gmnote">${formattedContent}</div>`;
          break;
        case 'completion':
          updateSection = `<h2 class="spaced">Quest Completed - ${timestamp}</h2><div class="readaloud">${formattedContent}</div>`;
          break;
        case 'failure':
          updateSection = `<h2 class="spaced">Quest Failed - ${timestamp}</h2><div class="gmnote">${formattedContent}</div>`;
          break;
        case 'modification':
          updateSection = `<h2 class="spaced">Quest Modified - ${timestamp}</h2><div class="gmnote">${formattedContent}</div>`;
          break;
      }
    }

    // Update quest status in the grid for completion/failure
    if (updateType === 'completion') {
      currentContent = currentContent.replace(
        '<li><strong>Status:</strong> Active</li>',
        '<li><strong>Status:</strong> Completed</li>'
      );
    } else if (updateType === 'failure') {
      currentContent = currentContent.replace(
        '<li><strong>Status:</strong> Active</li>',
        '<li><strong>Status:</strong> Failed</li>'
      );
    }

    // Add the update section before the closing section tag
    // Handle both possible closing patterns (with/without spacing)
    if (currentContent.includes('</div>\n    </section>')) {
      return currentContent.replace(
        '</div>\n    </section>',
        updateSection + '</div>\n    </section>'
      );
    } else {
      return currentContent.replace('</div></section>', updateSection + '</div></section>');
    }
  }

  /**
   * Format text content for Foundry VTT (convert to proper HTML)
   */
  private formatTextForFoundry(text: string): string {
    // Escape HTML to prevent injection
    let escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Convert line breaks to paragraphs
    const paragraphs = escaped.split('\n\n').filter(p => p.trim().length > 0);

    if (paragraphs.length === 0) {
      return '<p></p>';
    }

    if (paragraphs.length === 1) {
      // Single paragraph - handle line breaks within it
      return `<p>${paragraphs[0].replace(/\n/g, '<br>')}</p>`;
    }

    // Multiple paragraphs
    return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }

  /**
   * Format update content for Foundry VTT (preserve HTML like create-quest-journal)
   * Allows custom section headings and themed content with proper CSS classes
   */
  private formatUpdateContentForFoundry(content: string): string {
    // Trim whitespace
    const trimmed = content.trim();

    if (!trimmed) {
      return '<p></p>';
    }

    // Check if content already contains HTML tags - preserve them like create-quest-journal
    const hasHTMLTags = /<[^>]+>/.test(trimmed);

    if (hasHTMLTags) {
      // Content already has HTML structure - return as-is for themed sections
      // This allows custom headings like "<h2>The Thorned Grove</h2>" to work properly
      return trimmed;
    } else {
      // Plain text content - convert to paragraphs with line break handling
      const paragraphs = trimmed.split('\n\n').filter(p => p.trim().length > 0);

      if (paragraphs.length === 0) {
        return '<p></p>';
      }

      if (paragraphs.length === 1) {
        // Single paragraph - handle line breaks within it
        return `<p>${paragraphs[0].replace(/\n/g, '<br>')}</p>`;
      }

      // Multiple paragraphs
      return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    }
  }

  /**
   * Check if a journal appears to be quest-related
   */
  private isQuestRelated(journalName: string): boolean {
    const questKeywords = ['quest', 'mission', 'task', 'adventure', 'job', 'contract'];
    const nameLower = journalName.toLowerCase();
    return questKeywords.some(keyword => nameLower.includes(keyword));
  }

  /**
   * Extract content snippet around search term
   */
  private extractSnippet(content: string, searchTerm: string, maxLength: number = 200): string {
    const index = content.toLowerCase().indexOf(searchTerm.toLowerCase());
    if (index === -1) return '';

    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + maxLength);

    return '...' + content.substring(start, end) + '...';
  }

  /**
   * Determine if the named NPC is an antagonist based on quest description
   */
  private determineNPCRole(
    questDescription: string,
    npcName?: string
  ): 'quest_giver' | 'antagonist' | 'neutral' {
    if (!npcName) return 'neutral';

    const desc = questDescription.toLowerCase();
    const name = npcName.toLowerCase();

    // Keywords that suggest antagonist role
    const antagonistKeywords = [
      'stop',
      'defeat',
      'confront',
      'evil',
      'corrupt',
      'mad',
      'insane',
      'villain',
      'enemy',
      'threat',
      'dangerous',
      'rogue',
      'gone wrong',
      'obsessed',
      'twisted',
      'dark',
      'forbidden',
      'necro',
      'tyrant',
      'bandit',
      'cultist',
      'possessed',
      'cursed',
      'malevolent',
    ];

    // Check if the description mentions the NPC in an antagonistic context
    const hasAntagonistContext = antagonistKeywords.some(
      keyword => desc.includes(keyword) && desc.includes(name)
    );

    // Check for explicit antagonist phrasing
    const explicitAntagonist =
      desc.includes(`${name} has`) ||
      desc.includes(`${name} is`) ||
      desc.includes(`confront ${name}`) ||
      desc.includes(`stop ${name}`) ||
      desc.includes(`defeat ${name}`);

    return hasAntagonistContext || explicitAntagonist ? 'antagonist' : 'quest_giver';
  }

  /**
   * Generate background text using separate quest giver and NPC parameters
   */
  private generateBackgroundText(request: QuestJournalRequest): string {
    let backgroundText = '';

    if (request.questGiver && request.location) {
      backgroundText = `This quest is provided by ${request.questGiver} and takes place in ${request.location}. `;
    } else if (request.questGiver) {
      backgroundText = `This quest is provided by ${request.questGiver}. `;
    } else if (request.location) {
      backgroundText = `This quest takes place in ${request.location}. `;
    } else {
      backgroundText = `This quest involves the party's investigation and action. `;
    }

    if (request.npcName) {
      backgroundText += `The quest centers around ${request.npcName}. `;
    }

    backgroundText += 'Adjust these details as needed for your campaign.';
    return backgroundText;
  }

  /**
   * Generate adventure hook with proper quest giver logic and complete sentences
   */
  private generateAdventureHook(request: QuestJournalRequest): string {
    let hookText = '<p><strong>Read-Aloud:</strong> ';

    if (request.questGiver) {
      // Use the explicit quest giver with crafted dialogue
      hookText += `${request.questGiver} approaches the party with evident concern. `;

      if (request.location && request.npcName) {
        hookText += `"There's been trouble in ${request.location} involving ${request.npcName}. `;
      } else if (request.location) {
        hookText += `"Something troubling is happening in ${request.location}. `;
      } else if (request.npcName) {
        hookText += `"I need to tell you about ${request.npcName}. `;
      } else {
        hookText += `"I have urgent news that requires your attention. `;
      }

      // Create specific dialogue based on quest type and content
      const hookDialogue = this.generateQuestGiverDialogue(request);
      hookText += `${hookDialogue}" ${request.questGiver} pauses, clearly hoping you'll take action.`;
    } else {
      // No explicit quest giver - use rumors/reports format
      if (request.location) {
        hookText += `Troubling reports reach your ears concerning ${request.location}. `;
      } else {
        hookText += `Disturbing rumors begin circulating in the area. `;
      }

      // Create specific rumor content
      const rumorContent = this.generateRumorHook(request);
      hookText += `${rumorContent} The situation clearly demands investigation before it worsens.`;
    }

    hookText += '</p>';
    return hookText;
  }

  /**
   * Generate quest giver dialogue based on quest content
   */
  private generateQuestGiverDialogue(request: QuestJournalRequest): string {
    const desc = request.questDescription.toLowerCase();

    if (desc.includes('blight') || desc.includes('corruption')) {
      return `A strange blight is spreading, and crops are turning into something unnatural. The situation grows worse by the day`;
    } else if (desc.includes('missing') || desc.includes('disappeared')) {
      return `People have been going missing, and we fear the worst. Someone needs to find out what's happening`;
    } else if (desc.includes('bandits') || desc.includes('raiders')) {
      return `Bandits have been terrorizing travelers and merchants. The roads aren't safe anymore`;
    } else if (desc.includes('monster') || desc.includes('creature')) {
      return `A dangerous creature has been spotted in the area. People are too frightened to venture out`;
    } else if (desc.includes('cult') || desc.includes('ritual')) {
      return `Strange rituals and suspicious activities have been observed. Something dark is stirring`;
    } else if (
      request.npcName &&
      this.isLikelyAntagonist(request.questDescription, request.npcName)
    ) {
      return `${request.npcName} has become a threat to everyone in the area. Someone must stop them before more people get hurt`;
    } else {
      // Generic but compelling dialogue
      return `The situation has become dangerous, and innocent people are at risk. We need heroes to set things right`;
    }
  }

  /**
   * Generate rumor-based hook content
   */
  private generateRumorHook(request: QuestJournalRequest): string {
    const desc = request.questDescription.toLowerCase();

    if (desc.includes('wizard') || desc.includes('magic')) {
      return `Witnesses speak of uncontrolled magical experiments and their terrifying consequences.`;
    } else if (desc.includes('blight') || desc.includes('corruption')) {
      return `Farmers report that healthy crops are turning into hostile, animate creatures overnight.`;
    } else if (desc.includes('missing') || desc.includes('disappeared')) {
      return `Several people have vanished without a trace, leaving behind only mysterious circumstances.`;
    } else if (request.npcName) {
      return `Local tales speak of ${request.npcName} and the growing danger they represent to the community.`;
    } else {
      return `Multiple witnesses describe strange and threatening events that demand immediate investigation.`;
    }
  }

  /**
   * Generate specific quest objectives based on type and parameters
   */
  private generateQuestObjectives(request: QuestJournalRequest): string[] {
    const objectives: string[] = [];

    // Add type-specific objectives
    if (request.questType === 'fetch') {
      objectives.push('Locate and retrieve the required item or information');
      if (request.location) {
        objectives.push(`Travel to ${request.location} and investigate thoroughly`);
      }
    } else if (request.questType === 'escort') {
      objectives.push('Safely escort the target to their destination');
      objectives.push('Protect against threats along the journey');
    } else if (request.questType === 'kill') {
      objectives.push('Eliminate the specified threat or enemy');
      objectives.push('Ensure the area is secure from further danger');
    } else if (request.questType === 'mystery') {
      objectives.push('Investigate the mysterious circumstances');
      objectives.push('Gather evidence and interview witnesses');
      objectives.push('Uncover the truth behind the events');
    } else {
      // For side quests and others, generate smart objectives
      if (request.npcName && this.isLikelyAntagonist(request.questDescription, request.npcName)) {
        objectives.push(`Investigate the situation involving ${request.npcName}`);
        if (request.location) {
          objectives.push(`Travel to ${request.location} and assess the threat`);
        }
        objectives.push(`Deal with ${request.npcName} as appropriate`);
      } else {
        // Create objectives from key action words in description
        const actionWords = this.extractActionObjectives(request.questDescription);
        actionWords.forEach(action => objectives.push(action));
      }
    }

    // Add reporting objective based on quest giver
    if (request.questGiver) {
      objectives.push(`Report back to ${request.questGiver} upon completion`);
    } else {
      objectives.push('Report the outcome to the appropriate authorities');
    }

    // Add rewards objective if specified
    if (request.rewards) {
      objectives.push('Claim the promised rewards');
    }

    return objectives;
  }

  /**
   * Check if NPC is likely an antagonist based on description
   */
  private isLikelyAntagonist(description: string, npcName: string): boolean {
    const desc = description.toLowerCase();
    const name = npcName.toLowerCase().split(' ')[0]; // Use first name only

    const antagonistPhrases = [
      'confront',
      'stop',
      'defeat',
      'gone wrong',
      'obsessed',
      'mad',
      'threat',
      'corrupted',
      'evil',
      'dangerous',
    ];

    return antagonistPhrases.some(phrase => desc.includes(phrase)) && desc.includes(name);
  }

  /**
   * Extract actionable objectives from quest description
   */
  private extractActionObjectives(description: string): string[] {
    const objectives: string[] = [];

    // Look for action phrases in the description
    if (description.includes('investigate')) {
      objectives.push('Investigate the mysterious circumstances');
    }
    if (description.includes('navigate')) {
      objectives.push('Navigate through the dangerous area');
    }
    if (description.includes('confront')) {
      objectives.push('Confront the source of the problem');
    }
    if (description.includes('stop') || description.includes('prevent')) {
      objectives.push('Prevent further spread of the threat');
    }

    // If no specific actions found, create generic objective
    if (objectives.length === 0) {
      const words = description.split(' ');
      const briefObjective = words.slice(0, 15).join(' ') + (words.length > 15 ? '...' : '');
      objectives.push(`Complete the main objective: ${briefObjective}`);
    }

    return objectives;
  }

  /**
   * Convert Markdown to plain text and warn (don't block the operation)
   * This ensures the tool works while gently educating about proper format
   */
  private convertMarkdownToPlainText(content: string): string {
    const originalContent = content;

    // Convert common Markdown patterns to plain text
    content = content
      .replace(/\*\*(.+?)\*\*/g, '$1') // **bold** → bold
      .replace(/\*(.+?)\*/g, '$1') // *italic* → italic
      .replace(/^#{1,6}\s+(.+)/gm, '$1') // # headers → headers
      .replace(/`(.+?)`/g, '$1') // `code` → code
      .replace(/\[(.+?)\]\((.+?)\)/g, '$1') // [text](url) → text
      .replace(/^[-*+]\s+(.+)/gm, '$1') // - item → item
      .replace(/^\d+\.\s+(.+)/gm, '$1') // 1. item → item
      .replace(/^>\s*(.+)/gm, '$1'); // > quote → quote

    // If we made changes, log a warning (but don't block)
    if (content !== originalContent) {
      this.logger.warn(
        'Automatically converted Markdown formatting to plain text. Future updates will work better with plain text input.'
      );
    }

    return content;
  }
}
