-- AlterTable
ALTER TABLE `operateurs` ADD COLUMN `supervisor_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `operateurs_supervisor_id_idx` ON `operateurs`(`supervisor_id`);

-- AddForeignKey
ALTER TABLE `operateurs` ADD CONSTRAINT `operateurs_supervisor_id_fkey` FOREIGN KEY (`supervisor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
