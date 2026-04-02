import type { PresentationPipeline } from '../types';

interface Props {
  open: boolean;
  promptPreview: string;
  onSelect: (pipeline: PresentationPipeline) => void;
  onCancel: () => void;
}

export function PresentationPipelineDialog({
  open,
  promptPreview,
  onSelect,
  onCancel,
}: Props) {
  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-xl rounded-[1.5rem] border border-border-subtle bg-background/95 p-6 shadow-2xl backdrop-blur-md">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Presentation Pipeline
          </div>
          <h3 className="text-xl font-semibold text-text-primary">
            How should this deck request be handled?
          </h3>
          <p className="text-sm leading-6 text-text-secondary">
            OpenGolem can generate the presentation itself, or hand you off to NotebookLM.
            We&apos;ll remember your choice for this chat.
          </p>
          <div className="rounded-2xl border border-border-subtle bg-surface/70 px-4 py-3 text-sm text-text-secondary">
            <div className="line-clamp-4 whitespace-pre-wrap">{promptPreview}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onSelect('agent')}
            className="rounded-2xl border border-border-subtle bg-surface px-4 py-4 text-left transition hover:border-border hover:bg-surface-hover"
          >
            <div className="text-sm font-semibold text-text-primary">Generate With Agent</div>
            <div className="mt-1 text-sm text-text-secondary">
              Keep the work inside OpenGolem and deliver the result back into chat.
            </div>
          </button>
          <button
            type="button"
            onClick={() => onSelect('notebooklm')}
            className="rounded-2xl border border-amber-500/35 bg-amber-500/8 px-4 py-4 text-left transition hover:border-amber-500/55 hover:bg-amber-500/12"
          >
            <div className="text-sm font-semibold text-text-primary">Send To NotebookLM</div>
            <div className="mt-1 text-sm text-text-secondary">
              Open NotebookLM instead of waiting here for a long deck generation job.
            </div>
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border-subtle px-4 py-2 text-sm text-text-secondary transition hover:border-border hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
