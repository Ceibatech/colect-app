-- Versement documentaire final dans Alfresco, distinct du stockage de travail.
ALTER TABLE documents
  ADD COLUMN digital_archive_status ENUM('NON_REQUIS', 'EN_ATTENTE', 'EN_COURS', 'ARCHIVE', 'ERREUR') NOT NULL DEFAULT 'NON_REQUIS',
  ADD COLUMN alfresco_node_id VARCHAR(191) NULL,
  ADD COLUMN alfresco_web_url TEXT NULL,
  ADD COLUMN alfresco_archived_at DATETIME(3) NULL,
  ADD COLUMN alfresco_archive_error TEXT NULL,
  ADD COLUMN alfresco_archive_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_archive_attempt_at DATETIME(3) NULL;

CREATE UNIQUE INDEX documents_alfresco_node_id_key ON documents(alfresco_node_id);
CREATE INDEX documents_digital_archive_status_idx ON documents(digital_archive_status);
