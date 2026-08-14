/**
 * Modèle de colonnes attendu pour l'import (§54). Extrait de
 * `import-service.ts` (qui porte "server-only") pour rester importable sans
 * dépendance Next.js/serveur — réutilisé par le service d'import ET par les
 * tests API (Phase 13, §72) qui construisent un fichier CSV de test à partir
 * de cette même source unique de vérité (jamais un format dupliqué en dur).
 */
export const IMPORT_COLUMNS: Array<{ header: string; key: string }> = [
  { header: "Opérateur (matricule)", key: "operateurMatricule" },
  { header: "Libellé carton", key: "libelleCarton" },
  { header: "Code-barres", key: "codeBarres" },
  { header: "N° guichet", key: "numeroGuichet" },
  { header: "N° DDU", key: "numeroDdu" },
  { header: "Référence classement", key: "referenceClassement" },
  { header: "N° îlot", key: "numeroIlot" },
  { header: "N° lot", key: "numeroLot" },
  { header: "Superficie", key: "superficie" },
  { header: "N° titre foncier", key: "numeroTitreFoncier" },
  { header: "Commune", key: "communeRef" },
  { header: "Lotissement", key: "lotissementRef" },
  { header: "Nature dossier", key: "natureRef" },
  { header: "Nom", key: "nom" },
  { header: "Prénoms", key: "prenoms" },
  { header: "Adresse", key: "adresse" },
  { header: "Téléphone", key: "telephone" },
  { header: "E-mail", key: "email" },
  { header: "Personne à contacter", key: "personneContact" },
  { header: "Mobile", key: "mobile" },
];
