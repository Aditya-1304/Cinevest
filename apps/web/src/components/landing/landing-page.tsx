import { LandingAbout } from "./landing-about";
import { LandingEconomy } from "./landing-economy";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";
import { LandingHero } from "./landing-hero";
import { InfrastructureGrid } from "./infrastructure-grid";

export function LandingPage() {
  return (
    <main
      id="top"
      className="overflow-x-hidden bg-background text-foreground [--landing-gutter:max(6%,calc((100%-1440px)/2))] [&_a:focus-visible]:outline-3 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-ring [&_button:focus-visible]:outline-3 [&_button:focus-visible]:outline-offset-4 [&_button:focus-visible]:outline-ring"
    >
      <LandingHeader />
      <LandingHero />
      <LandingAbout />
      <InfrastructureGrid />
      <LandingEconomy />
      <LandingFooter />
    </main>
  );
}
