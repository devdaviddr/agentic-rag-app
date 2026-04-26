import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import './globals.css';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans-stack',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-stack',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Agentic RAG',
  description: 'Agentic full-stack RAG over a local knowledge base.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
