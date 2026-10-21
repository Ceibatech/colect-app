-- Registre de garde des lots archivistiques et bordereaux de transfert.
INSERT INTO permissions (code, name, description, created_at, updated_at) VALUES
  ('TRANSFER_VIEW', 'Consulter les transferts', 'Accès au registre de garde et aux bordereaux.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('TRANSFER_CREATE', 'Créer un lot de transfert', 'Constitution d’un lot à partir des cartons identifiés.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('TRANSFER_OPERATE', 'Enregistrer les mouvements', 'Sortie, réception et retour des cartons avec bordereau signé.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('TRANSFER_AUTHORIZE', 'Autoriser les transferts', 'Autorisation d’un lot avant sa première sortie.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  updated_at = CURRENT_TIMESTAMP(3);

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP(3)
FROM roles r
JOIN permissions p
WHERE (r.code = 'ADMIN' AND p.code IN ('TRANSFER_VIEW', 'TRANSFER_CREATE', 'TRANSFER_OPERATE', 'TRANSFER_AUTHORIZE'))
   OR (r.code = 'SUPERVISEUR' AND p.code IN ('TRANSFER_VIEW', 'TRANSFER_AUTHORIZE'))
   OR (r.code = 'OPERATEUR' AND p.code IN ('TRANSFER_VIEW', 'TRANSFER_CREATE', 'TRANSFER_OPERATE'));

CREATE TABLE transfer_lots (
  id INTEGER NOT NULL AUTO_INCREMENT,
  reference VARCHAR(191) NOT NULL,
  source_site_id INTEGER NOT NULL,
  source_entrepot_id INTEGER NULL,
  destination_site_id INTEGER NOT NULL,
  destination_entrepot_id INTEGER NULL,
  status ENUM('BROUILLON', 'AUTORISE', 'PARTIELLEMENT_SORTI', 'EN_TRANSIT', 'RECU_PARTIEL', 'CHEZ_CEIBAC', 'RETOUR_PARTIEL', 'CLOTURE', 'ANNULE') NOT NULL DEFAULT 'BROUILLON',
  motif TEXT NULL,
  planned_at DATETIME(3) NULL,
  authorized_at DATETIME(3) NULL,
  created_by_id INTEGER NOT NULL,
  authorized_by_id INTEGER NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL,
  UNIQUE INDEX transfer_lots_reference_key (reference),
  INDEX transfer_lots_source_site_id_source_entrepot_id_idx (source_site_id, source_entrepot_id),
  INDEX transfer_lots_destination_site_id_destination_entrepot_id_idx (destination_site_id, destination_entrepot_id),
  INDEX transfer_lots_status_idx (status),
  INDEX transfer_lots_created_by_id_idx (created_by_id),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE transfer_lot_items (
  id INTEGER NOT NULL AUTO_INCREMENT,
  transfer_lot_id INTEGER NOT NULL,
  carton_code VARCHAR(191) NOT NULL,
  carton_label VARCHAR(191) NULL,
  dossier_count_snapshot INTEGER NOT NULL,
  status ENUM('PREVU', 'SORTI', 'RECU', 'RETOURNE') NOT NULL DEFAULT 'PREVU',
  departed_at DATETIME(3) NULL,
  received_at DATETIME(3) NULL,
  returned_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL,
  UNIQUE INDEX transfer_lot_items_transfer_lot_id_carton_code_key (transfer_lot_id, carton_code),
  INDEX transfer_lot_items_carton_code_status_idx (carton_code, status),
  INDEX transfer_lot_items_status_idx (status),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE transfer_lot_dossiers (
  id INTEGER NOT NULL AUTO_INCREMENT,
  transfer_lot_item_id INTEGER NOT NULL,
  dossier_id INTEGER NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX transfer_lot_dossiers_item_id_dossier_id_key (transfer_lot_item_id, dossier_id),
  INDEX transfer_lot_dossiers_dossier_id_idx (dossier_id),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE transfer_movements (
  id INTEGER NOT NULL AUTO_INCREMENT,
  transfer_lot_id INTEGER NOT NULL,
  reference VARCHAR(191) NOT NULL,
  type ENUM('SORTIE', 'RECEPTION', 'RETOUR') NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  from_site_id INTEGER NOT NULL,
  to_site_id INTEGER NOT NULL,
  observations TEXT NULL,
  created_by_id INTEGER NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX transfer_movements_reference_key (reference),
  INDEX transfer_movements_transfer_lot_id_occurred_at_idx (transfer_lot_id, occurred_at),
  INDEX transfer_movements_created_by_id_idx (created_by_id),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE transfer_movement_items (
  id INTEGER NOT NULL AUTO_INCREMENT,
  movement_id INTEGER NOT NULL,
  transfer_lot_item_id INTEGER NOT NULL,
  status_before ENUM('PREVU', 'SORTI', 'RECU', 'RETOURNE') NOT NULL,
  status_after ENUM('PREVU', 'SORTI', 'RECU', 'RETOURNE') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX transfer_movement_items_movement_item_key (movement_id, transfer_lot_item_id),
  INDEX transfer_movement_items_transfer_lot_item_id_idx (transfer_lot_item_id),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE transfer_signatures (
  id INTEGER NOT NULL AUTO_INCREMENT,
  movement_id INTEGER NOT NULL,
  party ENUM('MINISTERE', 'CEIBAC') NOT NULL,
  signatory_name VARCHAR(191) NOT NULL,
  signatory_title VARCHAR(191) NOT NULL,
  signature_data LONGTEXT NOT NULL,
  captured_by_id INTEGER NOT NULL,
  signed_at DATETIME(3) NOT NULL,
  ip_address VARCHAR(191) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX transfer_signatures_movement_id_party_key (movement_id, party),
  INDEX transfer_signatures_captured_by_id_idx (captured_by_id),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE transfer_lots ADD CONSTRAINT transfer_lots_source_site_id_fkey FOREIGN KEY (source_site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE transfer_lots ADD CONSTRAINT transfer_lots_source_entrepot_id_fkey FOREIGN KEY (source_entrepot_id) REFERENCES entrepots(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE transfer_lots ADD CONSTRAINT transfer_lots_destination_site_id_fkey FOREIGN KEY (destination_site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE transfer_lots ADD CONSTRAINT transfer_lots_destination_entrepot_id_fkey FOREIGN KEY (destination_entrepot_id) REFERENCES entrepots(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE transfer_lots ADD CONSTRAINT transfer_lots_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE transfer_lots ADD CONSTRAINT transfer_lots_authorized_by_id_fkey FOREIGN KEY (authorized_by_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE transfer_lot_items ADD CONSTRAINT transfer_lot_items_transfer_lot_id_fkey FOREIGN KEY (transfer_lot_id) REFERENCES transfer_lots(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE transfer_lot_dossiers ADD CONSTRAINT transfer_lot_dossiers_transfer_lot_item_id_fkey FOREIGN KEY (transfer_lot_item_id) REFERENCES transfer_lot_items(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE transfer_lot_dossiers ADD CONSTRAINT transfer_lot_dossiers_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE transfer_movements ADD CONSTRAINT transfer_movements_transfer_lot_id_fkey FOREIGN KEY (transfer_lot_id) REFERENCES transfer_lots(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE transfer_movements ADD CONSTRAINT transfer_movements_from_site_id_fkey FOREIGN KEY (from_site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE transfer_movements ADD CONSTRAINT transfer_movements_to_site_id_fkey FOREIGN KEY (to_site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE transfer_movements ADD CONSTRAINT transfer_movements_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE transfer_movement_items ADD CONSTRAINT transfer_movement_items_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES transfer_movements(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE transfer_movement_items ADD CONSTRAINT transfer_movement_items_transfer_lot_item_id_fkey FOREIGN KEY (transfer_lot_item_id) REFERENCES transfer_lot_items(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE transfer_signatures ADD CONSTRAINT transfer_signatures_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES transfer_movements(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE transfer_signatures ADD CONSTRAINT transfer_signatures_captured_by_id_fkey FOREIGN KEY (captured_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
