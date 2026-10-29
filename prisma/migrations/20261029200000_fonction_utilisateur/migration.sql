-- Fonction habilitée de l'utilisateur, reprise sur les signatures.
ALTER TABLE `users` ADD COLUMN `fonction` VARCHAR(120) NULL AFTER `name`;
