import type { PresentationPipeline } from '../types';

const PRESENTATION_KEYWORDS = [
  'presentation',
  'slide deck',
  'slides',
  'pptx',
  'powerpoint',
  'deck',
];

const AUDIENCE_HINTS = [
  'for ',
  'audience',
  'executive',
  'board',
  'investor',
  'student',
  'students',
  'beginner',
  'beginners',
  'technical team',
  'team',
  'customer',
  'clients',
  'class',
];

const TONE_HINTS = [
  'formal',
  'casual',
  'technical',
  'educational',
  'persuasive',
  'executive',
  'sales',
  'academic',
  'playful',
];

export interface PresentationBriefDraft {
  audience: string;
  objective: string;
  tone: string;
  slideCount: string;
  speakerNotes: 'yes' | 'no';
}

export function isPresentationPipelineCandidate(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return PRESENTATION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function isUnderSpecifiedPresentationPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!isPresentationPipelineCandidate(normalized)) {
    return false;
  }

  const hasAudience = AUDIENCE_HINTS.some((hint) => normalized.includes(hint));
  const hasTone = TONE_HINTS.some((hint) => normalized.includes(hint));
  const hasSlideCount = /\b\d+\s*(slide|slides)\b/.test(normalized)
    || /\bshort deck\b/.test(normalized)
    || /\blong deck\b/.test(normalized);
  const hasObjective = /\b(explain|teach|overview|intro|introduction|pitch|compare|summarize|training|report|proposal)\b/.test(normalized);

  const signalCount = [hasAudience, hasTone, hasSlideCount, hasObjective].filter(Boolean).length;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return signalCount < 2 && wordCount <= 18;
}

export function getDefaultPresentationBriefDraft(prompt: string): PresentationBriefDraft {
  const normalized = prompt.trim().toLowerCase();
  return {
    audience: normalized.includes('executive') || normalized.includes('board')
      ? 'Executives'
      : normalized.includes('student') || normalized.includes('class')
        ? 'Students'
        : 'General audience',
    objective: 'Explain the topic clearly and concisely.',
    tone: normalized.includes('technical') ? 'Technical' : 'Clear and accessible',
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
