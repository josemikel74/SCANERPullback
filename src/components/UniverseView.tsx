import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  DAX_40_TICKERS,
  IBEX_35_TICKERS,
  MARKETS_METADATA,
  SP500_TICKERS,
  getTickersByMarket,
} from '../data/tickersData';
import type { MarketId } from '../types/market';

const MARKETS: MarketId[] = ['IBEX35', 'DAX', 'SP500', 'EUROPE'];

export function UniverseView() {
  const [selectedMarket, setSelectedMarket] = useState<MarketId>('IBEX35');
  const [query, setQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState('ALL');

  const currentTickers = getTickersByMarket(selectedMarket);

  const sectors = useMemo(() => {
    const unique = Array.from(new Set(currentTickers.map((t) => t.sector)));
    return unique.sort((a, b) => a.localeCompare(b, 'es'));
  }, [currentTickers]);

  const filteredTickers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return currentTickers.filter((item) => {
      const matchesSector = sectorFilter === 'ALL' || item.sector === sectorFilter;
      const matchesQuery =
        !q ||
        item.ticker.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q);
      return matchesSector && matchesQuery;
    });
  }, [currentTickers, query, sectorFilter]);

  const totalUniverse =
    IBEX_35_TICKERS.length + DAX_40_TICKERS.length + SP500_TICKERS.length;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-[#0F172A]">
              Universo Maestro de Valores
            </h2>
            <p className="text-xs text-[#64748B] tabular-nums">
              {totalUniverse} activos tipados sin recortes · IBEX 35 ({IBEX_35_TICKERS.length}) ·
              DAX 40 ({DAX_40_TICKERS.length}) · S&amp;P 500 ({SP500_TICKERS.length})
            </p>
          </div>

          <div
            role="group"
            aria-label="Seleccionar índice del universo"
            className="inline-flex items-center p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg self-start"
          >
            {MARKETS.map((m) => {
              const active = selectedMarket === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setSelectedMarket(m);
                    setSectorFilter('ALL');
                  }}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-[#0F172A] shadow-xs border border-[#E2E8F0]'
                      : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
                  }`}
                >
                  {MARKETS_METADATA[m].shortLabel} (
                  <span className="font-mono tabular-nums">
                    {getTickersByMarket(m).length}
                  </span>
                  )
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E2E8F0]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar por ticker o compañía..."
                className="pl-8 pr-3 py-2 w-64 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              aria-label="Filtrar universo por sector"
              className="px-3 py-2 text-xs font-medium bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">Todos los sectores</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <span className="text-xs text-[#64748B] tabular-nums">
            Mostrando {filteredTickers.length} de {currentTickers.length} componentes ·{' '}
            {MARKETS_METADATA[selectedMarket].country}
          </span>
        </div>

        <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="max-h-[540px] overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold text-[#475569]">
                <tr>
                  <th className="py-2.5 pl-4 pr-3 w-14 tabular-nums">#</th>
                  <th className="py-2.5 px-3 w-32">Ticker</th>
                  <th className="py-2.5 px-3">Compañía</th>
                  <th className="py-2.5 pl-3 pr-4">Sector</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs">
                {filteredTickers.map((item, idx) => (
                  <tr key={item.ticker} className="h-[40px] hover:bg-[#F8FAFC]">
                    <td className="py-2 pl-4 pr-3 font-mono text-[#94A3B8] tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold text-[#0F172A]">
                      {item.ticker}
                    </td>
                    <td className="py-2 px-3 text-[#334155]">{item.name}</td>
                    <td className="py-2 pl-3 pr-4 text-[#64748B]">{item.sector}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
