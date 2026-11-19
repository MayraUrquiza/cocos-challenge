# API de Portfolio, búsqueda de activos y órdenes

Servicio en Node.js + TypeScript (Fastify, PostgreSQL) que resuelve el [backend challenge](backend-challenge.md): portfolio de un usuario, búsqueda de instrumentos, envío, consulta y cancelación de órdenes, y transferencias de pesos.

## Documentación

- [RFC-001](docs/rfc/RFC-001-api-portfolio-busqueda-ordenes.md): visión general de la solución. Qué se construye, por qué y qué queda fuera de alcance.
- ADRs: cada decisión con su justificación y las alternativas evaluadas.
  - [ADR-0001](docs/adr/ADR-0001-stack-http-validacion-y-acceso-a-datos.md): stack técnico (Fastify, TypeBox, Kysely) e integración continua.
  - [ADR-0002](docs/adr/ADR-0002-arquitectura-y-patrones-de-dominio.md): arquitectura hexagonal, CQRS lógico y modelo del dominio.
  - [ADR-0003](docs/adr/ADR-0003-persistencia-consistencia-y-cantidades.md): persistencia, historial contable, concurrencia, idempotencia y cambios al esquema.
  - [ADR-0004](docs/adr/ADR-0004-reglas-de-negocio.md): reglas de negocio que el enunciado deja abiertas.
  - [ADR-0005](docs/adr/ADR-0005-contrato-de-la-api.md): contrato de la API (rutas, errores, montos, versionado).
- [Glosario](docs/glossary.md): términos de negocio y técnicos.

## Cómo levantarlo

**Requisitos:** Node.js 26.13.1 (la versión de [.nvmrc](.nvmrc), con `nvm use` alcanza) y Docker.

```bash
npm install
cp .env.example .env     # los valores por defecto sirven para desarrollo
npm run db:up            # PostgreSQL 18 con los usuarios y los datos de database.sql
npm run db:migrate       # controles, índices, historial contable y carga de las 11 órdenes
npm run dev              # API en http://localhost:3000, se reinicia al cambiar el código
```

Para verificar que levantó: `curl http://localhost:3000/health` responde `{"status":"ok"}`.

Para producción se compila con `npm run build` y se ejecuta con `npm start`.

### Variables de entorno

La API valida las variables al arrancar y, si falta alguna o tiene un valor inválido, termina indicando cuál.

| Variable | Por defecto | Para qué |
|---|---|---|
| `DATABASE_URL` | (obligatoria) | Conexión de la API, con el usuario `cocos_app`, que solo puede leer y registrar operaciones. |
| `MIGRATION_DATABASE_URL` | (obligatoria para migrar) | Conexión de las migraciones, con el usuario `cocos_migrator`, dueño del esquema. |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Dónde escucha la API. |
| `LOG_LEVEL` | `info` | Nivel de los logs, en JSON y con el `correlationId` de cada request. |
| `MARKET_SIMULATION_ENABLED` | `false` | Habilita `POST /v1/simulation/orders/{orderId}/fill`, que simula la ejecución de una orden LIMIT. Solo para pruebas. |

Los dos usuarios de base de datos los crea Docker al iniciar la base por primera vez ([docker/postgres/init/](docker/postgres/init/)), con contraseñas que sirven solo para desarrollo.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm test` | Todos los tests. Los de integración crean una base nueva por suite, así que necesitan la base de Docker levantada. |
| `npm run test:unit` / `npm run test:int` | Solo los de unidad, o solo los de integración. |
| `npm run typecheck` / `npm run lint:deps` | Tipos, y las reglas de dependencias entre capas. |
| `npm run reconcile` | Compara `orders` con el historial contable de cada cuenta. Termina con código 1 si alguna no coincide. |
| `npm run db:reset` | Borra la base, la vuelve a crear con los datos de `database.sql` y la migra. |
| `npm run db:codegen` | Regenera los tipos de las tablas ([schema.ts](src/infrastructure/database/schema.ts)) después de una migración. |

CI ejecuta lo mismo en cada push: tipos, build, capas, migraciones, tipos generados al día y tests.

### Usar la base de Neon

La API también corre contra la base de PostgreSQL en Neon que acompaña a la challenge. Esa base ya está preparada: tiene el usuario `cocos_app` y todas las migraciones aplicadas. Solo hace falta crear el archivo `.env.neon` en la raíz, con las credenciales:

```bash
PORT=3000
LOG_LEVEL=info
# API: usuario cocos_app, por el endpoint con pooler
DATABASE_URL=postgresql://cocos_app:<contraseña>@<endpoint>-pooler.<región>.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require
# Migraciones: usuario neondb_owner, por el endpoint directo (sin -pooler)
MIGRATION_DATABASE_URL=postgresql://neondb_owner:<contraseña>@<endpoint>.<región>.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require
MARKET_SIMULATION_ENABLED=true
```

Después se usan los mismos comandos, con el prefijo `neon:`:

| Comando | Qué hace |
|---|---|
| `npm run neon:dev` | Levanta la API contra Neon en `http://localhost:3000`. |
| `npm run neon:migrate` | Aplica las migraciones pendientes. |
| `npm run neon:reconcile` | Reconcilia `orders` con el historial contable en Neon. |
| `npm run neon:reset -- --yes` | Vuelve la base al estado inicial: borra todo, carga `database.sql` y aplica las migraciones. Sin `--yes` solo avisa qué base borraría. Conviene detener la API antes. |

- **Las credenciales van en `.env.neon` y no en `.env`.** Git ignora el archivo, y así los tests no pueden apuntar a Neon por error: siempre corren contra Docker, porque crean y borran una base por suite.
- **Dos endpoints:** la API usa el que tiene pooler, que reparte pocas conexiones reales entre muchos clientes. Las migraciones usan el directo, porque cambian el esquema y toman bloqueos que conviene no pasar por el pooler.
- **`sslmode=verify-full`** verifica el certificado del servidor y su nombre, y no solo que la conexión esté cifrada.
- **El usuario `cocos_app` se creó por SQL,** con permiso solo para conectarse y usar el esquema, y no desde la consola de Neon, que lo habría agregado a `neon_superuser`. Los permisos sobre cada tabla los dan las migraciones.

## Supuestos

Las decisiones sobre lo que el enunciado deja abierto están en el [RFC-001](docs/rfc/RFC-001-api-portfolio-busqueda-ordenes.md#problemas-y-desafíos) y en [ADR-0004](docs/adr/ADR-0004-reglas-de-negocio.md). Las principales:

- **Una orden rechazada se guarda y responde `201`** con `status: REJECTED` y su `rejectReason`, como pide el enunciado. Los requests mal armados responden `400` y no se guardan.
- **Las órdenes pendientes apartan** los pesos (compras) o las acciones (ventas) hasta que se ejecutan o se cancelan. Por eso el usuario 1 tiene 627.500 pesos disponibles y no 753.000.
- **El rendimiento** de una posición se mide contra el costo promedio de las acciones que el usuario todavía tiene.
- **La venta inconsistente de BMA** de los datos de prueba no se corrige: el portfolio muestra los −10 BMA con un aviso.
- **Una MARKET por monto** compra la mayor cantidad de acciones enteras que alcance, y se rechaza si no alcanza para ninguna.
- **Las transferencias de pesos** llegan ya confirmadas por un sistema externo, que en este proyecto se simula con los requests de ejemplo.
- **No hay autenticación,** pero todo lo que pertenece a una cuenta cuelga de `/v1/users/{userId}` y una orden de otro usuario responde `404`.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/v1/users/{userId}/portfolio` | Valor total de la cuenta, pesos (total, reservados y disponibles) y cada posición con su cantidad, costo promedio, valor de mercado y rendimientos. |
| `GET` | `/v1/instruments?q=` | Busca acciones por ticker o nombre, sin distinguir mayúsculas ni tildes, con su último precio. Paginada. |
| `POST` | `/v1/users/{userId}/orders` | Envía una orden de compra o venta, MARKET o LIMIT, por cantidad de acciones o por monto en pesos. |
| `GET` | `/v1/users/{userId}/orders` | Lista las órdenes del usuario, transferencias incluidas, de la más nueva a la más vieja. Paginada. |
| `GET` | `/v1/users/{userId}/orders/{orderId}` | Detalle de una orden del usuario. |
| `POST` | `/v1/users/{userId}/orders/{orderId}/cancel` | Cancela una orden pendiente y libera lo que tenía apartado. |
| `POST` | `/v1/users/{userId}/transfers` | Registra un ingreso o un retiro de pesos. |
| `POST` | `/v1/simulation/orders/{orderId}/fill` | Simula que el mercado ejecutó una orden LIMIT pendiente. Solo existe con `MARKET_SIMULATION_ENABLED=true`. |
| `GET` | `/health` | Estado del servicio y de la base de datos. |

Con la API levantada, la documentación OpenAPI en `http://localhost:3000/docs` muestra los bodies, las respuestas con sus códigos de error y ejemplos de cada ruta, y permite probarlas desde el navegador. Las convenciones comunes (montos como texto, rechazos con `201`, `Idempotency-Key`) están en [ADR-0005](docs/adr/ADR-0005-contrato-de-la-api.md).

## Probar la API

- **Colección de requests:** la carpeta [requests/](requests/) tiene un archivo `.http` por grupo de rutas, y [walkthrough.http](requests/walkthrough.http) con un recorrido completo: ingreso de pesos, compra LIMIT, ejecución, portfolio y venta. Se ejecutan desde VS Code con la extensión [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client), o desde un IDE de JetBrains, que los soporta sin instalar nada.
- **Postman o Insomnia:** con la API levantada, importá `http://localhost:3000/docs/json` como OpenAPI para obtener la colección completa, con todas las rutas y sus bodies.
- **Documentación navegable:** `http://localhost:3000/docs`.

## Estructura de carpetas

El código sigue una arquitectura hexagonal con la regla de dependencias `infrastructure → application → domain`. Por qué se eligió y qué alternativas se descartaron está en [ADR-0002](docs/adr/ADR-0002-arquitectura-y-patrones-de-dominio.md).

```
src/
├── domain/
│   ├── account/                    # decider (decide / evolve), AccountState, eventos, FinancialValidationService
│   ├── order/                      # entidad Order, state machine, strategies (tipo y side)
│   ├── portfolio/                  # proyección del portfolio: valor de mercado, ganancia, rendimientos (funciones puras)
│   └── shared/                     # value objects: Money, Quantity, OrderSide, OrderType, OrderStatus, quantityScale
├── application/
│   ├── ports/
│   │   ├── inbound/                # contratos de los casos de uso (lo que el sistema ofrece)
│   │   └── outbound/               # contratos de lo que el sistema necesita del exterior
│   ├── shared/                     # tipos que comparten varios puertos (paginación, errores, vista de una orden)
│   └── use-cases/
│       ├── commands/               # PlaceOrder, CancelOrder, TransferCash, FillOrder (simulación): implementan puertos inbound
│       └── queries/                # GetPortfolio, SearchInstruments, GetOrder, ListOrders, ReconcileAccounts: implementan puertos inbound
├── infrastructure/
│   ├── adapters/                   # solo implementaciones de puertos
│   │   ├── inbound/
│   │   │   └── http/
│   │   │       ├── routes/
│   │   │       ├── schemas/        # TypeBox
│   │   │       ├── mappers/        # body ↔ comando, resultado ↔ response
│   │   │       └── errors/         # dominio → HTTP, formateador de errores de Ajv
│   │   └── outbound/
│   │       ├── postgres/
│   │       │   ├── repositories/   # PostgresAccountRepository
│   │       │   ├── finders/        # consultas de solo lectura: Instrument, Order, User, Portfolio, AccountEvents, PriceProvider
│   │       │   └── mappers/        # fila → dominio
│   │       └── system/             # SystemClock
│   ├── database/                   # conexión Kysely, migraciones, backfill, schema.ts generado
│   ├── config/                     # carga y validación de variables de entorno
│   └── logging/                    # logger estructurado
├── main.ts                         # composition root de la API
└── reconcile.ts                    # composition root de la reconciliación (npm run reconcile)
```

- `infrastructure/adapters/` contiene solo implementaciones de puertos, y los mappers viven junto a su adaptador.
- `main.ts` y `reconcile.ts` son los únicos lugares donde se construyen los adaptadores y se pasan por constructor a los casos de uso, sin contenedor de inyección de dependencias.
