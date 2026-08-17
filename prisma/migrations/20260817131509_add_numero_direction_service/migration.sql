-- AlterTable
ALTER TABLE `dossiers` ADD COLUMN `numero_direction_service` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `dossiers_numero_direction_service_idx` ON `dossiers`(`numero_direction_service`);
