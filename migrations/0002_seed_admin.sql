-- Migration number: 0002    Seed initial admin user
-- Email:    admin@sa-inmobiliaria.com
-- Password: ChangeMe123!   ← CHANGE IT immediately after first login (Admin → Users)

INSERT INTO users (name, email, password, role)
VALUES (
  'Administrator',
  'admin@sa-inmobiliaria.com',
  'pbkdf2$100000$wfgvsa+eIivOLFePGXyzPA==$bGbT5zz2Uh1G/llKCuAFDLTc1JWXB3zTp9MECuxtY+c=',
  'admin'
);
