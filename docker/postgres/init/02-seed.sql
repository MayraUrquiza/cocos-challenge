-- Carga el modelo y los datos provistos por el challenge, sin modificarlos.
-- Se ejecuta como cocos_migrator para que sea dueño de las tablas y pueda
-- alterarlas en las migraciones.

SET ROLE cocos_migrator;
\i /seed/database.sql
RESET ROLE;
