// Stub pour les tests unitaires (Vitest, environnement Node) : le paquet
// "server-only" n'est pas installé en dépendance (Next.js le résout via un
// alias interne à son propre bundler webpack, sans nécessiter d'installation
// npm). Vitest n'a pas ce traitement spécial — cet alias vide (voir
// vitest.config.ts) permet d'importer directement les modules de service qui
// portent `import "server-only"` sans faire tourner tout Next.js.
export {};
