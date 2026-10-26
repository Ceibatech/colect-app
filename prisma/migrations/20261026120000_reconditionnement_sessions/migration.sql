-- Reconditionnement par dossier : chaque agent prend un dossier à la fois ;
-- on garde qui, sur quel dossier, combien de temps et sa réponse de fin.
-- CreateTable
CREATE TABLE `reconditionnement_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dossier_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` DATETIME(3) NULL,
    `duration_seconds` INTEGER NULL,
    `etat_remise` ENUM('ETAT_INITIAL', 'AVEC_RESERVE') NULL,
    `abandoned` BOOLEAN NOT NULL DEFAULT false,
    `observations` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reconditionnement_sessions_dossier_id_idx`(`dossier_id`),
    INDEX `reconditionnement_sessions_user_id_finished_at_idx`(`user_id`, `finished_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reconditionnement_sessions` ADD CONSTRAINT `reconditionnement_sessions_dossier_id_fkey` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reconditionnement_sessions` ADD CONSTRAINT `reconditionnement_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
