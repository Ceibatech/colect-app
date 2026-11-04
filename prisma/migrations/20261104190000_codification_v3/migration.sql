-- Codification FONCTION V3 : identifiant figé des communes (RGPH) et ancienne cote en alias.
ALTER TABLE `communes`
  ADD COLUMN `identifiant` CHAR(3) NULL,
  ADD COLUMN `district` VARCHAR(80) NULL,
  ADD COLUMN `region` VARCHAR(80) NULL,
  ADD COLUMN `departement` VARCHAR(80) NULL;
CREATE UNIQUE INDEX `communes_identifiant_key` ON `communes`(`identifiant`);

ALTER TABLE `cartons` ADD COLUMN `cote_ancienne` VARCHAR(40) NULL;
CREATE UNIQUE INDEX `cartons_cote_ancienne_key` ON `cartons`(`cote_ancienne`);

ALTER TABLE `dossiers` ADD COLUMN `cote_ancienne` VARCHAR(50) NULL;
CREATE UNIQUE INDEX `dossiers_cote_ancienne_key` ON `dossiers`(`cote_ancienne`);
