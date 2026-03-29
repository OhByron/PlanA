ALTER TABLE projects
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS due_date,
  DROP COLUMN IF EXISTS contact_name,
  DROP COLUMN IF EXISTS contact_email,
  DROP COLUMN IF EXISTS contact_phone;
