import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDocument } from '@app/db';
import { DocumentViewer } from '@/components/document-viewer';
import { ArrowLeftIcon } from '@/components/icons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) notFound();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-doc px-4 md:px-6 lg:px-8 py-8 md:py-10">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeftIcon size={13} />
          Documents
        </Link>

        <header className="mt-4 flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-primary tracking-[-0.01em]">
            {doc.title ?? doc.source}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-secondary">
              {doc.source}
            </code>
            {doc.mimeType && (
              <>
                <span className="text-border-default">·</span>
                <span>{doc.mimeType}</span>
              </>
            )}
            {doc.bytes !== null && (
              <>
                <span className="text-border-default">·</span>
                <span>{formatBytes(doc.bytes)}</span>
              </>
            )}
            <span className="text-border-default">·</span>
            <span>
              {doc.chunkCount} chunk{doc.chunkCount === 1 ? '' : 's'}
            </span>
            <span className="text-border-default">·</span>
            <span>{new Date(doc.createdAt).toLocaleString()}</span>
          </div>
        </header>

        <div className="mt-8">
          <DocumentViewer
            id={doc.id}
            source={doc.source}
            mimeType={doc.mimeType}
            hasOriginal={doc.hasOriginal}
          />
        </div>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
