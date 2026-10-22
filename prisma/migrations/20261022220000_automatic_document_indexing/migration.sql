ALTER TABLE `documents`
  ADD COLUMN `automatic_index_status` ENUM('A_TRAITER', 'EN_COURS', 'A_VERIFIER', 'INDEXE', 'ERREUR') NOT NULL DEFAULT 'A_TRAITER',
  ADD COLUMN `extracted_text` LONGTEXT NULL,
  ADD COLUMN `search_text` LONGTEXT NULL,
  ADD COLUMN `indexing_confidence` DECIMAL(5, 2) NULL,
  ADD COLUMN `classification_path` TEXT NULL,
  ADD COLUMN `indexed_at` DATETIME(3) NULL,
  ADD COLUMN `last_indexing_error` TEXT NULL;

CREATE INDEX `documents_automatic_index_status_idx` ON `documents`(`automatic_index_status`);
CREATE FULLTEXT INDEX `documents_search_text_fulltext_idx` ON `documents`(`search_text`);

CREATE TABLE `indexing_fields` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `aliases` JSON NOT NULL,
  `data_type` ENUM('TEXT', 'DATE', 'NUMBER', 'IDENTIFIER') NOT NULL DEFAULT 'TEXT',
  `is_required` BOOLEAN NOT NULL DEFAULT false,
  `is_searchable` BOOLEAN NOT NULL DEFAULT true,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `indexing_fields_key_key`(`key`),
  INDEX `indexing_fields_is_active_sort_order_idx`(`is_active`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `document_index_values` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `document_id` INTEGER NOT NULL,
  `field_id` INTEGER NOT NULL,
  `value` TEXT NOT NULL,
  `raw_value` TEXT NULL,
  `confidence` DECIMAL(5, 2) NULL,
  `source` ENUM('OCR', 'DOSSIER', 'MANUAL') NOT NULL DEFAULT 'OCR',
  `validated` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `document_index_values_document_id_field_id_key`(`document_id`, `field_id`),
  INDEX `document_index_values_field_id_value_idx`(`field_id`, `value`(191)),
  PRIMARY KEY (`id`),
  CONSTRAINT `document_index_values_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `document_index_values_field_id_fkey` FOREIGN KEY (`field_id`) REFERENCES `indexing_fields`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `document_indexing_runs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `document_id` INTEGER NOT NULL,
  `triggered_by` INTEGER NULL,
  `status` ENUM('A_TRAITER', 'EN_COURS', 'A_VERIFIER', 'INDEXE', 'ERREUR') NOT NULL DEFAULT 'EN_COURS',
  `engine` VARCHAR(191) NOT NULL,
  `extracted_fields` JSON NULL,
  `extracted_text_size` INTEGER NULL,
  `confidence` DECIMAL(5, 2) NULL,
  `error` TEXT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,

  INDEX `document_indexing_runs_document_id_started_at_idx`(`document_id`, `started_at`),
  INDEX `document_indexing_runs_status_idx`(`status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `document_indexing_runs_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `document_indexing_runs_triggered_by_fkey` FOREIGN KEY (`triggered_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `indexing_fields` (`key`, `label`, `aliases`, `data_type`, `is_required`, `is_searchable`, `sort_order`) VALUES
  ('document_title', 'Titre du document', JSON_ARRAY('titre', 'intitulé', 'objet'), 'TEXT', true, true, 10),
  ('business_reference', 'Référence métier', JSON_ARRAY('référence', 'réf', 'numéro de référence'), 'IDENTIFIER', false, true, 20),
  ('document_date', 'Date du document', JSON_ARRAY('date', 'date du document', 'établi le'), 'DATE', false, true, 30),
  ('titulaire', 'Titulaire', JSON_ARRAY('titulaire', 'nom et prénoms', 'nom du titulaire'), 'TEXT', false, true, 40),
  ('commune', 'Commune', JSON_ARRAY('commune', 'localité'), 'TEXT', false, true, 50),
  ('lotissement', 'Lotissement', JSON_ARRAY('lotissement'), 'TEXT', false, true, 60),
  ('numero_lot', 'Numéro de lot', JSON_ARRAY('numéro de lot', 'n° lot', 'lot'), 'IDENTIFIER', false, true, 70),
  ('numero_ilot', 'Numéro d''îlot', JSON_ARRAY('numéro d''îlot', 'n° îlot', 'ilot', 'îlot'), 'IDENTIFIER', false, true, 80),
  ('titre_foncier', 'Titre foncier', JSON_ARRAY('titre foncier', 'tf', 'numéro titre foncier'), 'IDENTIFIER', false, true, 90),
  ('direction_service', 'Direction / service', JSON_ARRAY('direction', 'service', 'direction/service'), 'TEXT', false, true, 100),
  ('code_barres', 'Code-barres', JSON_ARRAY('code-barres', 'code barre', 'barcode'), 'IDENTIFIER', false, true, 110),
  ('nature_dossier', 'Nature du dossier', JSON_ARRAY('nature du dossier', 'nature documentaire', 'type de dossier'), 'TEXT', false, true, 120);

-- Les documents déjà contrôlés restent valides. Leur index minimal rend
-- immédiatement leurs métadonnées historiques interrogeables.
UPDATE `documents`
SET
  `automatic_index_status` = 'INDEXE',
  `search_text` = CONCAT_WS('\n', `nom_original`, `titre_indexation`, `reference_indexation`),
  `indexed_at` = COALESCE(`preindexed_at`, `updated_at`)
WHERE `preindex_status` = 'PRET';
