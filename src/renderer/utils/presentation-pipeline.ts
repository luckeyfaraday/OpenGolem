import type { Message, PresentationPipeline } from '../types';

const PRESENTATION_KEYWORDS = [
  'presentation',
  'presentacion',
  'slide deck',
  'slides',
  'diapositivas',
  'pptx',
  'powerpoint',
  'power point',
  'deck',
];

const AUDIENCE_HINTS = [
  'for ',
  'para ',
  'audience',
  'audiencia',
  'executive',
  'executivos',
  'board',
  'directiva',
  'junta',
  'investor',
  'student',
  'students',
  'estudiante',
  'estudiantes',
  'beginner',
  'beginners',
  'principiantes',
  'technical team',
  'team',
  'equipo',
  'equipo tecnico',
  'customer',
  'clients',
  'clientes',
  'class',
  'clase',
];

const TONE_HINTS = [
  'formal',
  'casual',
  'technical',
  'tecnico',
  'tecnica',
  'educational',
  'educativa',
  'educativo',
  'persuasive',
  'persuasivo',
  'executive',
  'ejecutivo',
  'sales',
  'academic',
  'academico',
  'playful',
];

function normalizePrompt(prompt: string): string {
  return prompt
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export interface PresentationBriefDraft {
  audience: string;
  objective: string;
  tone: string;
  slideCount: string;
  speakerNotes: 'yes' | 'no';
}

export function isPresentationPipelineCandidate(prompt: string): boolean {
  const normalized = normalizePrompt(prompt);
  if (!normalized) {
    return false;
  }

  return PRESENTATION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function isUnderSpecifiedPresentationPrompt(prompt: string): boolean {
  const normalized = normalizePrompt(prompt);
  if (!isPresentationPipelineCandidate(normalized)) {
    return false;
  }

  const hasAudience = AUDIENCE_HINTS.some((hint) => normalized.includes(hint));
  const hasTone = TONE_HINTS.some((hint) => normalized.includes(hint));
  const hasSlideCount = /\b\d+\s*(slide|slides|diapositivas)\b/.test(normalized)
    || /\bshort deck\b/.test(normalized)
    || /\blong deck\b/.test(normalized)
    || /\bdeck corto\b/.test(normalized)
    || /\bdeck largo\b/.test(normalized);
  const hasObjective = /\b(explain|teach|overview|intro|introduction|pitch|compare|summarize|training|report|proposal|explicar|ensenar|resumen|introduccion|comparar|capacitacion|propuesta|informe)\b/.test(normalized);

  const signalCount = [hasAudience, hasTone, hasSlideCount, hasObjective].filter(Boolean).length;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return signalCount < 2 && wordCount <= 18;
}

export function getDefaultPresentationBriefDraft(prompt: string): PresentationBriefDraft {
  const normalized = normalizePrompt(prompt);
  return {
    audience: normalized.includes('executive') || normalized.includes('board') || normalized.includes('ejecutivo') || normalized.includes('directiva') || normalized.includes('junta')
      ? 'Executives'
      : normalized.includes('student') || normalized.includes('class') || normalized.includes('estudiante') || normalized.includes('clase')
        ? 'Students'
        : 'General audience',
    objective: 'Explain the topic clearly and concisely.',
    tone: normalized.includes('technical') || normalized.includes('tecnico') || normalized.includes('tecnica') ? 'Technical' : 'Clear and accessible',
    slideCount: '10',
    speakerNotes: 'no',
  };
}

export function buildPresentationBrief(basePrompt: string, draft: PresentationBriefDraft): string {
  const lines = [
    basePrompt.trim(),
    '',
    'Presentation brief:',
    `Audience: ${draft.audience.trim() || 'General audience'}`,
    `Objective: ${draft.objective.trim() || 'Explain the topic clearly and concisely.'}`,
    `Tone: ${draft.tone.trim() || 'Clear and accessible'}`,
    `Target length: ${draft.slideCount.trim() || '10'} slides`,
    `Speaker notes: ${draft.speakerNotes === 'yes' ? 'Include speaker notes' : 'No speaker notes'}`,
  ];
  return lines.join('\n');
}

export function buildPresentationBriefPreview(basePrompt: string, draft: PresentationBriefDraft): string {
  return buildPresentationBrief(basePrompt, draft);
}

export function buildNotebookLMHandoffText(
  prompt: string,
  options: {
    notebookTitle: string;
    notebookId?: string;
    importedSources: number;
    skippedSources?: number;
  }
): string {
  const lines: string[] = [];
  lines.push('NotebookLM pipeline selected.');
  lines.push(`Notebook: ${options.notebookTitle}`);
  if (options.notebookId) {
    lines.push(`Notebook ID: ${options.notebookId}`);
  }
  lines.push(`Imported sources: ${options.importedSources}`);
  if ((options.skippedSources || 0) > 0) {
    lines.push(`Skipped sources: ${options.skippedSources}. Add those manually in NotebookLM if you still need them.`);
  }
  lines.push('I started the NotebookLM slide-deck generation flow and opened NotebookLM in your browser so you can continue there instead of waiting here for a long-running download.');
  lines.push('Use this brief in NotebookLM:');
  lines.push(prompt.trim());
  return lines.join('\n\n');
}

export function buildNotebookLMMissingCliText(command: string): string {
  return `NotebookLM pipeline is unavailable because \`${command}\` was not found on PATH. Install the NotebookLM CLI first, then try again.`;
}

export function buildPresentationPipelineLabel(pipeline: PresentationPipeline): string {
  return pipeline === 'notebooklm' ? 'NotebookLM' : 'Agent';
}

function flattenMessageText(message: Message): string {
  const parts: string[] = [];

  for (const block of message.content) {
    if (block.type === 'text' && block.text.trim()) {
      parts.push(block.text.trim());
    } else if (block.type === 'file_attachment' && block.filename.trim()) {
      parts.push(`[Attachment: ${block.filename.trim()}]`);
    }
  }

  return parts.join('\n\n').trim();
}

export function buildNotebookLMConversationContext(
  messages: Message[],
  options?: { maxMessages?: number; maxChars?: number }
): string | null {
  const maxMessages = options?.maxMessages ?? 8;
  const maxChars = options?.maxChars ?? 12000;

  const relevant = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      text: flattenMessageText(message),
    }))
    .filter((message) => message.text.length > 0)
    .slice(-maxMessages);

  if (relevant.length === 0) {
    return null;
  }

  const sections: string[] = ['# Conversation Context'];
  let remainingChars = maxChars;

  for (let index = relevant.length - 1; index >= 0; index -= 1) {
    const message = relevant[index];
    const heading = `## ${message.role === 'assistant' ? 'Assistant' : 'User'}`;
    const allowance = Math.max(300, remainingChars - heading.length - 4);
    const body = message.text.length > allowance
      ? `${message.text.slice(0, Math.max(0, allowance - 1)).trimEnd()}…`
      : message.text;
    const section = `${heading}\n\n${body}`;
    sections.splice(1, 0, section);
    remainingChars -= section.length;
    if (remainingChars <= 0) {
      break;
    }
  }

  return sections.join('\n\n').trim();
}
