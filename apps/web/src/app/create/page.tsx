import { CreateWorkspace } from "@/components/campaign/create-workspace";
import { AppShell } from "@/components/shell/app-shell";

export default function CreateCampaignPage() {
  return (
    <AppShell compact>
      <CreateWorkspace />
    </AppShell>
  );
}
