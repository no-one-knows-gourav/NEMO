import { StubPage } from "@/components/case/StubPage";

export default function PlaybookPage() {
  return (
    <StubPage
      title="Playbook"
      tagline="The rules that set depth, source weights and what each question must cover."
      items={[
        { label: "Depth rules", detail: "How purpose and sector map to Light, Standard or Enhanced." },
        { label: "Source weights", detail: "The importance of each source for each of the seven questions." },
        { label: "Mandatory questions", detail: "Questions that must be covered before a report can publish." },
        { label: "Versions", detail: "Playbook versions, with what changed and when." },
      ]}
    />
  );
}
