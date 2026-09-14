-- Finance and PMO are read-focused roles with dedicated permissions.
INSERT INTO permissions (code, name, description, created_at, updated_at) VALUES
  ('FINANCE_VIEW', 'Consulter le pilotage financier', 'Accès aux points et projections budgétaires.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('FINANCE_CONFIGURE', 'Configurer les barèmes financiers', 'Création de barèmes datés par point.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('PMO_VIEW', 'Consulter le pilotage PMO', 'Accès au portefeuille PMO affecté.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  updated_at = CURRENT_TIMESTAMP(3);

INSERT INTO roles (code, name, description, created_at, updated_at) VALUES
  ('FINANCE', 'Finance', 'Pilotage des points, barèmes et projections budgétaires.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('PMO', 'PMO', 'Pilotage en lecture seule du périmètre de superviseurs affecté.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  updated_at = CURRENT_TIMESTAMP(3);

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP(3)
FROM roles r
JOIN permissions p
WHERE (r.code = 'ADMIN' AND p.code IN ('FINANCE_VIEW', 'FINANCE_CONFIGURE', 'PMO_VIEW'))
   OR (r.code = 'FINANCE' AND p.code IN ('DASHBOARD_VIEW', 'FINANCE_VIEW', 'FINANCE_CONFIGURE'))
   OR (r.code = 'PMO' AND p.code IN ('DASHBOARD_VIEW', 'PMO_VIEW'));

CREATE TABLE pmo_supervisor_scopes (
  id INTEGER NOT NULL AUTO_INCREMENT,
  pmo_user_id INTEGER NOT NULL,
  supervisor_user_id INTEGER NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX pmo_supervisor_scopes_pmo_user_id_supervisor_user_id_key (pmo_user_id, supervisor_user_id),
  INDEX pmo_supervisor_scopes_supervisor_user_id_idx (supervisor_user_id),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE finance_rates (
  id INTEGER NOT NULL AUTO_INCREMENT,
  operator_point_value DECIMAL(14, 2) NOT NULL,
  supervisor_point_value DECIMAL(14, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'XOF',
  effective_from DATETIME(3) NOT NULL,
  effective_to DATETIME(3) NULL,
  created_by_id INTEGER NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX finance_rates_effective_from_key (effective_from),
  INDEX finance_rates_effective_from_effective_to_idx (effective_from, effective_to),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE pmo_supervisor_scopes
  ADD CONSTRAINT pmo_supervisor_scopes_pmo_user_id_fkey
  FOREIGN KEY (pmo_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE pmo_supervisor_scopes
  ADD CONSTRAINT pmo_supervisor_scopes_supervisor_user_id_fkey
  FOREIGN KEY (supervisor_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE finance_rates
  ADD CONSTRAINT finance_rates_created_by_id_fkey
  FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
