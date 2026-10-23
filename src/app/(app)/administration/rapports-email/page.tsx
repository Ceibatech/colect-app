import { MailCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmailReportsManager } from "@/components/administration/EmailReportsManager";
import { listEmailReportAdministration } from "@/lib/services/email-report-service";

export const metadata = { title: "Rapports par e-mail - Administration" };

export default async function EmailReportsAdministrationPage() {
  const data = await listEmailReportAdministration();
  const active = data.users.filter((user) => user.emailReportSubscription?.isActive).length;
  const sent = data.deliveries.filter((delivery) => delivery.status === "SENT").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Pilotage"
        icon={MailCheck}
        title="Rapports par e-mail"
        description="Diffusion des statistiques et des points aux comptes de pilotage autorisés."
        stats={[
          { label: "Destinataires", value: data.users.length },
          { label: "Diffusions actives", value: active, tone: "success" },
          { label: "Envois récents", value: sent },
        ]}
      />
      <EmailReportsManager
        recipients={data.users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          isActive: user.isActive,
          role: user.role,
          supervisedCount: user._count.supervisedOperateurs,
          subscription: user.emailReportSubscription ? {
            id: user.emailReportSubscription.id,
            frequency: user.emailReportSubscription.frequency,
            dayOfWeek: user.emailReportSubscription.dayOfWeek,
            dayOfMonth: user.emailReportSubscription.dayOfMonth,
            hourUtc: user.emailReportSubscription.hourUtc,
            includePoints: user.emailReportSubscription.includePoints,
            isActive: user.emailReportSubscription.isActive,
            nextSendAt: user.emailReportSubscription.nextSendAt.toISOString(),
            lastSentAt: user.emailReportSubscription.lastSentAt?.toISOString() ?? null,
          } : null,
        }))}
        deliveries={data.deliveries.map((delivery) => ({
          ...delivery,
          sentAt: delivery.sentAt?.toISOString() ?? null,
          createdAt: delivery.createdAt.toISOString(),
        }))}
        emailConfigured={data.emailConfigured}
      />
    </div>
  );
}
