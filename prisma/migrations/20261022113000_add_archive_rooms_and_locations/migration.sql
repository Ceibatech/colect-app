-- Structure physique des salles d'archives du MULCV et affectation des
-- fiches d'inventaire encore en brouillon. Les fiches soumises ne sont
-- jamais modifiées par cette migration.
ALTER TABLE `entrepots`
  ADD COLUMN `localisation` VARCHAR(191) NULL AFTER `nom`;

SET @mulcv_site_id = (
  SELECT `id`
  FROM `sites`
  WHERE `code` = 'SITE002' OR `nom` = 'MULCV-PLATEAU'
  ORDER BY (`code` = 'SITE002') DESC
  LIMIT 1
);

INSERT INTO `entrepots`
  (`site_id`, `code`, `nom`, `localisation`, `type_entrepot`, `description`, `is_active`, `created_at`, `updated_at`)
SELECT @mulcv_site_id, rooms.code, rooms.nom, rooms.localisation, 'Salle d''archives', rooms.description, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM (
  SELECT 'MULCV-S00' AS code, 'Salle à confirmer' AS nom, 'Mezzanine, Tour D' AS localisation, 'Affectation provisoire : la salle doit être confirmée par l''agent avant soumission.' AS description
  UNION ALL SELECT 'MULCV-S01', 'Salle 1', 'Mezzanine, Tour D', 'Marcory - Koumassi - Port-Bouët'
  UNION ALL SELECT 'MULCV-S02', 'Salle 2', 'Mezzanine, Tour D', 'Treichville'
  UNION ALL SELECT 'MULCV-S03', 'Salle 3', 'Mezzanine, Tour D', 'Abobo - Anyama'
  UNION ALL SELECT 'MULCV-S04', 'Salle 4', '1er étage, Tour D', 'Cocody'
  UNION ALL SELECT 'MULCV-S05', 'Salle 5', '2e étage, Tour D', 'Bingerville'
  UNION ALL SELECT 'MULCV-S06', 'Salle 6', '2e étage, Tour D', 'Yopougon - Songon'
  UNION ALL SELECT 'MULCV-S07', 'Salle 7', '3e étage, Tour D', 'Cocody-Bessikoi-Djorobité'
  UNION ALL SELECT 'MULCV-S08', 'Salle 8', '2 Plateaux', 'Villes de l''intérieur'
) AS rooms
WHERE @mulcv_site_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  `site_id` = VALUES(`site_id`),
  `nom` = VALUES(`nom`),
  `localisation` = VALUES(`localisation`),
  `type_entrepot` = VALUES(`type_entrepot`),
  `description` = VALUES(`description`),
  `is_active` = true,
  `updated_at` = CURRENT_TIMESTAMP(3);

SET @room_pending = (SELECT `id` FROM `entrepots` WHERE `code` = 'MULCV-S00' LIMIT 1);
SET @room_1 = (SELECT `id` FROM `entrepots` WHERE `code` = 'MULCV-S01' LIMIT 1);
SET @room_2 = (SELECT `id` FROM `entrepots` WHERE `code` = 'MULCV-S02' LIMIT 1);
SET @room_3 = (SELECT `id` FROM `entrepots` WHERE `code` = 'MULCV-S03' LIMIT 1);
SET @room_4 = (SELECT `id` FROM `entrepots` WHERE `code` = 'MULCV-S04' LIMIT 1);
SET @room_5 = (SELECT `id` FROM `entrepots` WHERE `code` = 'MULCV-S05' LIMIT 1);
SET @room_6 = (SELECT `id` FROM `entrepots` WHERE `code` = 'MULCV-S06' LIMIT 1);
SET @room_7 = (SELECT `id` FROM `entrepots` WHERE `code` = 'MULCV-S07' LIMIT 1);
SET @room_8 = (SELECT `id` FROM `entrepots` WHERE `code` = 'MULCV-S08' LIMIT 1);

-- Le document source couvre explicitement les communes d'Abidjan ci-dessous.
-- Toute commune de l'intérieur est affectée à la salle 8. Les communes
-- d'Abidjan non documentées et les valeurs absentes restent à confirmer.
UPDATE `dossiers` AS d
LEFT JOIN `communes` AS c ON c.`id` = d.`commune_id`
LEFT JOIN `lotissements` AS l ON l.`id` = d.`lotissement_id`
SET
  d.`site_id` = @mulcv_site_id,
  d.`entrepot_id` = CASE
    WHEN TRIM(c.`nom`) IN ('Marcory', 'Koumassi', 'Port-Bouët', 'Port-Bouet', 'Port Bouët', 'Port Bouet') THEN @room_1
    WHEN TRIM(c.`nom`) = 'Treichville' THEN @room_2
    WHEN TRIM(c.`nom`) IN ('Abobo', 'Anyama') THEN @room_3
    WHEN TRIM(c.`nom`) = 'Cocody' AND (UPPER(l.`nom`) LIKE '%BESSIKOI%' OR UPPER(l.`nom`) LIKE '%DJOROBIT%') THEN @room_7
    WHEN TRIM(c.`nom`) = 'Cocody' THEN @room_4
    WHEN TRIM(c.`nom`) = 'Bingerville' THEN @room_5
    WHEN TRIM(c.`nom`) IN ('Yopougon', 'Songon') THEN @room_6
    WHEN c.`id` IS NULL THEN @room_pending
    WHEN TRIM(c.`nom`) IN ('Adjamé', 'Adjame', 'Attécoubé', 'Attecoube', 'Plateau') THEN @room_pending
    ELSE @room_8
  END,
  d.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE d.`statut_collecte` = 'BROUILLON'
  AND @mulcv_site_id IS NOT NULL;
