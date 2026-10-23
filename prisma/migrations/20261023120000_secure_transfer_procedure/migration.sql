-- Capture the planning, transport, seal and incident evidence required by
-- the MULCV archive transfer and security procedure. Columns remain nullable
-- so historical transfers retain their evidentiary value without fabricated data.
ALTER TABLE `transfer_lots`
  ADD COLUMN `archive_support` VARCHAR(20) NULL,
  ADD COLUMN `planned_route` TEXT NULL,
  ADD COLUMN `transport_method` VARCHAR(160) NULL,
  ADD COLUMN `ceiba_participants` TEXT NULL,
  ADD COLUMN `sda_participants` TEXT NULL,
  ADD COLUMN `risk_assessment` TEXT NULL,
  ADD COLUMN `security_measures` TEXT NULL;

ALTER TABLE `transfer_movements`
  ADD COLUMN `vehicle_registration` VARCHAR(80) NULL,
  ADD COLUMN `vehicle_description` VARCHAR(160) NULL,
  ADD COLUMN `driver_name` VARCHAR(120) NULL,
  ADD COLUMN `driver_phone` VARCHAR(40) NULL,
  ADD COLUMN `ceiba_escort_name` VARCHAR(120) NULL,
  ADD COLUMN `seal_references` TEXT NULL,
  ADD COLUMN `seal_status` ENUM('INTACTS', 'ANOMALIE', 'NON_APPLICABLE') NULL,
  ADD COLUMN `incident_reported` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `incident_description` TEXT NULL;
