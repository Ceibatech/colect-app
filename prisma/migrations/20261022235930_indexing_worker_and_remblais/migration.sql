-- La référence métier correcte est REMBLAIS. Toutes les anciennes variantes
-- restent absorbées par le normaliseur applicatif.
SET @marcory_id = (
  SELECT `id` FROM `communes`
  WHERE UPPER(TRIM(`nom`)) = 'MARCORY'
  ORDER BY `is_active` DESC, `id` ASC
  LIMIT 1
);

SET @remblais_id = (
  SELECT `id` FROM `lotissements`
  WHERE `commune_id` = @marcory_id
    AND UPPER(TRIM(`nom`)) IN ('REMBLAI', 'REMBLAIS', 'MARCORY REMBLAI', 'MARCORY REMBLAIS')
  ORDER BY `is_active` DESC, `id` ASC
  LIMIT 1
);

UPDATE `dossiers` d
JOIN `lotissements` l ON l.`id` = d.`lotissement_id`
SET d.`lotissement_id` = @remblais_id,
    d.`commune_id` = @marcory_id
WHERE @remblais_id IS NOT NULL
  AND l.`commune_id` = @marcory_id
  AND UPPER(TRIM(l.`nom`)) IN ('REMBLAI', 'REMBLAIS', 'MARCORY REMBLAI', 'MARCORY REMBLAIS');

UPDATE `lotissements`
SET `nom` = 'REMBLAIS', `is_active` = TRUE, `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `id` = @remblais_id;

UPDATE `lotissements`
SET `is_active` = FALSE, `updated_at` = CURRENT_TIMESTAMP(3)
WHERE @remblais_id IS NOT NULL
  AND `commune_id` = @marcory_id
  AND `id` <> @remblais_id
  AND UPPER(TRIM(`nom`)) IN ('REMBLAI', 'REMBLAIS', 'MARCORY REMBLAI', 'MARCORY REMBLAIS');

ALTER TABLE `documents`
  MODIFY `automatic_index_status` ENUM(
    'A_TRAITER', 'EN_FILE', 'EN_COURS', 'A_VERIFIER', 'DEUXIEME_LECTURE',
    'A_REQUALIFIER', 'INDEXE', 'ERREUR'
  ) NOT NULL DEFAULT 'A_TRAITER';

ALTER TABLE `document_indexing_runs`
  MODIFY `status` ENUM(
    'A_TRAITER', 'EN_FILE', 'EN_COURS', 'A_VERIFIER', 'DEUXIEME_LECTURE',
    'A_REQUALIFIER', 'INDEXE', 'ERREUR'
  ) NOT NULL DEFAULT 'EN_COURS';

UPDATE `documents`
SET `automatic_index_status` = 'A_REQUALIFIER',
    `preindex_status` = 'PRET'
WHERE `automatic_index_status` = 'A_VERIFIER';

UPDATE `document_indexing_runs`
SET `status` = 'A_REQUALIFIER'
WHERE `status` = 'A_VERIFIER';

ALTER TABLE `documents`
  MODIFY `automatic_index_status` ENUM(
    'A_TRAITER', 'EN_FILE', 'EN_COURS', 'DEUXIEME_LECTURE',
    'A_REQUALIFIER', 'INDEXE', 'ERREUR'
  ) NOT NULL DEFAULT 'A_TRAITER';

ALTER TABLE `document_indexing_runs`
  MODIFY `status` ENUM(
    'A_TRAITER', 'EN_FILE', 'EN_COURS', 'DEUXIEME_LECTURE',
    'A_REQUALIFIER', 'INDEXE', 'ERREUR'
  ) NOT NULL DEFAULT 'EN_COURS';

CREATE TABLE `document_indexing_jobs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `document_id` INTEGER NOT NULL,
  `requested_by` INTEGER NULL,
  `status` ENUM('EN_ATTENTE', 'EN_COURS', 'TERMINE', 'ERREUR', 'ANNULE') NOT NULL DEFAULT 'EN_ATTENTE',
  `analysis_pass` ENUM('PRINCIPALE', 'SECONDE_LECTURE') NOT NULL DEFAULT 'PRINCIPALE',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `max_attempts` INTEGER NOT NULL DEFAULT 3,
  `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `locked_at` DATETIME(3) NULL,
  `worker_id` VARCHAR(191) NULL,
  `error` TEXT NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `document_indexing_jobs_status_available_at_created_at_idx`(`status`, `available_at`, `created_at`),
  INDEX `document_indexing_jobs_document_id_status_idx`(`document_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `document_indexing_jobs_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `document_indexing_jobs_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `document_derivatives` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `document_id` INTEGER NOT NULL,
  `kind` ENUM('PDFA_OCR') NOT NULL,
  `storage_provider` ENUM('LOCAL', 'CPANEL', 'S3', 'SHAREPOINT', 'OTHER') NOT NULL DEFAULT 'LOCAL',
  `storage_key` VARCHAR(191) NOT NULL,
  `url` TEXT NOT NULL,
  `mime_type` VARCHAR(191) NOT NULL,
  `size` INTEGER NOT NULL,
  `hash` VARCHAR(191) NOT NULL,
  `external_drive_id` VARCHAR(191) NULL,
  `external_item_id` VARCHAR(191) NULL,
  `external_web_url` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `document_derivatives_document_id_kind_key`(`document_id`, `kind`),
  INDEX `document_derivatives_hash_idx`(`hash`),
  PRIMARY KEY (`id`),
  CONSTRAINT `document_derivatives_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Les documents non traités entrent automatiquement dans la file. Les
-- documents historiques déjà indexés ne sont pas relancés.
INSERT INTO `document_indexing_jobs` (`document_id`, `status`, `analysis_pass`)
SELECT d.`id`, 'EN_ATTENTE', 'PRINCIPALE'
FROM `documents` d
WHERE d.`automatic_index_status` IN ('A_TRAITER', 'ERREUR')
  AND NOT EXISTS (
    SELECT 1 FROM `document_indexing_jobs` j
    WHERE j.`document_id` = d.`id` AND j.`status` IN ('EN_ATTENTE', 'EN_COURS')
  );

UPDATE `documents`
SET `automatic_index_status` = 'EN_FILE', `last_indexing_error` = NULL
WHERE `automatic_index_status` IN ('A_TRAITER', 'ERREUR');
