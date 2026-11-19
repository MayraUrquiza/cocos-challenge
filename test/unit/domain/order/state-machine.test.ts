import { InvalidTransitionError, transition } from '../../../../src/domain/order/state-machine';
import { ORDER_STATUSES } from '../../../../src/domain/shared/order-values';

describe('state machine de órdenes', () => {
  const valid = new Set(['NEW->CANCELLED', 'NEW->FILLED']);

  const combinations = ORDER_STATUSES.flatMap((from) => ORDER_STATUSES.map((to) => [from, to] as const));

  it.each(combinations)('%s -> %s', (from, to) => {
    if (valid.has(`${from}->${to}`)) {
      expect(transition(1, from, to)).toBe(to);
    } else {
      expect(() => transition(1, from, to)).toThrow(InvalidTransitionError);
    }
  });
});
