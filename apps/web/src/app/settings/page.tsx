import { SettingsForm } from '@/components/settings-form';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-doc px-4 md:px-6 lg:px-8 py-8 md:py-10">
        <header className="mb-8">
          <h1 className="text-xl font-semibold text-primary tracking-[-0.01em]">Settings</h1>
          <p className="mt-1 text-sm text-secondary">
            Configure Ollama, models, and retrieval. Database overrides take precedence over .env defaults.
          </p>
        </header>
        <SettingsForm />
      </div>
    </div>
  );
}
