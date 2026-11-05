import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Cinevest", description: "Testnet film financing" };

/** Shared document shell for this application. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
