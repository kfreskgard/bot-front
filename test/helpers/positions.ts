import type { PositionView } from '../../shared/types';

export function pos(over: Partial<PositionView>): PositionView {
  return {
    id: 'p', stockId: 's', stockName: 'Stock', state: 'x', status: 'open', untracked: false,
    created: '2026-10-22T07:00:00Z', lastUpdated: '2026-10-22T07:00:00Z',
    targetAmount: 100, bought: 100, sold: 0, orderCount: 1,
    avgBuyPrice: 250, avgSellPrice: null, lastPrice: 254.1, lastPriceTime: '2026-10-22T08:41:30Z',
    result: 410, resultPercent: 1.64, ...over,
  };
}

export const NOT_BOUGHT = {
  bought: 0, avgBuyPrice: null, lastPrice: null, lastPriceTime: null, result: null, resultPercent: null,
};

export const POSITIONS: PositionView[] = [
  pos({ id: '1', stockName: 'Alpha' }),
  pos({ id: '2', stockName: 'Beta', lastPriceTime: '2026-10-22T08:39:00Z' }),
  pos({ id: '3', stockName: 'Gamma', result: null, resultPercent: null }),
  pos({ id: '4', stockName: 'Delta', untracked: true }),
  pos({ id: '5', stockName: 'Eps', status: 'pending', ...NOT_BOUGHT }),
  pos({ id: '6', stockName: 'Zeta', status: 'notFilled', ...NOT_BOUGHT }),
  pos({
    id: '7', stockName: 'H&M <b>', status: 'closed', sold: 100, avgSellPrice: 260,
    result: -1500, resultPercent: -2.5, lastPrice: null, lastPriceTime: null,
  }),
];
