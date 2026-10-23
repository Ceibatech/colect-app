-- Invalidate every previously issued session when an account-sensitive
-- operation increments this version.
ALTER TABLE `users`
    ADD COLUMN `session_version` INTEGER NOT NULL DEFAULT 1;
