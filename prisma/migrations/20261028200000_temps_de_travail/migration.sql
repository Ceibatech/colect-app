-- Temps de travail : minutes actives par personne, jour et activité.
CREATE TABLE `activite_temps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `jour` DATE NOT NULL,
    `activite` VARCHAR(30) NOT NULL,
    `minutes` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `activite_temps_jour_idx`(`jour`),
    UNIQUE INDEX `activite_temps_user_id_jour_activite_key`(`user_id`, `jour`, `activite`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `presence_utilisateurs` (
    `user_id` INTEGER NOT NULL,
    `last_beat_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `activite_temps` ADD CONSTRAINT `activite_temps_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `presence_utilisateurs` ADD CONSTRAINT `presence_utilisateurs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
