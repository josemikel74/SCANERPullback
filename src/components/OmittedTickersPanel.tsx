import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { OmittedTickerItem } from '../types/market';

interface OmittedTickersPanelProps {
  items: OmittedTickerItem[];
}

export function OmittedTickersPanel({ items }: OmittedTickersPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return null;
  }

  const networkCount = items.filter((i) => i.reasonType === 'NETWORK_ERROR').length;
  const historyCount = items.filter((i) => i.reasonType === 'INSUFFICIENT_HISTORY').length;

  return (
    <section
      aria-label="Control de tickers omitidos"
      className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="w-full px-5 py-3 flex items-center justify-between gap-4 text-left hover:bg-[#F8FAFC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#475569]">
          <AlertTriangle
            className="w-3.5 h-3.5 text-[#D97706] shrink-0"
            aria-hidden="true"
          />
          <span className="font-semibold text-[#0F172A]">
            Tickers omitidos o con historial parcial
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums font-medium text-[#0F172A]">
            {items.length}
          </span>
          {historyCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {historyCount} sin 200 velas para SMA 200
              </span>
            </>
          )}
          {networkCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums text-[#B45309]">
                {networkCount} error de red
              </span>
            </>
          )}
        </div>

        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#64748B] shrink-0">
          <span>{expanded ? 'Ocultar detalle' : 'Ver detalle'}</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] max-h-64 overflow-y-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[11px] font-semibold text-[#64748B]">
                <th className="py-2 pl-5 pr-3 w-32">Ticker</th>
                <th className="py-2 px-3">Compañía</th>
                <th className="py-2 px-3 w-44">Motivo</th>
                <th className="py-2 pl-3 pr-5">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] bg-white">
              {items.map((item) => (
                <tr key={`${item.ticker}-${item.reasonType}`} className="h-9">
                  <td className="py-1.5 pl-5 pr-3 font-mono font-semibold text-[#0F172A]">
                    <a
                      href={`https://finance.yahoo.com/quote/${encodeURIComponent(item.ticker)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#1D4ED8] hover:underline"
                    >
                      {item.ticker}
                    </a>
                  </td>
                  <td className="py-1.5 px-3 text-[#334155]">{item.name}</td>
                  <td className="py-1.5 px-3 whitespace-nowrap">
                    <span
                      className={`font-medium ${
                        item.reasonType === 'NETWORK_ERROR'
                          ? 'text-[#DC2626]'
                          : 'text-[#B45309]'
                      }`}
                    >
                      {item.reasonType === 'NETWORK_ERROR'
                        ? 'Error de red'
                        : 'Historial insuficiente'}
                    </span>
                  </td>
                  <td className="py-1.5 pl-3 pr-5 text-[#64748B]">
                    {item.reasonDetail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
