import Link from 'next/link';
import { SparklesIcon } from './icons';

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 h-14 bg-surface/80 backdrop-blur border-b border-border-subtle">
      <div className="h-full px-4 md:px-6 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-xs">
            <SparklesIcon size={15} />
          </span>
          <span className="font-semibold text-primary tracking-[-0.01em]">Agentic RAG</span>
          <span className="hidden sm:inline-block text-[11px] font-medium px-1.5 py-0.5 rounded bg-subtle text-muted">
            local
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Ollama ready
          </span>
        </div>
      </div>
    </header>
  );
}
