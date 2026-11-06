"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Keeps any render failure inside the on-chain campaign views local to that card. */
export class CampaignBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed)
      return (
        <div
          role="alert"
          className="border-white/10 bg-[#04141C] text-white space-y-3 rounded-2xl border p-4"
        >
          <p>
            This campaign view could not be rendered. The address may be wrong
            or the contract view failed.
          </p>
          <Button onClick={() => this.setState({ failed: false })}>
            Try again
          </Button>
        </div>
      );
    return this.props.children;
  }
}
