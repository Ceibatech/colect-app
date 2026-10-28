// Référentiel de classement des archives du MULCV — version 2 du 07/09/2026.
// La rubrique choisie à l'inventaire ouvre la cote du carton (2010-KOU-0001).

export type Rubrique = { code: string; libelle: string; nature?: string };
export type Serie = { code: string; libelle: string; rubriques: Rubrique[] };

export const REFERENTIEL_CLASSEMENT: Serie[] = [
  { code: "1000", libelle: "Gouvernance et administration générale", rubriques: [
    { code: "1010", libelle: "Notes techniques" }, { code: "1011", libelle: "Courriers" }, { code: "1012", libelle: "Rapports de missions" },
    { code: "1013", libelle: "Rapports d'activités" }, { code: "1014", libelle: "Études sectorielles" }, { code: "1015", libelle: "Avis techniques" },
    { code: "1016", libelle: "Textes officiels" }, { code: "1017", libelle: "Procès-verbaux de réunions" }, { code: "1018", libelle: "Tableaux de bord" },
  ] },
  { code: "1100", libelle: "Gestion des ressources humaines", rubriques: [
    { code: "1110", libelle: "Dossiers du personnel" }, { code: "1111", libelle: "Dossiers des contractuels" },
    { code: "1112", libelle: "Évaluation du personnel" }, { code: "1113", libelle: "Formation du personnel" },
  ] },
  { code: "1200", libelle: "Gestion financière et comptable", rubriques: [
    { code: "1210", libelle: "Budgets" }, { code: "1211", libelle: "Factures" }, { code: "1212", libelle: "Pièces comptables" }, { code: "1213", libelle: "Rapports financiers" },
  ] },
  { code: "1300", libelle: "Gestion des marchés et achats", rubriques: [
    { code: "1310", libelle: "Dossiers d'appel d'offres (DAO)" }, { code: "1311", libelle: "Marchés approuvés" }, { code: "1312", libelle: "Contrats" },
    { code: "1313", libelle: "Procès-verbaux" }, { code: "1314", libelle: "Bons de commande" }, { code: "1315", libelle: "Rapports d'exécution" },
  ] },
  { code: "1400", libelle: "Gestion juridique et contentieux", rubriques: [
    { code: "1410", libelle: "Textes juridiques et réglementaires" }, { code: "1411", libelle: "Dossiers de contentieux" }, { code: "1412", libelle: "Avis juridiques" },
    { code: "1413", libelle: "Contrats" }, { code: "1414", libelle: "Conventions" },
  ] },
  { code: "1500", libelle: "Gestion du patrimoine et moyens généraux", rubriques: [
    { code: "1510", libelle: "Inventaires (meubles, mobiliers, fournitures) et fiches de stocks" }, { code: "1511", libelle: "Assurances automobiles" },
  ] },
  { code: "1600", libelle: "Gestion de la documentation et des archives", rubriques: [
    { code: "1610", libelle: "Bordereaux" }, { code: "1611", libelle: "Outils de gestion et de conservation" }, { code: "1612", libelle: "Rapports d'activités" }, { code: "1613", libelle: "Documentation" },
  ] },
  { code: "1700", libelle: "Gestion du système d'information", rubriques: [
    { code: "1710", libelle: "Procédures" }, { code: "1711", libelle: "Rapports techniques" }, { code: "1712", libelle: "Supports de formation" },
  ] },
  { code: "1800", libelle: "Communication et relations extérieures", rubriques: [
    { code: "1810", libelle: "Communiqués" }, { code: "1811", libelle: "Supports de communication" },
  ] },
  { code: "2000", libelle: "Gestion des actes du foncier", rubriques: [
    { code: "2010", libelle: "Dossiers ACD", nature: "ACD" }, { code: "2011", libelle: "Dossiers de base" }, { code: "2012", libelle: "Registres" }, { code: "2013", libelle: "Guides" },
  ] },
  { code: "2100", libelle: "Construction, logement et cadre de vie", rubriques: [
    { code: "2110", libelle: "Dossiers de permis de construire" }, { code: "2111", libelle: "Dossiers de baux" }, { code: "2112", libelle: "Dossiers de location" },
    { code: "2113", libelle: "Dossiers de cession" }, { code: "2114", libelle: "Dossiers de copropriété" }, { code: "2115", libelle: "Dossiers des syndicats" },
  ] },
  { code: "2200", libelle: "Contrôle urbain, enquêtes et infractions", rubriques: [
    { code: "2210", libelle: "Documents de mission" }, { code: "2211", libelle: "Rapports de contrôle et d'investigation" },
    { code: "2212", libelle: "Procès-verbaux de constats" }, { code: "2213", libelle: "Dossiers des plaintes et dénonciations" },
  ] },
  { code: "2300", libelle: "Urbanisme, planification et aménagement", rubriques: [
    { code: "2310", libelle: "Schémas directeurs approuvés" }, { code: "2311", libelle: "Plans directeurs approuvés" }, { code: "2313", libelle: "Plans des lotissements approuvés" },
    { code: "2314", libelle: "Plans cadastraux et topographiques" }, { code: "2315", libelle: "Cartes et bases géographiques" }, { code: "2316", libelle: "Conventions signées" },
    { code: "2317", libelle: "Rapports de suivi" },
  ] },
  { code: "3000", libelle: "Gestion du patrimoine immobilier de l'État", rubriques: [
    { code: "3010", libelle: "Inventaire du patrimoine" }, { code: "3011", libelle: "Dossiers de cession" }, { code: "3012", libelle: "Dossiers des baux" }, { code: "3013", libelle: "Dossiers des locations" },
  ] },
  { code: "4000", libelle: "Gestion des ventes du foncier de l'État", rubriques: [
    { code: "4010", libelle: "Dossiers des clients" }, { code: "4011", libelle: "Dossiers de promotion" },
  ] },
  { code: "5000", libelle: "Gestion des ventes des habitats de l'État", rubriques: [
    { code: "5010", libelle: "Dossiers des clients" }, { code: "5011", libelle: "Dossiers de promotion" },
  ] },
];

export const RUBRIQUES = REFERENTIEL_CLASSEMENT.flatMap((serie) => serie.rubriques.map((rubrique) => ({ ...rubrique, serie })));

export function findRubrique(code: string | null | undefined) {
  return RUBRIQUES.find((rubrique) => rubrique.code === code) ?? null;
}
