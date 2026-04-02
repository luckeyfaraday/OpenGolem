import type { PresentationPipeline } from '../types';

const PRESENTATION_KEYWORDS = [
  'presentation',
  'slide deck',
  'slides',
  'pptx',
  'powerpoint',
  'deck',
];

export function isPresentationPipelineCandidate(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return PRESENTATION_KEYWORDS.some((keyword) => normalized.includes(keyword));
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
