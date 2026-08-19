-- AlterTable
ALTER TABLE `sites` ADD COLUMN `adresse_gps` TEXT NULL,
    ADD COLUMN `altitude` DOUBLE NULL,
    ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `point_gps` VARCHAR(191) NULL,
    ADD COLUMN `precision_gps` DOUBLE NULL;

-- AlterTable
ALTER TABLE `dossiers` ADD COLUMN `entrepot_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `entrepots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `type_entrepot` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `annee_mise_en_service` INTEGER NULL,
    `responsable` VARCHAR(191) NULL,
    `telephone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `entrepots_code_key`(`code`),
    INDEX `entrepots_site_id_idx`(`site_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `dossiers_entrepot_id_idx` ON `dossiers`(`entrepot_id`);

-- AddForeignKey
ALTER TABLE `entrepots` ADD CONSTRAINT `entrepots_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dossiers` ADD CONSTRAINT `dossiers_entrepot_id_fkey` FOREIGN KEY (`entrepot_id`) REFERENCES `entrepots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
