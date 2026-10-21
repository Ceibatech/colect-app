-- Reserve la gestion physique des transferts a un profil dedie.
INSERT INTO roles (code, name, description, created_at, updated_at)
VALUES (
  'GESTIONNAIRE_TRANSFERT',
  'Gestionnaire des transferts',
  'Constitution des lots, mouvements de stock et bordereaux signes.',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  updated_at = CURRENT_TIMESTAMP(3);

-- Un operateur de collecte ne consulte ni ne modifie le registre de transfert.
DELETE rp
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.code = 'OPERATEUR'
  AND p.code IN ('TRANSFER_VIEW', 'TRANSFER_CREATE', 'TRANSFER_OPERATE', 'TRANSFER_AUTHORIZE');

-- Le gestionnaire constitue le lot et enregistre les mouvements signes.
-- L'autorisation reste separee et appartient au superviseur ou a l'administrateur.
INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP(3)
FROM roles r
JOIN permissions p
WHERE r.code = 'GESTIONNAIRE_TRANSFERT'
  AND p.code IN ('DASHBOARD_VIEW', 'TRANSFER_VIEW', 'TRANSFER_CREATE', 'TRANSFER_OPERATE');
