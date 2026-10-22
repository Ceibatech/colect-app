-- Les libellés historiques abrégés restent compatibles via leurs codes,
-- mais sont désormais affichés avec une appellation métier commune.
UPDATE `types_piece`
SET `libelle` = 'Carte nationale d''identité'
WHERE `code` = 'PIE-001';

UPDATE `types_piece`
SET `libelle` = 'Carte de résident'
WHERE `code` = 'PIE-002';

UPDATE `types_piece`
SET `libelle` = 'Extrait topographique'
WHERE `code` = 'PIE-004';
