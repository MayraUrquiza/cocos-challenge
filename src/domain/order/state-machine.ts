import type { OrderStatus } from '../shared/order-values';

/**
 * Los estados a los que puede pasar una orden desde cada estado (ADR-0002,
 * transiciones de estado). Solo una orden pendiente cambia: el usuario la
 * cancela o el mercado la ejecuta. Un estado nuevo sin su fila no compila.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ['CANCELLED', 'FILLED'],
  FILLED: [],
  REJECTED: [],
  CANCELLED: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly orderId: number,
    readonly from: OrderStatus | 'NOT_PENDING',
    readonly to: OrderStatus,
  ) {
    super(
      from === 'NOT_PENDING'
        ? `La orden ${orderId} no está pendiente: no puede pasar a ${to}`
        : `La orden ${orderId} no puede pasar de ${from} a ${to}`,
    );
    this.name = 'InvalidTransitionError';
  }
}

export function transition(orderId: number, from: OrderStatus, to: OrderStatus): OrderStatus {
  if (!TRANSITIONS[from].includes(to)) throw new InvalidTransitionError(orderId, from, to);
  return to;
}
