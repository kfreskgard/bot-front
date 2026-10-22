export type PositionStatus = 'noOrder' | 'pending' | 'open' | 'closed' | 'notFilled';

export interface PositionView {
  id: string;
  stockId: string;
  stockName: string;
  state: string;
  status: PositionStatus;
  untracked: boolean;
  created: string;
  lastUpdated: string;
  targetAmount: number;
  bought: number;
  sold: number;
  orderCount: number;
  avgBuyPrice: number | null;
  avgSellPrice: number | null;
  lastPrice: number | null;
  lastPriceTime: string | null;
  result: number | null;
  resultPercent: number | null;
}

export interface PositionsResponse {
  date: string;
  positions: PositionView[];
}

export type ApiErrorKind = 'badRequest' | 'unauthorized' | 'unreachable' | 'error';

export interface ApiErrorBody {
  error: { kind: ApiErrorKind; message: string; since?: string };
}
