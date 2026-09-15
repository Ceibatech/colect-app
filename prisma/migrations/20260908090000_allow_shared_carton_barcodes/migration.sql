-- One physical carton can contain several dossier records. The barcode now
-- groups those records instead of identifying a single dossier.
DROP INDEX `dossiers_code_barres_key` ON `dossiers`;

CREATE INDEX `dossiers_code_barres_idx` ON `dossiers`(`code_barres`);
