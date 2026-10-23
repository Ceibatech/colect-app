CREATE TABLE `email_report_subscriptions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `frequency` VARCHAR(16) NOT NULL DEFAULT 'WEEKLY',
  `day_of_week` INTEGER NOT NULL DEFAULT 1,
  `day_of_month` INTEGER NOT NULL DEFAULT 1,
  `hour_utc` INTEGER NOT NULL DEFAULT 7,
  `include_points` BOOLEAN NOT NULL DEFAULT true,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `next_send_at` DATETIME(3) NOT NULL,
  `last_sent_at` DATETIME(3) NULL,
  `created_by_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `email_report_subscriptions_user_id_key`(`user_id`),
  INDEX `email_report_subscriptions_is_active_next_send_at_idx`(`is_active`, `next_send_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `email_report_deliveries` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `subscription_id` INTEGER NOT NULL,
  `recipient_user_id` INTEGER NOT NULL,
  `triggered_by_id` INTEGER NULL,
  `trigger_type` VARCHAR(16) NOT NULL,
  `scheduled_for` DATETIME(3) NOT NULL,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `provider_message_id` VARCHAR(191) NULL,
  `error_message` TEXT NULL,
  `sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `email_report_deliveries_idempotency_key_key`(`idempotency_key`),
  INDEX `email_report_deliveries_subscription_id_created_at_idx`(`subscription_id`, `created_at`),
  INDEX `email_report_deliveries_recipient_user_id_created_at_idx`(`recipient_user_id`, `created_at`),
  INDEX `email_report_deliveries_status_created_at_idx`(`status`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `email_report_subscriptions`
  ADD CONSTRAINT `email_report_subscriptions_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `email_report_subscriptions_created_by_id_fkey`
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `email_report_deliveries`
  ADD CONSTRAINT `email_report_deliveries_subscription_id_fkey`
  FOREIGN KEY (`subscription_id`) REFERENCES `email_report_subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `email_report_deliveries_recipient_user_id_fkey`
  FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `email_report_deliveries_triggered_by_id_fkey`
  FOREIGN KEY (`triggered_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
