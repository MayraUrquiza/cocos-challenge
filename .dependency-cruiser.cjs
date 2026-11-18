/**
 * Reglas de dependencias entre capas (ADR-0002, Cómo se verifica).
 * Regla general: infrastructure → application → domain.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-solo-depende-de-domain',
      comment: 'El dominio no conoce la aplicación, la infraestructura ni el composition root.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: '^src/(application|infrastructure)/|^src/main\\.ts$' },
    },
    {
      name: 'domain-sin-librerias-externas',
      comment: 'El dominio solo usa decimal.js, a través de los value objects Money y Quantity.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg', 'core'],
        pathNot: '^node_modules/decimal\\.js/',
      },
    },
    {
      name: 'application-no-depende-de-infrastructure',
      comment: 'La aplicación depende del dominio y de sus propios puertos, nunca de adaptadores.',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { path: '^src/infrastructure/|^src/main\\.ts$' },
    },
    {
      name: 'application-sin-librerias-externas',
      comment: 'Fastify, Kysely y pg quedan confinados a infrastructure (ADR-0001).',
      severity: 'error',
      from: { path: '^src/application/' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg'],
        pathNot: '^node_modules/decimal\\.js/',
      },
    },
    {
      name: 'mappers-propios-de-cada-adaptador',
      comment: 'Un adaptador no usa los mappers de otro adaptador.',
      severity: 'error',
      from: { path: '^src/infrastructure/adapters/([^/]+)/([^/]+)/' },
      to: {
        path: '^src/infrastructure/adapters/[^/]+/[^/]+/mappers/',
        pathNot: '^src/infrastructure/adapters/$1/$2/mappers/',
      },
    },
    {
      name: 'nadie-importa-el-composition-root',
      severity: 'error',
      from: {},
      to: { path: '^src/main\\.ts$' },
    },
    {
      name: 'sin-dependencias-circulares',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'sin-imports-sin-resolver',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
