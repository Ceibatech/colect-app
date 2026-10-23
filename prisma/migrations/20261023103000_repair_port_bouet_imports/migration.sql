-- Les fichiers apurés historiques contiennent 4 009 dossiers PORT-BOUET.
-- Lors de la première reprise, leur libellé avec trait d'union n'a pas été
-- résolu et `commune_id` est resté vide. La réparation s'appuie sur la preuve
-- d'import (nom du fichier + numéro de ligne), pas sur le préfixe de code-barres
-- POR qui existe aussi sur quelques dossiers Marcory et Koumassi.

SET @port_bouet_commune_id := (
  SELECT `id`
  FROM `communes`
  WHERE `code` = 'CI-147'
     OR UPPER(REPLACE(`nom`, '-', ' ')) IN ('PORT BOUET', 'PORT BOUËT')
  ORDER BY (`code` = 'CI-147') DESC, `id` ASC
  LIMIT 1
);

SET @port_bouet_room_id := (
  SELECT `id`
  FROM `entrepots`
  WHERE `code` IN ('MIN-S01', 'MULCV-S01')
  ORDER BY (`code` = 'MIN-S01') DESC, `id` ASC
  LIMIT 1
);

SET @port_bouet_site_id := (
  SELECT `site_id`
  FROM `entrepots`
  WHERE `id` = @port_bouet_room_id
  LIMIT 1
);

INSERT INTO `communes` (`code`, `nom`, `description`, `is_active`, `created_at`, `updated_at`)
SELECT
  'CI-147',
  'Port Bouet',
  'Commune de Port-Bouët',
  TRUE,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
WHERE @port_bouet_commune_id IS NULL;

SET @port_bouet_commune_id := (
  SELECT `id`
  FROM `communes`
  WHERE `code` = 'CI-147'
     OR UPPER(REPLACE(`nom`, '-', ' ')) IN ('PORT BOUET', 'PORT BOUËT')
  ORDER BY (`code` = 'CI-147') DESC, `id` ASC
  LIMIT 1
);

CREATE TEMPORARY TABLE `_repair_port_bouet_dossiers` (
  `dossier_id` INT NOT NULL PRIMARY KEY
);

INSERT IGNORE INTO `_repair_port_bouet_dossiers` (`dossier_id`)
SELECT parsed.`dossier_id`
FROM (
  SELECT
    history.`dossier_id`,
    SUBSTRING_INDEX(SUBSTRING_INDEX(history.`commentaire`, 'Importé depuis ', -1), ' (ligne ', 1) AS `source_file`,
    CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(history.`commentaire`, '(ligne ', -1), ')', 1) AS UNSIGNED) AS `source_line`
  FROM `dossier_history` history
  WHERE history.`action` = 'IMPORT'
    AND history.`commentaire` LIKE 'Importé depuis GeoArchives_import_OP-%_apure.% (ligne %).'
) parsed
INNER JOIN `dossiers` dossier ON dossier.`id` = parsed.`dossier_id`
WHERE dossier.`commune_id` IS NULL
  AND (
    (
      parsed.`source_file` IN ('GeoArchives_import_OP-004_KONAN_apure.csv', 'GeoArchives_import_OP-004_KONAN_apure.xlsx')
      AND (
        parsed.`source_line` BETWEEN 1665 AND 1812
        OR parsed.`source_line` BETWEEN 1815 AND 1854
        OR parsed.`source_line` BETWEEN 1856 AND 1985
        OR parsed.`source_line` BETWEEN 1987 AND 2089
        OR parsed.`source_line` BETWEEN 2091 AND 2394
        OR parsed.`source_line` BETWEEN 2396 AND 2404
        OR parsed.`source_line` BETWEEN 2406 AND 2430
        OR parsed.`source_line` BETWEEN 2432 AND 2499
        OR parsed.`source_line` BETWEEN 2503 AND 2505
      )
    )
    OR (
      parsed.`source_file` IN ('GeoArchives_import_OP-005_GOLANA_apure.csv', 'GeoArchives_import_OP-005_GOLANA_apure.xlsx')
      AND parsed.`source_line` BETWEEN 1508 AND 1792
    )
    OR (
      parsed.`source_file` IN ('GeoArchives_import_OP-006_GUEHI_apure.csv', 'GeoArchives_import_OP-006_GUEHI_apure.xlsx')
      AND (
        parsed.`source_line` BETWEEN 2302 AND 2303
        OR parsed.`source_line` BETWEEN 2306 AND 3139
      )
    )
    OR (
      parsed.`source_file` IN ('GeoArchives_import_OP-007_COULIBALY_apure.csv', 'GeoArchives_import_OP-007_COULIBALY_apure.xlsx')
      AND (
        parsed.`source_line` BETWEEN 1242 AND 1244
        OR parsed.`source_line` BETWEEN 1280 AND 1300
        OR parsed.`source_line` BETWEEN 1302 AND 1461
        OR parsed.`source_line` BETWEEN 1463 AND 1736
        OR parsed.`source_line` BETWEEN 1738 AND 1808
        OR parsed.`source_line` BETWEEN 1810 AND 2015
      )
    )
    OR (
      parsed.`source_file` IN ('GeoArchives_import_OP-008_MALOULA_apure.csv', 'GeoArchives_import_OP-008_MALOULA_apure.xlsx')
      AND (
        parsed.`source_line` BETWEEN 2557 AND 2842
        OR parsed.`source_line` BETWEEN 2844 AND 2965
        OR parsed.`source_line` BETWEEN 2967 AND 3034
      )
    )
    OR (
      parsed.`source_file` IN ('GeoArchives_import_OP-009_MOUNOU_apure.csv', 'GeoArchives_import_OP-009_MOUNOU_apure.xlsx')
      AND parsed.`source_line` BETWEEN 1575 AND 2421
    )
  );

INSERT INTO `dossier_history` (
  `dossier_id`, `user_id`, `action`, `ancien_statut`, `nouveau_statut`, `commentaire`, `metadata`, `created_at`
)
SELECT
  dossier.`id`,
  NULL,
  'DATA_REPAIR_PORT_BOUET',
  'SANS_COMMUNE',
  CONCAT('COMMUNE_', @port_bouet_commune_id),
  'Commune Port Bouet restaurée depuis la preuve de ligne du fichier apuré.',
  JSON_OBJECT('migration', '20261023103000_repair_port_bouet_imports', 'communeId', @port_bouet_commune_id),
  CURRENT_TIMESTAMP(3)
FROM `dossiers` dossier
INNER JOIN `_repair_port_bouet_dossiers` repair ON repair.`dossier_id` = dossier.`id`;

UPDATE `dossiers` dossier
INNER JOIN `_repair_port_bouet_dossiers` repair ON repair.`dossier_id` = dossier.`id`
LEFT JOIN `entrepots` current_room ON current_room.`id` = dossier.`entrepot_id`
SET
  dossier.`commune_id` = @port_bouet_commune_id,
  dossier.`site_id` = CASE
    WHEN dossier.`statut_collecte` = 'BROUILLON'
      AND @port_bouet_room_id IS NOT NULL
      AND (dossier.`entrepot_id` IS NULL OR current_room.`code` IN ('MIN-S00', 'MULCV-S00'))
    THEN @port_bouet_site_id
    ELSE dossier.`site_id`
  END,
  dossier.`entrepot_id` = CASE
    WHEN dossier.`statut_collecte` = 'BROUILLON'
      AND @port_bouet_room_id IS NOT NULL
      AND (dossier.`entrepot_id` IS NULL OR current_room.`code` IN ('MIN-S00', 'MULCV-S00'))
    THEN @port_bouet_room_id
    ELSE dossier.`entrepot_id`
  END,
  dossier.`updated_at` = CURRENT_TIMESTAMP(3);

DROP TEMPORARY TABLE `_repair_port_bouet_dossiers`;
