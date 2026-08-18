"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  STATUT_VALIDATION_LABELS,
  STATUT_NUMERISATION_LABELS,
  STATUT_INDEXATION_LABELS,
  STATUT_ARCHIVAGE_LABELS,
} from "@/lib/utils/dossier-status";
import { ControleActions, NumerisationActions, IndexationActions, ArchivageActions } from "@/components/dossiers/WorkflowActions";
import { DocumentsPanel } from "@/components/dossiers/DocumentsPanel";
import type { PermissionCode } from "@/lib/permissions/constants";
import { ETAT_CONSERVATION_OPTIONS } from "@/lib/validation/dossier";

function etatLabel(value: "BON_ETAT" | "DEGRADE" | null) {
  return ETAT_CONSERVATION_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

interface DossierDetail {
  id: number;
  reference: string;
  site: { nom: string; code: string } | null;
  libelleCarton: string | null;
  codeBarres: string | null;
  numeroGuichet: string | null;
  numeroDdu: string | null;
  numeroDirectionService: string | null;
  referenceClassement: string | null;
  etatCarton: "BON_ETAT" | "DEGRADE" | null;
  etatCartonDescription: string | null;
  numeroIlot: string | null;
  numeroLot: string | null;
  superficie: number | null;
  numeroTitreFoncier: string | null;
  commune: { nom: string } | null;
  lotissement: { nom: string } | null;
  natureDossier: { libelle: string } | null;
  etatDossier: "BON_ETAT" | "DEGRADE" | null;
  etatDossierDescription: string | null;
  operateur: { nom: string; prenoms: string | null; matricule: string };
  nom: string | null;
  prenoms: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  personneContact: string | null;
  mobile: string | null;
  nombrePages: number | null;
  observations: string | null;
  statutValidation: keyof typeof STATUT_VALIDATION_LABELS;
  statutNumerisation: keyof typeof STATUT_NUMERISATION_LABELS;
  statutIndexation: keyof typeof STATUT_INDEXATION_LABELS;
  statutArchivage: keyof typeof STATUT_ARCHIVAGE_LABELS;
  dateSoumission: string | null;
  dateValidation: string | null;
  dateNumerisation: string | null;
  dateIndexation: string | null;
  dateArchivage: string | null;
  createdAt: string;
  numerisations: Array<{ id: number; statut: string; qualite: string | null; dateDebut: string | null; dateFin: string | null }>;
  indexations: Array<{ id: number; statut: string; scoreQualite: number | null; dateDebut: string | null; dateFin: string | null }>;
  archivages: Array<{ id: number; statut: string; emplacement: string | null; referenceArchivage: string | null; dateArchivage: string | null }>;
  documents: Array<{
    id: number;
    nomOriginal: string;
    typeMime: string;
    taille: number;
    hash: string | null;
    nombrePages: number | null;
    createdAt: string;
  }>;
  qualityChecks: Array<{
    id: number;
    typeControle: string;
    score: number | null;
    statut: string;
    createdAt: string;
    anomalies: Array<{ id: number; type: string; gravite: string; description: string | null }>;
  }>;
  history: Array<{ id: number; action: string; ancienStatut: string | null; nouveauStatut: string | null; commentaire: string | null; createdAt: string; user: { name: string } | null }>;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}


export function DossierDetailTabs({ dossier, permissions }: { dossier: DossierDetail; permissions: PermissionCode[] }) {
  // Rendu conditionnel manuel du panneau actif, au lieu du composant
  // <TabsContent> (masquage interne défaillant constaté avec ce composant
  // Base UI — les panneaux inactifs restaient visibles simultanément ;
  // documenté dans ARCHITECTURE.md). <Tabs>/<TabsList>/<TabsTrigger>
  // restent utilisés normalement pour la navigation.
  const [tab, setTab] = useState("informations");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
      <TabsList className="flex-wrap">
        <TabsTrigger value="informations">Informations</TabsTrigger>
        <TabsTrigger value="foncier">Foncier</TabsTrigger>
        <TabsTrigger value="titulaire">Titulaire</TabsTrigger>
        <TabsTrigger value="collecte">Collecte</TabsTrigger>
        <TabsTrigger value="controle">Contrôle</TabsTrigger>
        <TabsTrigger value="numerisation">Numérisation</TabsTrigger>
        <TabsTrigger value="indexation">Indexation</TabsTrigger>
        <TabsTrigger value="archivage">Archivage</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="historique">Historique</TabsTrigger>
      </TabsList>

      <div className="mt-2">
        {tab === "informations" && (
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
              <Field label="Site d'archivage" value={dossier.site ? `${dossier.site.nom} (${dossier.site.code})` : null} />
              <Field label="Référence" value={dossier.reference} />
              <Field label="Libellé du carton" value={dossier.libelleCarton} />
              <Field label="Code-barres" value={dossier.codeBarres} />
              <Field label="N° guichet" value={dossier.numeroGuichet} />
              <Field label="Direction/Service concerné(e)" value={dossier.numeroDdu} />
              <Field label="Numéro Direction/Service" value={dossier.numeroDirectionService} />
              <Field label="Référence de classement" value={dossier.referenceClassement} />
              <Field label="État du carton" value={etatLabel(dossier.etatCarton)} />
              {dossier.etatCarton === "DEGRADE" ? (
                <Field label="Description de l'état (carton)" value={dossier.etatCartonDescription} />
              ) : null}
              <Field label="Opérateur" value={`${dossier.operateur.nom} ${dossier.operateur.prenoms ?? ""} (${dossier.operateur.matricule})`} />
              <Field label="Créé le" value={dateFmt.format(new Date(dossier.createdAt))} />
            </CardContent>
          </Card>
        )}

        {tab === "foncier" && (
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
              <Field label="N° îlot" value={dossier.numeroIlot} />
              <Field label="N° lot" value={dossier.numeroLot} />
              <Field label="Superficie" value={dossier.superficie ? `${dossier.superficie} m²` : null} />
              <Field label="N° titre foncier" value={dossier.numeroTitreFoncier} />
              <Field label="Commune" value={dossier.commune?.nom} />
              <Field label="Lotissement" value={dossier.lotissement?.nom} />
            </CardContent>
          </Card>
        )}

        {tab === "titulaire" && (
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
              <Field label="Nom" value={dossier.nom} />
              <Field label="Prénoms" value={dossier.prenoms} />
              <Field label="Adresse" value={dossier.adresse} />
              <Field label="Téléphone" value={dossier.telephone} />
              <Field label="E-mail" value={dossier.email} />
              <Field label="Nature du dossier" value={dossier.natureDossier?.libelle} />
              <Field label="État du dossier" value={etatLabel(dossier.etatDossier)} />
              {dossier.etatDossier === "DEGRADE" ? (
                <Field label="Description de l'état (dossier)" value={dossier.etatDossierDescription} />
              ) : null}
              <Field label="Personne à contacter" value={dossier.personneContact} />
              <Field label="Mobile" value={dossier.mobile} />
            </CardContent>
          </Card>
        )}

        {tab === "collecte" && (
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
              <Field label="Nombre de pages" value={dossier.nombrePages} />
              <Field
                label="Date de soumission"
                value={dossier.dateSoumission ? dateFmt.format(new Date(dossier.dateSoumission)) : null}
              />
              <Field label="Observations" value={dossier.observations} />
            </CardContent>
          </Card>
        )}

        {tab === "controle" && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Statut de validation" value={STATUT_VALIDATION_LABELS[dossier.statutValidation]} />
                <Field
                  label="Date de validation"
                  value={dossier.dateValidation ? dateFmt.format(new Date(dossier.dateValidation)) : null}
                />
              </div>
              {dossier.qualityChecks.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Contrôles qualité</div>
                  {dossier.qualityChecks.map((qc) => (
                    <div key={qc.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span>{qc.typeControle}</span>
                        <Badge variant={qc.statut === "CONFORME" ? "default" : "destructive"}>{qc.statut}</Badge>
                      </div>
                      {qc.anomalies.length > 0 && (
                        <ul className="mt-2 list-disc pl-4 text-muted-foreground">
                          {qc.anomalies.map((a) => (
                            <li key={a.id}>
                              [{a.gravite}] {a.type} — {a.description}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <ControleActions
                dossierId={dossier.id}
                permissions={permissions}
                statutValidation={dossier.statutValidation}
                statutNumerisation={dossier.statutNumerisation}
                statutIndexation={dossier.statutIndexation}
                statutArchivage={dossier.statutArchivage}
              />
            </CardContent>
          </Card>
        )}

        {tab === "numerisation" && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Field label="Statut" value={STATUT_NUMERISATION_LABELS[dossier.statutNumerisation]} />
              {dossier.numerisations.map((n) => (
                <div key={n.id} className="rounded-md border p-3 text-sm">
                  Statut : {n.statut} {n.qualite ? `— Qualité : ${n.qualite}` : ""}
                </div>
              ))}
              <NumerisationActions
                dossierId={dossier.id}
                permissions={permissions}
                statutValidation={dossier.statutValidation}
                statutNumerisation={dossier.statutNumerisation}
                statutIndexation={dossier.statutIndexation}
                statutArchivage={dossier.statutArchivage}
              />
              <p className="text-xs text-muted-foreground">Le document scanné se dépose depuis l&apos;onglet « Documents ».</p>
            </CardContent>
          </Card>
        )}

        {tab === "indexation" && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Field label="Statut" value={STATUT_INDEXATION_LABELS[dossier.statutIndexation]} />
              {dossier.indexations.map((n) => (
                <div key={n.id} className="rounded-md border p-3 text-sm">
                  Statut : {n.statut} {n.scoreQualite !== null ? `— Score : ${n.scoreQualite}` : ""}
                </div>
              ))}
              <IndexationActions
                dossierId={dossier.id}
                permissions={permissions}
                statutValidation={dossier.statutValidation}
                statutNumerisation={dossier.statutNumerisation}
                statutIndexation={dossier.statutIndexation}
                statutArchivage={dossier.statutArchivage}
              />
            </CardContent>
          </Card>
        )}

        {tab === "archivage" && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Field label="Statut" value={STATUT_ARCHIVAGE_LABELS[dossier.statutArchivage]} />
              {dossier.archivages.map((a) => (
                <div key={a.id} className="rounded-md border p-3 text-sm">
                  {a.emplacement ?? "Emplacement non renseigné"} {a.referenceArchivage ? `— ${a.referenceArchivage}` : ""}
                </div>
              ))}
              <ArchivageActions
                dossierId={dossier.id}
                permissions={permissions}
                statutValidation={dossier.statutValidation}
                statutNumerisation={dossier.statutNumerisation}
                statutIndexation={dossier.statutIndexation}
                statutArchivage={dossier.statutArchivage}
              />
            </CardContent>
          </Card>
        )}

        {tab === "documents" && (
          <Card>
            <CardContent className="pt-6">
              <DocumentsPanel
                dossierId={dossier.id}
                documents={dossier.documents}
                canManage={permissions.includes("NUMERISATION_UPDATE")}
              />
            </CardContent>
          </Card>
        )}

        {tab === "historique" && (
          <Card>
            <CardContent className="space-y-3 pt-6">
              {dossier.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun historique.</p>
              ) : (
                dossier.history.map((h) => (
                  <div key={h.id} className="border-l-2 pl-3 text-sm">
                    <div className="font-medium">{h.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {dateFmt.format(new Date(h.createdAt))} {h.user ? `— ${h.user.name}` : ""}
                      {h.ancienStatut || h.nouveauStatut ? ` — ${h.ancienStatut ?? "?"} → ${h.nouveauStatut ?? "?"}` : ""}
                    </div>
                    {h.commentaire && <div className="mt-1 text-muted-foreground">{h.commentaire}</div>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Tabs>
  );
}
