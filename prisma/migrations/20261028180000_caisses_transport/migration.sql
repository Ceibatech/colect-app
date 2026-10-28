-- Caisses de transport : chargées pour un lot (enlèvement ou retour), vidées à la réception.
-- Aucune caisse n'existe encore : le type de mouvement change de valeurs sans reprise.
ALTER TABLE `caisse_mouvements` ADD COLUMN `transfer_lot_id` INTEGER NULL,
    MODIFY `type` ENUM('CHARGEMENT', 'RETRAIT', 'DECHARGEMENT') NOT NULL;
ALTER TABLE `caisses` ADD COLUMN `transfer_lot_id` INTEGER NULL;
CREATE INDEX `caisses_transfer_lot_id_idx` ON `caisses`(`transfer_lot_id`);
ALTER TABLE `caisses` ADD CONSTRAINT `caisses_transfer_lot_id_fkey` FOREIGN KEY (`transfer_lot_id`) REFERENCES `transfer_lots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `caisse_mouvements` ADD CONSTRAINT `caisse_mouvements_transfer_lot_id_fkey` FOREIGN KEY (`transfer_lot_id`) REFERENCES `transfer_lots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
