-- Chaîne de garde complète : soumission, visas séquentiels, constat d'arrivée et suivi GPS.
ALTER TABLE transfer_lots
  MODIFY status ENUM('BROUILLON', 'SOUMIS', 'AUTORISE', 'PARTIELLEMENT_SORTI', 'EN_TRANSIT', 'RECU_PARTIEL', 'CHEZ_CEIBAC', 'RETOUR_PARTIEL', 'CLOTURE', 'ANNULE') NOT NULL DEFAULT 'BROUILLON',
  ADD COLUMN submitted_at DATETIME(3) NULL AFTER planned_at,
  ADD COLUMN approval_signatory_name VARCHAR(191) NULL AFTER authorized_at,
  ADD COLUMN approval_signatory_title VARCHAR(191) NULL AFTER approval_signatory_name,
  ADD COLUMN approval_signature_data LONGTEXT NULL AFTER approval_signatory_title;

ALTER TABLE transfer_signatures
  MODIFY party ENUM('MINISTERE', 'CEIBAC', 'CEIBAC_VALIDATOR') NOT NULL;

ALTER TABLE transfer_movements
  ADD COLUMN status ENUM('SOUMIS_CEIBAC', 'VALIDE_CEIBAC', 'VALIDE_MINISTERE', 'REJETE') NOT NULL DEFAULT 'VALIDE_MINISTERE' AFTER type,
  ADD COLUMN condition_status ENUM('CONFORME', 'AVEC_RESERVES', 'NON_CONFORME') NULL AFTER status,
  ADD COLUMN ceibac_validated_at DATETIME(3) NULL AFTER created_by_id,
  ADD COLUMN ceibac_validated_by_id INTEGER NULL AFTER ceibac_validated_at,
  ADD COLUMN ministry_validated_at DATETIME(3) NULL AFTER ceibac_validated_by_id,
  ADD COLUMN ministry_validated_by_id INTEGER NULL AFTER ministry_validated_at,
  ADD INDEX transfer_movements_status_idx (status),
  ADD INDEX transfer_movements_ceibac_validated_by_id_idx (ceibac_validated_by_id),
  ADD INDEX transfer_movements_ministry_validated_by_id_idx (ministry_validated_by_id),
  ADD CONSTRAINT transfer_movements_ceibac_validated_by_id_fkey FOREIGN KEY (ceibac_validated_by_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT transfer_movements_ministry_validated_by_id_fkey FOREIGN KEY (ministry_validated_by_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE transfer_tracking_points (
  id INTEGER NOT NULL AUTO_INCREMENT,
  transfer_lot_id INTEGER NOT NULL,
  captured_by_id INTEGER NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  accuracy DOUBLE NULL,
  speed DOUBLE NULL,
  heading DOUBLE NULL,
  captured_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX transfer_tracking_points_transfer_lot_id_captured_at_idx (transfer_lot_id, captured_at),
  INDEX transfer_tracking_points_captured_by_id_idx (captured_by_id),
  PRIMARY KEY (id),
  CONSTRAINT transfer_tracking_points_transfer_lot_id_fkey FOREIGN KEY (transfer_lot_id) REFERENCES transfer_lots(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT transfer_tracking_points_captured_by_id_fkey FOREIGN KEY (captured_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO roles (code, name, description, created_at, updated_at)
VALUES ('VALIDATEUR_CEIBAC', 'Validateur CEIBAC', 'Contrôle et visa CEIBAC des constats de réception documentaire.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), updated_at = CURRENT_TIMESTAMP(3);

INSERT INTO permissions (code, name, description, created_at, updated_at) VALUES
  ('TRANSFER_SUBMIT', 'Soumettre un lot', 'Transmission d’un lot constitué au responsable du ministère.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('TRANSFER_CEIBAC_VALIDATE', 'Valider une réception CEIBAC', 'Contrôle et visa CEIBAC du constat de déchargement.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('TRANSFER_TRACK', 'Suivre un convoi', 'Enregistrement volontaire des positions GPS pendant l’acheminement.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), updated_at = CURRENT_TIMESTAMP(3);

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP(3)
FROM roles r
JOIN permissions p
WHERE (r.code = 'ADMIN' AND p.code IN ('TRANSFER_SUBMIT', 'TRANSFER_CEIBAC_VALIDATE', 'TRANSFER_TRACK'))
   OR (r.code = 'GESTIONNAIRE_TRANSFERT' AND p.code IN ('TRANSFER_SUBMIT', 'TRANSFER_TRACK'))
   OR (r.code = 'VALIDATEUR_CEIBAC' AND p.code IN ('DASHBOARD_VIEW', 'TRANSFER_VIEW', 'TRANSFER_CEIBAC_VALIDATE'));
