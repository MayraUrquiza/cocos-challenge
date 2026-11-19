import type { UserPortfolio } from '../../../../../application/ports/inbound/get-portfolio';
import type { PortfolioResponse } from '../schemas/portfolio';

const text = (value: { toString(): string } | null): string | null => value?.toString() ?? null;

export function toPortfolioResponse(portfolio: UserPortfolio): PortfolioResponse {
  return {
    userId: portfolio.userId,
    accountNumber: portfolio.accountNumber,
    totalValue: portfolio.totalValue.toString(),
    cash: {
      total: portfolio.cash.total.toString(),
      reserved: portfolio.cash.reserved.toString(),
      available: portfolio.cash.available.toString(),
    },
    warnings: portfolio.warnings,
    positions: portfolio.positions.map((position) => ({
      instrumentId: position.instrument.id,
      ticker: position.instrument.ticker,
      name: position.instrument.name,
      quantity: position.quantity.toString(),
      avgCostPrice: text(position.avgCostPrice),
      lastPrice: text(position.lastPrice),
      marketValue: text(position.marketValue),
      gain: text(position.gain),
      returnPct: text(position.returnPct),
      dailyReturnPct: text(position.dailyReturn),
      warnings: position.warnings,
    })),
  };
}
