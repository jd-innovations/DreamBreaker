type MobileLinkFallbackProps = {
  title: string;
  description: string;
  path: string;
};

export function MobileLinkFallback({ title, description, path }: MobileLinkFallbackProps) {
  const appUrl = `https://pickleballapp.app${path}`;

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <section className="w-full max-w-md text-center space-y-5">
        <p className="font-mono text-xs tracking-[0.28em] text-primary uppercase">Pickleball App</p>
        <h1 className="font-display text-4xl tracking-wide">{title}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        <a
          href={appUrl}
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 font-display text-sm tracking-[0.18em] text-primary-foreground transition hover:bg-primary/90"
        >
          Open in app
        </a>
      </section>
    </main>
  );
}
