-- AlterTable
ALTER TABLE `dossiers` ADD COLUMN `etat_carton` ENUM('BON_ETAT', 'DEGRADE') NULL,
    ADD COLUMN `etat_carton_description` TEXT NULL,
    ADD COLUMN `etat_dossier` ENUM('BON_ETAT', 'DEGRADE') NULL,
    ADD COLUMN `etat_dossier_description` TEXT NULL;
