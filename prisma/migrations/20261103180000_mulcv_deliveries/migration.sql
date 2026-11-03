-- Envois des caisses reçues chez CEIBA vers MULCV (file d'attente, idempotente).
CREATE TABLE `mulcv_deliveries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transfer_lot_id` INTEGER NOT NULL,
    `movement_id` INTEGER NULL,
    `conteneur_id` VARCHAR(64) NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `carton_count` INTEGER NOT NULL,
    `dossier_count` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_attempt_at` DATETIME(3) NULL,
    `error_message` TEXT NULL,
    `mulcv_path` VARCHAR(255) NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `mulcv_deliveries_idempotency_key_key`(`idempotency_key`),
    INDEX `mulcv_deliveries_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
    INDEX `mulcv_deliveries_transfer_lot_id_idx`(`transfer_lot_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
