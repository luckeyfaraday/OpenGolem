import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { useIPC } from '../hooks/useIPC';
import { MessageCard } from './MessageCard';
import { SlashCommandMenu } from './SlashCommandMenu';
import { PresentationBriefDialog } from './PresentationBriefDialog';
import { PresentationPipelineDialog } from './PresentationPipelineDialog';
import type { Message, ContentBlock, PresentationPipeline } from '../types';
import { getInitialSessionTitle } from '../../shared/session-title';
import {
  buildSlashCommandHelpText,
  buildSlashCommandMemoryHelpText,
  buildSlashCommandMemoryText,
  buildSlashCommandReviewPrompt,
  getSlashCommandSuggestions,
  parseMemoryCommandArgs,
  buildSlashCommandUsageText,
  buildSlashCommandWhereText,
  buildUnknownSlashCommandText,
  isKnownSlashCommand,
  parseSlashCommand,
} from '../utils/slash-commands';
import {
  buildNotebookLMHandoffText,
  buildPresentationBrief,
  getDefaultPresentationBriefDraft,
  isPresentationPipelineCandidate,
  isUnderSpecifiedPresentationPrompt,
} from '../utils/presentation-pipeline';
import { Send, Square, Plus, Loader2, Plug, X, Clock } from 'lucide-react';

type AttachedFile = {
  name: string;
  path: string;
  size: number;
  type: string;
  inlineDataBase64?: string;
};

export function ChatView() {
  const { t } = useTranslation();
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const messagesBySession = useAppStore((s) => s.messagesBySession);
  const partialMessagesBySession = useAppStore((s) => s.partialMessagesBySession);
  const partialThinkingBySession = useAppStore((s) => s.partialThinkingBySession);
  const activeTurnsBySession = useAppStore((s) => s.activeTurnsBySession);
  const pendingTurnsBySession = useAppStore((s) => s.pendingTurnsBySession);
  const executionClockBySession = useAppStore((s) => s.executionClockBySession);
  const appConfig = useAppStore((s) => s.appConfig);
  const workingDir = useAppStore((s) => s.workingDir);
  const addMessage = useAppStore((s) => s.addMessage);
  const setMessages = useAppStore((s) => s.setMessages);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const setGlobalNotice = useAppStore((s) => s.setGlobalNotice);
  const presentationPipelineBySession = useAppStore((s) => s.presentationPipelineBySession);
  const setPresentationPipeline = useAppStore((s) => s.setPresentationPipeline);
  const { continueSession, startSession, stopSession, addMemory, searchMemory, listMemory, isElectron } = useIPC();
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBriefDialog, setShowBriefDialog] = useState(false);
  const [briefPromptSeed, setBriefPromptSeed] = useState('');
  const [showPipelineDialog, setShowPipelineDialog] = useState(false);
  const [pipelinePromptPreview, setPipelinePromptPreview] = useState('');
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
  const [activeConnectors, setActiveConnectors] = useState<any[]>([]);
  const [showConnectorLabel, setShowConnectorLabel] = useState(true);
  const headerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const connectorMeasureRef = useRef<HTMLDivElement>(null);
  const [pastedImages, setPastedImages] = useState<
    Array<{ url: string; base64: string; mediaType: string }>
  >([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);
  const isComposingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevMessageCountRef = useRef(0);
  const prevPartialLengthRef = useRef(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRequestRef = useRef<number | null>(null);
  const isScrollingRef = useRef(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSessionId ? messagesBySession[activeSessionId] || [] : [];
  const pendingTurns = activeSessionId ? pendingTurnsBySession[activeSessionId] || [] : [];
  const partialMessage = activeSessionId ? partialMessagesBySession[activeSessionId] || '' : '';
  const partialThinking = activeSessionId
    ? partialThinkingBySession[activeSessionId] || ''
    : '';
  const activeTurn = activeSessionId ? activeTurnsBySession[activeSessionId] : null;
  const hasActiveTurn = Boolean(activeTurn);
  const pendingCount = pendingTurns.length;
  const isSessionRunning = activeSession?.status === 'running';
  const canStop = isSessionRunning || hasActiveTurn || pendingCount > 0;
  const slashSuggestions = useMemo(() => getSlashCommandSuggestions(prompt), [prompt]);
  const initialBriefDraft = useMemo(
    () => getDefaultPresentationBriefDraft(briefPromptSeed),
    [briefPromptSeed]
  );
  const rememberedPresentationPipeline = activeSessionId
    ? presentationPipelineBySession[activeSessionId] || null
    : null;

  const displayedMessages = useMemo(() => {
    if (!activeSessionId) return messages;
    // Show streaming message if we have partial text OR partial thinking
    const hasStreamingContent = partialMessage || partialThinking;
    if (!hasStreamingContent || !activeTurn?.userMessageId) return messages;
    const anchorIndex = messages.findIndex((message) => message.id === activeTurn.userMessageId);
    if (anchorIndex === -1) return messages;

    let insertIndex = anchorIndex + 1;
    while (insertIndex < messages.length) {
      if (messages[insertIndex].role === 'user') break;
      insertIndex += 1;
    }

    const contentBlocks: ContentBlock[] = [];
    if (partialThinking) {
      contentBlocks.push({ type: 'thinking', thinking: partialThinking });
    }
    if (partialMessage) {
      contentBlocks.push({ type: 'text', text: partialMessage });
    }

    const streamingMessage: Message = {
      id: `partial-${activeSessionId}`,
      sessionId: activeSessionId,
      role: 'assistant',
      content: contentBlocks,
      timestamp: Date.now(),
    };

    return [...messages.slice(0, insertIndex), streamingMessage, ...messages.slice(insertIndex)];
  }, [activeSessionId, activeTurn?.userMessageId, messages, partialMessage, partialThinking]);

  // Format execution time for display
  const formatExecutionTime = useCallback((ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }, []);

  // --- Real-time execution timer ---
  const executionClock = activeSessionId ? executionClockBySession[activeSessionId] : undefined;
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    const isActive = Boolean(executionClock?.startAt && executionClock.endAt === null);
    if (!isActive) {
      return;
    }
    setClockNow(Date.now());
    const interval = setInterval(() => {
      setClockNow(Date.now());
    }, 100);
    return () => clearInterval(interval);
  }, [executionClock?.startAt, executionClock?.endAt]);

  const liveElapsed =
    executionClock?.startAt == null
      ? 0
      : Math.max(0, (executionClock.endAt ?? clockNow) - executionClock.startAt);
  const timerActive = Boolean(executionClock?.startAt && executionClock.endAt === null);

  // Debounced scroll function to prevent scroll conflicts
  const scrollToBottom = useRef((behavior: ScrollBehavior = 'auto', immediate: boolean = false) => {
    // Cancel any pending scroll requests
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    if (scrollRequestRef.current) {
      cancelAnimationFrame(scrollRequestRef.current);
      scrollRequestRef.current = null;
    }

    const performScroll = () => {
      if (!isUserAtBottomRef.current) return;

      // Mark as scrolling to prevent concurrent scrolls
      isScrollingRef.current = true;

      messagesEndRef.current?.scrollIntoView({ behavior });

      // Reset scrolling flag after a short delay
      setTimeout(
        () => {
          isScrollingRef.current = false;
        },
        behavior === 'smooth' ? 300 : 50
      );
    };

    if (immediate) {
      performScroll();
    } else {
      // Use RAF + timeout for debouncing
      scrollRequestRef.current = requestAnimationFrame(() => {
        scrollTimeoutRef.current = setTimeout(performScroll, 16); // ~1 frame delay
      });
    }
  }).current;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const updateScrollState = () => {
      const distanceToBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      isUserAtBottomRef.current = distanceToBottom <= 80;
    };
    updateScrollState();
    // 用户阅读旧消息时，阻止新消息自动滚动打断视线
    const onScroll = () => updateScrollState();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const messageCount = messages.length;
    const partialLength = partialMessage.length + partialThinking.length;
    const hasNewMessage = messageCount !== prevMessageCountRef.current;
    const isStreamingTick = partialLength !== prevPartialLengthRef.current && !hasNewMessage;

    // Skip scroll if already scrolling (prevent conflicts)
    if (isScrollingRef.current) {
      prevMessageCountRef.current = messageCount;
      prevPartialLengthRef.current = partialLength;
      return;
    }

    if (isUserAtBottomRef.current) {
      if (!isStreamingTick) {
        // New message - use smooth scroll but with debounce
        const behavior: ScrollBehavior = hasNewMessage ? 'smooth' : 'auto';
        scrollToBottom(behavior, false);
      } else {
        // Streaming tick - use instant scroll with debounce
        scrollToBottom('auto', false);
      }
    }

    prevMessageCountRef.current = messageCount;
    prevPartialLengthRef.current = partialLength;
  }, [messages.length, partialMessage, partialThinking]);

  // Additional scroll trigger for content height changes (e.g., TodoWrite expand/collapse)
  useEffect(() => {
    const container = scrollContainerRef.current;
    const messagesContainer = messagesContainerRef.current;
    if (!container || !messagesContainer) return;

    const resizeObserver = new ResizeObserver(() => {
      // Don't interfere with ongoing scrolls
      if (!isScrollingRef.current && isUserAtBottomRef.current) {
        // Scroll to bottom when content height changes
        scrollToBottom('auto', false);
      }
    });

    resizeObserver.observe(messagesContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, [displayedMessages.length]); // Re-create observer when message count changes

  // Cleanup scroll timeouts on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (scrollRequestRef.current) {
        cancelAnimationFrame(scrollRequestRef.current);
      }
    };
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeSessionId]);

  useEffect(() => {
    setSelectedSlashCommandIndex((current) =>
      slashSuggestions.length === 0 ? 0 : Math.min(current, slashSuggestions.length - 1)
    );
  }, [slashSuggestions]);

  // Handle paste event for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();

    const newImages: Array<{ url: string; base64: string; mediaType: string }> = [];

    for (const item of imageItems) {
      const blob = item.getAsFile();
      if (!blob) continue;

      try {
        // Resize if needed to stay under API limit
        const resizedBlob = await resizeImageIfNeeded(blob);
        const base64 = await blobToBase64(resizedBlob);
        const url = URL.createObjectURL(resizedBlob);
        newImages.push({
          url,
          base64,
          mediaType: resizedBlob.type as any,
        });
      } catch (err) {
        console.error('Failed to process pasted image:', err);
      }
    }

    setPastedImages((prev) => [...prev, ...newImages]);
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('FileReader result is not a string'));
          return;
        }
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const parts = result.split(',');
        resolve(parts[1] || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Resize and compress image if needed to stay under 5MB base64 limit
  const resizeImageIfNeeded = async (blob: Blob): Promise<Blob> => {
    // Claude API limit is 5MB for base64 encoded images
    // Base64 encoding increases size by ~33%, so we target 3.75MB for the blob
    const MAX_BLOB_SIZE = 3.75 * 1024 * 1024; // 3.75MB

    if (blob.size <= MAX_BLOB_SIZE) {
      return blob; // No need to resize
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);

        // Calculate scaling factor to reduce file size
        // We use a more aggressive approach: scale down until size is acceptable
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Start with a scale factor based on size ratio
        const scale = Math.sqrt(MAX_BLOB_SIZE / blob.size);
        const quality = 0.9;

        const attemptCompress = (currentScale: number, currentQuality: number): Promise<Blob> => {
          canvas.width = Math.floor(img.width * currentScale);
          canvas.height = Math.floor(img.height * currentScale);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          return new Promise((resolveBlob) => {
            canvas.toBlob(
              (compressedBlob) => {
                if (!compressedBlob) {
                  reject(new Error('Failed to compress image'));
                  return;
                }

                // If still too large, try again with lower quality or scale
                if (
                  compressedBlob.size > MAX_BLOB_SIZE &&
                  (currentQuality > 0.5 || currentScale > 0.3)
                ) {
                  const newQuality = Math.max(0.5, currentQuality - 0.1);
                  const newScale = currentQuality <= 0.5 ? currentScale * 0.9 : currentScale;
                  attemptCompress(newScale, newQuality).then(resolveBlob);
                } else {
                  resolveBlob(compressedBlob);
                }
              },
              blob.type || 'image/jpeg',
              currentQuality
            );
          });
        };

        attemptCompress(scale, quality).then(resolve).catch(reject);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  };

  const removeImage = (index: number) => {
    setPastedImages((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].url);
      updated.splice(index, 1);
      return updated;
    });
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleFileSelect = async () => {
    if (!isElectron || !window.electronAPI) {
      console.log('[ChatView] Not in Electron, file selection not available');
      return;
    }

    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths.length === 0) return;

      // Get file info for each selected file
      const newFiles = filePaths.map((filePath) => {
        const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
        return {
          name: fileName,
          path: filePath,
          size: 0, // Will be set by backend when copying
          type: 'application/octet-stream',
        };
      });

      setAttachedFiles((prev) => [...prev, ...newFiles]);
    } catch (error) {
      console.error('[ChatView] Error selecting files:', error);
    }
  };

  // Handle drag and drop for images
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const otherFiles = files.filter((file) => !file.type.startsWith('image/'));

    // Process images
    if (imageFiles.length > 0) {
      const newImages: Array<{ url: string; base64: string; mediaType: string }> = [];

      for (const file of imageFiles) {
        try {
          // Resize if needed to stay under API limit
          const resizedBlob = await resizeImageIfNeeded(file);
          const base64 = await blobToBase64(resizedBlob);
          const url = URL.createObjectURL(resizedBlob);
          newImages.push({
            url,
            base64,
            mediaType: resizedBlob.type,
          });
        } catch (err) {
          console.error('Failed to process dropped image:', err);
        }
      }

      setPastedImages((prev) => [...prev, ...newImages]);
    }

    // Process other files
    if (otherFiles.length > 0) {
      const newFiles = await Promise.all(
        otherFiles.map(async (file) => {
          const droppedPath = 'path' in file && typeof file.path === 'string' ? file.path : '';
          const inlineDataBase64 = droppedPath ? undefined : await blobToBase64(file);

          return {
            name: file.name,
            path: droppedPath,
            size: file.size,
            type: file.type || 'application/octet-stream',
            inlineDataBase64,
          };
        })
      );

      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  // Load active MCP connectors
  useEffect(() => {
    if (isElectron && typeof window !== 'undefined' && window.electronAPI) {
      const loadConnectors = async () => {
        try {
          const statuses = await window.electronAPI.mcp.getServerStatus();
          const active = statuses?.filter((s: any) => s.connected && s.toolCount > 0) || [];
          setActiveConnectors(active);
        } catch (err) {
          console.error('Failed to load MCP connectors:', err);
        }
      };
      loadConnectors();
      // Refresh every 5 seconds
      const interval = setInterval(loadConnectors, 5000);
      return () => clearInterval(interval);
    }
  }, [isElectron]);

  useEffect(() => {
    const titleEl = titleRef.current;
    const headerEl = headerRef.current;
    const measureEl = connectorMeasureRef.current;
    if (!titleEl || !headerEl || !measureEl) {
      setShowConnectorLabel(true);
      return;
    }
    const updateLabelVisibility = () => {
      const isTruncated = titleEl.scrollWidth > titleEl.clientWidth;
      const headerStyle = window.getComputedStyle(headerEl);
      const paddingLeft = Number.parseFloat(headerStyle.paddingLeft) || 0;
      const paddingRight = Number.parseFloat(headerStyle.paddingRight) || 0;
      const contentWidth = headerEl.clientWidth - paddingLeft - paddingRight;
      const titleWidth = titleEl.getBoundingClientRect().width;
      const rightColumnWidth = Math.max(0, (contentWidth - titleWidth) / 2);
      const connectorFullWidth = measureEl.getBoundingClientRect().width;
      setShowConnectorLabel(!isTruncated && rightColumnWidth >= connectorFullWidth);
    };
    updateLabelVisibility();
    const observer = new ResizeObserver(() => {
      updateLabelVisibility();
    });
    observer.observe(titleEl);
    observer.observe(headerEl);
    return () => observer.disconnect();
  }, [activeSession?.title, activeConnectors.length]);

  const clearComposer = useCallback(() => {
    setPrompt('');
    if (textareaRef.current) {
      textareaRef.current.value = '';
    }
    pastedImages.forEach((img) => URL.revokeObjectURL(img.url));
    setPastedImages([]);
    setAttachedFiles([]);
  }, [pastedImages]);

  const pushLocalCommandMessage = useCallback((text: string) => {
    if (!activeSessionId) return;
    addMessage(activeSessionId, {
      id: `slash-${Date.now()}`,
      sessionId: activeSessionId,
      role: 'system',
      content: [{ type: 'text', text }],
      timestamp: Date.now(),
    });
  }, [activeSessionId, addMessage]);

  const buildContentBlocks = useCallback((trimmedPrompt: string): ContentBlock[] => {
    const contentBlocks: ContentBlock[] = [];

    pastedImages.forEach((img) => {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType as any,
          data: img.base64,
        },
      });
    });

    attachedFiles.forEach((file) => {
      contentBlocks.push({
        type: 'file_attachment',
        filename: file.name,
        relativePath: file.path,
        size: file.size,
        mimeType: file.type,
        inlineDataBase64: file.inlineDataBase64,
      });
    });

    if (trimmedPrompt) {
      contentBlocks.push({ type: 'text', text: trimmedPrompt });
    }

    return contentBlocks;
  }, [attachedFiles, pastedImages]);

  const handoffToNotebookLM = useCallback(async (trimmedPrompt: string, contentBlocks: ContentBlock[]) => {
    if (!activeSessionId) return;
    if (!window.electronAPI?.notebooklm) {
      setGlobalNotice({
        id: `notice-notebooklm-${Date.now()}`,
        type: 'error',
        message: 'NotebookLM integration is only available in the desktop app.',
      });
      return;
    }

    const sourcePaths = attachedFiles
      .map((file) => file.path?.trim() || '')
      .filter((filePath) => filePath.length > 0);
    const localSkippedSources =
      pastedImages.length + attachedFiles.filter((file) => !(file.path && file.path.trim())).length;

    const preparation = await window.electronAPI.notebooklm.preparePresentationDeck({
      title: activeSession?.title || getInitialSessionTitle(trimmedPrompt),
      prompt: trimmedPrompt,
      sourcePaths,
    });

    if (preparation.status === 'unavailable') {
      setGlobalNotice({
        id: `notice-notebooklm-${Date.now()}`,
        type: 'error',
        message: preparation.message,
      });
      return;
    }

    if (preparation.status === 'requires_login') {
      const loginResult = await window.electronAPI.notebooklm.startLogin();
      const opened = await window.electronAPI.notebooklm.openWebApp();
      setGlobalNotice({
        id: `notice-notebooklm-${Date.now()}`,
        type: opened ? 'warning' : 'error',
        message: loginResult.started
          ? 'NotebookLM sign-in started. Finish authentication in the browser, then resend this presentation request.'
          : 'NotebookLM authentication is required before sources can be uploaded.',
      });
      return;
    }

    if (preparation.status === 'error') {
      setGlobalNotice({
        id: `notice-notebooklm-${Date.now()}`,
        type: 'error',
        message: preparation.message,
      });
      return;
    }

    const opened = await window.electronAPI.notebooklm.openWebApp();
    const assistantMessage: Message = {
      id: `notebooklm-assistant-${Date.now()}`,
      sessionId: activeSessionId,
      role: 'assistant',
      content: [{
        type: 'text',
        text: buildNotebookLMHandoffText(trimmedPrompt, {
          notebookTitle: preparation.notebookTitle,
          notebookId: preparation.notebookId,
          importedSources: preparation.importedSources,
          skippedSources: preparation.skippedSources + localSkippedSources,
        }),
      }],
      timestamp: Date.now(),
    };
    const userMessage: Message = {
      id: `notebooklm-user-${Date.now()}`,
      sessionId: activeSessionId,
      role: 'user',
      content: contentBlocks,
      timestamp: Date.now(),
    };
    setMessages(activeSessionId, [...messages, userMessage, assistantMessage]);
    clearComposer();
    setGlobalNotice({
      id: `notice-notebooklm-${Date.now()}`,
      type: opened ? 'success' : 'warning',
      message: opened
        ? 'NotebookLM notebook prepared and opened in your browser.'
        : 'NotebookLM notebook was prepared, but opening the browser failed.',
    });
  }, [activeSession, activeSessionId, attachedFiles, clearComposer, messages, pastedImages.length, setGlobalNotice, setMessages]);

  const submitPrompt = useCallback(async (
    promptText: string,
    pipeline: PresentationPipeline | null = null,
    options?: { bypassBrief?: boolean }
  ) => {
    if (!activeSessionId) return;
    const trimmedPrompt = promptText.trim();

    if ((!trimmedPrompt && pastedImages.length === 0 && attachedFiles.length === 0) || isSubmitting) {
      return;
    }

    const slashCommand = parseSlashCommand(trimmedPrompt);
    if (slashCommand) {
      if (pastedImages.length > 0 || attachedFiles.length > 0) {
        setGlobalNotice({
          id: `notice-slash-attachments-${Date.now()}`,
          type: 'warning',
          message: 'Slash commands do not support attachments yet.',
        });
        return;
      }

      if (!isKnownSlashCommand(slashCommand.name)) {
        pushLocalCommandMessage(buildUnknownSlashCommandText(slashCommand.name));
        clearComposer();
        return;
      }

      switch (slashCommand.name) {
        case 'help':
          pushLocalCommandMessage(buildSlashCommandHelpText());
          clearComposer();
          return;
        case 'memory': {
          const memoryCommand = parseMemoryCommandArgs(slashCommand.args);
          if (memoryCommand.kind === 'help') {
            pushLocalCommandMessage(buildSlashCommandMemoryHelpText());
            clearComposer();
            return;
          }
          if (memoryCommand.kind === 'invalid') {
            pushLocalCommandMessage(memoryCommand.message);
            clearComposer();
            return;
          }
          if (memoryCommand.kind === 'add') {
            const entry = await addMemory(activeSessionId, memoryCommand.content);
            pushLocalCommandMessage(
              entry
                ? `Saved memory for ${entry.metadata.sessionTitle || activeSession?.title || 'this chat'}.`
                : 'Failed to save memory.'
            );
            clearComposer();
            return;
          }
          if (memoryCommand.kind === 'search') {
            const entries = await searchMemory(memoryCommand.query, memoryCommand.limit);
            pushLocalCommandMessage(buildSlashCommandMemoryText(entries, `Memory search: ${memoryCommand.query}`));
            clearComposer();
            return;
          }
          const entries = await listMemory(memoryCommand.limit);
          pushLocalCommandMessage(buildSlashCommandMemoryText(entries, 'Recent memories:'));
          clearComposer();
          return;
        }
        case 'where':
          pushLocalCommandMessage(
            buildSlashCommandWhereText({
              session: activeSession,
              workingDir,
              model: appConfig?.model || null,
            })
          );
          clearComposer();
          return;
        case 'usage':
          pushLocalCommandMessage(buildSlashCommandUsageText(messages));
          clearComposer();
          return;
        case 'new':
          clearComposer();
          if (!slashCommand.args) {
            setActiveSession(null);
            setShowSettings(false);
            return;
          }
          await startSession(
            getInitialSessionTitle(slashCommand.args),
            slashCommand.args,
            activeSession?.cwd || workingDir || undefined
          );
          return;
        case 'review':
          await continueSession(activeSessionId, buildSlashCommandReviewPrompt(slashCommand.args));
          clearComposer();
          return;
      }
    }

    if (!options?.bypassBrief && isUnderSpecifiedPresentationPrompt(trimmedPrompt)) {
      setBriefPromptSeed(trimmedPrompt);
      setShowBriefDialog(true);
      return;
    }

    const effectivePipeline =
      pipeline || (isPresentationPipelineCandidate(trimmedPrompt) ? rememberedPresentationPipeline : null);
    if (!pipeline && trimmedPrompt && isPresentationPipelineCandidate(trimmedPrompt) && !effectivePipeline) {
      setPipelinePromptPreview(trimmedPrompt);
      setShowPipelineDialog(true);
      return;
    }

    const contentBlocks = buildContentBlocks(trimmedPrompt);

    setIsSubmitting(true);
    try {
      if (pipeline) {
        setPresentationPipeline(activeSessionId, pipeline);
      }
      if (pipeline === 'notebooklm' || effectivePipeline === 'notebooklm') {
        await handoffToNotebookLM(trimmedPrompt, contentBlocks);
        return;
      }
      await continueSession(activeSessionId, contentBlocks);
      clearComposer();
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeSession,
    activeSessionId,
    addMemory,
    appConfig?.model,
    attachedFiles,
    buildContentBlocks,
    clearComposer,
    continueSession,
    handoffToNotebookLM,
    isSubmitting,
    listMemory,
    messages,
    pastedImages.length,
    pushLocalCommandMessage,
    rememberedPresentationPipeline,
    searchMemory,
    setGlobalNotice,
    setPresentationPipeline,
    setShowSettings,
    startSession,
    workingDir,
  ]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await submitPrompt(textareaRef.current?.value || prompt);
  };

  const handlePipelineSelection = useCallback(async (pipeline: PresentationPipeline) => {
    setShowPipelineDialog(false);
    const nextPrompt = pipelinePromptPreview || textareaRef.current?.value || prompt;
    setPipelinePromptPreview('');
    await submitPrompt(nextPrompt, pipeline, { bypassBrief: true });
  }, [pipelinePromptPreview, prompt, submitPrompt]);

  const handleBriefConfirm = useCallback(async (draft: ReturnType<typeof getDefaultPresentationBriefDraft>) => {
    const enhancedPrompt = buildPresentationBrief(briefPromptSeed, draft);
    setShowBriefDialog(false);
    setBriefPromptSeed('');
    setPrompt(enhancedPrompt);
    if (textareaRef.current) {
      textareaRef.current.value = enhancedPrompt;
    }
    if (rememberedPresentationPipeline) {
      await submitPrompt(enhancedPrompt, rememberedPresentationPipeline, { bypassBrief: true });
      return;
    }
    setPipelinePromptPreview(enhancedPrompt);
    setShowPipelineDialog(true);
  }, [briefPromptSeed, rememberedPresentationPipeline, submitPrompt]);

  const applySlashCommand = useCallback((commandName: string) => {
    const nextValue = `/${commandName} `;
    setPrompt(nextValue);
    setSelectedSlashCommandIndex(0);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.value = nextValue;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextValue.length, nextValue.length);
      }
    });
  }, []);

  const handleStop = () => {
    if (activeSessionId) {
      stopSession(activeSessionId);
    }
  };

  if (!activeSession) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <span>{t('chat.loadingConversation')}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div
        ref={headerRef}
        className="relative h-12 border-b border-border-muted grid grid-cols-[1fr_auto_1fr] items-center px-4 lg:px-8 bg-background/88 backdrop-blur-md"
      >
        <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-text-muted">
          OpenGolem
        </div>
        <h2
          ref={titleRef}
          className="text-[15px] font-medium text-text-primary text-center truncate max-w-[40vw] lg:max-w-[32rem]"
        >
          {activeSession.title}
        </h2>
        {activeConnectors.length > 0 && (
          <>
            <div
              ref={connectorMeasureRef}
              aria-hidden="true"
              className="absolute left-0 top-0 -z-10 opacity-0 pointer-events-none"
            >
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-mcp/20">
                <Plug className="w-3.5 h-3.5" />
                <span className="text-xs font-medium whitespace-nowrap">
                  {t('chat.connectorCount', { count: activeConnectors.length })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-mcp/8 border border-mcp/15 justify-self-end">
              <Plug className="w-3.5 h-3.5 text-mcp" />
              <span className="text-xs text-mcp font-medium">
                {showConnectorLabel
                  ? t('chat.connectorCount', { count: activeConnectors.length })
                  : activeConnectors.length}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div
          ref={messagesContainerRef}
          className="w-full max-w-[920px] mx-auto py-8 px-5 lg:px-8 space-y-5"
        >
          {displayedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 text-text-muted space-y-3 text-center">
              <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted/80">
                OpenGolem
              </p>
              <p className="text-base text-text-secondary">{t('chat.startConversation')}</p>
            </div>
          ) : (
            displayedMessages.map((message) => {
              const isStreaming =
                typeof message.id === 'string' && message.id.startsWith('partial-');
              return (
                <div key={message.id}>
                  <MessageCard message={message} isStreaming={isStreaming} />
                </div>
              );
            })
          )}

          {/* Processing indicator - show when we have an active turn but no streaming content yet */}
          {hasActiveTurn &&
            (!partialMessage || partialMessage.trim() === '') &&
            !partialThinking && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-full bg-background/80 border border-border-subtle max-w-fit">
              <Loader2 className="w-4 h-4 text-accent animate-spin" />
              <span className="text-sm text-text-secondary">{t('chat.processing')}</span>
            </div>
          )}

          {/* Real-time execution timer */}
          {liveElapsed > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-1 ml-0.5">
              <Clock className="w-3 h-3" />
              <span>
                {timerActive
                  ? formatExecutionTime(liveElapsed)
                  : t('messageCard.executionTime', { time: formatExecutionTime(liveElapsed) })}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border-muted bg-background/92 backdrop-blur-md">
        <div className="max-w-[920px] mx-auto px-5 lg:px-8 py-5">
          <form
            onSubmit={handleSubmit}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="relative w-full"
          >
            {/* Image previews */}
            {pastedImages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-3">
                {pastedImages.map((img, index) => (
                  <div key={img.url || `pasted-image-${index}`} className="relative group">
                    <img
                      src={img.url}
                      alt={t('common.pastedImageAlt', { index: index + 1 })}
                      className="w-full aspect-square object-cover rounded-lg border border-border block"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* File attachments */}
            {attachedFiles.length > 0 && (
              <div className="space-y-2 mb-3">
                {attachedFiles.map((file, index) => (
                  <div
                    key={file.path || `attached-file-${index}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-muted border border-border group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{file.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="w-6 h-6 rounded-full bg-error/10 hover:bg-error/20 text-error flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <SlashCommandMenu
              commands={slashSuggestions}
              selectedIndex={selectedSlashCommandIndex}
              onSelect={(command) => applySlashCommand(command.name)}
            />

            <div
              className={`flex items-end gap-2 p-3.5 rounded-[1.75rem] bg-background/88 border border-border-muted shadow-soft transition-colors ${
                isDragging ? 'ring-2 ring-accent bg-accent/5' : ''
              }`}
            >
              <button
                type="button"
                onClick={handleFileSelect}
                className="w-9 h-9 rounded-2xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                title={t('welcome.attachFiles')}
              >
                <Plus className="w-5 h-5" />
              </button>

              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  isComposingRef.current = false;
                }}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  const slashSelectionText = (textareaRef.current?.value || prompt).trimStart();
                  const shouldApplySlashSelection =
                    slashSuggestions.length > 0 && /^\/\S*$/.test(slashSelectionText);

                  if (e.key === 'ArrowDown' && slashSuggestions.length > 0) {
                    e.preventDefault();
                    setSelectedSlashCommandIndex((current) =>
                      (current + 1) % slashSuggestions.length
                    );
                    return;
                  }

                  if (e.key === 'ArrowUp' && slashSuggestions.length > 0) {
                    e.preventDefault();
                    setSelectedSlashCommandIndex((current) =>
                      (current - 1 + slashSuggestions.length) % slashSuggestions.length
                    );
                    return;
                  }

                  if ((e.key === 'Tab' || e.key === 'Enter') && shouldApplySlashSelection) {
                    e.preventDefault();
                    applySlashCommand(slashSuggestions[selectedSlashCommandIndex].name);
                    return;
                  }

                  // Enter to send, Shift+Enter for new line
                  if (e.key === 'Enter' && !e.shiftKey) {
                    if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) {
                      return;
                    }
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={t('chat.typeMessage')}
                disabled={isSubmitting}
                rows={1}
                className="flex-1 resize-none bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted text-[15px] py-2"
              />

              <div className="flex items-center gap-2">
                {/* Model display */}
                <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full border border-border-subtle bg-background/60 text-xs text-text-muted">
                  {appConfig?.model || t('chat.noModel')}
                </span>

                {canStop && (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="w-9 h-9 rounded-2xl flex items-center justify-center bg-error/10 text-error hover:bg-error/20 transition-colors"
                    title={t('chat.stop')}
                  >
                    <Square className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={
                    (!prompt.trim() &&
                      !textareaRef.current?.value.trim() &&
                      pastedImages.length === 0 &&
                      attachedFiles.length === 0) ||
                    isSubmitting
                  }
                  className="w-9 h-9 rounded-2xl flex items-center justify-center bg-accent text-background disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
                  title={t('chat.sendMessage')}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-[11px] text-text-muted/60 text-center mt-2.5">
              {t('chat.disclaimer')}
            </p>
          </form>
        </div>
      </div>
      <PresentationPipelineDialog
        open={showPipelineDialog}
        promptPreview={pipelinePromptPreview}
        onSelect={handlePipelineSelection}
        onCancel={() => {
          setShowPipelineDialog(false);
          setPipelinePromptPreview('');
        }}
      />
      <PresentationBriefDialog
        open={showBriefDialog}
        promptPreview={briefPromptSeed}
        initialDraft={initialBriefDraft}
        onConfirm={handleBriefConfirm}
        onCancel={() => {
          setShowBriefDialog(false);
          setBriefPromptSeed('');
        }}
      />
    </div>
  );
}
