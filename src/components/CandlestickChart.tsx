import { useMemo, useState } from 'react';
import type { MatchedSma, OHLCVCandle, Timeframe } from '../types/market';
import {
  RSI_DEFAULT_PERIOD,
  SMA_LONG_PERIOD,
  SMA_SHORT_PERIOD,
  calculateRSISeries,
  calculateSMASeries,
} from '../utils/indicators';

interface CandlestickChartProps {
  candles: OHLCVCandle[];
  symbol: '€' | '$';
  timeframe: Timeframe;
  proximityThresholdPct: number;
  matchedSma: MatchedSma | null;
}

type BandTarget = 'SMA50' | 'SMA200' | 'NONE';

function formatPrice(val: number | null, symbol: '€' | '$'): string {
  if (val === null || !Number.isFinite(val)) return '—';
  const str = val.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol === '€' ? `${str} €` : `$${str}`;
}

function formatDateLabel(ts: number, timeframe: Timeframe): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  if (timeframe === '1h' || timeframe === '4h') {
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

function buildPolylinePath(
  values: Array<number | null>,
  xAt: (idx: number) => number,
  yAt: (val: number) => number
): string {
  let d = '';
  let inSegment = false;
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val === null || !Number.isFinite(val)) {
      inSegment = false;
      continue;
    }
    const x = xAt(i).toFixed(2);
    const y = yAt(val).toFixed(2);
    d += inSegment ? ` L ${x} ${y}` : ` M ${x} ${y}`;
    inSegment = true;
  }
  return d.trim();
}

function buildBandAreaPath(
  values: Array<number | null>,
  thresholdPct: number,
  xAt: (idx: number) => number,
  yAt: (val: number) => number
): string {
  const ratio = Math.abs(thresholdPct) / 100;
  if (ratio <= 0) return '';

  const upperPoints: string[] = [];
  const lowerPoints: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) continue;
    const x = xAt(i).toFixed(2);
    upperPoints.push(`${x} ${yAt(v * (1 + ratio)).toFixed(2)}`);
    lowerPoints.unshift(`${x} ${yAt(v * (1 - ratio)).toFixed(2)}`);
  }

  if (upperPoints.length < 2) return '';
  return `M ${upperPoints.join(' L ')} L ${lowerPoints.join(' L ')} Z`;
}

export function CandlestickChart({
  candles,
  symbol,
  timeframe,
  proximityThresholdPct,
  matchedSma,
}: CandlestickChartProps) {
  const [windowBars, setWindowBars] = useState<60 | 90 | 150>(90);
  const [bandTarget, setBandTarget] = useState<BandTarget>(
    matchedSma === 'SMA200' ? 'SMA200' : 'SMA50'
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const series = useMemo(() => {
    const closes = candles.map((c) => c.close);
    const sma50All = calculateSMASeries(closes, SMA_SHORT_PERIOD);
    const sma200All = calculateSMASeries(closes, SMA_LONG_PERIOD);
    const rsiAll = calculateRSISeries(closes, RSI_DEFAULT_PERIOD);

    const start = Math.max(0, candles.length - windowBars);
    const slicedCandles = candles.slice(start);
    const slicedSma50 = sma50All.slice(start);
    const slicedSma200 = sma200All.slice(start);
    const slicedRsi = rsiAll.slice(start);

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVol = 0;

    for (let i = 0; i < slicedCandles.length; i++) {
      const c = slicedCandles[i];
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVol) maxVol = c.volume;

      const s50 = slicedSma50[i];
      const s200 = slicedSma200[i];
      if (s50 !== null) {
        if (s50 < minPrice) minPrice = s50;
        if (s50 > maxPrice) maxPrice = s50;
      }
      if (s200 !== null) {
        if (s200 < minPrice) minPrice = s200;
        if (s200 > maxPrice) maxPrice = s200;
      }
    }

    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) {
      minPrice = 0;
      maxPrice = 100;
    }

    const pad = (maxPrice - minPrice) * 0.08;
    return {
      candles: slicedCandles,
      sma50: slicedSma50,
      sma200: slicedSma200,
      rsi: slicedRsi,
      minPrice: Math.max(0, minPrice - pad),
      maxPrice: maxPrice + pad,
      maxVol: maxVol > 0 ? maxVol : 1,
    };
  }, [candles, windowBars]);

  if (series.candles.length < 2) {
    return (
      <div className="border border-[#E2E8F0] rounded-lg p-6 text-center text-xs text-[#64748B]">
        No hay suficientes velas válidas para dibujar el gráfico OHLC.
      </div>
    );
  }

  const width = 920;
  const height = 300;
  const padLeft = 14;
  const padRight = 76;
  const padTop = 14;
  const padBottom = 28;
  const volHeight = 42;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom - volHeight - 6;

  const n = series.candles.length;
  const stepX = plotWidth / n;
  const bodyWidth = Math.max(2, Math.min(9, stepX * 0.62));

  const xAt = (idx: number) => padLeft + (idx + 0.5) * stepX;
  const yAt = (price: number) => {
    const ratio = (price - series.minPrice) / Math.max(1e-9, series.maxPrice - series.minPrice);
    return padTop + (1 - ratio) * plotHeight;
  };

  const sma50Path = buildPolylinePath(series.sma50, xAt, yAt);
  const sma200Path = buildPolylinePath(series.sma200, xAt, yAt);
  const bandSeries =
    bandTarget === 'SMA50'
      ? series.sma50
      : bandTarget === 'SMA200'
        ? series.sma200
        : [];
  const bandPath =
    bandSeries.length > 0
      ? buildBandAreaPath(bandSeries, proximityThresholdPct, xAt, yAt)
      : '';

  const priceTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => {
    const val = series.minPrice + r * (series.maxPrice - series.minPrice);
    return { val, y: yAt(val) };
  });

  const activeIdx =
    hoverIdx !== null && hoverIdx >= 0 && hoverIdx < n ? hoverIdx : n - 1;
  const activeCandle = series.candles[activeIdx];
  const activeSma50 = series.sma50[activeIdx];
  const activeSma200 = series.sma200[activeIdx];
  const activeRsi = series.rsi[activeIdx];

  const xAxisIndexes = Array.from(
    new Set([0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1])
  );

  return (
    <div className="border border-[#E2E8F0] rounded-lg bg-white p-4 space-y-3">
      {/* Cabecera de gráfico con leyenda e interruptores */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums">
          <span className="font-sans font-semibold text-xs text-[#0F172A]">
            Gráfico OHLC · {formatDateLabel(activeCandle.timestamp, timeframe)}
          </span>
          <span className="text-[#475569]">
            O <strong className="text-[#0F172A]">{formatPrice(activeCandle.open, symbol)}</strong>
          </span>
          <span className="text-[#475569]">
            H <strong className="text-[#0F172A]">{formatPrice(activeCandle.high, symbol)}</strong>
          </span>
          <span className="text-[#475569]">
            L <strong className="text-[#0F172A]">{formatPrice(activeCandle.low, symbol)}</strong>
          </span>
          <span className="text-[#475569]">
            C <strong className="text-[#0F172A]">{formatPrice(activeCandle.close, symbol)}</strong>
          </span>
          <span className="text-[#1D4ED8]">
            SMA50 {formatPrice(activeSma50, symbol)}
          </span>
          <span className="text-[#4338CA]">
            SMA200 {formatPrice(activeSma200, symbol)}
          </span>
          {activeRsi !== null && (
            <span className="text-[#334155]">
              RSI {activeRsi.toFixed(1)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <div className="inline-flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-md p-0.5">
            {([60, 90, 150] as const).map((len) => (
              <button
                key={len}
                type="button"
                onClick={() => setWindowBars(len)}
                className={`px-2 py-0.5 rounded font-mono font-semibold transition-colors ${
                  windowBars === len
                    ? 'bg-white text-[#0F172A] shadow-xs border border-[#E2E8F0]'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {len}v
              </button>
            ))}
          </div>

          <div className="inline-flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-md p-0.5">
            {(
              [
                { id: 'SMA50', label: 'Banda 50' },
                { id: 'SMA200', label: 'Banda 200' },
                { id: 'NONE', label: 'Sin banda' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setBandTarget(opt.id)}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  bandTarget === opt.id
                    ? 'bg-white text-[#0F172A] shadow-xs border border-[#E2E8F0]'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lienzo SVG responsivo */}
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[260px] sm:h-[300px] select-none"
          role="img"
          aria-label="Gráfico interactivo de velas OHLC con medias móviles SMA 50 y SMA 200"
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (rect.width <= 0) return;
            const svgX = ((e.clientX - rect.left) / rect.width) * width;
            const idx = Math.floor((svgX - padLeft) / stepX);
            if (idx >= 0 && idx < n) {
              setHoverIdx(idx);
            } else {
              setHoverIdx(null);
            }
          }}
        >
          {/* Rejilla horizontal y etiquetas de precio */}
          {priceTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                y1={t.y}
                x2={width - padRight}
                y2={t.y}
                stroke="#F1F5F9"
                strokeWidth="1"
              />
              <text
                x={width - padRight + 6}
                y={t.y + 3}
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fill="#64748B"
              >
                {t.val.toFixed(2)}
              </text>
            </g>
          ))}

          {/* Banda sombreada ±umbral% alrededor de SMA seleccionada */}
          {bandPath && (
            <path
              d={bandPath}
              fill={bandTarget === 'SMA200' ? 'rgba(67, 56, 202, 0.10)' : 'rgba(29, 78, 216, 0.10)'}
            />
          )}

          {/* Barras de volumen */}
          {series.candles.map((c, idx) => {
            const x = xAt(idx);
            const isUp = c.close >= c.open;
            const barH = Math.max(1, (c.volume / series.maxVol) * volHeight);
            const yTop = height - padBottom - barH;
            return (
              <rect
                key={`v-${idx}`}
                x={x - bodyWidth / 2}
                y={yTop}
                width={bodyWidth}
                height={barH}
                fill={isUp ? 'rgba(16, 185, 129, 0.30)' : 'rgba(239, 68, 68, 0.30)'}
              />
            );
          })}

          {/* Velas japonesas OHLC */}
          {series.candles.map((c, idx) => {
            const x = xAt(idx);
            const isUp = c.close >= c.open;
            const color = isUp ? '#10B981' : '#EF4444';
            const yHigh = yAt(c.high);
            const yLow = yAt(c.low);
            const yOpen = yAt(c.open);
            const yClose = yAt(c.close);
            const rectY = Math.min(yOpen, yClose);
            const rectH = Math.max(1.5, Math.abs(yClose - yOpen));

            return (
              <g key={`c-${idx}`}>
                <line
                  x1={x}
                  y1={yHigh}
                  x2={x}
                  y2={yLow}
                  stroke={color}
                  strokeWidth="1.2"
                />
                <rect
                  x={x - bodyWidth / 2}
                  y={rectY}
                  width={bodyWidth}
                  height={rectH}
                  fill={color}
                  rx="0.5"
                />
              </g>
            );
          })}

          {/* Líneas SMA 200 y SMA 50 */}
          {sma200Path && (
            <path
              d={sma200Path}
              fill="none"
              stroke="#4338CA"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          )}
          {sma50Path && (
            <path
              d={sma50Path}
              fill="none"
              stroke="#1D4ED8"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          )}

          {/* Crosshair al pasar el ratón */}
          {hoverIdx !== null && (
            <g>
              <line
                x1={xAt(activeIdx)}
                y1={padTop}
                x2={xAt(activeIdx)}
                y2={height - padBottom}
                stroke="#94A3B8"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line
                x1={padLeft}
                y1={yAt(activeCandle.close)}
                x2={width - padRight}
                y2={yAt(activeCandle.close)}
                stroke="#94A3B8"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            </g>
          )}

          {/* Etiquetas eje X */}
          {xAxisIndexes.map((idx) => (
            <text
              key={`x-${idx}`}
              x={xAt(idx)}
              y={height - 8}
              textAnchor={idx === 0 ? 'start' : idx === n - 1 ? 'end' : 'middle'}
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              fill="#64748B"
            >
              {formatDateLabel(series.candles[idx].timestamp, timeframe)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
