-- Le groupe historique n'est pas une identité publique : il sert uniquement
-- à rattacher les dossiers au premier carton stable. Les codes bruts restent
-- inchangés et les dossiers sans code ni libellé restent explicitement non liés.
CREATE TABLE `cartons` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `legacy_key` CHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `cartons_legacy_key_key` (`legacy_key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dossiers` ADD COLUMN `carton_id` INTEGER NULL;
ALTER TABLE `transfer_lot_items` ADD COLUMN `carton_id` INTEGER NULL;

CREATE TEMPORARY TABLE `_carton_inventory_keys` (
  `dossier_id` INTEGER NOT NULL PRIMARY KEY,
  `legacy_key` CHAR(64) NOT NULL,
  `history_anchor` INTEGER NULL,
  INDEX (`legacy_key`)
);
INSERT INTO `_carton_inventory_keys` (`dossier_id`, `legacy_key`, `history_anchor`)
SELECT d.id,
  SHA2(CONCAT(COALESCE(CAST(d.site_id AS CHAR), '~'), ':',
    COALESCE(CAST(d.entrepot_id AS CHAR), '~'), ':',
    IF(NULLIF(TRIM(d.code_barres), '') IS NOT NULL, 'code:', 'label:'),
    HEX(CONVERT(COALESCE(NULLIF(TRIM(d.code_barres), ''), TRIM(d.libelle_carton)) USING utf8mb4))), 256),
  (SELECT MAX(tld.transfer_lot_item_id) FROM transfer_lot_dossiers tld WHERE tld.dossier_id = d.id)
FROM dossiers d
WHERE COALESCE(NULLIF(TRIM(d.code_barres), ''), NULLIF(TRIM(d.libelle_carton), '')) IS NOT NULL;

-- Si l'historique indique plusieurs cohortes au même emplacement/code, les
-- conserver séparément au lieu de fusionner potentiellement deux cartons.
CREATE TEMPORARY TABLE `_carton_history_counts` AS
SELECT legacy_key, COUNT(DISTINCT history_anchor) AS cohort_count
FROM `_carton_inventory_keys` GROUP BY legacy_key;
CREATE UNIQUE INDEX `_carton_history_key` ON `_carton_history_counts` (`legacy_key`);

CREATE TEMPORARY TABLE `_carton_backfill_groups` AS
SELECT k.legacy_key,
  IF(h.cohort_count > 1, COALESCE(k.history_anchor, 0), 0) AS cohort,
  MIN(k.dossier_id) AS carton_id,
  IF(h.cohort_count > 1, NULL, k.legacy_key) AS intake_key
FROM `_carton_inventory_keys` k
JOIN `_carton_history_counts` h ON h.legacy_key = k.legacy_key
GROUP BY k.legacy_key, IF(h.cohort_count > 1, COALESCE(k.history_anchor, 0), 0),
  IF(h.cohort_count > 1, NULL, k.legacy_key);
CREATE UNIQUE INDEX `_carton_group_key` ON `_carton_backfill_groups` (`legacy_key`, `cohort`);

INSERT INTO cartons (id, legacy_key, created_at, updated_at)
SELECT carton_id, intake_key, NOW(3), NOW(3)
FROM `_carton_backfill_groups` ORDER BY carton_id;

UPDATE dossiers d
JOIN `_carton_inventory_keys` k ON k.dossier_id = d.id
JOIN `_carton_history_counts` h ON h.legacy_key = k.legacy_key
JOIN `_carton_backfill_groups` g ON g.legacy_key = k.legacy_key
  AND g.cohort = IF(h.cohort_count > 1, COALESCE(k.history_anchor, 0), 0)
SET d.carton_id = g.carton_id;

-- Un ancien bordereau ne reçoit une liaison que si l'intégralité de son
-- manifeste désigne désormais un unique carton. Les autres restent lisibles
-- avec leur code et leur manifeste historiques, sans association inventée.
CREATE TEMPORARY TABLE `_carton_item_links` AS
SELECT tld.transfer_lot_item_id AS item_id, MIN(d.carton_id) AS carton_id
FROM transfer_lot_dossiers tld JOIN dossiers d ON d.id = tld.dossier_id
GROUP BY tld.transfer_lot_item_id
HAVING COUNT(DISTINCT d.carton_id) = 1 AND COUNT(*) = COUNT(d.carton_id);

UPDATE transfer_lot_items tli
JOIN `_carton_item_links` l ON l.item_id = tli.id
SET tli.carton_id = l.carton_id;

-- Un carton ayant déjà circulé ne conserve pas de clé d'admission héritée.
UPDATE cartons c JOIN transfer_lot_items tli ON tli.carton_id = c.id
SET c.legacy_key = NULL
WHERE tli.status <> 'PREVU';

CREATE INDEX `dossiers_carton_id_idx` ON `dossiers`(`carton_id`);
CREATE INDEX `transfer_lot_items_carton_id_idx` ON `transfer_lot_items`(`carton_id`);
ALTER TABLE `dossiers` ADD CONSTRAINT `dossiers_carton_id_fkey`
  FOREIGN KEY (`carton_id`) REFERENCES `cartons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `transfer_lot_items` ADD CONSTRAINT `transfer_lot_items_carton_id_fkey`
  FOREIGN KEY (`carton_id`) REFERENCES `cartons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TEMPORARY TABLE `_carton_item_links`;
DROP TEMPORARY TABLE `_carton_backfill_groups`;
DROP TEMPORARY TABLE `_carton_history_counts`;
DROP TEMPORARY TABLE `_carton_inventory_keys`;
