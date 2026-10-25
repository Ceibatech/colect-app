-- Profils symétriques du circuit de transfert entre CEIBA et le SDA.
-- CEIBA : Exécutif, Gestionnaire des transferts, Validateur interne, Convoyeur.
-- SDA   : Exécutif SDA, Gestionnaire de transfert SDA, Responsable validation SDA.
-- Aucun compte n'est créé ni réaffecté : un administrateur attribue les profils.

INSERT INTO roles (code, name, description, created_at, updated_at) VALUES
  ('CONVOYEUR', 'Convoyeur', 'Accompagne le convoi et partage sa position GPS pendant le transport.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('GESTIONNAIRE_TRANSFERT_SDA', 'Gestionnaire de transfert SDA', 'Remet ou réceptionne les cartons sur les sites du ministère et signe les bordereaux.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('EXECUTIF_SDA', 'Exécutif SDA', 'Lecture seule du registre des transferts et du stock par site.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  updated_at = CURRENT_TIMESTAMP(3);

UPDATE roles SET name = 'Gestionnaire des transferts CEIBA', updated_at = CURRENT_TIMESTAMP(3) WHERE code = 'GESTIONNAIRE_TRANSFERT';
UPDATE roles SET name = 'Validateur interne', updated_at = CURRENT_TIMESTAMP(3) WHERE code = 'VALIDATEUR_CEIBAC';
UPDATE roles SET name = 'Responsable validation SDA', updated_at = CURRENT_TIMESTAMP(3) WHERE code = 'VALIDATEUR_MINISTERE';

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP(3) FROM roles r JOIN permissions p
WHERE r.code = 'CONVOYEUR' AND p.code IN ('DASHBOARD_VIEW', 'TRANSFER_VIEW', 'TRANSFER_TRACK');

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP(3) FROM roles r JOIN permissions p
WHERE r.code = 'GESTIONNAIRE_TRANSFERT_SDA' AND p.code IN ('DASHBOARD_VIEW', 'TRANSFER_VIEW', 'TRANSFER_OPERATE');

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP(3) FROM roles r JOIN permissions p
WHERE r.code IN ('EXECUTIF_SDA', 'EXECUTIF') AND p.code IN ('DASHBOARD_VIEW', 'TRANSFER_VIEW');

-- Intervenants désignés sur une opération, choisis parmi les comptes habilités.
-- Le texte figé dans transfer_lots (ceiba_participants / sda_participants)
-- reste la mention imprimée sur les documents signés.
CREATE TABLE `transfer_lot_participants` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `transfer_lot_id` INTEGER NOT NULL,
  `user_id` INTEGER NOT NULL,
  `side` ENUM('CEIBA', 'SDA') NOT NULL,
  `role_code` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `transfer_lot_participants_transfer_lot_id_user_id_key` (`transfer_lot_id`, `user_id`),
  INDEX `transfer_lot_participants_user_id_idx` (`user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `transfer_lot_participants`
  ADD CONSTRAINT `transfer_lot_participants_transfer_lot_id_fkey` FOREIGN KEY (`transfer_lot_id`) REFERENCES `transfer_lots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `transfer_lot_participants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
