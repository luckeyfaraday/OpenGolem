/**
 * Message Router
 * 消息路由器:将远程消息路由到 Agent,将 Agent 响应路由回 Channel
 */

import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { log, logError } from '../utils/logger';
import { isUncPath, isWindowsDrivePath } from '../../shared/local-file-path';
import { resolvePathAgainstWorkspace } from '../../shared/workspace-path';
import type {
  RemoteMessage,
  RemoteResponse,
  RemoteSessionMapping,
  ChannelType,
} from './types';
import type { Message, ContentBlock, TextContent } from '../../renderer/types/index';
import {
  buildRemoteSessionBanner,
  formatRemoteHistory,
  parseRemoteCommand,
  stripRemoteMentions,
} from './remote-command-utils';

// Callback type for sending responses back to channels
type ResponseCallback = (response: RemoteResponse) => Promise<void>;

// Callback type for agent execution
type AgentCallback = (
  sessionId: string,
  prompt: string,
  content: ContentBlock[],
  workingDirectory: string | undefined,
  channelType: string,
  channelId: string,
  onMessage: (message: Message) => void,
  onPartial: (delta: string) => void,
) => Promise<void>;
type WorkingDirectoryValidator = (cwd: string) => Promise<string | null> | string | null;
type TypingIndicatorCallback = (channelType: ChannelType, channelId: string) => Promise<void>;
type StopSessionCallback = (sessionId: string) => Promise<void>;
type ResetSessionCallback = (remoteSessionId: string, actualSessionId?: string) => Promise<void> | void;
type SessionMessagesCallback = (sessionId: string) => Promise<Message[]> | Message[];

/**
 * Message queue item
 */
interface QueuedMessage {
  message: RemoteMessage;
  addedAt: number;
}

export class MessageRouter {
  // Session mappings: channelType:channelId[:userId] -> session
  private sessionMappings: Map<string, RemoteSessionMapping> = new Map();

  // Message queues per session
  private messageQueues: Map<string, QueuedMessage[]> = new Map();

  // Processing flags
  private processingSession: Set<string> = new Set();

  // Callbacks
  private responseCallback?: ResponseCallback;
  private agentCallback?: AgentCallback;
  private workingDirectoryValidator?: WorkingDirectoryValidator;
  private typingIndicatorCallback?: TypingIndicatorCallback;
  private stopSessionCallback?: StopSessionCallback;
  private resetSessionCallback?: ResetSessionCallback;
  private sessionMessagesCallback?: SessionMessagesCallback;

  // Accumulated response text per session (for streaming)
  private responseBuffers: Map<string, string> = new Map();
  private typingTimers: Map<string, NodeJS.Timeout> = new Map();

  // Default working directory for new sessions
  private defaultWorkingDirectory?: string;

  // Periodic cleanup timer
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Persistence file path
  private persistencePath: string;

  constructor() {
    // Set persistence path in user data directory
    const userDataPath = app?.getPath?.('userData') || process.cwd();
    this.persistencePath = path.join(userDataPath, 'remote-sessions.json');
    this.loadSessionMappings();
    this.startPeriodicCleanup();
  }

  startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 30 * 60 * 1000); // Every 30 minutes
  }

  stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Load session mappings from persistent storage
   */
  private loadSessionMappings(): void {
    try {
      if (fs.existsSync(this.persistencePath)) {
        const data = JSON.parse(fs.readFileSync(this.persistencePath, 'utf-8'));
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.sessionId && item.channelType && item.channelId) {
              // Reconstruct sessionKey: DM uses userId, groups use channelId
              const sessionKey = item.userId
                ? `${item.channelType}:dm:${item.userId}`
                : `${item.channelType}:group:${item.channelId}`;
              this.sessionMappings.set(sessionKey, item);
            }
          }
          log('[MessageRouter] Loaded session mappings from disk:', this.sessionMappings.size, 'sessions');
        }
      }
    } catch (error) {
      logError('[MessageRouter] Failed to load session mappings:', error);
    }
  }

  /**
   * Save session mappings to persistent storage
   */
  private saveSessionMappings(): void {
    try {
      const data = Array.from(this.sessionMappings.values());
      fs.writeFileSync(this.persistencePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logError('[MessageRouter] Failed to save session mappings:', error);
    }
  }

  /**
   * Force-persist session mappings to disk. Called after updates like actualSessionId changes.
   */
  persistSessions(): void {
    this.saveSessionMappings();
  }

  /**
   * Set default working directory for remote sessions
   */
  setDefaultWorkingDirectory(dir: string | undefined): void {
    this.defaultWorkingDirectory = dir;
    log('[MessageRouter] Default working directory set to:', dir || '(none)');
  }

  /**
   * Set response callback (called when agent produces a response)
   */
  onResponse(callback: ResponseCallback): void {
    this.responseCallback = callback;
  }

  /**
   * Set agent callback (called to execute agent)
   */
  setAgentCallback(callback: AgentCallback): void {
    this.agentCallback = callback;
  }

  setWorkingDirectoryValidator(validator: WorkingDirectoryValidator): void {
    this.workingDirectoryValidator = validator;
  }

  setTypingIndicatorCallback(callback: TypingIndicatorCallback): void {
    this.typingIndicatorCallback = callback;
  }

  setSessionControlCallbacks(callbacks: {
    stopSession?: StopSessionCallback;
    resetSession?: ResetSessionCallback;
    getSessionMessages?: SessionMessagesCallback;
  }): void {
    this.stopSessionCallback = callbacks.stopSession;
    this.resetSessionCallback = callbacks.resetSession;
    this.sessionMessagesCallback = callbacks.getSessionMessages;
  }

  /**
   * Route incoming message to agent
   */
  async routeMessage(message: RemoteMessage): Promise<void> {
    const sessionKey = this.getSessionKey(message);

    log('[MessageRouter] Routing message:', {
      sessionKey,
      messageId: message.id,
      contentType: message.content.type,
    });

    // Get or create session mapping
    let mapping = this.sessionMappings.get(sessionKey);
    if (!mapping) {
      mapping = this.createSessionMapping(message, sessionKey);
      this.sessionMappings.set(sessionKey, mapping);
      this.saveSessionMappings();
      log('[MessageRouter] Created new session mapping:', mapping);
    }

    // Update last active time
    mapping.lastActiveAt = Date.now();

    if (await this.handleImmediateCommand(message, sessionKey, mapping)) {
      this.saveSessionMappings();
      return;
    }

    // Add to queue
    this.addToQueue(mapping.sessionId, message);

    // Process queue
    await this.processQueue(mapping.sessionId);
  }

  /**
   * Get session key from message
   * For DMs: channelType:userId
   * For groups: channelType:channelId
   */
  private getSessionKey(message: RemoteMessage): string {
    if (message.isGroup) {
      return `${message.channelType}:group:${message.channelId}`;
    } else {
      return `${message.channelType}:dm:${message.sender.id}`;
    }
  }

  /**
   * Create new session mapping
   */
  private createSessionMapping(message: RemoteMessage, sessionKey: string): RemoteSessionMapping {
    // Use sessionKey as sessionId so it's stable across restarts.
    // This ensures the remote session ID is deterministic for a given
    // sender/channel, avoiding "session not found" errors after restart.
    const sessionId = sessionKey;

    return {
      channelType: message.channelType,
      channelId: message.channelId,
      userId: message.isGroup ? undefined : message.sender.id,
      sessionId,
      announceSession: true,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
  }

  private ensureSessionMapping(
    message: RemoteMessage,
    sessionKey: string,
    sessionId: string
  ): RemoteSessionMapping {
    const existing = this.sessionMappings.get(sessionKey);
    if (existing) {
      return existing;
    }

    const created = {
      ...this.createSessionMapping(message, sessionKey),
      sessionId,
    };
    this.sessionMappings.set(sessionKey, created);
    return created;
  }

  private resolveWorkingDirectory(
    cwd: string | undefined,
    currentWorkingDirectory?: string
  ): string | undefined {
    if (!cwd) {
      return undefined;
    }
    if (!currentWorkingDirectory && !path.isAbsolute(cwd) && !isWindowsDrivePath(cwd) && !isUncPath(cwd)) {
      return undefined;
    }
    return resolvePathAgainstWorkspace(cwd, currentWorkingDirectory);
  }

  private async handleImmediateCommand(
    message: RemoteMessage,
    sessionKey: string,
    mapping: RemoteSessionMapping
  ): Promise<boolean> {
    if (message.content.type !== 'text' || !message.content.text) {
      return false;
    }

    const command = parseRemoteCommand(message.content.text);
    if (!command) {
      return false;
    }

    switch (command.name) {
      case 'where':
        await this.sendTextResponse(message, buildRemoteSessionBanner(mapping, this.defaultWorkingDirectory));
        return true;
      case 'history':
        await this.handleHistoryCommand(message, mapping);
        return true;
      case 'stop':
        await this.handleStopCommand(message, mapping);
        return true;
      case 'new':
        await this.handleNewCommand(message, sessionKey, mapping, command.args);
        return true;
      default:
        return false;
    }
  }

  private async handleHistoryCommand(
    message: RemoteMessage,
    mapping: RemoteSessionMapping
  ): Promise<void> {
    if (!mapping.actualSessionId || !this.sessionMessagesCallback) {
      await this.sendTextResponse(message, 'No history yet for this chat.');
      return;
    }

    const messages = await this.sessionMessagesCallback(mapping.actualSessionId);
    const banner = buildRemoteSessionBanner(mapping, this.defaultWorkingDirectory);
    await this.sendTextResponse(message, `${banner}\n\nRecent turns:\n${formatRemoteHistory(messages)}`);
  }

  private async handleStopCommand(
    message: RemoteMessage,
    mapping: RemoteSessionMapping
  ): Promise<void> {
    if (!mapping.actualSessionId || !this.stopSessionCallback) {
      await this.sendTextResponse(message, 'No active run to stop in this chat.');
      return;
    }

    await this.stopSessionCallback(mapping.actualSessionId);
    this.clearQueuedMessages(mapping.sessionId);
    this.stopTypingIndicator(mapping.sessionId);
    await this.sendTextResponse(message, 'Stopped the active run for this chat.');
  }

  private async handleNewCommand(
    message: RemoteMessage,
    _sessionKey: string,
    mapping: RemoteSessionMapping,
    args: string
  ): Promise<void> {
    if (mapping.actualSessionId && this.stopSessionCallback) {
      await this.stopSessionCallback(mapping.actualSessionId);
    }
    await this.resetSessionCallback?.(mapping.sessionId, mapping.actualSessionId);

    this.clearQueuedMessages(mapping.sessionId);
    this.stopTypingIndicator(mapping.sessionId);

    mapping.actualSessionId = undefined;
    mapping.title = undefined;
    mapping.pendingTitle = args || undefined;
    mapping.announceSession = true;

    await this.sendTextResponse(
      message,
      `Started a fresh chat.${args ? ` Title: ${args}` : ''}`
    );
  }

  private clearQueuedMessages(sessionId: string): void {
    const queue = this.messageQueues.get(sessionId);
    if (queue) {
      queue.length = 0;
    }
  }

  /**
   * Add message to queue
   */
  private addToQueue(sessionId: string, message: RemoteMessage): void {
    if (!this.messageQueues.has(sessionId)) {
      this.messageQueues.set(sessionId, []);
    }

    this.messageQueues.get(sessionId)!.push({
      message,
      addedAt: Date.now(),
    });

    log('[MessageRouter] Added message to queue:', {
      sessionId,
      queueLength: this.messageQueues.get(sessionId)!.length,
    });
  }

  /**
   * Process message queue for a session
   */
  private async processQueue(sessionId: string): Promise<void> {
    // Check if already processing
    if (this.processingSession.has(sessionId)) {
      log('[MessageRouter] Session already processing, will process later:', sessionId);
      return;
    }

    const queue = this.messageQueues.get(sessionId);
    if (!queue || queue.length === 0) {
      return;
    }

    // Mark as processing
    this.processingSession.add(sessionId);

    try {
      while (queue.length > 0) {
        const item = queue.shift()!;
        await this.processMessage(sessionId, item.message);
      }
    } finally {
      this.processingSession.delete(sessionId);
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(sessionId: string, message: RemoteMessage): Promise<void> {
    if (!this.agentCallback) {
      logError('[MessageRouter] Agent callback not set');
      return;
    }

    log('[MessageRouter] Processing message:', {
      sessionId,
      messageId: message.id,
    });

    // Convert remote content to agent content blocks
    const content = this.convertToContentBlocks(message);
    const { prompt, cwd } = this.extractPromptAndCwd(message);

    // Get session mapping to update/get working directory
    const sessionKey = this.getSessionKey(message);
    const mapping = this.sessionMappings.get(sessionKey);
    const baseWorkingDirectory = mapping?.workingDirectory || this.defaultWorkingDirectory;
    const resolvedCwd = this.resolveWorkingDirectory(cwd, baseWorkingDirectory);

    if (cwd && !resolvedCwd) {
      await this.sendErrorResponse(
        message,
        new Error('Relative working directory requires an existing base directory')
      );
      return;
    }

    if (resolvedCwd && this.workingDirectoryValidator) {
      const validationError = await this.workingDirectoryValidator(resolvedCwd);
      if (validationError) {
        await this.sendErrorResponse(message, new Error(validationError));
        return;
      }
    }

    // Handle !cd command (change directory without executing prompt)
    if (!prompt && resolvedCwd) {
      const ensuredMapping = this.ensureSessionMapping(message, sessionKey, sessionId);
      ensuredMapping.workingDirectory = resolvedCwd;
      this.saveSessionMappings();
      log('[MessageRouter] Updated session working directory:', resolvedCwd);
      // Send confirmation
      await this.sendCwdChangeResponse(message, resolvedCwd);
      return;
    }

    // Determine working directory for this message
    // Priority: 1. [cwd:] prefix in message, 2. session's current cwd, 3. default cwd
    let workingDirectory = resolvedCwd;
    if (!workingDirectory && mapping?.workingDirectory) {
      workingDirectory = mapping.workingDirectory;
    }
    if (!workingDirectory) {
      workingDirectory = this.defaultWorkingDirectory;
    }

    log('[MessageRouter] Using working directory:', workingDirectory || '(default)');

    // Initialize response buffer
    this.responseBuffers.set(sessionId, '');
    this.startTypingIndicator(sessionId, message.channelType, message.channelId);

    try {
      // Call agent with working directory and channel info
      await this.agentCallback(
        sessionId,
        prompt,
        content,
        workingDirectory,
        message.channelType, // Pass channel type for routing
        message.channelId,   // Pass channel ID for routing
        // onMessage callback
        (agentMessage) => {
          this.handleAgentMessage(sessionId, message, agentMessage);
        },
        // onPartial callback
        (delta) => {
          this.handlePartialResponse(sessionId, message, delta);
        },
      );

      if (resolvedCwd) {
        const ensuredMapping = this.ensureSessionMapping(message, sessionKey, sessionId);
        ensuredMapping.workingDirectory = resolvedCwd;
        this.saveSessionMappings();
      }

      // Send final accumulated response
      await this.sendFinalResponse(sessionId, message);

    } catch (error) {
      logError('[MessageRouter] Error processing message:', error);

      // Send error response
      await this.sendErrorResponse(message, error);
    } finally {
      this.stopTypingIndicator(sessionId);
      this.responseBuffers.delete(sessionId);
    }
  }

  /**
   * Send confirmation for working directory change
   */
  private async sendCwdChangeResponse(originalMessage: RemoteMessage, newCwd: string): Promise<void> {
    if (!this.responseCallback) {
      return;
    }

    const response: RemoteResponse = {
      channelType: originalMessage.channelType,
      channelId: originalMessage.channelId,
      content: {
        type: 'text',
        text: `✅ 工作目录已切换到: ${newCwd}`,
      },
      replyTo: originalMessage.id,
    };

    await this.responseCallback(response);
  }

  private startTypingIndicator(
    sessionId: string,
    channelType: ChannelType,
    channelId: string
  ): void {
    if (!this.typingIndicatorCallback || this.typingTimers.has(sessionId)) {
      return;
    }

    void this.typingIndicatorCallback(channelType, channelId);
    const timer = setInterval(() => {
      void this.typingIndicatorCallback?.(channelType, channelId);
    }, 4000);
    this.typingTimers.set(sessionId, timer);
  }

  private stopTypingIndicator(sessionId: string): void {
    const timer = this.typingTimers.get(sessionId);
    if (!timer) {
      return;
    }

    clearInterval(timer);
    this.typingTimers.delete(sessionId);
  }

  private async sendTextResponse(originalMessage: RemoteMessage, text: string): Promise<void> {
    if (!this.responseCallback) {
      return;
    }

    await this.responseCallback({
      channelType: originalMessage.channelType,
      channelId: originalMessage.channelId,
      content: {
        type: 'text',
        text,
      },
      replyTo: originalMessage.id,
    });
  }

  /**
   * Convert remote message content to agent content blocks
   */
  private convertToContentBlocks(message: RemoteMessage): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    switch (message.content.type) {
      case 'text':
        if (message.content.text) {
          blocks.push({
            type: 'text',
            text: message.content.text,
          } as TextContent);
        }
        break;

      case 'image':
        // TODO: Download image and convert to base64
        if (message.content.imageUrl) {
          // For now, add as text description
          blocks.push({
            type: 'text',
            text: `[用户发送了一张图片: ${message.content.imageUrl}]`,
          } as TextContent);
        }
        break;

      case 'file':
        if (message.content.file) {
          blocks.push({
            type: 'text',
            text: `[用户发送了文件: ${message.content.file.name}]`,
          } as TextContent);
        }
        break;

      case 'voice':
        // TODO: Transcribe voice message
        blocks.push({
          type: 'text',
          text: '[用户发送了语音消息]',
        } as TextContent);
        break;

      default:
        blocks.push({
          type: 'text',
          text: message.content.text || '[不支持的消息类型]',
        } as TextContent);
    }

    return blocks;
  }

  /**
   * Extract prompt text and working directory from message
   * Supports [cwd:路径] prefix to specify working directory
   * Also supports !cd 路径 command to change working directory
   */
  private extractPromptAndCwd(message: RemoteMessage): { prompt: string; cwd?: string } {
    let cwd: string | undefined;

    if (message.content.type === 'text' && message.content.text) {
      let text = stripRemoteMentions(message.content.text);

      // Check for [cwd:路径] prefix
      // Supports both [cwd:路径] and [cwd: 路径] formats
      const cwdMatch = text.match(/^\[cwd:\s*([^\]]+)\]\s*/i);
      if (cwdMatch) {
        cwd = cwdMatch[1].trim();
        text = text.slice(cwdMatch[0].length).trim();
        log('[MessageRouter] Extracted cwd from message:', cwd);
      }

      // Check for !cd command (sets session cwd without executing a prompt)
      const cdMatch = text.match(/^!cd\s+(.+)$/i);
      if (cdMatch) {
        cwd = cdMatch[1].trim();
        return { prompt: '', cwd };
      }

      return { prompt: text || '你好', cwd };
    }

    return { prompt: '请处理上述内容', cwd };
  }

  /**
   * Handle agent message (complete message)
   */
  private handleAgentMessage(sessionId: string, _originalMessage: RemoteMessage, agentMessage: Message): void {
    // Extract text from agent message
    const textContent = agentMessage.content.find(c => c.type === 'text') as TextContent | undefined;

    if (textContent?.text) {
      // Accumulate response
      const buffer = this.responseBuffers.get(sessionId) || '';
      this.responseBuffers.set(sessionId, buffer + textContent.text);
    }

    log('[MessageRouter] Received agent message:', {
      sessionId,
      role: agentMessage.role,
      contentTypes: agentMessage.content.map(c => c.type),
    });
  }

  /**
   * Handle partial response (streaming)
   */
  private handlePartialResponse(sessionId: string, _originalMessage: RemoteMessage, delta: string): void {
    // Accumulate partial response
    const buffer = this.responseBuffers.get(sessionId) || '';
    this.responseBuffers.set(sessionId, buffer + delta);
  }

  /**
   * Send final accumulated response
   */
  private async sendFinalResponse(sessionId: string, originalMessage: RemoteMessage): Promise<void> {
    let responseText = this.responseBuffers.get(sessionId);

    if (!responseText || !this.responseCallback) {
      return;
    }

    const mapping = this.getSessionMappingForRemoteSessionId(sessionId);
    if (mapping?.announceSession) {
      const banner = buildRemoteSessionBanner(mapping, this.defaultWorkingDirectory);
      responseText = `${banner}\n\n${responseText}`;
      mapping.announceSession = false;
      this.saveSessionMappings();
    }

    log('[MessageRouter] Sending final response:', {
      sessionId,
      textLength: responseText.length,
    });

    const response: RemoteResponse = {
      channelType: originalMessage.channelType,
      channelId: originalMessage.channelId,
      content: {
        type: 'markdown',
        markdown: responseText,
      },
      replyTo: originalMessage.id,
    };

    await this.responseCallback(response);
  }

  /**
   * Send error response
   */
  private async sendErrorResponse(originalMessage: RemoteMessage, error: unknown): Promise<void> {
    if (!this.responseCallback) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    const response: RemoteResponse = {
      channelType: originalMessage.channelType,
      channelId: originalMessage.channelId,
      content: {
        type: 'text',
        text: `❌ 处理消息时发生错误: ${errorMessage}`,
      },
      replyTo: originalMessage.id,
    };

    await this.responseCallback(response);
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessionMappings.size;
  }

  /**
   * Get session mapping by key
   */
  getSessionMapping(channelType: ChannelType, channelId: string, userId?: string): RemoteSessionMapping | undefined {
    const key = userId
      ? `${channelType}:dm:${userId}`
      : `${channelType}:group:${channelId}`;
    return this.sessionMappings.get(key);
  }

  /**
   * Get all session mappings
   */
  getAllSessionMappings(): RemoteSessionMapping[] {
    return Array.from(this.sessionMappings.values());
  }

  /**
   * Get session mapping by remote session ID
   */
  getSessionMappingForRemoteSessionId(sessionId: string): RemoteSessionMapping | undefined {
    for (const mapping of this.sessionMappings.values()) {
      if (mapping.sessionId === sessionId) {
        return mapping;
      }
    }
    return undefined;
  }

  updateSessionMetadata(sessionId: string, updates: Partial<RemoteSessionMapping>): boolean {
    const mapping = this.getSessionMappingForRemoteSessionId(sessionId);
    if (!mapping) {
      return false;
    }

    Object.assign(mapping, updates);
    this.saveSessionMappings();
    return true;
  }

  /**
   * Rebuild reverse session mappings from loaded session data.
   * Called by RemoteManager after MessageRouter loads persisted sessions.
   */
  rebuildReverseMapping(
    remoteSessionIds: Set<string>,
    sessionIdMapping: Map<string, string>,
    reverseSessionIdMapping: Map<string, string>
  ): void {
    for (const mapping of this.sessionMappings.values()) {
      if (mapping.actualSessionId) {
        remoteSessionIds.add(mapping.sessionId);
        sessionIdMapping.set(mapping.actualSessionId, mapping.sessionId);
        reverseSessionIdMapping.set(mapping.sessionId, mapping.actualSessionId);
      }
    }
    log('[MessageRouter] Rebuilt reverse mappings for', this.sessionMappings.size, 'sessions');
  }

  /**
   * Get channel info for a remote session ID (fallback to sessionMappings if not in memory)
   */
  getChannelInfoForSession(sessionId: string): { channelType: ChannelType; channelId: string } | undefined {
    // Try sessionChannelMapping first (in-memory, per RemoteManager)
    // If not found, try sessionMappings (persisted)
    const mapping = this.getSessionMappingForRemoteSessionId(sessionId);
    if (mapping) {
      return { channelType: mapping.channelType, channelId: mapping.channelId };
    }
    return undefined;
  }

  /**
   * Clear session mapping
   */
  clearSession(sessionId: string): boolean {
    for (const [key, mapping] of this.sessionMappings) {
      if (mapping.sessionId === sessionId) {
        this.sessionMappings.delete(key);
        this.messageQueues.delete(sessionId);
        this.responseBuffers.delete(sessionId);
        this.processingSession.delete(sessionId);
        this.stopTypingIndicator(sessionId);
        this.saveSessionMappings();
        log('[MessageRouter] Cleared session:', sessionId);
        return true;
      }
    }
    return false;
  }

  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    this.sessionMappings.clear();
    this.messageQueues.clear();
    this.responseBuffers.clear();
    this.processingSession.clear();
    for (const sessionId of this.typingTimers.keys()) {
      this.stopTypingIndicator(sessionId);
    }
    this.saveSessionMappings();
    log('[MessageRouter] Cleared all sessions');
  }

  /**
   * Cleanup stale sessions (older than specified time)
   */
  cleanupStaleSessions(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, mapping] of this.sessionMappings) {
      if (now - mapping.lastActiveAt > maxAge) {
        this.sessionMappings.delete(key);
        this.messageQueues.delete(mapping.sessionId);
        this.stopTypingIndicator(mapping.sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.saveSessionMappings();
      log('[MessageRouter] Cleaned up stale sessions:', cleaned);
    }

    return cleaned;
  }
}
