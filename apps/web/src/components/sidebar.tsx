'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ChatIcon, DocsIcon, SettingsIcon, SparklesIcon } from './icons';

type Item = { href: string; label: string; icon: ReactNode; match: (p: string) => boolean };

const items: Item[] = [
  {
    href: '/',
    label: 'Chat',
    icon: <ChatIcon size={16} />,
    match: (p) => p === '/',
  },
  {
    href: '/documents',
    label: 'Documents',
    icon: <DocsIcon size={16} />,
    match: (p) => p === '/documents' || p.startsWith('/documents/'),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: <SettingsIcon size={16} />,
    match: (p) => p === '/settings',
  },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-60 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] flex-col border-r border-border-subtle bg-surface px-3 py-5">
      <div className="px-2 pb-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Workspace</p>
      </div>
      <nav className="flex flex-col gap-0.5">
        {items.map((it) => {
          const active = it.match(pathname ?? '');
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex items-center gap-2.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors duration-150',
                active
                  ? 'bg-accent-subtle text-accent'
                  : 'text-secondary hover:bg-subtle hover:text-primary',
              ].join(' ')}
            >
              <span className={active ? 'text-accent' : 'text-muted'}>{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-border-subtle">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-subtle">
          <span className="text-accent">
            <SparklesIcon size={14} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary leading-tight">Local-first</p>
            <p className="text-[11px] text-muted leading-tight">Ollama · pgvector</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
