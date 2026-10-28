-- Caisses de rangement des cartons sur un site CEIBA (40 cartons par caisse).
ALTER TABLE `cartons` ADD COLUMN `caisse_id` INTEGER NULL,
    ADD COLUMN `mis_en_caisse_at` DATETIME(3) NULL;
CREATE TABLE `caisses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numero` VARCHAR(40) NOT NULL,
    `description` VARCHAR(255) NULL,
    `capacite` INTEGER NOT NULL DEFAULT 40,
    `site_id` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `caisses_numero_key`(`numero`),
    INDEX `caisses_site_id_idx`(`site_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `caisse_mouvements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `caisse_id` INTEGER NOT NULL,
    `carton_id` INTEGER NOT NULL,
    `type` ENUM('RANGEMENT', 'RETRAIT') NOT NULL,
    `user_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `caisse_mouvements_caisse_id_created_at_idx`(`caisse_id`, `created_at`),
    INDEX `caisse_mouvements_carton_id_idx`(`carton_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE INDEX `cartons_caisse_id_idx` ON `cartons`(`caisse_id`);
ALTER TABLE `cartons` ADD CONSTRAINT `cartons_caisse_id_fkey` FOREIGN KEY (`caisse_id`) REFERENCES `caisses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `caisses` ADD CONSTRAINT `caisses_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `caisse_mouvements` ADD CONSTRAINT `caisse_mouvements_caisse_id_fkey` FOREIGN KEY (`caisse_id`) REFERENCES `caisses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `caisse_mouvements` ADD CONSTRAINT `caisse_mouvements_carton_id_fkey` FOREIGN KEY (`carton_id`) REFERENCES `cartons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `caisse_mouvements` ADD CONSTRAINT `caisse_mouvements_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
