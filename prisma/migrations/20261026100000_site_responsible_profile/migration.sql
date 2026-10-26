-- Profil « Responsable de site » : remplace « Gestionnaire de transfert SDA ».
-- Rattaché à un ou plusieurs sites (ministère ou CEIBA), il remet les cartons
-- qui partent de ses sites et fait l'état des lieux de ceux qui y arrivent.
-- Les comptes existants gardent leur rôle (même ligne, code renommé) ; un
-- administrateur doit ensuite leur rattacher leurs sites.

UPDATE roles
SET code = 'RESPONSABLE_SITE',
    name = 'Responsable de site',
    description = 'Remet les cartons qui partent de ses sites et fait l''état des lieux de ceux qui y arrivent.',
    updated_at = CURRENT_TIMESTAMP(3)
WHERE code = 'GESTIONNAIRE_TRANSFERT_SDA'
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM roles WHERE code = 'RESPONSABLE_SITE') existing);

INSERT INTO roles (code, name, description, created_at, updated_at)
VALUES ('RESPONSABLE_SITE', 'Responsable de site', 'Remet les cartons qui partent de ses sites et fait l''état des lieux de ceux qui y arrivent.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE updated_at = updated_at;

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP(3) FROM roles r JOIN permissions p
WHERE r.code = 'RESPONSABLE_SITE' AND p.code IN ('DASHBOARD_VIEW', 'TRANSFER_VIEW', 'TRANSFER_OPERATE');

UPDATE transfer_lot_participants SET role_code = 'RESPONSABLE_SITE' WHERE role_code = 'GESTIONNAIRE_TRANSFERT_SDA';

CREATE TABLE `user_sites` (
  `user_id` INTEGER NOT NULL,
  `site_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `user_sites_site_id_idx` (`site_id`),
  PRIMARY KEY (`user_id`, `site_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_sites`
  ADD CONSTRAINT `user_sites_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `user_sites_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
