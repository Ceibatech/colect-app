# Sécurisation de l'identité et migration Keycloak

## Décision

Keycloak est la cible d'authentification de GeoArchives. La migration doit rester
progressive : l'application ne doit jamais dépendre d'un nouveau fournisseur d'identité
avant que son exploitation, ses sauvegardes et son retour arrière aient été testés.

GeoArchives conserve l'autorisation métier dans sa base : rôles, permissions, périmètres
PMO, affectations d'opérateurs et droits de transfert. Keycloak prend en charge l'identité,
la connexion, les sessions, la MFA et les politiques anti-bruteforce.

## Architecture cible

- Flux OpenID Connect Authorization Code avec PKCE.
- Realm GeoArchives dédié, sans comptes de démonstration.
- Client confidentiel pour l'application serveur, secret uniquement dans `app.env`.
- Correspondance stable entre le `sub` Keycloak et un utilisateur GeoArchives.
- MFA TOTP ou WebAuthn obligatoire pour `ADMIN`, `VALIDATEUR_CEIBA` et
  `VALIDATEUR_MINISTERE`, puis extension progressive aux autres rôles.
- Console d'administration Keycloak non exposée publiquement : accès par VPN, liste IP ou
  réseau d'administration.
- Base Keycloak séparée, sauvegardée et testée en restauration.
- TLS au reverse proxy, URL publique fixe et en-têtes proxy explicitement configurés.
- Journalisation des connexions, échecs, changements de facteurs et actions administratives.

## Migration sans coupure

### Phase 1 - Durcissement local

- Révocation immédiate par version de session.
- Rôle, permissions et état actif relus en base à chaque requête protégée.
- Invitation à usage unique, sans mot de passe connu de l'administrateur.
- Politique de mot de passe renforcée et en-têtes HTTP de sécurité.

Cette phase est compatible avec tous les comptes existants. Le déploiement invalide une
fois les anciens cookies JWT ; les utilisateurs se reconnectent normalement.

### Phase 2 - Infrastructure Keycloak

1. Déployer Keycloak et sa base sur le réseau privé Contabo.
2. Configurer le realm, le client OIDC, les URL de redirection exactes et le logout.
3. Tester sauvegarde, restauration, rotation des secrets et indisponibilité simulée.
4. Créer deux comptes administrateurs nominatifs protégés par MFA ; ne jamais utiliser le
   compte bootstrap pour l'exploitation courante.

### Phase 3 - Double lecture contrôlée

1. Ajouter `identityProvider` et `identitySubject` à `users` avec unicité.
2. Lier les comptes existants à leur identité Keycloak après vérification de l'e-mail.
3. Activer OIDC pour un groupe pilote sans supprimer la connexion locale de secours.
4. Vérifier les journaux, la révocation, le changement de rôle et le logout global.

### Phase 4 - Bascule

1. Migrer les comptes par groupe et imposer progressivement la MFA.
2. Désactiver la connexion locale pour les comptes migrés.
3. Conserver un compte d'urgence hors ligne, fortement protégé, audité et testé selon une
   procédure formelle.
4. Après la période d'observation, retirer les endpoints de mot de passe locaux.

## Contrôles du portail d'administration

- Chaque action reste autorisée côté serveur par permission, jamais seulement dans l'UI.
- Un administrateur ne voit, ne choisit et ne transmet aucun mot de passe utilisateur.
- Désactiver un compte ou changer son rôle coupe immédiatement ses sessions.
- Les comptes administrateurs sont nominatifs ; aucun partage d'identifiants.
- Les invitations et réinitialisations restent à usage unique, limitées dans le temps et
  journalisées.
- Les modifications de rôle, de statut et d'accès sont conservées dans le journal d'audit.

## Critères de mise en production

La bascule Keycloak est autorisée seulement après validation des parcours connexion,
MFA, récupération, révocation, logout, changement de rôle, compte désactivé, indisponibilité
du fournisseur, restauration de sauvegarde et retour au mécanisme précédent.
