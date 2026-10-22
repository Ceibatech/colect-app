-- Harmonisation du stock historique de Marcory.
-- Les alias restent traçables dans le référentiel mais sont désactivés après
-- rattachement de tous les dossiers aux fiches canoniques.

SET @marcory_id = (
  SELECT `id`
  FROM `communes`
  WHERE UPPER(TRIM(`nom`)) = 'MARCORY'
  LIMIT 1
);

-- Crée les trois fiches canoniques uniquement si elles n'existent pas déjà.
INSERT INTO `lotissements` (`commune_id`, `code`, `nom`, `description`, `is_active`, `created_at`, `updated_at`)
SELECT @marcory_id, 'CI-127-LOT-ZONE4C', 'ZONE 4/C', 'Secteur canonique harmonisé', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE @marcory_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `lotissements`
    WHERE `commune_id` = @marcory_id AND UPPER(TRIM(`nom`)) = 'ZONE 4/C'
  );

INSERT INTO `lotissements` (`commune_id`, `code`, `nom`, `description`, `is_active`, `created_at`, `updated_at`)
SELECT @marcory_id, 'CI-127-LOT-ZONE3', 'ZONE 3', 'Secteur canonique harmonisé', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE @marcory_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `lotissements`
    WHERE `commune_id` = @marcory_id AND UPPER(TRIM(`nom`)) = 'ZONE 3'
  );

INSERT INTO `lotissements` (`commune_id`, `code`, `nom`, `description`, `is_active`, `created_at`, `updated_at`)
SELECT @marcory_id, 'CI-127-LOT-REMBLAI', 'REMBLAI', 'Secteur canonique harmonisé', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE @marcory_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `lotissements`
    WHERE `commune_id` = @marcory_id AND UPPER(TRIM(`nom`)) = 'REMBLAI'
  );

SET @zone4c_id = (
  SELECT `id` FROM `lotissements`
  WHERE `commune_id` = @marcory_id AND UPPER(TRIM(`nom`)) = 'ZONE 4/C'
  ORDER BY `is_active` DESC, `id` ASC LIMIT 1
);
SET @zone3_id = (
  SELECT `id` FROM `lotissements`
  WHERE `commune_id` = @marcory_id AND UPPER(TRIM(`nom`)) = 'ZONE 3'
  ORDER BY `is_active` DESC, `id` ASC LIMIT 1
);
SET @remblai_id = (
  SELECT `id` FROM `lotissements`
  WHERE `commune_id` = @marcory_id AND UPPER(TRIM(`nom`)) = 'REMBLAI'
  ORDER BY `is_active` DESC, `id` ASC LIMIT 1
);

-- ZONE 4/C et son ancien libellé « complémentaire » représentent le même secteur.
UPDATE `dossiers` d
JOIN `lotissements` l ON l.`id` = d.`lotissement_id`
SET d.`commune_id` = @marcory_id, d.`lotissement_id` = @zone4c_id
WHERE @marcory_id IS NOT NULL AND @zone4c_id IS NOT NULL
  AND UPPER(TRIM(l.`nom`)) IN (
    'ZONE 4/C', 'ZONE 4 / C', 'ZONE4/C', 'ZONE 4 C', '1ZONE 4/C',
    'ZONE 4/C COMPLEMENTAIRE', 'ZONE 4/C COMPLÉMENTAIRE',
    'ZONE 4 C COMPLEMENTAIRE', 'ZONE 4/C COMPLEMENT'
  );

UPDATE `dossiers` d
JOIN `lotissements` l ON l.`id` = d.`lotissement_id`
SET d.`commune_id` = @marcory_id, d.`lotissement_id` = @zone3_id
WHERE @marcory_id IS NOT NULL AND @zone3_id IS NOT NULL
  AND UPPER(TRIM(l.`nom`)) IN ('ZONE 3', 'ZONE 3 MARCORY', 'MARCORY ZONE 3');

UPDATE `dossiers` d
JOIN `lotissements` l ON l.`id` = d.`lotissement_id`
SET d.`commune_id` = @marcory_id, d.`lotissement_id` = @remblai_id
WHERE @marcory_id IS NOT NULL AND @remblai_id IS NOT NULL
  AND UPPER(TRIM(l.`nom`)) IN ('REMBLAI', 'REMBLAIS', 'MARCORY REMBLAI', 'MARCORY REMBLAIS');

-- TYPE I reste un secteur distinct, mais relève bien de Marcory.
UPDATE `lotissements`
SET `commune_id` = @marcory_id, `nom` = 'ZONE 4/C TYPE I', `updated_at` = CURRENT_TIMESTAMP(3)
WHERE @marcory_id IS NOT NULL
  AND UPPER(TRIM(`nom`)) IN ('ZONE 4/C TYPE I', 'ZONE 4 C TYPE I', 'ZONE4/C TYPE I');

UPDATE `dossiers` d
JOIN `lotissements` l ON l.`id` = d.`lotissement_id`
SET d.`commune_id` = @marcory_id
WHERE @marcory_id IS NOT NULL AND UPPER(TRIM(l.`nom`)) = 'ZONE 4/C TYPE I';

-- Retire les fiches fusionnées des formulaires sans casser leur historique.
UPDATE `lotissements`
SET `is_active` = FALSE, `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `id` <> @zone4c_id
  AND UPPER(TRIM(`nom`)) IN (
    'ZONE 4/C', 'ZONE 4 / C', 'ZONE4/C', 'ZONE 4 C', '1ZONE 4/C',
    'ZONE 4/C COMPLEMENTAIRE', 'ZONE 4/C COMPLÉMENTAIRE',
    'ZONE 4 C COMPLEMENTAIRE', 'ZONE 4/C COMPLEMENT'
  );

UPDATE `lotissements`
SET `is_active` = FALSE, `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `id` <> @zone3_id
  AND UPPER(TRIM(`nom`)) IN ('ZONE 3', 'ZONE 3 MARCORY', 'MARCORY ZONE 3');

UPDATE `lotissements`
SET `is_active` = FALSE, `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `id` <> @remblai_id
  AND UPPER(TRIM(`nom`)) IN ('REMBLAI', 'REMBLAIS', 'MARCORY REMBLAI', 'MARCORY REMBLAIS');

UPDATE `lotissements`
SET `is_active` = TRUE, `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `id` IN (@zone4c_id, @zone3_id, @remblai_id);
