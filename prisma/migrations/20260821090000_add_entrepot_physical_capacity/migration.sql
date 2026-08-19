-- AlterTable
ALTER TABLE `entrepots` ADD COLUMN `capacite_boites_max` INTEGER NULL,
    ADD COLUMN `capacite_cartons_max` INTEGER NULL,
    ADD COLUMN `capacite_theorique` INTEGER NULL,
    ADD COLUMN `hauteur_sous_plafond` DOUBLE NULL,
    ADD COLUMN `largeur` DOUBLE NULL,
    ADD COLUMN `longueur` DOUBLE NULL,
    ADD COLUMN `nombre_etageres` INTEGER NULL,
    ADD COLUMN `nombre_niveaux` INTEGER NULL,
    ADD COLUMN `nombre_rayonnages` INTEGER NULL,
    ADD COLUMN `nombre_salles` INTEGER NULL,
    ADD COLUMN `nombre_travees` INTEGER NULL,
    ADD COLUMN `nombre_zones_archivage` INTEGER NULL,
    ADD COLUMN `surface_m2` DOUBLE NULL;
