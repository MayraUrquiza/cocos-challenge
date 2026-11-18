import type { OrderView } from '../../../../../application/shared/order-view';
import type { Page } from '../../../../../application/shared/pagination';
import type { ListOrdersResponse, OrderResponse } from '../schemas/orders';

export function toOrderResponse(order: OrderView): OrderResponse {
  return {
    id: order.id,
    userId: order.userId,
    instrumentId: order.instrumentId,
    side: order.side,
    type: order.type,
    size: order.size?.toString() ?? null,
    price: order.price?.toString() ?? null,
    status: order.status,
    rejectReason: order.rejectReason,
    datetime: order.datetime.toISOString(),
  };
}

export function toListOrdersResponse(page: Page<OrderView>): ListOrdersResponse {
  return { ...page, items: page.items.map(toOrderResponse) };
}
