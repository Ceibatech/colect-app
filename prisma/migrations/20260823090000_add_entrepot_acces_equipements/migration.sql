-- AlterTable
ALTER TABLE `entrepots` ADD COLUMN `acces_libre` BOOLEAN NULL,
    ADD COLUMN `acces_weekend` VARCHAR(191) NULL,
    ADD COLUMN `autorisation_necessaire` BOOLEAN NULL,
    ADD COLUMN `badge_necessaire` BOOLEAN NULL,
    ADD COLUMN `contact_urgence` VARCHAR(191) NULL,
    ADD COLUMN `controle_identite` BOOLEAN NULL,
    ADD COLUMN `horaire_fermeture` VARCHAR(191) NULL,
    ADD COLUMN `horaire_ouverture` VARCHAR(191) NULL,
    ADD COLUMN `jours_acces` VARCHAR(191) NULL,
    ADD COLUMN `responsable_acces` VARCHAR(191) NULL,
    ADD COLUMN `type_acces` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `equipements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entrepot_id` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `marque` VARCHAR(191) NULL,
    `quantite` INTEGER NULL DEFAULT 1,
    `etat` ENUM('BON_ETAT', 'DEGRADE') NULL,
    `date_acquisition` DATETIME(3) NULL,
    `date_dernier_controle` DATETIME(3) NULL,
    `date_prochaine_maintenance` DATETIME(3) NULL,
    `observation` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `equipements_entrepot_id_idx`(`entrepot_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `equipements` ADD CONSTRAINT `equipements_entrepot_id_fkey` FOREIGN KEY (`entrepot_id`) REFERENCES `entrepots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
