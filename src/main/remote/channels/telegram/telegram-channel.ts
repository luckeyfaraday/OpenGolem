/**
 * Telegram Channel
 * Implements the IChannel interface for Telegram Bot API
 */

import { ChannelBase, withRetry } from '../channel-base';
import { log, logError, logWarn } from '../../../utils/logger';
import { TelegramAPI } from './telegram-api';
import type {
  TelegramChannelConfig,
  RemoteMessage,
  RemoteResponse,
} from '../../types';

export class TelegramChannel extends ChannelBase {
  readonly type = 'telegram' as const;

  private config: TelegramChannelConfig;
  private api: TelegramAPI;
  private pollingInterval?: NodeJS.Timeout;
  private lastUpdateId: number = 0;
  private stopPolling: boolean = false;

  // Bot info
  private botUsername?: string;
  private botName?: string;

  constructor(config: TelegramChannelConfig) {
    super();
    this.config = config;
    this.api = new TelegramAPI(config.botToken);
  }

  /**
   * Start the channel - uses long polling
   */
  async start(): Promise<void> {
    if (this._connected) {
      logWarn('[Telegram] Channel already started');
      return;
    }

    this.logStatus('Starting channel...');

    try {
      // Get bot info
      const me = await this.api.getMe();
      if (me.ok) {
        this.botUsername = me.result.username;
        this.botName = me.result.first_name;
        log('[Telegram] Bot info:', { username: this.botUsername, name: this.botName });
      }

      // Set up webhook if URL is configured
      if (this.config.webhookUrl) {
        this.logStatus('Configuring webhook...');
        const webhookResult = await this.api.setWebhook({
          url: this.config.webhookUrl,
          allowed_updates: ['message', 'callback_query'],
        });
        log('[Telegram] Webhook set result:', webhookResult);
      } else {
        // Start long polling
        this.startLongPolling();
      }

      this._connected = true;
      this.logStatus('Channel started successfully');

    } catch (error) {
      logError('[Telegram] Failed to start channel:', error);
      this._connected = false;
      throw error;
    }
  }

  /**
   * Stop the channel
   */
  async stop(): Promise<void> {
    if (!this._connected) {
      return;
    }

    this.logStatus('Stopping channel...');

    this.stopPolling = true;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }

    // Delete webhook if configured
    if (this.config.webhookUrl) {
      try {
        await this.api.deleteWebhook();
      } catch (e) {
        // Ignore
      }
    }

    this._connected = false;
    this.logStatus('Channel stopped');
  }

  /**
   * Send response to Telegram
   */
  async send(response: RemoteResponse): Promise<void> {
    if (!this._connected) {
      throw new Error('Channel not connected');
    }

    const { channelId, content, replyTo } = response;

    log('[Telegram] Sending message:', {
      channelId,
      contentType: content.type,
      hasReplyTo: !!replyTo,
    });

    try {
      await withRetry(
        async () => {
          await this.sendMessage(channelId, content, replyTo);
        },
        {
          maxRetries: 3,
          delayMs: 1000,
          onRetry: (attempt, error) => {
            logWarn(`[Telegram] Send retry ${attempt}:`, error.message);
          },
        }
      );

      log('[Telegram] Message sent successfully');

    } catch (error) {
      logError('[Telegram] Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Get DM policy for this channel
   */
  getDmPolicy(): 'open' | 'pairing' | 'allowlist' {
    return this.config.dm?.policy || 'pairing';
  }

  /**
   * Escape special characters for Telegram MarkdownV2 parse mode
   */
  private escapeMarkdownV2(text: string): string {
    // Escape MarkdownV2 special characters
    const specialChars = /([_\*\[\]\(\)~\`\>\#\+\-\=\|\{\}\.\!])/g;
    let escaped = text.replace(specialChars, '\\$1');
    // Also escape Unicode curly quotes/apostrophes and other problematic chars
    escaped = escaped.replace(/[\u2018\u2019]/g, "\\'");  // curly single quotes
    escaped = escaped.replace(/[\u201C\u201D]/g, '\\"');  // curly double quotes
    escaped = escaped.replace(/\u2014/g, "\\-");           // em dash
    escaped = escaped.replace(/\u2026/g, "\\.");           // ellipsis
    return escaped;
  }

  /**
   * Handle incoming webhook request
   */
  handleWebhook(_headers: Record<string, string>, body: string): { status: number; data: any } {
    log('[Telegram] Received webhook request');

    try {
      const update = JSON.parse(body);
      this.processUpdate(update);
      return { status: 200, data: { ok: true } };
    } catch (error) {
      logError('[Telegram] Webhook handling error:', error);
      return { status: 500, data: { error: 'Internal error' } };
    }
  }

  /**
   * Start long polling for updates
   */
  private startLongPolling(): void {
    this.stopPolling = false;
    this.logStatus('Starting long polling...');

    const poll = async () => {
      if (this.stopPolling) return;

      try {
        const result = await this.api.getUpdates({
          offset: this.lastUpdateId > 0 ? this.lastUpdateId + 1 : undefined,
          timeout: 30,
          allowedUpdates: ['message', 'callback_query'],
        });

        if (result.ok && result.result && result.result.length > 0) {
          for (const update of result.result) {
            this.processUpdate(update);
            this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
          }
        }
      } catch (error) {
        logError('[Telegram] Polling error:', error);
        // On error, wait before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Schedule next poll
      if (!this.stopPolling) {
        // Use setTimeout to avoid stacking if previous poll takes time
        setTimeout(poll, 0);
      }
    };

    // Start first poll
    setTimeout(poll, 0);
  }

  /**
   * Process a single Telegram update
   */
  private processUpdate(update: any): void {
    try {
      // Handle message
      if (update.message) {
        const msg = update.message;

        // Skip bot's own messages
        if (msg.from?.is_bot && msg.from.id === this.getBotId()) {
          return;
        }

        const remoteMessage = this.buildRemoteMessage(msg);
        if (remoteMessage) {
          this.emitMessage(remoteMessage);
        }
      }

      // Handle callback query (inline button clicks)
      if (update.callback_query) {
        const query = update.callback_query;

        // Answer the callback query
        this.api.answerCallbackQuery({
          callback_query_id: query.id,
        }).catch((err) => {
          logWarn('[Telegram] Failed to answer callback query:', err);
        });

        // Treat as a message with the callback data as text
        if (query.message) {
          const remoteMessage = this.buildRemoteMessage(query.message);
          if (remoteMessage) {
            // Include callback data in the message
            remoteMessage.content = {
              type: 'text',
              text: query.data || '',
            };
            remoteMessage.raw = {
              ...(remoteMessage.raw as Record<string, unknown>),
              callbackQueryId: query.id,
              callbackData: query.data,
            };
            this.emitMessage(remoteMessage);
          }
        }
      }
    } catch (error) {
      logError('[Telegram] Error processing update:', error);
    }
  }

  /**
   * Get bot user ID from bot token
   */
  private getBotId(): number {
    // Extract bot ID from token (format: <bot_id>:<token>)
    const parts = this.config.botToken.split(':');
    if (parts.length >= 2) {
      return parseInt(parts[0]);
    }
    return 0;
  }

  /**
   * Build a RemoteMessage from a Telegram message
   */
  private buildRemoteMessage(msg: any): RemoteMessage | null {
    try {
      const content = this.parseContent(msg);
      if (!content) {
        logWarn('[Telegram] Unable to parse message content');
        return null;
      }

      const chat = msg.chat;
      const from = msg.from;

      // Check if this is a group chat
      const isGroup = chat.type === 'group' || chat.type === 'supergroup';

      // Check if bot was mentioned (only for groups)
      let isMentioned = false;
      if (isGroup && msg.entities) {
        // Check for @username mention
        isMentioned = msg.entities.some((e: any) =>
          e.type === 'mention' && msg.text?.substring(e.offset, e.offset + e.length) === `@${this.botUsername}`
        ) || msg.text?.startsWith(`@${this.botUsername}`);
      } else if (isGroup && msg.text) {
        // Also trigger on any message in group if not using mentions
        isMentioned = true;
      }

      return {
        id: msg.message_id?.toString() || this.generateMessageId(),
        channelType: 'telegram',
        channelId: chat.id.toString(),
        sender: {
          id: from.id.toString(),
          name: from.first_name + (from.last_name ? ` ${from.last_name}` : ''),
          extra: from.username ? { username: from.username } : undefined,
          isBot: from.is_bot || false,
        },
        content,
        timestamp: (msg.date || Date.now() / 1000) * 1000,
        isGroup,
        isMentioned,
        raw: {
          chatId: chat.id,
          chatType: chat.type,
          messageId: msg.message_id,
          fromId: from.id,
          text: msg.text,
          entities: msg.entities,
        },
      };
    } catch (error) {
      logError('[Telegram] Error building remote message:', error);
      return null;
    }
  }

  /**
   * Parse Telegram message content
   */
  private parseContent(msg: any): RemoteMessage['content'] | null {
    const text = msg.text || msg.caption;

    if (msg.photo) {
      return {
        type: 'image',
        imageUrl: this.getPhotoFileId(msg.photo),
      };
    }

    if (msg.document) {
      return {
        type: 'file',
        file: {
          name: msg.document.file_name || 'document',
          key: msg.document.file_id,
          size: msg.document.file_size,
          mimeType: msg.document.mime_type,
        },
      };
    }

    if (msg.voice) {
      return {
        type: 'voice',
        voice: {
          key: msg.voice.file_id,
          duration: msg.voice.duration,
        },
      };
    }

    if (msg.video) {
      return {
        type: 'file',
        file: {
          name: msg.video.file_name || 'video',
          key: msg.video.file_id,
          size: msg.video.file_size,
          mimeType: msg.video.mime_type,
        },
      };
    }

    if (text) {
      return {
        type: 'text',
        text,
      };
    }

    // Fallback for unsupported types
    if (msg.sticker || msg.animation || msg.contact || msg.location) {
      return {
        type: 'text',
        text: '[Unsupported message type]',
      };
    }

    return null;
  }

  /**
   * Get the largest photo file_id from an array of photo sizes
   */
  private getPhotoFileId(photos: any[]): string {
    if (!photos || photos.length === 0) return '';
    // photos is an array of photo objects sorted by size (smallest first)
    // The largest is the last one
    const largest = photos[photos.length - 1];
    return largest.file_id || '';
  }

  /**
   * Send message to Telegram
   */
  private async sendMessage(chatId: string, content: RemoteResponse['content'], replyTo?: string): Promise<void> {
    const chatIdNum = parseInt(chatId);

    switch (content.type) {
      case 'text':
        if (content.text) {
          // Split long messages
          if (content.text.length > 4000) {
            const chunks = this.splitMessage(content.text, 4000);
            for (const chunk of chunks) {
              await this.api.sendMessage({
                chat_id: chatIdNum,
                text: chunk,
                reply_to_message_id: replyTo ? parseInt(replyTo) : undefined,
              });
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          } else {
            await this.api.sendMessage({
              chat_id: chatIdNum,
              text: content.text,
              reply_to_message_id: replyTo ? parseInt(replyTo) : undefined,
            });
          }
        }
        break;

      case 'markdown':
        if (content.markdown) {
          const chunks = this.splitMessage(content.markdown, 4000);
          for (const chunk of chunks) {
            await this.api.sendMessage({
              chat_id: chatIdNum,
              text: this.escapeMarkdownV2(chunk),
              parse_mode: 'MarkdownV2',
              reply_to_message_id: replyTo ? parseInt(replyTo) : undefined,
            });
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        break;

      case 'image':
        if (content.image?.url || content.image?.key) {
          await this.api.sendPhoto({
            chat_id: chatIdNum,
            photo: content.image.key || content.image.url || '',
            caption: content.text,
            reply_to_message_id: replyTo ? parseInt(replyTo) : undefined,
          });
        }
        break;

      case 'file':
        if (content.file?.url || content.file?.path) {
          await this.api.sendDocument({
            chat_id: chatIdNum,
            document: content.file.url || content.file.path || '',
            caption: content.text,
            reply_to_message_id: replyTo ? parseInt(replyTo) : undefined,
          });
        }
        break;

      default:
        // Default to text representation
        const text = content.text || JSON.stringify(content);
        await this.api.sendMessage({
          chat_id: chatIdNum,
          text,
          reply_to_message_id: replyTo ? parseInt(replyTo) : undefined,
        });
    }
  }
}
