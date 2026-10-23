-- GeoArchives est le SAE interne de CEIBA Analytics. Les codes techniques
-- historiques CEIBAC restent inchangés pour préserver la compatibilité,
-- tandis que les libellés visibles et les propriétaires de sites sont unifiés.

ALTER TABLE `sites`
  ADD COLUMN `organisation` ENUM('MINISTERE', 'CEIBA', 'AUTRE') NOT NULL DEFAULT 'MINISTERE' AFTER `type_site`;

UPDATE `sites`
SET
  `organisation` = 'CEIBA',
  `nom` = 'Site CEIBA',
  `updated_at` = CURRENT_TIMESTAMP(3)
WHERE UPPER(CONCAT(`code`, ' ', `nom`)) LIKE '%CEIBA%';

UPDATE `sites`
SET
  `organisation` = 'MINISTERE',
  `nom` = 'Site ministère - Plateau',
  `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'SITE002' OR UPPER(`nom`) = 'MULCV-PLATEAU';

UPDATE `entrepots`
SET
  `code` = REPLACE(`code`, 'MULCV-', 'MIN-'),
  `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` LIKE 'MULCV-S%';

INSERT INTO `sites` (
  `code`, `nom`, `type_site`, `organisation`, `description`, `is_active`, `created_at`, `updated_at`
)
SELECT
  'SITE-CEIBA',
  'Site CEIBA',
  'Site de traitement',
  'CEIBA',
  'Site de traitement documentaire de CEIBA Analytics.',
  TRUE,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (
  SELECT 1 FROM `sites` WHERE `organisation` = 'CEIBA'
);

UPDATE `roles`
SET
  `name` = 'Validateur CEIBA',
  `description` = 'Contrôle et visa CEIBA des constats de réception documentaire.',
  `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'VALIDATEUR_CEIBAC';

UPDATE `roles`
SET
  `description` = 'Autorisation des lots de transfert et contre-signature des réceptions après visa CEIBA.',
  `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'VALIDATEUR_MINISTERE';

UPDATE `permissions`
SET
  `name` = 'Valider un lot CEIBA',
  `description` = 'Visa du responsable CEIBA avant l’autorisation de sortie du ministère.',
  `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'TRANSFER_CEIBAC_APPROVE';

UPDATE `permissions`
SET
  `name` = 'Valider une réception CEIBA',
  `description` = 'Contrôle et visa CEIBA du constat de déchargement.',
  `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'TRANSFER_CEIBAC_VALIDATE';

UPDATE `settings`
SET
  `value` = 'GeoArchives - SAE interne CEIBA Analytics',
  `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `key` = 'APP_NAME';
