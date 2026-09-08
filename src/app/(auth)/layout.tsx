export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-primary/40" aria-hidden="true" />
      {children}
    </div>
  );
}
