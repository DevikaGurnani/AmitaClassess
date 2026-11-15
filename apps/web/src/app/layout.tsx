import './globals.css';
import './education.css';
import { Suspense, type ReactNode } from 'react';
import AppShell from '@/components/AppShell';
export const metadata = {
  title: 'Amita’s Classes | Learning portal',
  description: 'A connected home for classes, students, families, and learning progress.',
};
export const dynamic = 'force-dynamic';
export default function RootLayout({ children }: {children: ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-tuition-background">
        <Suspense fallback={null}><AppShell>{children}</AppShell></Suspense>
      </body>
    </html>
  );
}
