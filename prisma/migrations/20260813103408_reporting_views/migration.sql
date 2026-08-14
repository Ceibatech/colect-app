-- ================================================================
-- Vues SQL de reporting — MBPE-CABINET
-- Ce fichier est la source de vérité ; son contenu est copié tel quel
-- dans une migration Prisma dédiée (prisma/migrations/..._reporting_views)
-- afin que les vues restent reproductibles via `prisma migrate deploy`.
-- ================================================================

DROP VIEW IF EXISTS vw_dashboard_global;
CREATE VIEW vw_dashboard_global AS
SELECT
  COUNT(*)                                                              AS total_dossiers,
  SUM(CASE WHEN statut_collecte = 'SOUMIS' THEN 1 ELSE 0 END)           AS total_soumis,
  SUM(CASE WHEN statut_validation = 'EN_CONTROLE' THEN 1 ELSE 0 END)    AS total_en_controle,
  SUM(CASE WHEN statut_validation = 'VALIDE' THEN 1 ELSE 0 END)         AS total_valides,
  SUM(CASE WHEN statut_validation = 'REJETE' THEN 1 ELSE 0 END)         AS total_rejetes,
  SUM(CASE WHEN statut_numerisation = 'TERMINE' THEN 1 ELSE 0 END)      AS total_numerises,
  SUM(CASE WHEN statut_indexation = 'TERMINE' THEN 1 ELSE 0 END)        AS total_indexes,
  SUM(CASE WHEN statut_archivage = 'TERMINE' THEN 1 ELSE 0 END)         AS total_archives
FROM dossiers;

DROP VIEW IF EXISTS vw_dossiers_par_commune;
CREATE VIEW vw_dossiers_par_commune AS
SELECT
  c.id                                                                  AS commune_id,
  c.code                                                                AS commune_code,
  c.nom                                                                 AS commune_nom,
  COUNT(d.id)                                                           AS total_dossiers,
  SUM(CASE WHEN d.statut_archivage = 'TERMINE' THEN 1 ELSE 0 END)       AS total_archives
FROM communes c
LEFT JOIN dossiers d ON d.commune_id = c.id
GROUP BY c.id, c.code, c.nom;

DROP VIEW IF EXISTS vw_dossiers_par_operateur;
CREATE VIEW vw_dossiers_par_operateur AS
SELECT
  o.id                                                                  AS operateur_id,
  o.matricule                                                          AS operateur_matricule,
  o.nom                                                                 AS operateur_nom,
  COUNT(d.id)                                                           AS total_dossiers,
  SUM(CASE WHEN d.statut_collecte = 'SOUMIS' THEN 1 ELSE 0 END)         AS total_soumis,
  SUM(CASE WHEN d.statut_validation = 'VALIDE' THEN 1 ELSE 0 END)       AS total_valides,
  SUM(CASE WHEN d.statut_validation = 'REJETE' THEN 1 ELSE 0 END)       AS total_rejetes,
  SUM(CASE WHEN d.statut_numerisation = 'TERMINE' THEN 1 ELSE 0 END)    AS total_numerises,
  SUM(CASE WHEN d.statut_indexation = 'TERMINE' THEN 1 ELSE 0 END)      AS total_indexes,
  SUM(CASE WHEN d.statut_archivage = 'TERMINE' THEN 1 ELSE 0 END)       AS total_archives
FROM operateurs o
LEFT JOIN dossiers d ON d.operateur_id = o.id
GROUP BY o.id, o.matricule, o.nom;

DROP VIEW IF EXISTS vw_dossiers_par_statut;
CREATE VIEW vw_dossiers_par_statut AS
SELECT statut_collecte AS statut, 'COLLECTE' AS workflow_type, COUNT(*) AS total FROM dossiers GROUP BY statut_collecte
UNION ALL
SELECT statut_validation, 'VALIDATION', COUNT(*) FROM dossiers GROUP BY statut_validation
UNION ALL
SELECT statut_numerisation, 'NUMERISATION', COUNT(*) FROM dossiers GROUP BY statut_numerisation
UNION ALL
SELECT statut_indexation, 'INDEXATION', COUNT(*) FROM dossiers GROUP BY statut_indexation
UNION ALL
SELECT statut_archivage, 'ARCHIVAGE', COUNT(*) FROM dossiers GROUP BY statut_archivage;

DROP VIEW IF EXISTS vw_evolution_collecte;
CREATE VIEW vw_evolution_collecte AS
SELECT DATE_FORMAT(created_at, '%Y-%m') AS mois, COUNT(*) AS total
FROM dossiers
GROUP BY DATE_FORMAT(created_at, '%Y-%m')
ORDER BY mois;

DROP VIEW IF EXISTS vw_evolution_numerisation;
CREATE VIEW vw_evolution_numerisation AS
SELECT DATE_FORMAT(date_numerisation, '%Y-%m') AS mois, COUNT(*) AS total
FROM dossiers
WHERE date_numerisation IS NOT NULL
GROUP BY DATE_FORMAT(date_numerisation, '%Y-%m')
ORDER BY mois;

DROP VIEW IF EXISTS vw_evolution_indexation;
CREATE VIEW vw_evolution_indexation AS
SELECT DATE_FORMAT(date_indexation, '%Y-%m') AS mois, COUNT(*) AS total
FROM dossiers
WHERE date_indexation IS NOT NULL
GROUP BY DATE_FORMAT(date_indexation, '%Y-%m')
ORDER BY mois;

DROP VIEW IF EXISTS vw_evolution_archivage;
CREATE VIEW vw_evolution_archivage AS
SELECT DATE_FORMAT(date_archivage, '%Y-%m') AS mois, COUNT(*) AS total
FROM dossiers
WHERE date_archivage IS NOT NULL
GROUP BY DATE_FORMAT(date_archivage, '%Y-%m')
ORDER BY mois;
