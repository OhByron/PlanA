-- User language preference for i18n. NULL means use browser default (en).
ALTER TABLE users ADD COLUMN language TEXT DEFAULT NULL;