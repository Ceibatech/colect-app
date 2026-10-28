-- Métadonnées de la série 2000 du référentiel MULCV contrôlées à l'inventaire.
ALTER TABLE `dossiers`
  ADD COLUMN `sans_titre_foncier` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `annee_acte` INTEGER NULL;
