-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `permissions_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role_id` INTEGER NOT NULL,
    `permission_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `role_permissions_permission_id_idx`(`permission_id`),
    UNIQUE INDEX `role_permissions_role_id_permission_id_key`(`role_id`, `permission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role_id` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_id_idx`(`role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operateurs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `matricule` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `prenoms` VARCHAR(191) NULL,
    `telephone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `operateurs_user_id_key`(`user_id`),
    UNIQUE INDEX `operateurs_matricule_key`(`matricule`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `communes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `communes_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lotissements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `commune_id` INTEGER NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lotissements_code_key`(`code`),
    INDEX `lotissements_commune_id_idx`(`commune_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `natures_dossier` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `libelle` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `natures_dossier_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_statuses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workflow_type` ENUM('COLLECTE', 'VALIDATION', 'NUMERISATION', 'INDEXATION', 'ARCHIVAGE') NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `libelle` VARCHAR(191) NOT NULL,
    `ordre` INTEGER NOT NULL,
    `is_final` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workflow_statuses_workflow_type_code_key`(`workflow_type`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_transitions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dossier_id` INTEGER NOT NULL,
    `workflow_type` ENUM('COLLECTE', 'VALIDATION', 'NUMERISATION', 'INDEXATION', 'ARCHIVAGE') NOT NULL,
    `from_status` VARCHAR(191) NULL,
    `to_status` VARCHAR(191) NOT NULL,
    `user_id` INTEGER NULL,
    `commentaire` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workflow_transitions_dossier_id_workflow_type_idx`(`dossier_id`, `workflow_type`),
    INDEX `workflow_transitions_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dossier_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dossier_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `action` VARCHAR(191) NOT NULL,
    `ancien_statut` VARCHAR(191) NULL,
    `nouveau_statut` VARCHAR(191) NULL,
    `commentaire` TEXT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dossier_history_dossier_id_created_at_idx`(`dossier_id`, `created_at`),
    INDEX `dossier_history_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dossiers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reference` VARCHAR(191) NOT NULL,
    `operateur_id` INTEGER NOT NULL,
    `libelle_carton` VARCHAR(191) NULL,
    `code_barres` VARCHAR(191) NULL,
    `numero_guichet` VARCHAR(191) NULL,
    `numero_ddu` VARCHAR(191) NULL,
    `reference_classement` VARCHAR(191) NULL,
    `numero_ilot` VARCHAR(191) NULL,
    `numero_lot` VARCHAR(191) NULL,
    `superficie` DECIMAL(12, 2) NULL,
    `numero_titre_foncier` VARCHAR(191) NULL,
    `commune_id` INTEGER NULL,
    `lotissement_id` INTEGER NULL,
    `nature_dossier_id` INTEGER NULL,
    `nom` VARCHAR(191) NULL,
    `prenoms` VARCHAR(191) NULL,
    `adresse` TEXT NULL,
    `telephone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `personne_contact` VARCHAR(191) NULL,
    `mobile` VARCHAR(191) NULL,
    `statut_collecte` ENUM('BROUILLON', 'SOUMIS') NOT NULL DEFAULT 'BROUILLON',
    `statut_validation` ENUM('EN_ATTENTE', 'EN_CONTROLE', 'VALIDE', 'REJETE') NOT NULL DEFAULT 'EN_ATTENTE',
    `statut_numerisation` ENUM('EN_ATTENTE', 'EN_COURS', 'TERMINE') NOT NULL DEFAULT 'EN_ATTENTE',
    `statut_indexation` ENUM('EN_ATTENTE', 'EN_COURS', 'TERMINE') NOT NULL DEFAULT 'EN_ATTENTE',
    `statut_archivage` ENUM('EN_ATTENTE', 'EN_COURS', 'TERMINE') NOT NULL DEFAULT 'EN_ATTENTE',
    `date_soumission` DATETIME(3) NULL,
    `date_validation` DATETIME(3) NULL,
    `date_numerisation` DATETIME(3) NULL,
    `date_indexation` DATETIME(3) NULL,
    `date_archivage` DATETIME(3) NULL,
    `nombrePages` INTEGER NULL,
    `observations` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dossiers_reference_key`(`reference`),
    UNIQUE INDEX `dossiers_code_barres_key`(`code_barres`),
    INDEX `dossiers_numero_ddu_idx`(`numero_ddu`),
    INDEX `dossiers_numero_guichet_idx`(`numero_guichet`),
    INDEX `dossiers_reference_classement_idx`(`reference_classement`),
    INDEX `dossiers_numero_ilot_idx`(`numero_ilot`),
    INDEX `dossiers_numero_lot_idx`(`numero_lot`),
    INDEX `dossiers_numero_titre_foncier_idx`(`numero_titre_foncier`),
    INDEX `dossiers_commune_id_idx`(`commune_id`),
    INDEX `dossiers_lotissement_id_idx`(`lotissement_id`),
    INDEX `dossiers_nature_dossier_id_idx`(`nature_dossier_id`),
    INDEX `dossiers_operateur_id_idx`(`operateur_id`),
    INDEX `dossiers_statut_collecte_idx`(`statut_collecte`),
    INDEX `dossiers_statut_validation_idx`(`statut_validation`),
    INDEX `dossiers_statut_numerisation_idx`(`statut_numerisation`),
    INDEX `dossiers_statut_indexation_idx`(`statut_indexation`),
    INDEX `dossiers_statut_archivage_idx`(`statut_archivage`),
    INDEX `dossiers_created_at_idx`(`created_at`),
    INDEX `dossiers_commune_id_statut_archivage_idx`(`commune_id`, `statut_archivage`),
    INDEX `dossiers_operateur_id_statut_validation_idx`(`operateur_id`, `statut_validation`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dossier_id` INTEGER NOT NULL,
    `nom_fichier` VARCHAR(191) NOT NULL,
    `nom_original` VARCHAR(191) NOT NULL,
    `type_mime` VARCHAR(191) NOT NULL,
    `extension` VARCHAR(191) NOT NULL,
    `taille` INTEGER NOT NULL,
    `url` TEXT NOT NULL,
    `storage_provider` ENUM('LOCAL', 'CPANEL', 'S3', 'OTHER') NOT NULL DEFAULT 'LOCAL',
    `hash` VARCHAR(191) NULL,
    `nombre_pages` INTEGER NULL,
    `uploaded_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `documents_dossier_id_idx`(`dossier_id`),
    INDEX `documents_hash_idx`(`hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `numerisations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dossier_id` INTEGER NOT NULL,
    `operateur_id` INTEGER NULL,
    `date_debut` DATETIME(3) NULL,
    `date_fin` DATETIME(3) NULL,
    `nombre_pages` INTEGER NULL,
    `statut` ENUM('EN_COURS', 'TERMINEE', 'ANNULEE') NOT NULL DEFAULT 'EN_COURS',
    `qualite` ENUM('BONNE', 'MOYENNE', 'FAIBLE') NULL,
    `commentaire` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `numerisations_dossier_id_idx`(`dossier_id`),
    INDEX `numerisations_operateur_id_idx`(`operateur_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `indexations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dossier_id` INTEGER NOT NULL,
    `operateur_id` INTEGER NULL,
    `date_debut` DATETIME(3) NULL,
    `date_fin` DATETIME(3) NULL,
    `statut` ENUM('EN_COURS', 'TERMINEE', 'ANNULEE') NOT NULL DEFAULT 'EN_COURS',
    `score_qualite` INTEGER NULL,
    `commentaire` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `indexations_dossier_id_idx`(`dossier_id`),
    INDEX `indexations_operateur_id_idx`(`operateur_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archivages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dossier_id` INTEGER NOT NULL,
    `operateur_id` INTEGER NULL,
    `date_archivage` DATETIME(3) NULL,
    `emplacement` VARCHAR(191) NULL,
    `reference_archivage` VARCHAR(191) NULL,
    `statut` ENUM('EN_COURS', 'TERMINEE', 'ANNULEE') NOT NULL DEFAULT 'EN_COURS',
    `commentaire` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `archivages_dossier_id_idx`(`dossier_id`),
    INDEX `archivages_operateur_id_idx`(`operateur_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quality_checks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dossier_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `type_controle` VARCHAR(191) NOT NULL,
    `score` INTEGER NULL,
    `statut` ENUM('CONFORME', 'NON_CONFORME', 'A_CORRIGER') NOT NULL,
    `nombre_anomalies` INTEGER NOT NULL DEFAULT 0,
    `commentaire` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `quality_checks_dossier_id_idx`(`dossier_id`),
    INDEX `quality_checks_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `anomalies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dossier_id` INTEGER NOT NULL,
    `quality_check_id` INTEGER NULL,
    `type` ENUM('CHAMP_MANQUANT', 'DOUBLON', 'FORMAT_INVALIDE', 'INCOHERENCE', 'ERREUR_SAISIE', 'DOCUMENT_MANQUANT', 'AUTRE') NOT NULL,
    `champ` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `gravite` ENUM('FAIBLE', 'MOYENNE', 'ELEVEE', 'CRITIQUE') NOT NULL,
    `statut` ENUM('OUVERTE', 'EN_COURS', 'CORRIGEE', 'IGNOREE') NOT NULL DEFAULT 'OUVERTE',
    `corrige_par` INTEGER NULL,
    `corrige_le` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `anomalies_dossier_id_idx`(`dossier_id`),
    INDEX `anomalies_quality_check_id_idx`(`quality_check_id`),
    INDEX `anomalies_gravite_idx`(`gravite`),
    INDEX `anomalies_statut_idx`(`statut`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `imports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `nom_fichier` VARCHAR(191) NOT NULL,
    `type_fichier` ENUM('CSV', 'XLSX') NOT NULL,
    `nombre_lignes` INTEGER NULL,
    `nombre_valides` INTEGER NULL,
    `nombre_invalides` INTEGER NULL,
    `nombre_doublons` INTEGER NULL,
    `nombre_importes` INTEGER NULL,
    `statut` ENUM('EN_COURS', 'TERMINE', 'ECHEC', 'ANNULE') NOT NULL DEFAULT 'EN_COURS',
    `erreurs` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,

    INDEX `imports_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type_export` VARCHAR(191) NOT NULL,
    `filtres` JSON NULL,
    `nombre_lignes` INTEGER NULL,
    `fichier` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exports_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entity_id` INTEGER NULL,
    `old_value` JSON NULL,
    `new_value` JSON NULL,
    `ip_address` VARCHAR(191) NULL,
    `user_agent` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_entity_entity_id_idx`(`entity`, `entity_id`),
    INDEX `audit_logs_action_idx`(`action`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `titre` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `read_at` DATETIME(3) NULL,

    INDEX `notifications_user_id_is_read_idx`(`user_id`, `is_read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NULL,
    `description` TEXT NULL,
    `is_public` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `settings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operateurs` ADD CONSTRAINT `operateurs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lotissements` ADD CONSTRAINT `lotissements_commune_id_fkey` FOREIGN KEY (`commune_id`) REFERENCES `communes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transitions` ADD CONSTRAINT `workflow_transitions_dossier_id_fkey` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transitions` ADD CONSTRAINT `workflow_transitions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dossier_history` ADD CONSTRAINT `dossier_history_dossier_id_fkey` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dossier_history` ADD CONSTRAINT `dossier_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dossiers` ADD CONSTRAINT `dossiers_operateur_id_fkey` FOREIGN KEY (`operateur_id`) REFERENCES `operateurs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dossiers` ADD CONSTRAINT `dossiers_commune_id_fkey` FOREIGN KEY (`commune_id`) REFERENCES `communes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dossiers` ADD CONSTRAINT `dossiers_lotissement_id_fkey` FOREIGN KEY (`lotissement_id`) REFERENCES `lotissements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dossiers` ADD CONSTRAINT `dossiers_nature_dossier_id_fkey` FOREIGN KEY (`nature_dossier_id`) REFERENCES `natures_dossier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_dossier_id_fkey` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `numerisations` ADD CONSTRAINT `numerisations_dossier_id_fkey` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `numerisations` ADD CONSTRAINT `numerisations_operateur_id_fkey` FOREIGN KEY (`operateur_id`) REFERENCES `operateurs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `indexations` ADD CONSTRAINT `indexations_dossier_id_fkey` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `indexations` ADD CONSTRAINT `indexations_operateur_id_fkey` FOREIGN KEY (`operateur_id`) REFERENCES `operateurs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archivages` ADD CONSTRAINT `archivages_dossier_id_fkey` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archivages` ADD CONSTRAINT `archivages_operateur_id_fkey` FOREIGN KEY (`operateur_id`) REFERENCES `operateurs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quality_checks` ADD CONSTRAINT `quality_checks_dossier_id_fkey` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quality_checks` ADD CONSTRAINT `quality_checks_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `anomalies` ADD CONSTRAINT `anomalies_dossier_id_fkey` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `anomalies` ADD CONSTRAINT `anomalies_quality_check_id_fkey` FOREIGN KEY (`quality_check_id`) REFERENCES `quality_checks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `anomalies` ADD CONSTRAINT `anomalies_corrige_par_fkey` FOREIGN KEY (`corrige_par`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `imports` ADD CONSTRAINT `imports_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exports` ADD CONSTRAINT `exports_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
