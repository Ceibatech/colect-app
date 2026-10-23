# Procédure de transfert et de sécurisation des archives

GeoArchives applique la procédure MULCV reçue le 23 octobre 2026. Le circuit
garantit l'intégrité, la confidentialité, la traçabilité et la conservation des
archives physiques, électroniques ou hybrides transférées entre un site du
ministère et un site CEIBA.

## Responsabilités

- **CEIBA Analytics** planifie et coordonne l'opération, organise le transport,
  désigne les intervenants et assure le suivi.
- **Service de la Documentation et des Archives (SDA)** identifie les archives,
  contrôle le classement et l'état, puis valide l'inventaire.
- **Responsable du site de départ** contrôle la sortie et signe le bon de sortie.
- **Archivistes** préparent, conditionnent, étiquettent et inventorient les
  documents avant chargement.
- **Responsable du site destinataire** contrôle les colis, les scellés et la
  concordance avec le bordereau, puis formalise la réception.
- **Équipe de transport** assure le chargement, le transport sécurisé et la remise.
- **Service informatique / CEIBA Analytics** protège les fichiers, les supports
  électroniques et les données pendant le transfert.

## Circuit numérique

1. **Gestionnaire des transferts** : identifier le lot, examiner les dossiers et
   renseigner la date, le support, l'itinéraire, le véhicule prévu, les intervenants
   CEIBA/SDA, les risques et les mesures de sécurité. Cliquer ensuite sur
   **Soumettre à CEIBA**. Le lot devient « À valider par CEIBA ».
2. **Validateur CEIBA** : ouvrir **Transferts → Validation CEIBA**, consulter la
   fiche du lot, puis signer. Le lot est transmis au ministère.
3. **Validateur ministère** : ouvrir **Transferts → Validation ministère**, contrôler
   l'inventaire et signer l'autorisation F01. Le lot devient « Autorisé ».
4. **Sortie du site** : enregistrer le véhicule, l'immatriculation, le conducteur,
   le convoyeur CEIBA, les scellés et les signatures de remise. Le système produit
   le bon de sortie et bordereau de transfert F02. Les dossiers passent en transit.
   Le convoyeur démarre le suivi GPS depuis son appareil.
5. **Arrivée sur le site CEIBA** : contrôler le nombre et l'état des contenants,
   la concordance avec le bordereau et les scellés. Le système produit le
   procès-verbal de réception et de déchargement F03. Toute anomalie impose un
   constat écrit. Le validateur CEIBA vise la réception, puis le ministère la
   contre-signe. Le stock est alors affecté au site de destination.
6. **Installation** : les archives sont installées dans la zone prévue et leur
   nouvelle localisation est enregistrée. Les documents et points GPS restent
   attachés à l'opération comme preuves.

## Documents de preuve

- **F01 — Autorisation de transfert** : document agrégé par date et trajet,
  signé par CEIBA et le ministère avant tout départ.
- **F02 — Bon de sortie et bordereau de transfert** : preuve de chargement et de
  remise au transporteur, avec véhicule, conducteur, convoyeur et scellés.
- **F03 — Procès-verbal de réception et de déchargement** : contrôle à l'arrivée,
  réserves, état des scellés et constat d'incident éventuel.
- **Fiche de suivi GPS** : itinéraire réellement observé pendant le transport.
- **Registre de localisation** : emplacement d'origine, transit et emplacement final.

La fiche individuelle sert à contrôler chaque lot : tant que le ministère n'a pas
signé, elle porte la mention **PROJET — SORTIE NON AUTORISÉE**. La **F01 finale**
n'est pas créée par lot. GeoArchives regroupe tous les lots ayant la même date et le
même trajet, puis produit une autorisation unique avec le nombre total de cartons,
le nombre de dossiers et l'inventaire complet. Elle devient téléchargeable seulement
lorsque tous les lots de l'opération ont reçu les visas CEIBA et ministère. Une fois
la signature commencée, aucun nouveau carton ne peut être ajouté à cette opération.

Le nombre « 0 bordereau » dans le registre indique qu'aucun mouvement physique n'a
été enregistré ; il n'empêche pas de consulter la fiche et de valider le lot.

L'espace ministère propose les réceptions à signer, celles encore en attente de
CEIBA, les bordereaux validés et l'ensemble des bordereaux, avec recherche par référence
et pagination. Chaque bordereau peut être ouvert puis imprimé depuis le navigateur.

## Mise en service

La migration `20261023120000_secure_transfer_procedure` ajoute les informations de
planification, de véhicule, de conducteur, de convoyeur, de scellés et d'incident.
La migration `20261023090000_add_ministry_transfer_validator` ajoute le profil
**Validateur ministère**, la permission de validation CEIBA des lots et les preuves
de signature associées. Aucun compte n'est créé ou réaffecté automatiquement. Un
administrateur peut attribuer les rôles **Validateur CEIBA** et **Validateur ministère**
aux responsables désignés depuis **Administration → Utilisateurs**.

Les administrateurs et validateurs doivent se déconnecter puis se reconnecter après
le déploiement ou une modification de rôle : les permissions de session sont conservées
jusqu'à huit heures. Les superviseurs conservent leur accès existant au visa ministère.

Les lots déjà autorisés suivent leur circuit existant ; aucun visa CEIBA rétroactif
n'est inventé. Les lots encore « Soumis » rejoignent la file CEIBA et doivent passer
par les deux visas avant leur départ.
