import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { CaseHeader } from "@/components/shell/CaseHeader";
import { CaseTabs } from "@/components/shell/CaseTabs";
import { getCaseById } from "@/lib/data";

/**
 * Shared case-workspace chrome: AppShell + case header + tab bar. Each tab is a
 * page.tsx under this segment and renders inside <main> below the tabs.
 */
export default async function CaseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const c = await getCaseById(caseId);
  if (!c) notFound();
  return (
    <AppShell>
      <CaseHeader c={c} />
      <div className="mt-3">
        <CaseTabs caseId={caseId} />
      </div>
      <div className="p-4">{children}</div>
    </AppShell>
  );
}
