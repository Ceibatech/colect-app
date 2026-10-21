-- Stockage SharePoint via Microsoft Graph et métadonnées de pré-indexation.
ALTER TABLE documents
  MODIFY storage_provider ENUM('LOCAL', 'CPANEL', 'S3', 'SHAREPOINT', 'OTHER') NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN preindex_status ENUM('A_TRAITER', 'BROUILLON', 'PRET') NOT NULL DEFAULT 'A_TRAITER',
  ADD COLUMN titre_indexation VARCHAR(191) NULL,
  ADD COLUMN reference_indexation VARCHAR(191) NULL,
  ADD COLUMN date_document DATETIME(3) NULL,
  ADD COLUMN preindex_notes TEXT NULL,
  ADD COLUMN type_piece_id INTEGER NULL,
  ADD COLUMN preindexed_by INTEGER NULL,
  ADD COLUMN preindexed_at DATETIME(3) NULL,
  ADD COLUMN external_drive_id VARCHAR(191) NULL,
  ADD COLUMN external_item_id VARCHAR(191) NULL,
  ADD COLUMN external_web_url TEXT NULL;

CREATE INDEX documents_preindex_status_idx ON documents(preindex_status);
CREATE INDEX documents_type_piece_id_idx ON documents(type_piece_id);
CREATE INDEX documents_preindexed_by_idx ON documents(preindexed_by);
CREATE UNIQUE INDEX documents_external_drive_id_external_item_id_key ON documents(external_drive_id, external_item_id);

ALTER TABLE documents
  ADD CONSTRAINT documents_type_piece_id_fkey FOREIGN KEY (type_piece_id) REFERENCES types_piece(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT documents_preindexed_by_fkey FOREIGN KEY (preindexed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
