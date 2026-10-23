-- Harmonize existing identity labels with the uppercase convention enforced
-- by the administration forms. E-mail addresses and technical identifiers
-- remain untouched.
UPDATE `users`
SET `name` = UPPER(TRIM(`name`))
WHERE BINARY `name` <> BINARY UPPER(TRIM(`name`));

UPDATE `operateurs`
SET
  `nom` = UPPER(TRIM(`nom`)),
  `prenoms` = CASE
    WHEN `prenoms` IS NULL THEN NULL
    ELSE UPPER(TRIM(`prenoms`))
  END;
