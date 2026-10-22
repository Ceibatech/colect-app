-- La préparation devient une file de travail partagée. L'auteur de
-- l'inventaire (`operateur_id`) reste inchangé ; ces colonnes tracent
-- séparément l'agent ayant renseigné la préparation et sa soumission.
ALTER TABLE `dossiers`
  ADD COLUMN `preparateur_id` INTEGER NULL,
  ADD COLUMN `date_soumission_preparation` DATETIME(3) NULL,
  ADD COLUMN `observations_preparation` TEXT NULL;

CREATE INDEX `dossiers_preparateur_id_idx` ON `dossiers`(`preparateur_id`);

ALTER TABLE `dossiers`
  ADD CONSTRAINT `dossiers_preparateur_id_fkey`
  FOREIGN KEY (`preparateur_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
