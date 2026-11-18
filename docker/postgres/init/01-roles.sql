-- Usuarios de base de datos (RFC-001, Plan de rollout).
-- Las contraseñas son solo para desarrollo local y CI.
--
-- cocos_migrator: dueño de la base y del esquema, ejecuta las migraciones (DDL).
-- cocos_app: usuario de la aplicación. Los permisos sobre cada tabla se otorgan
-- en las migraciones, para que el historial contable solo admita SELECT e INSERT.

CREATE ROLE cocos_migrator WITH LOGIN PASSWORD 'cocos_migrator';
CREATE ROLE cocos_app WITH LOGIN PASSWORD 'cocos_app';

ALTER DATABASE cocos OWNER TO cocos_migrator;

REVOKE ALL ON DATABASE cocos FROM PUBLIC;
GRANT CONNECT ON DATABASE cocos TO cocos_app;
GRANT USAGE ON SCHEMA public TO cocos_app;
