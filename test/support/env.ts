/** URL de la base para los tests de integración. Por defecto, la de docker-compose. */
export function testDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? 'postgres://cocos_app:cocos_app@localhost:5432/cocos';
}
