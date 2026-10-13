import Image from "next/image";

// A person's photo, or their initials when they have none: the app's rule
// (its Avatar component). Until 2026-10-13 the website filled the gap with a
// stock photo of a stranger, so a player without a photo appeared on their
// profile and in Partner Finder as somebody else.

export function personInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

type Common = { src: string | null | undefined; name: string | null | undefined; className?: string; priority?: boolean; draggable?: boolean };
type Sized = Common & { width: number; height: number; fill?: false; sizes?: undefined };
type Fill = Common & { fill: true; sizes: string; width?: undefined; height?: undefined };

export function PersonPhoto(props: Sized | Fill) {
  const { src, name, className = "", priority, draggable } = props;
  if (src) {
    return props.fill
      ? <Image src={src} alt="" fill sizes={props.sizes} priority={priority} draggable={draggable} className={className} />
      : <Image src={src} alt="" width={props.width} height={props.height} priority={priority} draggable={draggable} className={className} />;
  }
  // Same box and rounding as the photo would have; navy with white initials
  // like the app. The text scales with the box via container units.
  return (
    <div
      aria-label={name ?? undefined}
      className={`${props.fill ? "absolute inset-0" : ""} ${className} flex items-center justify-center bg-[#0A1228] text-white font-display select-none [container-type:size]`}
    >
      <span className="text-[38cqmin] leading-none">{personInitials(name)}</span>
    </div>
  );
}
