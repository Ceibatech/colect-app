-- Profil dédié aux visas du ministère, sans droits de collecte ni de gestion physique.
-- Les comptes et les droits existants du superviseur restent inchangés.
-- Aucun visa n'est fabriqué pour les lots déjà autorisés. Les lots encore SOUMIS
-- passent désormais par le contrôle CEIBAC avant leur présentation au ministère.
ALTER TABLE transfer_lots
  MODIFY status ENUM('BROUILLON', 'SOUMIS', 'VALIDE_CEIBAC', 'AUTORISE', 'PARTIELLEMENT_SORTI', 'EN_TRANSIT', 'RECU_PARTIEL', 'CHEZ_CEIBAC', 'RETOUR_PARTIEL', 'CLOTURE', 'ANNULE') NOT NULL DEFAULT 'BROUILLON',
  ADD COLUMN ceibac_validated_at DATETIME(3) NULL AFTER submitted_at,
  ADD COLUMN ceibac_validated_by_id INTEGER NULL AFTER ceibac_validated_at,
  ADD COLUMN ceibac_signatory_name VARCHAR(120) NULL AFTER ceibac_validated_by_id,
  ADD COLUMN ceibac_signatory_title VARCHAR(120) NULL AFTER ceibac_signatory_name,
  ADD COLUMN ceibac_signature_data LONGTEXT NULL AFTER ceibac_signatory_title,
  ADD INDEX transfer_lots_ceibac_validated_by_id_idx (ceibac_validated_by_id),
  ADD CONSTRAINT transfer_lots_ceibac_validated_by_id_fkey FOREIGN KEY (ceibac_validated_by_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO roles (code, name, description, created_at, updated_at)
VALUES (
  'VALIDATEUR_MINISTERE',
  'Validateur ministère',
  'Autorisation des lots de transfert et contre-signature des réceptions après visa CEIBAC.',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  updated_at = CURRENT_TIMESTAMP(3);

UPDATE roles
SET description = 'Validation des lots avant visa du ministère et contrôle des constats de réception documentaire.',
    updated_at = CURRENT_TIMESTAMP(3)
WHERE code = 'VALIDATEUR_CEIBAC';

INSERT INTO permissions (code, name, description, created_at, updated_at)
VALUES (
  'TRANSFER_CEIBAC_APPROVE',
  'Valider un lot CEIBAC',
  'Visa du responsable CEIBAC avant l’autorisation de sortie du ministère.',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  updated_at = CURRENT_TIMESTAMP(3);

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP(3)
FROM roles r
JOIN permissions p
WHERE r.code = 'VALIDATEUR_MINISTERE'
  AND p.code IN ('DASHBOARD_VIEW', 'TRANSFER_VIEW', 'TRANSFER_AUTHORIZE');

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP(3)
FROM roles r
JOIN permissions p
WHERE r.code IN ('ADMIN', 'VALIDATEUR_CEIBAC')
  AND p.code = 'TRANSFER_CEIBAC_APPROVE';
