-- Add the read-only executive role used by the global dashboards.
INSERT INTO roles (code, name, description, created_at, updated_at)
VALUES ('EXECUTIF', 'Exécutif', 'Lecture seule des tableaux de bord globaux de pilotage.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    updated_at = CURRENT_TIMESTAMP(3);

-- Executive sessions deliberately receive no operational or administrative permission.
INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP(3)
FROM roles r
JOIN permissions p ON p.code = 'DASHBOARD_VIEW'
WHERE r.code = 'EXECUTIF';
