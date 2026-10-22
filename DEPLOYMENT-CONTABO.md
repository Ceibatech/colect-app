# Déploiement et exploitation sur Contabo

Ce guide décrit la procédure de bascule et d'exploitation. Le compte rendu de
déploiement indique séparément les étapes effectivement réalisées.

## Architecture prévue

- VPS **169.58.29.56**, Ubuntu 24.04, Docker et Compose 5.6 déjà présents.
- Nginx utilise déjà les ports 80/443 pour plusieurs applications : conserver ses
  sites et ajouter uniquement un hôte virtuel pour Colect.
- Domaine : **geoarchives.ceiba-analytics.com**, actuellement associé à Render.
- Application isolée dans `/opt/colect-app`, projet Compose `colect-app`, accessible
  sur le VPS à `127.0.0.1:8300`. Nginx assure HTTPS et le relais vers ce port.
- La base MariaDB reste chez GoDaddy avec la `DATABASE_URL` existante. Autoriser
  l'IP du VPS dans l'accès distant MySQL/cPanel si nécessaire.
- Les documents historiques locaux restent montés depuis `shared/documents`.
  Lorsque `STORAGE_PROVIDER=sharepoint`, les nouveaux scans sont chargés dans
  SharePoint via Microsoft Graph ; les anciens fichiers locaux restent lisibles.

Le service Caddy est réservé au profil optionnel `caddy`, sur un serveur disposant
de ports 80/443 libres. Il reste désactivé sur ce VPS équipé de nginx.

## Répertoires et configuration

```text
/opt/colect-app/
  releases/<SHA Git complet>/   sources d'une version
  current -> releases/<SHA>/   dernière version validée
  incoming/                   archives de transfert
  shared/
    app.env                   secrets applicatifs
    deploy.env                paramètres du déploiement
    documents/                documents persistants
    db-backups/               sauvegardes SQL compressées
    document-backups/         sauvegardes des fichiers
```

Créer ces répertoires avant le premier déploiement. Les répertoires
`shared/documents`, `shared/db-backups` et `shared/document-backups` doivent être accessibles en écriture à
l'UID/GID **1000:1000**, utilisé par le conteneur. Le compte de déploiement doit
pouvoir lire les deux fichiers de configuration, gérer les versions et utiliser
Docker. Protéger `app.env` avec le mode **0600** et les sauvegardes avec des droits
restreints.

Dans `shared/app.env`, transférer les valeurs existantes de `DATABASE_URL` et
`AUTH_SECRET`, ainsi que les autres paramètres applicatifs utiles. Utiliser le
format `NOM=valeur`, **sans guillemets** autour des valeurs : Compose lit ce fichier
avec `format: raw` (Compose ≥ 2.30). Les caractères `$` restent littéraux ; conserver
l'encodage `%xx` des caractères spéciaux du mot de passe dans l'URL MySQL. Ne pas
exécuter ce fichier avec `source` et ne pas le placer dans Git ou l'image Docker.

`shared/deploy.env` :

```dotenv
DOMAIN=geoarchives.ceiba-analytics.com
APP_HTTP_PORT=8300
PROXY_MODE=nginx
CHECK_HTTPS=true
```

Utiliser temporairement `CHECK_HTTPS=false` pour la première prévisualisation,
avant la configuration DNS/certificat. Revenir à `true` dès que HTTPS fonctionne.
Compose impose `NODE_ENV=production`, `APP_URL=https://geoarchives.ceiba-analytics.com`
et `DOCUMENTS_STORAGE_PATH=/var/data/documents`.

Les paramètres d'envoi d'e-mails ne sont pas renseignés dans la configuration
fournie. Configurer `RESEND_API_KEY` et `EMAIL_FROM` avec un expéditeur validé pour
activer les e-mails de réinitialisation de mot de passe.

### Microsoft Graph et SharePoint

Pour activer le chargement et la pré-indexation SharePoint, créer une inscription
d'application dans **Microsoft Entra ID** :

1. **App registrations → New registration**, puis relever le **Tenant ID** et
   l'**Application (client) ID**.
2. **Certificates & secrets → New client secret**, puis copier immédiatement la
   valeur du secret (elle ne sera plus réaffichée).
3. **API permissions → Microsoft Graph → Application permissions** : pour le
   premier raccordement par lien partagé, ajouter `Files.ReadWrite.All` et accorder
   le consentement administrateur. Après découverte du `driveId` et du dossier,
   remplacer cette permission large par `Sites.Selected` accordée uniquement au
   site CEIBA Projects.
4. Ajouter dans `/opt/colect-app/shared/app.env`, sans guillemets :

```dotenv
STORAGE_PROVIDER=sharepoint
MICROSOFT_TENANT_ID=<tenant-id>
MICROSOFT_CLIENT_ID=<application-client-id>
MICROSOFT_CLIENT_SECRET=<valeur-du-secret>
SHAREPOINT_SHARED_FOLDER_URL=<lien-partage-du-dossier-ceiba-projects>
```

Ne pas renseigner `SHAREPOINT_DRIVE_ID` ni `SHAREPOINT_FOLDER_ITEM_ID` pendant ce
premier test : l'application résout le lien partagé automatiquement. Protéger le
fichier puis laisser le prochain déploiement recréer le conteneur avec ces valeurs :

```bash
chmod 600 /opt/colect-app/shared/app.env
```

### Archive finale Alfresco

Alfresco ne remplace pas SharePoint : il reçoit une copie définitive uniquement
après la validation de l'archivage du dossier. Quand Alfresco tourne sur la même VM,
le déploiement crée automatiquement un compte de service et un espace racine réservés
à GeoArchives. Le compte `admin` Alfresco sert uniquement à ce provisionnement et
n'est jamais enregistré dans la configuration applicative.

Configuration finale écrite dans `/opt/colect-app/shared/app.env` :

```dotenv
ARCHIVE_STORAGE_PROVIDER=alfresco
ALFRESCO_API_URL=http://alfresco-geoarchives:8080/alfresco
ALFRESCO_USERNAME=<compte-service-geoarchives>
ALFRESCO_PASSWORD=<mot-de-passe-long-et-unique>
ALFRESCO_ROOT_NODE_ID=<node-id-du-repertoire-GeoArchives-MULCV>
ALFRESCO_NODE_TYPE=arc:archiveDocument
ALFRESCO_CLASSIFICATION=INTERNAL
```

`ALFRESCO_API_URL` doit pointer vers la racine Alfresco qui expose
`/api/-default-/public/alfresco/versions/1`. Sur le VPS mutualisé, le déploiement
crée le réseau Docker interne `geoarchives-alfresco`, un compte technique isolé et
le répertoire racine `GeoArchives-MULCV`. Aucun identifiant Alfresco n'est publié
dans GitHub et l'API documentaire ne doit pas être exposée sur Internet. Après
modification :

```bash
chmod 600 /opt/colect-app/shared/app.env
docker compose --env-file /opt/colect-app/shared/deploy.env -f /opt/colect-app/current/compose.contabo.yml up -d --force-recreate app
```

Les dossiers déjà terminés peuvent être versés depuis l'onglet Documents avec
**Relancer Alfresco**. Les erreurs restent visibles en base et peuvent être reprises
sans doublonner les nœuds déjà créés.

### Indexation automatique locale

L'image applicative embarque Poppler (`pdftotext`, `pdfinfo`, `pdftoppm`) et
Tesseract avec les modèles français et anglais. Les PDF contenant déjà une couche
texte sont lus directement ; seuls les scans sans texte sont convertis en images
et OCRisés. Aucun fichier documentaire n'est envoyé à un service tiers.

Les valeurs suivantes sont optionnelles dans `/opt/colect-app/shared/app.env` :

```dotenv
OCR_LANGUAGE=fra+eng
AUTO_INDEX_MAX_PAGES=20
```

`AUTO_INDEX_MAX_PAGES` limite le coût d'une analyse OCR. Les champs recherchés
se configurent dans **Administration > Champs d'indexation**. Une extraction reste
une proposition : l'agent doit contrôler les valeurs avant que le document soit
publié dans la recherche et classé dans Alfresco.

Le push sur `main` lance le workflow GitHub **Validate and deploy to Contabo** si
la variable de dépôt `CONTABO_ENABLED=true` est active. Le workflow applique la
migration Prisma, reconstruit le conteneur et vérifie la base et HTTPS. Il n'est
pas nécessaire d'exécuter `git pull` dans `~/geoarchiv/colect-app` pour le chemin
de déploiement automatisé : les releases immuables sont installées sous
`/opt/colect-app/releases/<SHA>`.

## Automatisation GitHub

Le workflow [contabo.yml](.github/workflows/contabo.yml) valide les pull requests
et les mises à jour de `main`. La publication exige la variable **de dépôt**
`CONTABO_ENABLED=true` ; la laisser désactivée pendant la préparation.

Créer l'environnement GitHub **production** et ses secrets :

| Secret | Contenu |
| --- | --- |
| `CONTABO_HOST` | `169.58.29.56` |
| `CONTABO_USER` | Compte SSH de déploiement |
| `CONTABO_SSH_KEY` | Clé privée SSH dédiée à ce déploiement |
| `CONTABO_KNOWN_HOSTS` | Entrée `known_hosts` dont l'empreinte a été vérifiée sur le VPS |

La variable `CONTABO_PORT` vaut `22` par défaut. Les secrets applicatifs restent
sur le VPS. Un compte SSH dédié est recommandé ; l'accès au groupe Docker confère
des privilèges équivalents à root sur l'hôte.

Le parcours automatisé est le suivant :

1. Installation Node.js 22, génération Prisma, tests unitaires, lint et build.
2. Transfert SSH vérifié d'une archive du commit exact et préparation de sa version.
3. Construction Docker sur le VPS puis validation de l'environnement.
4. Arrêt de l'application existante sur ce VPS pour figer les écritures, puis
   sauvegardes de la base et des documents.
5. Application explicite de `prisma migrate deploy` ; aucun seed automatique.
6. Démarrage, contrôle de `/login`, puis vérification réelle de la base via
   `/api/health` (`status: ok`, `database: up`).
7. Contrôle HTTPS via nginx sur ce VPS et mise à jour du lien `current`.

Le script [deploy/deploy.sh](deploy/deploy.sh) utilise un verrou pour empêcher deux
déploiements simultanés. Les mises à jour occasionnent une interruption pendant
les sauvegardes, migrations et contrôles. Le premier transfert depuis Render
exige une suspension équivalente des écritures sur Render, à organiser séparément.

## Bascule Render → Contabo et DNS GoDaddy

1. Préparer les secrets, les droits de stockage et une première version avec
   `CHECK_HTTPS=false`. Vérifier l'accès à la base depuis le conteneur.
2. Copier les documents Render en conservant leurs chemins relatifs et vérifier
   plusieurs téléchargements. Avant la copie finale et les sauvegardes de bascule,
   suspendre les écritures sur Render, puis effectuer la synchronisation finale.
3. Installer le nouvel hôte nginx à partir de
   [deploy/nginx.conf.example](deploy/nginx.conf.example), en remplaçant `DOMAIN`
   par `geoarchives.ceiba-analytics.com`. Le port amont doit correspondre à
   `APP_HTTP_PORT`. Vérifier qu'aucun autre fichier nginx ne déclare ce même domaine.
4. Exécuter `nginx -t`, puis `systemctl reload nginx`. Ne pas arrêter nginx ni
   remplacer ses autres sites. Le modèle autorise les fichiers applicatifs de
   20 MiB avec une marge pour le formulaire d'envoi.
5. Dans la zone DNS GoDaddy de `ceiba-analytics.com`, remplacer l'enregistrement
   Render de **geoarchives** par un enregistrement **A → 169.58.29.56**. Retirer un
   éventuel CNAME concurrent et vérifier qu'aucun AAAA de cet hôte ne pointe encore
   vers l'ancien hébergement. Préserver tous les autres enregistrements de la zone.
6. Quand le DNS public atteint ce VPS, obtenir le certificat avec
   `certbot --nginx -d geoarchives.ceiba-analytics.com`, puis vérifier la
   configuration nginx et le renouvellement de ce certificat uniquement avec
   `certbot renew --cert-name geoarchives.ceiba-analytics.com --dry-run`.
7. Vérifier HTTPS, connexion, consultation, envoi et téléchargement d'un document.
   Réactiver `CHECK_HTTPS=true`, puis l'automatisation GitHub. Maintenir Render sans
   écritures pendant la propagation DNS pour éviter deux stockages divergents.

Conserver les fichiers Render jusqu'à validation de la copie et des sauvegardes.
L'absence de fichiers historiques sur Render doit être résolue avant de considérer
la migration documentaire comme terminée.

## Contrôles courants

Depuis le VPS, préparer une commande Compose associée à la version courante :

```bash
release=$(readlink -f /opt/colect-app/current)
export APP_IMAGE="colect-app:$(basename "$release")"
dc() {
  docker compose --project-name colect-app \
    --env-file /opt/colect-app/shared/deploy.env \
    -f "$release/compose.contabo.yml" "$@"
}
dc ps
dc logs --tail 100 app
dc exec -T app node deploy/healthcheck.mjs --readiness
curl --fail --resolve geoarchives.ceiba-analytics.com:443:127.0.0.1 \
  https://geoarchives.ceiba-analytics.com/api/health
```

Un code HTTP 200 sur `/api/health` peut aussi signaler `database: down` : examiner
le JSON ou utiliser `--readiness`. La sonde `/login` mesure uniquement la capacité
du serveur à répondre. La politique `unless-stopped` relance un processus arrêté
anormalement ; un simple état Docker `unhealthy` ne déclenche pas de redémarrage.

## Échec, retour de version et restauration

Après l'arrêt de l'ancienne application, un échec provoque une tentative de remise
en service de l'image précédente, y compris lors d'une nouvelle tentative du même
SHA. **Les migrations déjà appliquées ne sont pas annulées.** Vérifier que l'ancien
code reste compatible avec le schéma avant de conserver ce retour de version.
Si la restauration automatique échoue, garder les écritures suspendues et
intervenir sur la version et la base ensemble.

Pour une restauration complète avec interruption de service :

1. Désactiver `CONTABO_ENABLED`, attendre la fin des déploiements en cours, réserver
   le verrou de déploiement et arrêter Colect. Suspendre aussi tout autre client
   qui écrit dans cette base, notamment Render s'il est encore actif.
2. Conserver l'état actuel avant remplacement. Identifier le dump `.sql.gz`,
   l'archive documentaire `.tar.gz` et la révision issus de la même exécution
   réussie ; vérifier les archives avec `gzip -t` et `tar -tzf`.
3. Tester la restauration sur une base isolée si possible, puis faire importer le
   SQL décompressé dans la base GoDaddy avec le client MariaDB ou l'outil
   d'administration adapté. Utiliser une saisie protégée ou un fichier de
   configuration 0600 pour les identifiants, jamais un mot de passe dans la ligne
   de commande. Le compte doit avoir les droits nécessaires sur tables et vues.
4. Extraire les documents dans un nouveau répertoire, vérifier leur arborescence
   et rétablir l'UID/GID 1000:1000. Remplacer `shared/documents` en conservant
   l'ancien répertoire pendant la validation.
5. Recréer le conteneur depuis la révision correspondant à la sauvegarde et son
   image `colect-app:<SHA>`, avec `docker compose up -d --no-build --force-recreate
   app`. Utiliser le fichier Compose de cette révision et les paramètres partagés.
   Le script de déploiement complet réappliquerait ses migrations : ne l'utiliser
   qu'après avoir décidé de remettre le schéma à cette version.
6. Vérifier la disponibilité de la base, HTTPS, les droits d'accès et plusieurs
   documents. Mettre `current` sur la version validée, puis reprendre les écritures
   et l'automatisation.

Les sauvegardes SQL sont écrites en mode 0600 ; leur fichier final apparaît
uniquement après un dump et une compression réussis. Les sauvegardes restent
**locales au VPS** : prévoir leur copie chiffrée hors site, contrôler l'espace disque
et appliquer une rétention manuelle. Aucune purge automatique ni restauration
automatique de la base n'est mise en place. Garder les images nécessaires aux
retours de version lors du nettoyage Docker.

Les déploiements antérieurs sur Render sont décrits dans [DEPLOYMENT.md](DEPLOYMENT.md).
