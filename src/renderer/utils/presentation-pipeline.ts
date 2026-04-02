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
    authenticated: boolean;
    loginStarted?: boolean;
    attachmentCount?: number;
  }
): string {
  const lines: string[] = [];
  lines.push('NotebookLM pipeline selected.');
  if (options.authenticated) {
    lines.push('I opened NotebookLM in your browser so you can generate the deck there directly instead of waiting here for a long-running job.');
  } else if (options.loginStarted) {
    lines.push('I started the NotebookLM sign-in flow and opened NotebookLM in your browser.');
  } else {
    lines.push('NotebookLM sign-in is still required before you can use that pipeline.');
  }
  if ((options.attachmentCount || 0) > 0) {
    lines.push(`You have ${options.attachmentCount} attached source file${options.attachmentCount === 1 ? '' : 's'} here. They were not uploaded automatically, so add them manually in NotebookLM.`);
  }
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
