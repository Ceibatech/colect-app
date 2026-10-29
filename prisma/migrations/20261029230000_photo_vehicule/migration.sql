-- Photo du véhicule prise sur place (plaque visible) sur les bordereaux.
ALTER TABLE `transfer_movements` ADD COLUMN `vehicle_photo` MEDIUMTEXT NULL AFTER `vehicle_description`;
