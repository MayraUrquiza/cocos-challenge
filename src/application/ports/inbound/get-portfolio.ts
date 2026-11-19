import type { Portfolio } from '../../../domain/portfolio/project-portfolio';

export interface UserPortfolio extends Portfolio {
  userId: number;
  accountNumber: string;
}

export interface GetPortfolio {
  execute(query: { userId: number }): Promise<UserPortfolio>;
}
