-- Jalons de départ et d'arrivée des convois.
-- CreateTable
CREATE TABLE `transfer_convoy_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transfer_lot_id` INTEGER NOT NULL,
    `type` ENUM('DEPART', 'ARRIVEE') NOT NULL,
    `user_id` INTEGER NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `automatic` BOOLEAN NOT NULL DEFAULT false,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `transfer_convoy_events_transfer_lot_id_occurred_at_idx`(`transfer_lot_id`, `occurred_at`),
    INDEX `transfer_convoy_events_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `transfer_convoy_events` ADD CONSTRAINT `transfer_convoy_events_transfer_lot_id_fkey` FOREIGN KEY (`transfer_lot_id`) REFERENCES `transfer_lots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfer_convoy_events` ADD CONSTRAINT `transfer_convoy_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
