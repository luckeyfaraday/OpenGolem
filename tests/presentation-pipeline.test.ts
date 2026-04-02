import { describe, expect, it } from 'vitest';
import {
  buildNotebookLMHandoffText,
  buildPresentationBrief,
  buildNotebookLMMissingCliText,
  getDefaultPresentationBriefDraft,
  isPresentationPipelineCandidate,
  isUnderSpecifiedPresentationPrompt,
} from '../src/renderer/utils/presentation-pipeline';

describe('presentation pipeline helpers', () => {
  it('detects deck-like prompts', () => {
    expect(isPresentationPipelineCandidate('Create a slide deck for the board meeting')).toBe(true);
    expect(isPresentationPipelineCandidate('Make me a PPTX about market structure')).toBe(true);
    expect(isPresentationPipelineCandidate('Summarize this repository')).toBe(false);
  });

  it('flags underspecified presentation prompts', () => {
    expect(isUnderSpecifiedPresentationPrompt('Make a presentation about nematodes')).toBe(true);
    expect(
      isUnderSpecifiedPresentationPrompt(
        'Make a 12 slide educational presentation about nematodes for biology students'
      )
    ).toBe(false);
  });

  it('builds a notebooklm handoff with attachment guidance', () => {
    const text = buildNotebookLMHandoffText('Build a presentation about LNG shipping.', {
      notebookTitle: 'LNG Shipping Deck',
      notebookId: 'nb-123',
      importedSources: 3,
      skippedSources: 2,
    });

    expect(text).toContain('NotebookLM pipeline selected.');
    expect(text).toContain('LNG Shipping Deck');
    expect(text).toContain('nb-123');
    expect(text).toContain('Imported sources: 3');
    expect(text).toContain('Skipped sources: 2');
    expect(text).toContain('Build a presentation about LNG shipping.');
  });

  it('builds a missing-cli message', () => {
    expect(buildNotebookLMMissingCliText('notebooklm')).toContain('`notebooklm`');
  });

  it('builds a structured presentation brief', () => {
    const draft = getDefaultPresentationBriefDraft('Make a presentation about nematodes');
    const text = buildPresentationBrief('Make a presentation about nematodes', {
      ...draft,
      audience: 'High school biology students',
      objective: 'Explain what nematodes are and why they matter.',
      tone: 'Educational',
      slideCount: '10',
      speakerNotes: 'yes',
    });

    expect(text).toContain('Presentation brief:');
    expect(text).toContain('Audience: High school biology students');
    expect(text).toContain('Target length: 10 slides');
    expect(text).toContain('Speaker notes: Include speaker notes');
  });
});
