# Validation et suivi des transferts

1. **Gestionnaire des transferts** : identifier le lot, examiner les dossiers et
   cliquer sur **Soumettre à CEIBAC**. Le lot devient « À valider par CEIBAC ».
2. **Validateur CEIBAC** : ouvrir **Transferts → Validation CEIBAC**, consulter la
   fiche du lot, puis signer. Le lot est transmis au ministère.
3. **Validateur ministère** : ouvrir **Transferts → Validation ministère**, contrôler
   la fiche et signer l'autorisation. Le lot devient « Autorisé ».
4. **Gestionnaire des transferts** : enregistrer le bordereau de sortie avec les
   signatures de remise. Les dossiers passent en transit. Démarrer volontairement
   le suivi GPS depuis l'appareil du convoyeur et autoriser sa localisation.
5. **Arrivée sur site** : enregistrer le constat de réception et l'état du chargement.
   Le validateur CEIBAC le vise, puis le ministère le contre-signe. Le stock est alors
   affecté au site de destination. Les points GPS déjà reçus restent consultables.

La fiche du lot est disponible avant le départ : tant que le ministère n'a pas signé,
elle porte la mention **PROJET — SORTIE NON AUTORISÉE**. Le nombre « 0 bordereau » dans
le registre indique qu'aucun mouvement physique n'a été enregistré ; il n'empêche pas
de consulter cette fiche et de valider le lot.

L'espace ministère propose les réceptions à signer, celles encore en attente de
CEIBAC, les bordereaux validés et l'ensemble des bordereaux, avec recherche par référence
et pagination. Chaque bordereau peut être ouvert puis imprimé depuis le navigateur.

## Mise en service

La migration `20261023090000_add_ministry_transfer_validator` ajoute le profil
**Validateur ministère**, la permission de validation CEIBAC des lots et les champs
de preuve associés. Aucun compte n'est créé ou réaffecté automatiquement. Un
administrateur peut attribuer les rôles **Validateur CEIBAC** et **Validateur ministère**
aux responsables désignés depuis **Administration → Utilisateurs**.

Les administrateurs et validateurs doivent se déconnecter puis se reconnecter après
le déploiement ou une modification de rôle : les permissions de session sont conservées
jusqu'à huit heures. Les superviseurs conservent leur accès existant au visa ministère.

Les lots déjà autorisés suivent leur circuit existant ; aucun visa CEIBAC rétroactif
n'est inventé. Les lots encore « Soumis » rejoignent la file CEIBAC et doivent passer
par les deux visas avant leur départ.
