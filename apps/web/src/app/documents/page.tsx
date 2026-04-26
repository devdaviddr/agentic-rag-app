import { SourcesPanel } from '@/components/sources-panel';

export const dynamic = 'force-dynamic';

export default function DocumentsPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-content px-4 md:px-6 lg:px-8 py-8 md:py-10">
        <SourcesPanel />
      </div>
    </div>
  );
}
