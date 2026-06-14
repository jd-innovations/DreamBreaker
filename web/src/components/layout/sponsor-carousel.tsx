"use client";

type Brand = { name: string; domain: string; url: string };

const BRANDS: Brand[] = [
  { name: "Selkirk",         domain: "selkirk.com",          url: "https://selkirk.com" },
  { name: "Joola",           domain: "joolausa.com",         url: "https://joolausa.com" },
  { name: "Paddletek",       domain: "paddletek.com",        url: "https://paddletek.com" },
  { name: "Franklin Sports", domain: "franklinsports.com",   url: "https://franklinsports.com" },
  { name: "HEAD",            domain: "head.com",             url: "https://head.com/pickleball" },
  { name: "Engage",          domain: "engagepickleball.com", url: "https://engagepickleball.com" },
  { name: "Gamma Sports",    domain: "gammasports.com",      url: "https://gammasports.com" },
  { name: "Onix",            domain: "onixpickleball.com",   url: "https://onixpickleball.com" },
  { name: "ProKennex",       domain: "prokennex.com",        url: "https://prokennex.com" },
  { name: "Vulcan",          domain: "vulcansports.com",     url: "https://vulcansports.com" },
];

const TRACK = [...BRANDS, ...BRANDS];

export function SponsorCarousel() {
  return (
    <section className="border-t border-border py-8 overflow-hidden" data-testid="sponsor-carousel">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
        <div className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground text-center">
          PROUD PARTNERS &amp; SPONSORS
        </div>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-background to-transparent" />

        <div className="flex gap-16 animate-marquee whitespace-nowrap items-center">
          {TRACK.map((b, i) => (
            <a
              key={i}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center gap-3 opacity-50 hover:opacity-100 transition-opacity duration-300"
              aria-label={b.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://logo.clearbit.com/${b.domain}?size=80`}
                alt={b.name}
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
                style={{ filter: "brightness(0) invert(1)" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <span className="font-display tracking-[0.15em] text-sm text-foreground">
                {b.name.toUpperCase()}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
