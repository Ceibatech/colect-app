-- Une préparation est désormais ventilée par type de pièce. Les colonnes
-- agrégées historiques restent sur dossiers pour les tableaux de bord et
-- pour lire les préparations antérieures à cette migration.
ALTER TABLE `dossiers`
  ADD COLUMN `preparation_claimed_at` DATETIME(3) NULL;

CREATE TABLE `preparation_piece_lines` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `dossier_id` INTEGER NOT NULL,
  `type_piece_id` INTEGER NOT NULL,
  `nombre_pieces` INTEGER NOT NULL,
  `nombre_pages` INTEGER NOT NULL,
  `prepared_by_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `preparation_piece_lines_dossier_id_type_piece_id_key` (`dossier_id`, `type_piece_id`),
  INDEX `preparation_piece_lines_type_piece_id_idx` (`type_piece_id`),
  INDEX `preparation_piece_lines_prepared_by_id_idx` (`prepared_by_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `preparation_piece_lines`
  ADD CONSTRAINT `preparation_piece_lines_dossier_id_fkey`
  FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `preparation_piece_lines`
  ADD CONSTRAINT `preparation_piece_lines_type_piece_id_fkey`
  FOREIGN KEY (`type_piece_id`) REFERENCES `types_piece`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `preparation_piece_lines`
  ADD CONSTRAINT `preparation_piece_lines_prepared_by_id_fkey`
  FOREIGN KEY (`prepared_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
