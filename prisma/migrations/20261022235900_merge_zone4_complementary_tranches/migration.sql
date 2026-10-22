-- Les mentions de tranche sont des précisions de l'ancien libellé
-- « ZONE 4/C complémentaire », déjà déclaré comme alias de ZONE 4/C.

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
  AND (
    UPPER(TRIM(l.`nom`)) LIKE 'ZONE 4C COMPLEMENT%'
    OR UPPER(TRIM(l.`nom`)) LIKE 'ZONE 4C COMPLÉMENT%'
    OR UPPER(TRIM(l.`nom`)) LIKE 'ZONE 4/C COMPLEMENT%'
    OR UPPER(TRIM(l.`nom`)) LIKE 'ZONE 4/C COMPLÉMENT%'
  );

UPDATE `lotissements`
SET `is_active` = FALSE, `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `id` <> @zone4c_id
  AND (
    UPPER(TRIM(`nom`)) LIKE 'ZONE 4C COMPLEMENT%'
    OR UPPER(TRIM(`nom`)) LIKE 'ZONE 4C COMPLÉMENT%'
    OR UPPER(TRIM(`nom`)) LIKE 'ZONE 4/C COMPLEMENT%'
    OR UPPER(TRIM(`nom`)) LIKE 'ZONE 4/C COMPLÉMENT%'
  );
