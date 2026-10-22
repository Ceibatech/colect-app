-- Complément détecté lors du contrôle visuel de production : certaines
-- sources placent l'espace uniquement avant la barre (« ZONE 4 /C »).

SET @marcory_id = (
  SELECT `id` FROM `communes`
  WHERE UPPER(TRIM(`nom`)) = 'MARCORY'
  LIMIT 1
);
SET @zone4c_id = (
  SELECT `id` FROM `lotissements`
  WHERE `commune_id` = @marcory_id AND UPPER(TRIM(`nom`)) = 'ZONE 4/C'
  ORDER BY `is_active` DESC, `id` ASC LIMIT 1
);

UPDATE `dossiers` d
JOIN `lotissements` l ON l.`id` = d.`lotissement_id`
SET d.`commune_id` = @marcory_id, d.`lotissement_id` = @zone4c_id
WHERE @marcory_id IS NOT NULL AND @zone4c_id IS NOT NULL
  AND UPPER(TRIM(l.`nom`)) IN ('ZONE 4 /C', 'ZONE4 /C');

UPDATE `lotissements`
SET `is_active` = FALSE, `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `id` <> @zone4c_id
  AND UPPER(TRIM(`nom`)) IN ('ZONE 4 /C', 'ZONE4 /C');

-- TYPE I est conservé comme secteur distinct, mais toutes ses graphies sont
-- regroupées sous une seule fiche rattachée à Marcory.
INSERT INTO `lotissements` (`commune_id`, `code`, `nom`, `description`, `is_active`, `created_at`, `updated_at`)
SELECT @marcory_id, 'CI-127-LOT-ZONE4C-T1', 'ZONE 4/C TYPE I', 'Secteur canonique harmonisé', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE @marcory_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `lotissements`
    WHERE `commune_id` = @marcory_id AND UPPER(TRIM(`nom`)) = 'ZONE 4/C TYPE I'
  );

SET @zone4c_type1_id = (
  SELECT `id` FROM `lotissements`
  WHERE `commune_id` = @marcory_id AND UPPER(TRIM(`nom`)) = 'ZONE 4/C TYPE I'
  ORDER BY `is_active` DESC, `id` ASC LIMIT 1
);

UPDATE `dossiers` d
JOIN `lotissements` l ON l.`id` = d.`lotissement_id`
SET d.`commune_id` = @marcory_id, d.`lotissement_id` = @zone4c_type1_id
WHERE @marcory_id IS NOT NULL AND @zone4c_type1_id IS NOT NULL
  AND UPPER(TRIM(l.`nom`)) IN ('ZONE 4/C TYPE I', 'ZONE 4 /C TYPE I', 'ZONE 4 C TYPE I', 'ZONE4/C TYPE I');

UPDATE `lotissements`
SET `is_active` = FALSE, `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `id` <> @zone4c_type1_id
  AND UPPER(TRIM(`nom`)) IN ('ZONE 4/C TYPE I', 'ZONE 4 /C TYPE I', 'ZONE 4 C TYPE I', 'ZONE4/C TYPE I');

UPDATE `lotissements`
SET `commune_id` = @marcory_id, `nom` = 'ZONE 4/C TYPE I', `is_active` = TRUE, `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `id` = @zone4c_type1_id;
