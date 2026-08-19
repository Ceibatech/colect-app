-- AlterTable
ALTER TABLE `dossiers` ADD COLUMN `autres_pieces` TEXT NULL,
    ADD COLUMN `nombre_pieces` INTEGER NULL;

-- CreateTable
CREATE TABLE `types_piece` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `libelle` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `types_piece_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_DossierTypesPieces` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_DossierTypesPieces_AB_unique`(`A`, `B`),
    INDEX `_DossierTypesPieces_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `_DossierTypesPieces` ADD CONSTRAINT `_DossierTypesPieces_A_fkey` FOREIGN KEY (`A`) REFERENCES `dossiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_DossierTypesPieces` ADD CONSTRAINT `_DossierTypesPieces_B_fkey` FOREIGN KEY (`B`) REFERENCES `types_piece`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
