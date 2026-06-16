import { Logo } from "./logo";
import { InstagramLogo, TiktokLogo, YoutubeLogo, XLogo } from "@phosphor-icons/react/dist/ssr";

const socials = [InstagramLogo, TiktokLogo, YoutubeLogo, XLogo];

export function Footer() {
  return (
    <footer className="border-t border-border mt-20" data-testid="site-footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <Logo />
          <p className="text-sm text-muted-foreground mt-4 max-w-sm">
            The competitive home of pickleball. Host tournaments, find partners, hold your spot, and earn your rank.
          </p>
          <div className="flex gap-3 mt-5">
            {socials.map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="h-10 w-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                aria-label="social"
                data-testid={`social-link-${i}`}
              >
                <Icon size={18} weight="bold" />
              </a>
            ))}
          </div>
        </div>
        <div>
          <h4 className="font-display tracking-wider text-foreground mb-3">PLAY</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Find Tournaments</li>
            <li>Hold My Spot</li>
            <li>Find a Partner</li>
            <li>Brackets</li>
          </ul>
        </div>
        <div>
          <h4 className="font-display tracking-wider text-foreground mb-3">COMPANY</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>About</li>
            <li>Directors</li>
            <li>Contact</li>
            <li>Terms · Privacy</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted-foreground font-mono">
        © 2026 COMPETE PICKLEBALL · ALL RIGHTS RESERVED
      </div>
    </footer>
  );
}
