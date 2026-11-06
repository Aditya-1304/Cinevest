"use client";

import { useState } from "react";

/**
 * Verified Swarm poster served by the backend. next/image cannot optimize this URL, and a poster
 * the backend refuses to verify (or an unreachable node) must not show a broken-image icon.
 */
export function PosterImage({
  src,
  alt,
  className,
  lazy = false,
}: {
  src: string;
  alt: string;
  className: string;
  lazy?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div
        role="img"
        aria-label={`${alt} (unavailable)`}
        className={`${className} flex items-center justify-center bg-[#072733] p-3 text-center text-xs text-white/50`}
      >
        Poster unavailable
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={lazy ? "lazy" : undefined}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
