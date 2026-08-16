import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface PlaylistToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class PlaylistTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: PlaylistToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'PlaylistTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'list-playlists',
        description:
          'List all Foundry VTT playlists with their current playback state, mode, and sounds. Use this to see what music/ambience is available before playing. ' +
          'Each sound reports volume on both scales: "volume" is Foundry\'s internal 0.0–1.0 value, which is what play-playlist accepts back, ' +
          'and "volumePercent" is what the Foundry sidebar displays for that track. They differ — internal 0.5 shows as 63% — so quote volumePercent ' +
          'when describing what the GM sees, and pass volume when setting it.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'play-playlist',
        description:
          'Start playing a Foundry VTT playlist by name. Optionally specify a sound within the playlist to play a single track. Supports partial name matching. ' +
          'Optional parameters loop, volume, and mode make persistent changes to the track or playlist before playing.',
        inputSchema: {
          type: 'object',
          properties: {
            playlist: {
              type: 'string',
              description: 'Name or partial name of the playlist to play.',
            },
            sound: {
              type: 'string',
              description:
                'Optional: name or partial name of a specific sound within the playlist to play. Omit to play the whole playlist.',
            },
            loop: {
              type: 'boolean',
              description:
                'Set whether the track repeats after finishing. Only applies when a specific sound is also specified. Persistent change to the track.',
            },
            volume: {
              type: 'number',
              description:
                "Set the track volume on Foundry's internal scale (0.0–1.0). Only applies when a specific sound is also specified. Persistent change to the track. " +
                'NOTE: Foundry displays volume on a curve with exponent 1.5, so an internal 0.5 shows as ~63% in the UI. ' +
                'To hit a target UI percentage P, pass (P/100)^1.5 — e.g. 50% is 0.354, 75% is 0.65.',
              minimum: 0,
              maximum: 1,
            },
            mode: {
              type: 'string',
              enum: ['sequential', 'shuffle', 'simultaneous', 'soundboard'],
              description:
                'Set the playlist playback mode. Persistent change to the playlist. "soundboard" is Foundry\'s "Soundboard Only" mode, in which the playlist never plays on its own and tracks are triggered individually.',
            },
          },
          required: ['playlist'],
        },
      },
      {
        name: 'stop-playlist',
        description:
          'Stop a Foundry VTT playlist by name. Omit the playlist name to stop all currently playing playlists.',
        inputSchema: {
          type: 'object',
          properties: {
            playlist: {
              type: 'string',
              description: 'Name or partial name of the playlist to stop. Omit to stop everything.',
            },
          },
        },
      },
    ];
  }

  async handleListPlaylists(_args: any): Promise<any> {
    this.logger.info('Listing playlists');
    try {
      const data = await this.foundryClient.query('foundry-mcp-bridge.getPlaylists');
      return this.formatPlaylistsResponse(data);
    } catch (error) {
      this.logger.error('Failed to list playlists', error);
      throw new Error(
        `Failed to list playlists: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handlePlayPlaylist(args: any): Promise<any> {
    const schema = z.object({
      playlist: z.string(),
      sound: z.string().optional(),
      loop: z.boolean().optional(),
      volume: z.number().min(0).max(1).optional(),
      mode: z.enum(['sequential', 'shuffle', 'simultaneous', 'soundboard']).optional(),
    });
    const { playlist, sound, loop, volume, mode } = schema.parse(args);
    this.logger.info('Playing playlist', { playlist, sound, loop, volume, mode });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.playPlaylist', {
        playlist,
        sound,
        loop,
        volume,
        mode,
      });
    } catch (error) {
      this.logger.error('Failed to play playlist', error);
      throw new Error(
        `Failed to play playlist: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleStopPlaylist(args: any): Promise<any> {
    const schema = z.object({
      playlist: z.string().optional(),
    });
    const { playlist } = schema.parse(args);
    this.logger.info('Stopping playlist', { playlist });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.stopPlaylist', { playlist });
    } catch (error) {
      this.logger.error('Failed to stop playlist', error);
      throw new Error(
        `Failed to stop playlist: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private formatPlaylistsResponse(data: any): any {
    const playlists: any[] = data.playlists ?? [];

    if (playlists.length === 0) {
      return { total: 0, currentlyPlaying: 0, message: 'No playlists found.', playlists: [] };
    }

    return {
      total: data.total,
      currentlyPlaying: data.currentlyPlaying,
      playlists: playlists.map((pl: any) => ({
        name: pl.name,
        playing: pl.playing,
        mode: pl.mode,
        totalSounds: pl.totalSounds,
        playingSounds: pl.playingSounds,
        sounds: pl.sounds.map((s: any) => ({
          name: s.name,
          playing: s.playing,
          // Two scales, each named. `volume` is Foundry's internal 0-1 value and is what
          // play-playlist accepts back; `volumePercent` is what Foundry's own sidebar shows
          // for it, which is the slider position, not the raw value (internal 0.5 → "63%").
          // The old `Math.round(s.volume * 100) + '%'` reported the raw value wearing a
          // percent sign, so it disagreed with the UI and could not be fed back as a volume.
          volume: s.volume,
          volumePercent: typeof s.volumePercent === 'number' ? `${s.volumePercent}%` : null,
          repeat: s.repeat,
        })),
      })),
    };
  }
}
