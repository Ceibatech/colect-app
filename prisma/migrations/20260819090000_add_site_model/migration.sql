-- AlterTable
ALTER TABLE `dossiers` ADD COLUMN `site_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `type_site` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `date_mise_en_service` DATETIME(3) NULL,
    `responsable` VARCHAR(191) NULL,
    `telephone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `adresse` TEXT NULL,
    `commune_id` INTEGER NULL,
    `quartier` VARCHAR(191) NULL,
    `ville` VARCHAR(191) NULL,
    `region` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sites_code_key`(`code`),
    INDEX `sites_commune_id_idx`(`commune_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `dossiers_site_id_idx` ON `dossiers`(`site_id`);

-- AddForeignKey
ALTER TABLE `sites` ADD CONSTRAINT `sites_commune_id_fkey` FOREIGN KEY (`commune_id`) REFERENCES `communes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dossiers` ADD CONSTRAINT `dossiers_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
