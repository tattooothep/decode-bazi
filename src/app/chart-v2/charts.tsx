// Visual chart components — graphic-first
// All inline SVG · no extra deps · light + dark theme

import { ELEMENT_TOKEN, ELEMENT_ZH, type ElementCode } from "./data";

// ────────────────────────────────────────────────────────────
// 5-Element Radar (pentagon)
// ────────────────────────────────────────────────────────────
export function ElementRadar({
  values,
  yongshen = [],
  ji = [],
  size = 220,
}: {
  values: Record<ElementCode, number>;
  yongshen?: ElementCode[];
  ji?: ElementCode[];
  size?: number;
}) {
  const order: ElementCode[] = ["Fire", "Earth", "Metal", "Water", "Wood"];
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 30;
  const max = 50; // 50% = ขอบนอกสุด

  const polar = (i: number, dist: number): [number, number] => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)];
  };

  // Background pentagons (3 rings)
  const ringPoints = (ratio: number) =>
    order.map((_, i) => polar(i, r * ratio).join(",")).join(" ");

  // Data polygon
  const dataPoints = order
    .map((el, i) => polar(i, (values[el] / max) * r).join(","))
    .join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="block">
      {/* Background rings */}
      {[0.33, 0.66, 1.0].map((ratio) => (
        <polygon
          key={ratio}
          points={ringPoints(ratio)}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="1"
        />
      ))}
      {/* Spokes */}
      {order.map((_, i) => {
        const [x, y] = polar(i, r);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="currentColor"
            strokeOpacity="0.1"
          />
        );
      })}
      {/* Data fill */}
      <polygon
        points={dataPoints}
        fill="var(--cinnabar)"
        fillOpacity="0.18"
        stroke="var(--cinnabar)"
        strokeWidth="1.6"
      />
      {/* Element dots & labels */}
      {order.map((el, i) => {
        const [vx, vy] = polar(i, (values[el] / max) * r);
        const [lx, ly] = polar(i, r + 16);
        const isYong = yongshen.includes(el);
        const isJi = ji.includes(el);
        return (
          <g key={el}>
            <circle cx={vx} cy={vy} r={5} fill={ELEMENT_TOKEN[el]} />
            <text
              x={lx}
              y={ly + 4}
              fontFamily="var(--font-zh)"
              fontSize="20"
              fontWeight={isYong || isJi ? 700 : 500}
              fill={isYong ? "var(--cinnabar)" : isJi ? "currentColor" : "currentColor"}
              opacity={isYong || isJi ? 1 : 0.65}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {ELEMENT_ZH[el]}
            </text>
            {isYong && (
              <circle
                cx={lx}
                cy={ly + 4}
                r={14}
                fill="none"
                stroke="var(--cinnabar)"
                strokeWidth="1.5"
              />
            )}
            <text
              x={lx}
              y={ly + 22}
              fontSize="9"
              fill="currentColor"
              opacity="0.55"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {values[el]}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// Strength Gauge (semicircle with needle)
// ────────────────────────────────────────────────────────────
export function StrengthGauge({
  percent,
  status,
  size = 200,
}: {
  percent: number;
  status: string;
  size?: number;
}) {
  const w = size;
  const h = size * 0.6;
  const cx = w / 2;
  const cy = h - 10;
  const r = w / 2 - 20;

  // Needle angle: -90° at percent=0, +90° at percent=100
  const needleAngle = -90 + (percent / 100) * 180;
  const needleRad = (needleAngle * Math.PI) / 180;
  const tipX = cx + r * 0.85 * Math.sin(needleRad);
  const tipY = cy - r * 0.85 * Math.cos(needleRad);

  // Build arc path
  const arcSegments = [
    { from: 0,   to: 25,  color: "var(--chart-5)", label: "อ่อน" },
    { from: 25,  to: 45,  color: "var(--chart-3)", label: "" },
    { from: 45,  to: 55,  color: "var(--gold)",     label: "สมดุล" },
    { from: 55,  to: 75,  color: "var(--chart-1)", label: "" },
    { from: 75,  to: 100, color: "var(--cinnabar)", label: "แกร่ง" },
  ];

  const arcPath = (fromPct: number, toPct: number) => {
    const a1 = -Math.PI + (fromPct / 100) * Math.PI;
    const a2 = -Math.PI + (toPct / 100) * Math.PI;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };

  return (
    <svg viewBox={`0 0 ${w} ${h + 40}`} width={w} height={h + 40} className="block">
      {/* Arc segments */}
      {arcSegments.map((s, i) => (
        <path
          key={i}
          d={arcPath(s.from, s.to)}
          stroke={s.color}
          strokeWidth="14"
          fill="none"
          strokeLinecap="butt"
          opacity="0.85"
        />
      ))}

      {/* Needle */}
      <line
        x1={cx}
        y1={cy}
        x2={tipX}
        y2={tipY}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={6} fill="currentColor" />
      <circle cx={cx} cy={cy} r={3} fill="var(--background)" />

      {/* Big % */}
      <text
        x={cx}
        y={cy - r * 0.45}
        textAnchor="middle"
        fontFamily="var(--font-serif)"
        fontSize="34"
        fontWeight="600"
        fill="currentColor"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {percent}
      </text>
      <text
        x={cx}
        y={cy - r * 0.45 + 18}
        textAnchor="middle"
        fontSize="10"
        opacity="0.55"
        fontFamily="var(--font-mono)"
      >
        / 100
      </text>

      {/* Status */}
      <text
        x={cx}
        y={h + 22}
        textAnchor="middle"
        fontFamily="var(--font-serif)"
        fontSize="14"
        fontStyle="italic"
        fill="var(--cinnabar)"
        letterSpacing="0.04em"
      >
        {status}
      </text>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// Verdict Score Donut (today)
// ────────────────────────────────────────────────────────────
export function VerdictDonut({
  score,
  verdictTh,
  actionMode,
  size = 170,
}: {
  score: number;
  verdictTh: string;
  actionMode: string;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 14;
  const C = 2 * Math.PI * r;
  const dash = (score / 100) * C;
  const color =
    score >= 80 ? "var(--cinnabar)" :
    score >= 60 ? "var(--gold)" :
    score >= 40 ? "var(--chart-3)" : "var(--chart-5)";

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {/* Track */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.1"
        strokeWidth="10"
      />
      {/* Score arc */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={`${dash} ${C - dash}`}
        strokeDashoffset={C / 4}
        transform={`rotate(-90 ${cx} ${cy})`}
        strokeLinecap="round"
      />
      {/* Score text */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fontFamily="var(--font-serif)"
        fontSize="42"
        fontWeight="600"
        fill="currentColor"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {score}
      </text>
      <text
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        fontSize="10"
        fontFamily="var(--font-mono)"
        opacity="0.55"
        letterSpacing="0.2em"
      >
        / 100
      </text>
      <text
        x={cx}
        y={cy + 32}
        textAnchor="middle"
        fontSize="12"
        fill={color}
        fontFamily="var(--font-serif)"
        fontStyle="italic"
        letterSpacing="0.04em"
      >
        {verdictTh}
      </text>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// 5-Element Wheel (Yongshen highlight)
// ────────────────────────────────────────────────────────────
export function ElementWheel({
  yongshen,
  ji,
  size = 130,
}: {
  yongshen: ElementCode[];
  ji: ElementCode[];
  size?: number;
}) {
  const order: ElementCode[] = ["Fire", "Earth", "Metal", "Water", "Wood"];
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 18;

  const polar = (i: number, dist: number): [number, number] => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)];
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {/* Faint pentagon */}
      <polygon
        points={order.map((_, i) => polar(i, r).join(",")).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.12"
      />
      {/* Generation cycle arrows (subtle) */}
      {order.map((_, i) => {
        const [x1, y1] = polar(i, r);
        const [x2, y2] = polar((i + 1) % 5, r);
        return (
          <line
            key={`gen-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeOpacity="0.08"
          />
        );
      })}
      {/* Element circles */}
      {order.map((el, i) => {
        const [x, y] = polar(i, r);
        const isYong = yongshen.includes(el);
        const isJi = ji.includes(el);
        return (
          <g key={el}>
            {isYong && (
              <circle cx={x} cy={y} r={20} fill="none" stroke="var(--cinnabar)" strokeWidth="2" />
            )}
            <circle cx={x} cy={y} r={15} fill={ELEMENT_TOKEN[el]} opacity={isJi ? 0.25 : 0.9} />
            <text
              x={x}
              y={y + 5}
              textAnchor="middle"
              fontFamily="var(--font-zh)"
              fontSize="16"
              fontWeight="700"
              fill="white"
            >
              {ELEMENT_ZH[el]}
            </text>
            {isJi && (
              <line
                x1={x - 10}
                y1={y - 10}
                x2={x + 10}
                y2={y + 10}
                stroke="var(--cinnabar)"
                strokeWidth="1.5"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// Polar bar — 10 Gods distribution
// ────────────────────────────────────────────────────────────
export function TenGodsPolar({
  data,
  size = 240,
}: {
  data: { code: string; pct: number }[];
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const rMin = 24;
  const rMax = size / 2 - 12;
  const max = Math.max(...data.map((d) => d.pct));
  const slice = (2 * Math.PI) / data.length;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {/* Center label */}
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontFamily="var(--font-zh)"
        fontSize="20"
        fontWeight="700"
        fill="var(--cinnabar)"
      >
        十神
      </text>
      {/* Bars */}
      {data.map((d, i) => {
        const a1 = -Math.PI / 2 + i * slice + slice * 0.1;
        const a2 = -Math.PI / 2 + (i + 1) * slice - slice * 0.1;
        const r = rMin + ((d.pct / max) * (rMax - rMin));
        const x1 = cx + rMin * Math.cos(a1);
        const y1 = cy + rMin * Math.sin(a1);
        const x2 = cx + r * Math.cos(a1);
        const y2 = cy + r * Math.sin(a1);
        const x3 = cx + r * Math.cos(a2);
        const y3 = cy + r * Math.sin(a2);
        const x4 = cx + rMin * Math.cos(a2);
        const y4 = cy + rMin * Math.sin(a2);
        const path = `M ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${rMin} ${rMin} 0 0 0 ${x1} ${y1} Z`;
        const isTop = i < 3;
        // Label position
        const aMid = (a1 + a2) / 2;
        const lx = cx + (rMax + 10) * Math.cos(aMid);
        const ly = cy + (rMax + 10) * Math.sin(aMid);
        return (
          <g key={i}>
            <path
              d={path}
              fill={isTop ? "var(--cinnabar)" : "currentColor"}
              opacity={isTop ? 0.85 : 0.4 - i * 0.025}
            />
            <text
              x={lx}
              y={ly + 3}
              textAnchor="middle"
              fontFamily="var(--font-zh)"
              fontSize="12"
              fontWeight={isTop ? 700 : 500}
              opacity={isTop ? 1 : 0.65}
              fill={isTop ? "var(--cinnabar)" : "currentColor"}
            >
              {d.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// Compass mini
// ────────────────────────────────────────────────────────────
export function CompassMini({
  bestDeg,
  avoidDeg,
  bestZh,
  avoidZh,
  size = 130,
}: {
  bestDeg: number;
  avoidDeg: number;
  bestZh: string;
  avoidZh: string;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;
  const polar = (deg: number, rad: number): [number, number] => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };
  const [bx, by] = polar(bestDeg, r - 14);
  const [ax, ay] = polar(avoidDeg, r - 14);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity="0.18" />
      {/* Cross axis */}
      {[0, 90, 180, 270].map((d) => {
        const [x1, y1] = polar(d, r - 4);
        const [x2, y2] = polar(d, r);
        return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity="0.3" />;
      })}
      {/* Best arrow */}
      <line x1={cx} y1={cy} x2={bx} y2={by} stroke="var(--cinnabar)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={bx} cy={by} r={6} fill="var(--cinnabar)" />
      <text x={bx} y={by + 3} textAnchor="middle" fontFamily="var(--font-zh)" fontSize="10" fontWeight="700" fill="white">
        {bestZh}
      </text>
      {/* Avoid */}
      <line x1={cx} y1={cy} x2={ax} y2={ay} stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      <circle cx={ax} cy={ay} r={6} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x={ax} y={ay + 3} textAnchor="middle" fontFamily="var(--font-zh)" fontSize="10" fontWeight="700">
        {avoidZh}
      </text>
      <circle cx={cx} cy={cy} r={3} fill="currentColor" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// 12-hour radial clock (Liu Shi)
// ────────────────────────────────────────────────────────────
export function HourClock({
  hours,
  size = 280,
}: {
  hours: { zh: string; h: string; tone: "good" | "ok" | "bad" | "neutral" }[];
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 8;
  const rInner = size / 2 - 60;
  const slice = (2 * Math.PI) / 12;
  const tone = (t: string) => ({
    good: "var(--cinnabar)",
    ok: "var(--gold)",
    bad: "var(--foreground)",
    neutral: "currentColor",
  }[t] || "currentColor");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {hours.map((h, i) => {
        // Start at top (子=23-01) going clockwise
        const a1 = -Math.PI / 2 + i * slice + slice * 0.06;
        const a2 = -Math.PI / 2 + (i + 1) * slice - slice * 0.06;
        const x1o = cx + rOuter * Math.cos(a1);
        const y1o = cy + rOuter * Math.sin(a1);
        const x2o = cx + rOuter * Math.cos(a2);
        const y2o = cy + rOuter * Math.sin(a2);
        const x1i = cx + rInner * Math.cos(a1);
        const y1i = cy + rInner * Math.sin(a1);
        const x2i = cx + rInner * Math.cos(a2);
        const y2i = cy + rInner * Math.sin(a2);
        const path = `M ${x1i} ${y1i} L ${x1o} ${y1o} A ${rOuter} ${rOuter} 0 0 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${rInner} ${rInner} 0 0 0 ${x1i} ${y1i} Z`;
        const aMid = (a1 + a2) / 2;
        const rMid = (rOuter + rInner) / 2;
        const tx = cx + rMid * Math.cos(aMid);
        const ty = cy + rMid * Math.sin(aMid);
        const op = h.tone === "good" || h.tone === "bad" ? 0.85 : h.tone === "ok" ? 0.45 : 0.12;
        return (
          <g key={i}>
            <path d={path} fill={tone(h.tone)} opacity={op} />
            <text x={tx} y={ty + 5} textAnchor="middle" fontFamily="var(--font-zh)" fontSize="16" fontWeight="700" fill={h.tone === "good" || h.tone === "bad" ? "white" : "currentColor"}>
              {h.zh}
            </text>
          </g>
        );
      })}
      {/* Center label */}
      <circle cx={cx} cy={cy} r={rInner - 4} fill="var(--paper, var(--card))" />
      <text x={cx} y={cy - 6} textAnchor="middle" fontFamily="var(--font-zh)" fontSize="22" fontWeight="700" fill="var(--cinnabar)">
        十二
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontFamily="var(--font-zh)" fontSize="14" opacity="0.6">
        時辰
      </text>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// Star constellation (top 3 + dots for the rest)
// ────────────────────────────────────────────────────────────
export function StarConstellation({
  starsTop,
  totalActive,
  size = 200,
}: {
  starsTop: { zh: string; pillar: string }[];
  totalActive: number;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 24;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" />
      {/* Inner soft glow */}
      <circle cx={cx} cy={cy} r={r * 0.6} fill="var(--cinnabar)" opacity="0.04" />

      {/* Top 3 stars */}
      {starsTop.map((s, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / starsTop.length;
        const x = cx + r * 0.7 * Math.cos(a);
        const y = cy + r * 0.7 * Math.sin(a);
        const lx = cx + (r + 4) * Math.cos(a);
        const ly = cy + (r + 4) * Math.sin(a);
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--cinnabar)" strokeOpacity="0.4" strokeWidth="0.8" />
            <circle cx={x} cy={y} r={9} fill="var(--cinnabar)" />
            <text x={x} y={y + 4} textAnchor="middle" fontFamily="var(--font-zh)" fontSize="11" fontWeight="700" fill="white">
              {s.zh.slice(0, 2)}
            </text>
            <text x={lx} y={ly + 3} textAnchor={a > -Math.PI / 2 && a < Math.PI / 2 ? "start" : "end"} fontSize="9" opacity="0.7" fontFamily="var(--font-zh)">
              {s.zh}
            </text>
          </g>
        );
      })}

      {/* Dot for inactive stars */}
      {Array.from({ length: 25 - totalActive }).map((_, i) => {
        const a = (i / 25) * 2 * Math.PI;
        const x = cx + r * 0.4 * Math.cos(a);
        const y = cy + r * 0.4 * Math.sin(a);
        return <circle key={i} cx={x} cy={y} r={1.5} fill="currentColor" opacity="0.2" />;
      })}

      {/* Center count */}
      <text x={cx} y={cy + 4} textAnchor="middle" fontFamily="var(--font-serif)" fontSize="26" fontWeight="600" fill="var(--cinnabar)" style={{ fontVariantNumeric: "tabular-nums" }}>
        {totalActive}
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="9" opacity="0.55" letterSpacing="0.2em">
        / 25
      </text>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// LP timeline strip (10-year luck)
// ────────────────────────────────────────────────────────────
export function LpTimeline({
  pillars,
}: {
  pillars: { age: string; pillar: string; element: ElementCode; current?: boolean }[];
}) {
  const w = 720;
  const h = 90;
  const segW = w / pillars.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full">
      {pillars.map((p, i) => {
        const x = i * segW;
        return (
          <g key={i}>
            <rect
              x={x}
              y={20}
              width={segW - 4}
              height={50}
              fill={ELEMENT_TOKEN[p.element]}
              opacity={p.current ? 0.85 : 0.25}
            />
            {p.current && (
              <rect
                x={x}
                y={20}
                width={segW - 4}
                height={50}
                fill="none"
                stroke="var(--cinnabar)"
                strokeWidth="2.5"
              />
            )}
            <text
              x={x + (segW - 4) / 2}
              y={49}
              textAnchor="middle"
              fontFamily="var(--font-zh)"
              fontSize="20"
              fontWeight="700"
              fill={p.current ? "white" : "currentColor"}
            >
              {p.pillar}
            </text>
            <text x={x + (segW - 4) / 2} y={14} textAnchor="middle" fontSize="9" opacity="0.6" style={{ fontVariantNumeric: "tabular-nums" }}>
              {p.age}
            </text>
            {p.current && (
              <text x={x + (segW - 4) / 2} y={84} textAnchor="middle" fontSize="9" fill="var(--cinnabar)" letterSpacing="0.2em" fontWeight="700">
                NOW
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
