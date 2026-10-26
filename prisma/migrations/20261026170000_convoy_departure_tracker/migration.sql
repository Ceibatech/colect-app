-- Fiche de départ des convois et identifiants Traccar Client.
-- AlterTable
ALTER TABLE `transfer_convoy_events` ADD COLUMN `details` JSON NULL;

-- CreateTable
CREATE TABLE `convoy_tracker_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NULL,

    UNIQUE INDEX `convoy_tracker_tokens_user_id_key`(`user_id`),
    UNIQUE INDEX `convoy_tracker_tokens_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `convoy_tracker_tokens` ADD CONSTRAINT `convoy_tracker_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
