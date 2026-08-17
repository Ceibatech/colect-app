"use client";

import type { UseFormReturn } from "react-hook-form";
import type { DossierFormValues } from "@/lib/validation/dossier";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Pencil } from "lucide-react";

interface Lookups {
  communes: { id: number; nom: string; lotissements: { id: number; nom: string }[] }[];
  natures: { id: number; libelle: string }[];
  operateurs: { id: number; nom: string; prenoms: string | null }[];
  isOperateurRole: boolean;
  currentUserName: string;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function Section({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="mr-1 h-3 w-3" />
          Modifier
        </Button>
      </div>
      <Separator className="mb-2" />
      {children}
    </div>
  );
}

export function StepRecap({
  form,
  lookups,
  onEditStep,
}: {
  form: UseFormReturn<DossierFormValues>;
  lookups: Lookups;
  onEditStep: (step: number) => void;
}) {
  const v = form.getValues();
  const commune = lookups.communes.find((c) => c.id === v.communeId);
  const nature = lookups.natures.find((n) => n.id === v.natureDossierId)?.libelle ?? v.natureDossierAutre;
  const operateur = lookups.isOperateurRole
    ? lookups.currentUserName
    : (() => {
        const op = lookups.operateurs.find((o) => o.id === v.operateurId);
        return op ? `${op.nom} ${op.prenoms ?? ""}` : undefined;
      })();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Vérifiez les informations avant de soumettre le dossier. Cliquez sur « Modifier » pour corriger une section.
      </p>

      <Section title="Identification" onEdit={() => onEditStep(1)}>
        <Row label="Opérateur" value={operateur} />
        <Row label="Libellé du carton" value={v.libelleCarton} />
        <Row label="Code-barres" value={v.codeBarres} />
        <Row label="N° guichet" value={v.numeroGuichet} />
        <Row label="Direction/Service concerné(e)" value={v.numeroDdu} />
        <Row label="Numéro Direction/Service" value={v.numeroDirectionService} />
        <Row label="Référence de classement" value={v.referenceClassement} />
      </Section>

      <Section title="Informations foncières" onEdit={() => onEditStep(2)}>
        <Row label="N° îlot" value={v.numeroIlot} />
        <Row label="N° lot" value={v.numeroLot} />
        <Row label="Superficie" value={v.superficie ? `${v.superficie} m²` : undefined} />
        <Row label="N° titre foncier" value={v.numeroTitreFoncier} />
        <Row label="Commune" value={commune?.nom} />
        <Row label="Lotissement" value={v.lotissementNom} />
      </Section>

      <Section title="Dossier" onEdit={() => onEditStep(3)}>
        <Row label="Nature du dossier" value={nature} />
      </Section>

      <Section title="Titulaire" onEdit={() => onEditStep(4)}>
        <Row label="Nom" value={v.nom} />
        <Row label="Prénoms" value={v.prenoms} />
        <Row label="Adresse" value={v.adresse} />
        <Row label="Téléphone" value={v.telephone} />
        <Row label="E-mail" value={v.email} />
      </Section>

      <Section title="Contact" onEdit={() => onEditStep(5)}>
        <Row label="Personne à contacter" value={v.personneContact} />
        <Row label="Mobile" value={v.mobile} />
      </Section>

      <Section title="Suivi" onEdit={() => onEditStep(6)}>
        <Row label="Nombre de pages" value={v.nombrePages} />
        <Row label="Observations" value={v.observations} />
      </Section>
    </div>
  );
}
