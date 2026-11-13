import { Download } from 'lucide-react';
import type { ActiveViewTab } from '../types/market';

interface TopBarProps {
  activeTab: ActiveViewTab;
  onSelectTab: (tab: ActiveViewTab) => void;
  onExportCsv: () => void;
  exportDisabled: boolean;
}

const NAV_ITEMS: { id: ActiveViewTab; label: string }[] = [
  { id: 'SCANNER', label: 'Escáner Pullback' },
  { id: 'UNIVERSE', label: 'Universo de Índices' },
  { id: 'METHODOLOGY', label: 'Metodología SMA' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  onExportCsv,
  exportDisabled,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#E2E8F0]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zona 1: Marca en una sola línea */}
        <button
          type="button"
          onClick={() => onSelectTab('SCANNER')}
          className="text-lg font-bold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
        >
          PullbackMonitor
        </button>

        {/* Zona 2: Enlaces de navegación de texto limpio */}
        <nav
          aria-label="Navegación principal"
          className="flex items-center gap-6 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded ${
                  isActive
                    ? 'text-[#0F172A]'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-[#1D4ED8]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zona 3: Acción primaria única */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onExportCsv}
            disabled={exportDisabled}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] rounded-lg hover:bg-[#1E293B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>
    </header>
  );
}
