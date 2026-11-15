import Link from 'next/link';
export default function FeaturePending({title}:{title:string}) {
  return <main className="min-h-screen bg-tuition-background text-white flex items-center justify-center p-5">
    <div className="max-w-md bg-tuition-card border border-border rounded-xl p-7 space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-400">This workflow is scheduled for Phase 1. It is not implemented in the Phase 0 foundation package.</p>
      <Link href="/dashboard" className="inline-block underline text-tuition-accent">Return to dashboard</Link>
    </div>
  </main>;
}
