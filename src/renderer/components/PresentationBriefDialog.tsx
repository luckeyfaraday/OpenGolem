import { useEffect, useState } from 'react';
import type { PresentationBriefDraft } from '../utils/presentation-pipeline';

interface Props {
  open: boolean;
  promptPreview: string;
  initialDraft: PresentationBriefDraft;
  onConfirm: (draft: PresentationBriefDraft) => void;
  onCancel: () => void;
}

export function PresentationBriefDialog({
  open,
  promptPreview,
  initialDraft,
  onConfirm,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState<PresentationBriefDraft>(initialDraft);

  useEffect(() => {
    if (open) {
      setDraft(initialDraft);
    }
  }, [initialDraft, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-2xl rounded-[1.5rem] border border-border-subtle bg-background/95 p-6 shadow-2xl backdrop-blur-md">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Presentation Brief
          </div>
          <h3 className="text-xl font-semibold text-text-primary">
            Shape the deck before choosing a pipeline
          </h3>
          <p className="text-sm leading-6 text-text-secondary">
            This request is still vague. Add just enough direction so the deck says what you actually want.
          </p>
          <div className="rounded-2xl border border-border-subtle bg-surface/70 px-4 py-3 text-sm text-text-secondary">
            <div className="line-clamp-4 whitespace-pre-wrap">{promptPreview}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <div className="text-sm font-medium text-text-primary">Audience</div>
            <input
              value={draft.audience}
              onChange={(e) => setDraft((current) => ({ ...current, audience: e.target.value }))}
              className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border"
              placeholder="Executives, students, engineers..."
            />
          </label>

          <label className="space-y-2">
            <div className="text-sm font-medium text-text-primary">Tone</div>
            <input
              value={draft.tone}
              onChange={(e) => setDraft((current) => ({ ...current, tone: e.target.value }))}
              className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border"
              placeholder="Technical, educational, persuasive..."
            />
          </label>

          <label className="space-y-2 sm:col-span-2">
            <div className="text-sm font-medium text-text-primary">Objective</div>
            <textarea
              value={draft.objective}
              onChange={(e) => setDraft((current) => ({ ...current, objective: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border"
              placeholder="What should the presentation help the audience understand or do?"
            />
          </label>

          <label className="space-y-2">
            <div className="text-sm font-medium text-text-primary">Target slides</div>
            <input
              value={draft.slideCount}
              onChange={(e) => setDraft((current) => ({ ...current, slideCount: e.target.value }))}
              className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border"
              placeholder="10"
            />
          </label>

          <label className="space-y-2">
            <div className="text-sm font-medium text-text-primary">Speaker notes</div>
            <select
              value={draft.speakerNotes}
              onChange={(e) =>
                setDraft((current) => ({
                  ...current,
                  speakerNotes: e.target.value === 'yes' ? 'yes' : 'no',
                }))
              }
              className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border-subtle px-4 py-2 text-sm text-text-secondary transition hover:border-border hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(draft)}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-background transition hover:bg-accent-hover"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
