import { describe, expect, it } from 'vitest';
import {
  buildNotebookLMHandoffText,
  buildNotebookLMMissingCliText,
  isPresentationPipelineCandidate,
} from '../src/renderer/utils/presentation-pipeline';

describe('presentation pipeline helpers', () => {
  it('detects deck-like prompts', () => {
    expect(isPresentationPipelineCandidate('Create a slide deck for the board meeting')).toBe(true);
    expect(isPresentationPipelineCandidate('Make me a PPTX about market structure')).toBe(true);
    expect(isPresentationPipelineCandidate('Summarize this repository')).toBe(false);
  });

  it('builds a notebooklm handoff with attachment guidance', () => {
    const text = buildNotebookLMHandoffText('Build a presentation about LNG shipping.', {
      authenticated: false,
      loginStarted: true,
      attachmentCount: 2,
    });

    expect(text).toContain('NotebookLM pipeline selected.');
    expect(text).toContain('sign-in flow');
    expect(text).toContain('2 attached source files');
    expect(text).toContain('Build a presentation about LNG shipping.');
  });

  it('builds a missing-cli message', () => {
    expect(buildNotebookLMMissingCliText('notebooklm')).toContain('`notebooklm`');
  });
});
