-- One-time local database setup. Run as the PostgreSQL superuser, e.g.:
--   "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -v app_password="'YourStrongPassword'" -f scripts/create-database.sql
-- Then put the same password into DATABASE_URL and DATABASE_URL_TEST in backend/.env.
--
-- The application role owns its databases (needed for migrations) but is NOT a superuser.
-- CREATEDB lets Prisma create a temporary shadow database during `prisma migrate dev`.

SELECT format('CREATE ROLE library_app LOGIN CREATEDB PASSWORD %s', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'library_app')
\gexec

SELECT 'CREATE DATABASE digital_library OWNER library_app ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'digital_library')
\gexec

SELECT 'CREATE DATABASE digital_library_test OWNER library_app ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'digital_library_test')
\gexec
