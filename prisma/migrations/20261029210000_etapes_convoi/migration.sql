-- Étapes du convoi : chargement, véhicule en mouvement, déchargement.
ALTER TABLE `transfer_convoy_events` MODIFY `type` ENUM('CHARGEMENT_DEBUT', 'CHARGEMENT_FIN', 'DEPART', 'EN_ROUTE', 'ARRIVEE', 'DECHARGEMENT_DEBUT', 'DECHARGEMENT_FIN') NOT NULL;
