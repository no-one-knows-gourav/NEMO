import { StubPage } from "@/components/case/StubPage";

export default function MonitorPage() {
  return (
    <StubPage
      title="Monitor"
      tagline="Standing watch on published subjects: new orders, status changes and media spikes."
      items={[
        { label: "Alerts", detail: "New regulator orders and case-status changes on subjects you're watching." },
        { label: "Refresh cadence", detail: "How often each subject is re-surveyed, set by depth." },
        { label: "Media spikes", detail: "Unusual coverage that may warrant a fresh look." },
        { label: "Watchlist", detail: "The subjects under active monitoring and who owns each." },
      ]}
    />
  );
}
