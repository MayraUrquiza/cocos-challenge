import { ConfigError, loadConfig } from '../../../src/infrastructure/config/config';

const DATABASE_URL = 'postgres://cocos_app:cocos_app@localhost:5432/cocos';

describe('loadConfig', () => {
  it('aplica los valores por defecto', () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      port: 3000,
      host: '0.0.0.0',
      logLevel: 'info',
      databaseUrl: DATABASE_URL,
      marketSimulationEnabled: false,
    });
  });

  it('convierte los valores leídos como texto', () => {
    const config = loadConfig({
      DATABASE_URL,
      PORT: '8080',
      LOG_LEVEL: 'debug',
      MARKET_SIMULATION_ENABLED: 'true',
    });

    expect(config.port).toBe(8080);
    expect(config.logLevel).toBe('debug');
    expect(config.marketSimulationEnabled).toBe(true);
  });

  it('trata una variable vacía como ausente', () => {
    expect(loadConfig({ DATABASE_URL, PORT: '' }).port).toBe(3000);
  });

  it('falla si falta DATABASE_URL y lo nombra', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow('DATABASE_URL es obligatoria');
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['LOG_LEVEL', 'verbose'],
    ['MARKET_SIMULATION_ENABLED', 'yes'],
    ['DATABASE_URL', 'mysql://localhost/cocos'],
  ])('falla si %s vale %s', (key, value) => {
    expect(() => loadConfig({ DATABASE_URL, [key]: value })).toThrow(ConfigError);
  });

  it('la simulación de mercado está apagada por defecto', () => {
    expect(loadConfig({ DATABASE_URL }).marketSimulationEnabled).toBe(false);
  });
});
