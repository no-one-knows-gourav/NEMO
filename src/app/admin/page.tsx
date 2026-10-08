import { StubPage } from "@/components/case/StubPage";

export default function AdminPage() {
  return (
    <StubPage
      title="Admin"
      tagline="People, roles and the controls that keep the survey accountable."
      items={[
        { label: "Team and roles", detail: "Analysts, reviewers and compliance approvers, with their access." },
        { label: "Legal bases", detail: "The purposes and legal bases available when starting a check." },
        { label: "Vault and privacy", detail: "Identifier handling, masking and retention settings." },
        { label: "Audit export", detail: "Full, versioned audit trails for any check." },
      ]}
    />
  );
}
