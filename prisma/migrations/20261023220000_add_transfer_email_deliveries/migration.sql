CREATE TABLE `transfer_email_deliveries` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `recipient_user_id` INTEGER NOT NULL,
  `event_type` VARCHAR(48) NOT NULL,
  `entity_type` VARCHAR(32) NOT NULL,
  `entity_id` INTEGER NOT NULL,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `payload` JSON NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `next_attempt_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_attempt_at` DATETIME(3) NULL,
  `provider_message_id` VARCHAR(191) NULL,
  `error_message` TEXT NULL,
  `sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `transfer_email_deliveries_idempotency_key_key`(`idempotency_key`),
  INDEX `transfer_email_deliveries_recipient_user_id_created_at_idx`(`recipient_user_id`, `created_at`),
  INDEX `transfer_email_deliveries_event_type_entity_type_entity_id_idx`(`event_type`, `entity_type`, `entity_id`),
  INDEX `transfer_email_deliveries_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `transfer_email_deliveries`
  ADD CONSTRAINT `transfer_email_deliveries_recipient_user_id_fkey`
  FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
