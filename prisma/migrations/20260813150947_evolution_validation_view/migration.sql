-- Vue manquante ajoutée en Phase 9 (Dashboard) : évolution mensuelle de la
-- validation (§48 item 2), sur le même modèle que vw_evolution_numerisation
-- / vw_evolution_indexation / vw_evolution_archivage créées en Phase 2.
DROP VIEW IF EXISTS vw_evolution_validation;
CREATE VIEW vw_evolution_validation AS
SELECT DATE_FORMAT(date_validation, '%Y-%m') AS mois, COUNT(*) AS total
FROM dossiers
WHERE date_validation IS NOT NULL AND statut_validation = 'VALIDE'
GROUP BY DATE_FORMAT(date_validation, '%Y-%m')
ORDER BY mois;
