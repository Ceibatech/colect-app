import Link from "next/link";
import { ArrowLeft, BookOpenCheck, CheckCircle2, FileCheck2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/current-user";

export const metadata = { title: "Procédure de transfert - GeoArchives" };

const actors = [
  ["CEIBA Analytics", "Planification, coordination, transport, suivi et traçabilité."],
  ["SDA", "Identification, contrôle du classement, de l'état et validation de l'inventaire."],
  ["Responsable du site de départ", "Contrôle de la sortie et signature du bon de sortie."],
  ["Archivistes", "Conditionnement, étiquetage, inventaire et contrôle avant chargement."],
  ["Responsable destinataire", "Contrôle des colis, scellés et concordance ; formalisation de la réception."],
  ["Équipe de transport", "Chargement, transport sécurisé et remise des archives."],
  ["Service informatique / CEIBA", "Protection des supports électroniques, des fichiers et des données."],
];

const steps = [
  ["1", "Préparation et planification", "Inventaire détaillé, volumétrie, risques, date, itinéraire, transport et intervenants habilités."],
  ["2", "Conditionnement et sécurisation", "Contenants adaptés, étiquetage, contrôle de concordance, scellés et protection des supports."],
  ["3", "Chargement et transport", "Bon de sortie F02, véhicule sécurisé, convoyeur identifié, suivi du trajet et incidents consignés."],
  ["4", "Réception et contrôle", "Comptage, état, scellés, réserves et procès-verbal de réception F03."],
  ["5", "Installation et traçabilité", "Nouvelle localisation, mise à jour du stock et conservation de toutes les preuves."],
];

export default async function TransferProcedurePage() {
  await requirePermission("TRANSFER_VIEW");
  return (
    <div className="space-y-6">
      <PageHeader
        tone="transfer"
        eyebrow="Référentiel opérationnel"
        icon={BookOpenCheck}
        title="Procédure de transfert et de sécurisation"
        description="Règles applicables aux archives du ministère entre le site de départ et le site CEIBA destinataire."
        actions={<Link href="/transferts" className={buttonVariants({ variant: "outline" })}><ArrowLeft /> Registre</Link>}
        stats={[
          { label: "Autorisation", value: "F01" },
          { label: "Sortie et transport", value: "F02" },
          { label: "Réception", value: "F03" },
        ]}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Responsabilités</CardTitle></CardHeader>
          <CardContent className="divide-y p-0">
            {actors.map(([actor, responsibility]) => <div key={actor} className="grid gap-1 px-5 py-4 sm:grid-cols-[180px_1fr]"><p className="font-semibold">{actor}</p><p className="text-sm leading-6 text-muted-foreground">{responsibility}</p></div>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Chaîne obligatoire</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {steps.map(([number, title, description]) => <div key={number} className="flex gap-3"><Badge variant="outline" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md p-0">{number}</Badge><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div></div>)}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Requirement icon={FileCheck2} title="Preuves conservées" text="Inventaire consolidé, F01, F02, suivi du transport, F03, incidents et nouvelle localisation." />
        <Requirement icon={ShieldCheck} title="Sécurité" text="Aucune sortie sans inventaire validé, acteurs habilités, véhicule identifié, traçabilité et preuve de réception." />
        <Requirement icon={CheckCircle2} title="Gestion des anomalies" text="Toute perte, détérioration, ouverture ou discordance est signalée immédiatement et consignée par écrit." />
      </section>
    </div>
  );
}

function Requirement({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return <Card><CardContent className="flex gap-3 p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p></div></CardContent></Card>;
}
