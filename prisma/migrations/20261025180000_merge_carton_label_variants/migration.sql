-- Fusion des cartons dont l'identification ne diffère que par la casse, les
-- accents ou l'espacement (« Anan cocoteraie 1 » / « Anan Cocoteraie 1 »,
-- « 643-699 zone4/c » / « 643-699 zone 4/c »), au même site et à la même salle.
--
-- Règles (alignées sur src/lib/cartons/identity-normalization.ts) :
--   * code-barres : espaces retirés, casse significative (comparaison binaire) ;
--   * libellé (sans code) : espaces retirés, casse et accents ignorés
--     (collation utf8mb4_unicode_ci).
-- Le carton conservé est celui de plus petit identifiant (le plus ancien CTN).
--
-- Un groupe n'est PAS fusionné si :
--   * l'un de ses cartons est engagé dans un transfert ouvert (contenu figé) ;
--   * deux de ses cartons portent exactement le même texte : la migration
--     précédente les a volontairement séparés d'après l'historique des
--     transferts (deux contenants physiques distincts).
-- Les fautes de frappe (« Anna » / « Anan ») ne sont jamais fusionnées ici :
-- voir scripts/carton-duplicates.ts.
--
-- Tables de travail non temporaires : MariaDB ne permet pas de rouvrir une
-- table temporaire deux fois dans la même requête.

DROP TABLE IF EXISTS `_ctn_dossier_keys`, `_ctn_carton_keys`, `_ctn_groups`, `_ctn_merge`, `_ctn_blocked`;

CREATE TABLE `_ctn_dossier_keys` (
  `dossier_id` INTEGER NOT NULL PRIMARY KEY,
  `carton_id` INTEGER NOT NULL,
  `site_id` INTEGER NOT NULL,
  `entrepot_id` INTEGER NOT NULL,
  `kind` CHAR(5) NOT NULL,
  `norm_code` VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `norm_label` VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `raw_value` VARBINARY(2000) NOT NULL,
  INDEX (`carton_id`)
);

INSERT INTO `_ctn_dossier_keys`
SELECT x.dossier_id, x.carton_id, x.site_id, x.entrepot_id,
  IF(x.code <> '', 'code', 'label'),
  IF(x.code <> '', x.code, ''),
  IF(x.code <> '', '', x.label),
  CAST(IF(x.code <> '', TRIM(x.raw_code), TRIM(x.raw_label)) AS BINARY)
FROM (
  SELECT d.id AS dossier_id, d.carton_id,
    COALESCE(d.site_id, -1) AS site_id,
    COALESCE(d.entrepot_id, -1) AS entrepot_id,
    REGEXP_REPLACE(COALESCE(d.code_barres, ''), '(*UCP)[[:space:]]+', '') AS code,
    REGEXP_REPLACE(COALESCE(d.libelle_carton, ''), '(*UCP)[[:space:]]+', '') AS label,
    d.code_barres AS raw_code, d.libelle_carton AS raw_label
  FROM dossiers d
  WHERE d.carton_id IS NOT NULL
) x
WHERE x.code <> '' OR x.label <> '';

-- Un carton n'est candidat que si tous ses dossiers partagent la même clé.
CREATE TABLE `_ctn_carton_keys` (
  `carton_id` INTEGER NOT NULL PRIMARY KEY,
  `site_id` INTEGER NOT NULL,
  `entrepot_id` INTEGER NOT NULL,
  `kind` CHAR(5) NOT NULL,
  `norm_code` VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `norm_label` VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `raw_value` VARBINARY(2000) NOT NULL,
  INDEX (`site_id`, `entrepot_id`, `kind`)
);

INSERT INTO `_ctn_carton_keys`
SELECT k.carton_id, MIN(k.site_id), MIN(k.entrepot_id), MIN(k.kind),
  MIN(k.norm_code), MIN(k.norm_label), MIN(k.raw_value)
FROM `_ctn_dossier_keys` k
GROUP BY k.carton_id
HAVING COUNT(DISTINCT k.site_id) = 1
  AND COUNT(DISTINCT k.entrepot_id) = 1
  AND COUNT(DISTINCT k.kind) = 1
  AND COUNT(DISTINCT k.norm_code) = 1
  AND COUNT(DISTINCT k.norm_label) = 1;

CREATE TABLE `_ctn_groups` (
  `survivor_id` INTEGER NOT NULL PRIMARY KEY,
  `site_id` INTEGER NOT NULL,
  `entrepot_id` INTEGER NOT NULL,
  `kind` CHAR(5) NOT NULL,
  `norm_code` VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `norm_label` VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
);

INSERT INTO `_ctn_groups`
SELECT MIN(c.carton_id), c.site_id, c.entrepot_id, c.kind, c.norm_code, c.norm_label
FROM `_ctn_carton_keys` c
GROUP BY c.site_id, c.entrepot_id, c.kind, c.norm_code, c.norm_label
HAVING COUNT(*) > 1;

CREATE TABLE `_ctn_merge` (
  `carton_id` INTEGER NOT NULL PRIMARY KEY,
  `survivor_id` INTEGER NOT NULL,
  `raw_value` VARBINARY(2000) NOT NULL,
  INDEX (`survivor_id`)
);

INSERT INTO `_ctn_merge`
SELECT c.carton_id, g.survivor_id, c.raw_value
FROM `_ctn_carton_keys` c
JOIN `_ctn_groups` g
  ON g.site_id = c.site_id AND g.entrepot_id = c.entrepot_id AND g.kind = c.kind
  AND g.norm_code = c.norm_code AND g.norm_label = c.norm_label;

CREATE TABLE `_ctn_blocked` (`survivor_id` INTEGER NOT NULL PRIMARY KEY);

-- Contenu figé par un transfert ouvert.
INSERT IGNORE INTO `_ctn_blocked`
SELECT DISTINCT m.survivor_id
FROM `_ctn_merge` m
JOIN transfer_lot_items tli ON tli.carton_id = m.carton_id
JOIN transfer_lots tl ON tl.id = tli.transfer_lot_id
WHERE tli.status IN ('PREVU', 'SORTI', 'RECU')
  AND tl.status NOT IN ('CLOTURE', 'ANNULE');

-- Cohortes séparées volontairement (texte identique, cartons distincts).
INSERT IGNORE INTO `_ctn_blocked`
SELECT m.survivor_id
FROM `_ctn_merge` m
GROUP BY m.survivor_id, m.raw_value
HAVING COUNT(*) > 1;

DELETE m FROM `_ctn_merge` m JOIN `_ctn_blocked` b ON b.survivor_id = m.survivor_id;

-- Traçabilité : une ligne d'audit par carton absorbé.
INSERT INTO audit_logs (user_id, action, entity, entity_id, old_value, new_value, created_at)
SELECT NULL, 'CARTON_MERGE', 'CARTON', m.carton_id,
  JSON_OBJECT('cartonId', m.carton_id, 'libelleOuCode', CONVERT(m.raw_value USING utf8mb4)),
  JSON_OBJECT('cartonId', m.survivor_id, 'motif', 'Variante de casse/espacement du même carton'),
  NOW(3)
FROM `_ctn_merge` m
WHERE m.carton_id <> m.survivor_id;

UPDATE dossiers d
JOIN `_ctn_merge` m ON m.carton_id = d.carton_id
SET d.carton_id = m.survivor_id
WHERE m.carton_id <> m.survivor_id;

-- Les clés d'admission v1 (texte brut) sont obsolètes pour ces cartons :
-- l'admission retrouve désormais le carton par ses dossiers présents.
UPDATE cartons c JOIN `_ctn_merge` m ON m.carton_id = c.id
SET c.legacy_key = NULL;

-- Les cartons absorbés sans historique de transfert disparaissent ; ceux qui
-- figurent sur un ancien bordereau restent, vides, pour l'historique.
DELETE c FROM cartons c
JOIN `_ctn_merge` m ON m.carton_id = c.id AND m.carton_id <> m.survivor_id
LEFT JOIN transfer_lot_items tli ON tli.carton_id = c.id
LEFT JOIN dossiers d ON d.carton_id = c.id
WHERE tli.id IS NULL AND d.id IS NULL;

DROP TABLE `_ctn_blocked`, `_ctn_merge`, `_ctn_groups`, `_ctn_carton_keys`, `_ctn_dossier_keys`;
