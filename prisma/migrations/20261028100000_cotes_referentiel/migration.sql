-- Cotes du référentiel de classement MULCV (2010-KOU-0001, 2010-KOU-0001-012).
ALTER TABLE `communes` ADD COLUMN `sigle` VARCHAR(6) NULL;
CREATE UNIQUE INDEX `communes_sigle_key` ON `communes`(`sigle`);

ALTER TABLE `cartons`
  ADD COLUMN `cote` VARCHAR(40) NULL,
  ADD COLUMN `cote_prefixe` VARCHAR(20) NULL,
  ADD COLUMN `cote_sequence` INTEGER NULL;
CREATE UNIQUE INDEX `cartons_cote_key` ON `cartons`(`cote`);
CREATE UNIQUE INDEX `cartons_cote_prefixe_cote_sequence_key` ON `cartons`(`cote_prefixe`, `cote_sequence`);

ALTER TABLE `dossiers`
  ADD COLUMN `rang_carton` INTEGER NULL,
  ADD COLUMN `cote` VARCHAR(50) NULL;
CREATE UNIQUE INDEX `dossiers_cote_key` ON `dossiers`(`cote`);
CREATE UNIQUE INDEX `dossiers_carton_id_rang_carton_key` ON `dossiers`(`carton_id`, `rang_carton`);
