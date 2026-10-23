ALTER TABLE `workflow_statuses`
  MODIFY `workflow_type` ENUM('COLLECTE', 'VALIDATION', 'PREPARATION', 'NUMERISATION', 'CONDITIONNEMENT', 'INDEXATION', 'ARCHIVAGE') NOT NULL;

ALTER TABLE `workflow_transitions`
  MODIFY `workflow_type` ENUM('COLLECTE', 'VALIDATION', 'PREPARATION', 'NUMERISATION', 'CONDITIONNEMENT', 'INDEXATION', 'ARCHIVAGE') NOT NULL;

ALTER TABLE `dossiers`
  ADD COLUMN `statut_conditionnement` ENUM('EN_ATTENTE', 'EN_COURS', 'TERMINE', 'REJETE') NOT NULL DEFAULT 'EN_ATTENTE' AFTER `statut_numerisation`,
  ADD COLUMN `conditionneur_id` INTEGER NULL AFTER `date_numerisation`,
  ADD COLUMN `conditionnement_claimed_at` DATETIME(3) NULL AFTER `conditionneur_id`,
  ADD COLUMN `date_conditionnement` DATETIME(3) NULL AFTER `conditionnement_claimed_at`,
  ADD COLUMN `observations_conditionnement` TEXT NULL AFTER `date_conditionnement`;

UPDATE `dossiers`
SET `statut_conditionnement` = 'TERMINE',
    `date_conditionnement` = COALESCE(`date_indexation`, `date_numerisation`, `updated_at`)
WHERE `statut_indexation` <> 'EN_ATTENTE'
   OR `statut_archivage` <> 'EN_ATTENTE';

CREATE INDEX `dossiers_conditionneur_id_idx` ON `dossiers`(`conditionneur_id`);
CREATE INDEX `dossiers_statut_conditionnement_idx` ON `dossiers`(`statut_conditionnement`);

ALTER TABLE `dossiers`
  ADD CONSTRAINT `dossiers_conditionneur_id_fkey`
  FOREIGN KEY (`conditionneur_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `permissions` (`code`, `name`, `description`, `created_at`, `updated_at`)
VALUES
  ('CONDITIONNEMENT_VIEW', 'Voir le conditionnement', 'Consulter la file de reconditionnement des cartons.', NOW(3), NOW(3)),
  ('CONDITIONNEMENT_UPDATE', 'Réaliser le conditionnement', 'Prendre en charge et terminer le reconditionnement des cartons.', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `updated_at` = VALUES(`updated_at`);

INSERT INTO `roles` (`code`, `name`, `description`, `created_at`, `updated_at`)
VALUES
  ('OPERATEUR', 'Opérateur polyvalent', 'Profil multi-activité pour les agents cumulant plusieurs étapes de la chaîne.', NOW(3), NOW(3)),
  ('AGENT_INVENTAIRE', 'Agent d’inventaire', 'Inventaire et soumission des dossiers.', NOW(3), NOW(3)),
  ('PREPARATEUR', 'Préparateur documentaire', 'Préparation des dossiers dans les cartons partagés.', NOW(3), NOW(3)),
  ('NUMERISATEUR', 'Agent de numérisation', 'Numérisation et versement des fichiers depuis le poste scanner.', NOW(3), NOW(3)),
  ('CONDITIONNEUR', 'Agent de reconditionnement', 'Remise en ordre, fermeture et traçabilité des cartons numérisés.', NOW(3), NOW(3)),
  ('INDEXEUR', 'Agent d’indexation', 'Traitement des exceptions d’indexation documentaire.', NOW(3), NOW(3)),
  ('ARCHIVISTE', 'Archiviste', 'Classement final et archivage des dossiers.', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `updated_at` = VALUES(`updated_at`);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`)
SELECT r.id, p.id, NOW(3)
FROM `roles` r
JOIN `permissions` p ON p.code IN ('CONDITIONNEMENT_VIEW', 'CONDITIONNEMENT_UPDATE')
WHERE r.code IN ('ADMIN', 'OPERATEUR');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`)
SELECT r.id, p.id, NOW(3)
FROM `roles` r
JOIN `permissions` p ON p.code = 'CONDITIONNEMENT_VIEW'
WHERE r.code IN ('SUPERVISEUR', 'CONSULTATION');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`)
SELECT r.id, p.id, NOW(3) FROM `roles` r JOIN `permissions` p
WHERE r.code = 'AGENT_INVENTAIRE' AND p.code IN ('DASHBOARD_VIEW', 'DOSSIER_CREATE', 'DOSSIER_READ', 'DOSSIER_UPDATE', 'IMPORT_DATA');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`)
SELECT r.id, p.id, NOW(3) FROM `roles` r JOIN `permissions` p
WHERE r.code = 'PREPARATEUR' AND p.code IN ('DASHBOARD_VIEW', 'DOSSIER_READ', 'PREPARATION_VIEW', 'PREPARATION_UPDATE');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`)
SELECT r.id, p.id, NOW(3) FROM `roles` r JOIN `permissions` p
WHERE r.code = 'NUMERISATEUR' AND p.code IN ('DASHBOARD_VIEW', 'DOSSIER_READ', 'NUMERISATION_VIEW', 'NUMERISATION_UPDATE');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`)
SELECT r.id, p.id, NOW(3) FROM `roles` r JOIN `permissions` p
WHERE r.code = 'CONDITIONNEUR' AND p.code IN ('DASHBOARD_VIEW', 'DOSSIER_READ', 'CONDITIONNEMENT_VIEW', 'CONDITIONNEMENT_UPDATE');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`)
SELECT r.id, p.id, NOW(3) FROM `roles` r JOIN `permissions` p
WHERE r.code = 'INDEXEUR' AND p.code IN ('DASHBOARD_VIEW', 'DOSSIER_READ', 'INDEXATION_VIEW', 'INDEXATION_UPDATE');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`)
SELECT r.id, p.id, NOW(3) FROM `roles` r JOIN `permissions` p
WHERE r.code = 'ARCHIVISTE' AND p.code IN ('DASHBOARD_VIEW', 'DOSSIER_READ', 'ARCHIVAGE_VIEW', 'ARCHIVAGE_UPDATE');
