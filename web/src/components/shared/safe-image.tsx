import Image from "next/image";
import { isOptimizableImageUrl } from "@/lib/image-hosts";

/**
 * Renders `next/image` for a host it's actually configured to optimize, and a
 * plain `<img>` for anything else -- instead of assuming every src is safe and
 * letting next/image throw at render time for the one that isn't.
 *
 * Use this ONLY where the src can be a value someone else typed in -- today
 * that means `tournaments.cover_img_url`, a free-text field directors set.
 * Everything sourced from this app's own upload flow (avatar_url, marketplace
 * photos -- always a Supabase Storage URL) is safe by construction and should
 * keep using `next/image` directly; wrapping those in SafeImage too would just
 * make the fallback path dead code that no test ever exercises.
 *
 * See lib/image-hosts.ts for the incident this exists to prevent.
 */

type BaseProps = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  priority?: boolean;
};

type FillProps = BaseProps & {
  fill: true;
  sizes: string;
  width?: never;
  height?: never;
};

type FixedProps = BaseProps & {
  fill?: false;
  sizes?: never;
  width: number;
  height: number;
};

export function SafeImage(props: FillProps | FixedProps) {
  const { src, alt, className, priority } = props;

  if (!src) return null;

  if (!isOptimizableImageUrl(src)) {
    if (props.fill) {
      // `fill` positions next/image absolutely within a sized, relative
      // parent -- the plain-<img> equivalent has to do that itself, since it
      // has no intrinsic box of its own to fall back on.
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={`absolute inset-0 h-full w-full ${className ?? ""}`}
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={props.width}
        height={props.height}
        className={className}
      />
    );
  }

  if (props.fill) {
    return (
      <Image src={src} alt={alt} fill priority={priority} sizes={props.sizes} className={className} />
    );
  }
  return (
    <Image src={src} alt={alt} width={props.width} height={props.height} priority={priority} className={className} />
  );
}
