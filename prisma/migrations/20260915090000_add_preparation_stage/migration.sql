-- AlterTable
ALTER TABLE `workflow_statuses` MODIFY `workflow_type` ENUM('COLLECTE', 'VALIDATION', 'PREPARATION', 'NUMERISATION', 'INDEXATION', 'ARCHIVAGE') NOT NULL;

-- AlterTable
ALTER TABLE `workflow_transitions` MODIFY `workflow_type` ENUM('COLLECTE', 'VALIDATION', 'PREPARATION', 'NUMERISATION', 'INDEXATION', 'ARCHIVAGE') NOT NULL;

-- AlterTable
ALTER TABLE `dossiers` ADD COLUMN `date_preparation` DATETIME(3) NULL,
    ADD COLUMN `statut_preparation` ENUM('EN_ATTENTE', 'EN_COURS', 'A_VALIDER', 'TERMINE', 'REJETE') NOT NULL DEFAULT 'EN_ATTENTE';

-- CreateIndex
CREATE INDEX `dossiers_statut_preparation_idx` ON `dossiers`(`statut_preparation`);

-- Retrocompatibilite (decision utilisateur, 15/09/2026) : un dossier deja
-- NUMERISE/INDEXE/ARCHIVE (donc dont statut_numerisation a depasse
-- EN_ATTENTE) a necessairement ete numerise sans jamais passer par une
-- Preparation, qui n'existait pas encore avant cette migration. On le
-- considere retroactivement comme deja prepare, sans retraitement manuel
-- attendu de l'operateur ni du superviseur (meme principe que la Phase 19+
-- pour la validation superviseur systematique).
UPDATE `dossiers`
SET `statut_preparation` = 'TERMINE'
WHERE `statut_numerisation` <> 'EN_ATTENTE';
