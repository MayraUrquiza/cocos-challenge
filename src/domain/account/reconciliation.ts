import type { OrderDetails } from '../order/order';
import type { AccountState } from './account-state';

export type StateDifference =
  | { kind: 'CASH'; fromHistory: string; fromOrders: string }
  | { kind: 'SHARES'; instrumentId: number; fromHistory: string; fromOrders: string }
  | { kind: 'PENDING_ORDER'; orderId: number; fromHistory: string | null; fromOrders: string | null };

function describe(order: OrderDetails | undefined): string | null {
  if (!order) return null;
  return `${order.side} ${order.type} ${order.size.toString()} de ${order.instrumentId} a ${order.price.toString()}`;
}

export function compareStates(fromHistory: AccountState, fromOrders: AccountState): StateDifference[] {
  const differences: StateDifference[] = [];

  if (!fromHistory.cash.equals(fromOrders.cash)) {
    differences.push({
      kind: 'CASH',
      fromHistory: fromHistory.cash.toString(),
      fromOrders: fromOrders.cash.toString(),
    });
  }

  const instrumentIds = new Set([...fromHistory.shares.keys(), ...fromOrders.shares.keys()]);
  for (const instrumentId of [...instrumentIds].sort((a, b) => a - b)) {
    const history = fromHistory.shares.get(instrumentId)?.toString() ?? '0';
    const orders = fromOrders.shares.get(instrumentId)?.toString() ?? '0';
    if (history !== orders) {
      differences.push({ kind: 'SHARES', instrumentId, fromHistory: history, fromOrders: orders });
    }
  }

  const orderIds = new Set([...fromHistory.pending.keys(), ...fromOrders.pending.keys()]);
  for (const orderId of [...orderIds].sort((a, b) => a - b)) {
    const history = describe(fromHistory.pending.get(orderId));
    const orders = describe(fromOrders.pending.get(orderId));
    if (history !== orders) {
      differences.push({ kind: 'PENDING_ORDER', orderId, fromHistory: history, fromOrders: orders });
    }
  }

  return differences;
}
