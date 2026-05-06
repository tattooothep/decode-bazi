"use client";

import { useMemo, useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DATASETS,
  ELEM,
  ME,
  ORBIT,
  CENTER,
  VIEWBOX,
  COMPASS,
  COMPASS_RADIUS,
  type Mode,
  type StarNode,
  type Tier,
} from "./data";

// ─────────────────────────────────────────────────────────────────────
// Constellation Chart · client-side interactivity (mode switch + hover)
// ─────────────────────────────────────────────────────────────────────

const TIER_TONE: Record<Tier, string> = {
  S:    "bg-[var(--cinnabar)] text-white",
  "A+": "bg-foreground text-background",
  A:    "bg-foreground/85 text-background",
  B:    "bg-foreground/35 text-background",
  F:    "bg-foreground/15 text-foreground/55",
};

// Convert (angle°, radius) to SVG (x,y). 0° = north, clockwise.
function polar(angleDeg: number, radius: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)];
}

export default function StarChart() {
  const [mode, setMode] = useState<Mode>("personal");
  const [hoverId, setHoverId] = useState<string | null>(null);

  return (
    <Tabs
      value={mode}
      onValueChange={(v) => setMode(v as Mode)}
      className="w-full"
    >
      {/* Mode bar — disguised as a manuscript ribbon */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-y border-foreground/15 py-3">
        <div className="flex items-baseline gap-3">
          <span
            className="text-[10px] text-muted-foreground"
            style={{ letterSpacing: "0.3em" }}
          >
            VIEW · 視角
          </span>
        </div>

        <TabsList className="bg-transparent">
          {(Object.keys(DATASETS) as Mode[]).map((m) => (
            <TabsTrigger
              key={m}
              value={m}
              className="font-serif text-[14px] data-[selected]:text-[var(--cinnabar)]"
            >
              <span>{DATASETS[m].label}</span>
              <span className="zh ml-1.5 text-[12px] opacity-60">
                {DATASETS[m].labelZh}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {(Object.keys(DATASETS) as Mode[]).map((m) => (
        <TabsContent key={m} value={m} className="mt-0">
          <ChartScene
            datasetMode={m}
            hoverId={hoverId}
            setHoverId={setHoverId}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Scene · holds SVG + side panel
// ─────────────────────────────────────────────────────────────────────

function ChartScene({
  datasetMode,
  hoverId,
  setHoverId,
}: {
  datasetMode: Mode;
  hoverId: string | null;
  setHoverId: (s: string | null) => void;
}) {
  const data = DATASETS[datasetMode];
  const supporters = data.nodes.filter((n) => n.bucket === "support");
  const bridges    = data.nodes.filter((n) => n.bucket === "bridge");
  const frictions  = data.nodes.filter((n) => n.bucket === "friction");

  const insights = useMemo(() => buildInsights(data.nodes), [data.nodes]);
  const hovered = data.nodes.find((n) => n.id === hoverId) ?? null;

  return (
    <div className="grid grid-cols-12 gap-6 lg:gap-10">
      {/* ── CHART ── */}
      <div className="col-span-12 lg:col-span-8">
        <div className="relative">
          {/* Decorative 圖 character watermark */}
          <div
            aria-hidden
            className="zh pointer-events-none absolute -top-4 -right-2 select-none text-foreground/[0.045]"
            style={{ fontSize: "13rem", lineHeight: 1, fontWeight: 700 }}
          >
            圖
          </div>

          <ChartSvg
            data={data}
            hoverId={hoverId}
            setHoverId={setHoverId}
          />

          {/* Stats pinned below */}
          <div className="mt-6 grid grid-cols-3 gap-4 border-t border-foreground/15 pt-4">
            <StatPill zh="助" label="ผู้สนับสนุน" count={supporters.length} accent />
            <StatPill zh="橋" label="สะพาน"      count={bridges.length} />
            <StatPill zh="沖" label="แรงต้าน"   count={frictions.length} dim />
          </div>
        </div>
      </div>

      {/* ── SIDE PANEL · insights + hover detail ── */}
      <div className="col-span-12 space-y-5 lg:col-span-4">
        {/* Hovered node detail */}
        <div
          className="border border-foreground/15 bg-card p-5 transition-opacity"
          style={{ opacity: hovered ? 1 : 0.6 }}
        >
          <div
            className="text-[10px] text-muted-foreground"
            style={{ letterSpacing: "0.3em" }}
          >
            {hovered ? "STAR · 宿" : "HOVER A STAR"}
          </div>

          {hovered ? (
            <>
              <div className="mt-3 flex items-baseline gap-3">
                <span
                  className="zh leading-none"
                  style={{
                    fontSize: "3rem",
                    color:
                      hovered.bucket === "friction"
                        ? "var(--muted-foreground)"
                        : ELEM[hovered.element].color,
                    fontWeight: 600,
                    opacity: hovered.bucket === "friction" ? 0.65 : 1,
                  }}
                >
                  {hovered.stemZh}
                </span>
                <div>
                  <h4 className="font-serif text-[20px] tracking-tight">
                    {hovered.name}
                  </h4>
                  <p className="text-[12px] text-muted-foreground">
                    {hovered.relationship}
                  </p>
                </div>
                <div className="ml-auto">
                  <TierBadge tier={hovered.tier} />
                </div>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-foreground/80">
                <span
                  className="mr-1 font-serif italic text-[var(--cinnabar)]/70"
                  aria-hidden
                >
                  “
                </span>
                {hovered.note}
              </p>
            </>
          ) : (
            <p className="mt-3 font-serif text-[13px] italic leading-relaxed text-muted-foreground">
              เลื่อนเมาส์ผ่านดวงดาวบนแผนผัง
              <br />
              เพื่อดูรายละเอียดของแต่ละคน
            </p>
          )}
        </div>

        {/* Insights — like manuscript marginalia */}
        <div className="space-y-3">
          <div
            className="text-[10px] text-muted-foreground"
            style={{ letterSpacing: "0.3em" }}
          >
            READINGS · 占
          </div>
          {insights.map((ins, i) => (
            <InsightCard key={i} {...ins} />
          ))}
        </div>

        {/* Legend */}
        <div className="border border-foreground/15 bg-card p-5">
          <div
            className="text-[10px] text-muted-foreground"
            style={{ letterSpacing: "0.3em" }}
          >
            LEGEND · 圖例
          </div>
          <ul className="mt-3 space-y-2.5 text-[12px]">
            <li className="flex items-center gap-3">
              <Orbit ringTone="continuous" />
              <span>
                <span className="zh mr-1.5">助</span>วงใน · ผู้สนับสนุน · เส้นต่อเนื่อง
              </span>
            </li>
            <li className="flex items-center gap-3">
              <Orbit ringTone="solid" />
              <span>
                <span className="zh mr-1.5">橋</span>วงกลาง · สะพาน
              </span>
            </li>
            <li className="flex items-center gap-3">
              <Orbit ringTone="dashed" />
              <span>
                <span className="zh mr-1.5">沖</span>วงนอก · แรงต้าน · เส้นประ朱
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SVG chart
// ─────────────────────────────────────────────────────────────────────

function ChartSvg({
  data,
  hoverId,
  setHoverId,
}: {
  data: (typeof DATASETS)[Mode];
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
}) {
  // Pre-compute lines connecting center → support/friction
  const supportLines = data.nodes
    .filter((n) => n.bucket === "support")
    .map((n) => ({ id: n.id, end: polar(n.angle, ORBIT.support) }));
  const frictionLines = data.nodes
    .filter((n) => n.bucket === "friction")
    .map((n) => ({ id: n.id, end: polar(n.angle, ORBIT.friction) }));

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        className="block w-full max-w-full select-none"
        role="img"
        aria-label="Yongshen Network constellation chart"
      >
        {/* Defs */}
        <defs>
          <radialGradient id="ink-wash" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.10" />
            <stop offset="40%" stopColor="var(--ink)" stopOpacity="0.04" />
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft ink-wash backdrop */}
        <circle cx={CENTER} cy={CENTER} r={COMPASS_RADIUS - 4} fill="url(#ink-wash)" />

        {/* COMPASS RING — outermost, with cardinal Chinese marks */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={COMPASS_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="0.7"
        />

        {/* Tick marks every 15° */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = i * 15;
          const isMajor = angle % 45 === 0;
          const [x1, y1] = polar(angle, COMPASS_RADIUS);
          const [x2, y2] = polar(angle, COMPASS_RADIUS - (isMajor ? 12 : 5));
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeOpacity={isMajor ? 0.45 : 0.18}
              strokeWidth={isMajor ? 1 : 0.6}
            />
          );
        })}

        {/* Cardinal labels — 8 directions in 地支 */}
        {COMPASS.map((c) => {
          const [x, y] = polar(c.angle, COMPASS_RADIUS + 18);
          return (
            <text
              key={c.zh}
              x={x}
              y={y}
              fill="currentColor"
              opacity="0.55"
              fontSize="14"
              fontFamily="var(--font-zh)"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {c.zh}
            </text>
          );
        })}

        {/* THREE ORBIT RINGS */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={ORBIT.support}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="0.6"
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={ORBIT.bridge}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.13"
          strokeWidth="0.6"
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={ORBIT.friction}
          fill="none"
          stroke="var(--cinnabar)"
          strokeOpacity="0.22"
          strokeWidth="0.6"
          strokeDasharray="2 4"
        />

        {/* Orbit labels — small letterspaced annotations on top */}
        <OrbitLabel y={CENTER - ORBIT.support}  text="助 · SUPPORT" tone="default" />
        <OrbitLabel y={CENTER - ORBIT.bridge}   text="橋 · BRIDGE"  tone="muted" />
        <OrbitLabel y={CENTER - ORBIT.friction} text="沖 · FRICTION" tone="cinnabar" />

        {/* CONNECTION LINES — center to support (continuous), to friction (dashed cinnabar) */}
        {supportLines.map((l) => (
          <line
            key={`s-${l.id}`}
            x1={CENTER}
            y1={CENTER}
            x2={l.end[0]}
            y2={l.end[1]}
            stroke="currentColor"
            strokeOpacity={hoverId === l.id ? 0.55 : 0.16}
            strokeWidth={hoverId === l.id ? 1.5 : 0.75}
          />
        ))}
        {frictionLines.map((l) => (
          <line
            key={`f-${l.id}`}
            x1={CENTER}
            y1={CENTER}
            x2={l.end[0]}
            y2={l.end[1]}
            stroke="var(--cinnabar)"
            strokeOpacity={hoverId === l.id ? 0.7 : 0.28}
            strokeWidth={hoverId === l.id ? 1.5 : 0.8}
            strokeDasharray="3 5"
          />
        ))}

        {/* CENTER · cinnabar 我 seal — square stamp pressed at -4° */}
        <g transform={`translate(${CENTER} ${CENTER}) rotate(-4)`}>
          <rect
            x={-32}
            y={-32}
            width={64}
            height={64}
            fill="var(--cinnabar)"
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="2"
          />
          <text
            x={0}
            y={3}
            fill="white"
            fontFamily="var(--font-zh)"
            fontSize="34"
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {data.meZh}
          </text>
        </g>

        {/* DM character pinned just below the seal */}
        <text
          x={CENTER}
          y={CENTER + 56}
          fill="currentColor"
          opacity="0.7"
          fontSize="11"
          fontFamily="var(--font-serif)"
          fontStyle="italic"
          textAnchor="middle"
          letterSpacing="2"
        >
          {data.meSub}
        </text>

        {/* NODES — render last so they sit on top of lines */}
        {data.nodes.map((n) => (
          <Star
            key={n.id}
            node={n}
            isHovered={hoverId === n.id}
            onHover={() => setHoverId(n.id)}
            onLeave={() => setHoverId(null)}
          />
        ))}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Single star node
// ─────────────────────────────────────────────────────────────────────

function Star({
  node,
  isHovered,
  onHover,
  onLeave,
}: {
  node: StarNode;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const r = ORBIT[node.bucket];
  const [x, y] = polar(node.angle, r);
  const isFriction = node.bucket === "friction";
  const elemColor = ELEM[node.element].color;

  // Label offset along tangent (always pointing away from center)
  const labelDist = 28;
  const [lx, ly] = polar(node.angle, r + labelDist);
  const anchor = node.side === "right" ? "start" : "end";
  const labelDx = node.side === "right" ? 6 : -6;

  // Star marker size + inner stroke
  const dotR = isHovered ? 22 : 18;

  return (
    <g
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      className="cursor-pointer transition-transform"
      tabIndex={0}
      style={{ outline: "none" }}
    >
      {/* Halo on hover */}
      {isHovered && (
        <circle
          cx={x}
          cy={y}
          r={dotR + 8}
          fill={isFriction ? "var(--cinnabar)" : elemColor}
          opacity="0.10"
        />
      )}

      {/* Star disc */}
      <circle
        cx={x}
        cy={y}
        r={dotR}
        fill="var(--card)"
        stroke={isFriction ? "var(--cinnabar)" : elemColor}
        strokeWidth={isFriction ? 1.4 : 1.6}
        strokeOpacity={isFriction ? 0.7 : 0.9}
        strokeDasharray={isFriction ? "3 3" : undefined}
      />

      {/* Stem character — element-color, slightly muted on friction */}
      <text
        x={x}
        y={y + 1}
        fill={isFriction ? "var(--muted-foreground)" : elemColor}
        opacity={isFriction ? 0.85 : 1}
        fontSize="20"
        fontFamily="var(--font-zh)"
        fontWeight="600"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {node.stemZh}
      </text>

      {/* Tier pip · top-right of star */}
      <g transform={`translate(${x + dotR - 4} ${y - dotR + 4})`}>
        <rect
          x={-5}
          y={-5}
          width={10}
          height={10}
          fill={
            node.tier === "S"
              ? "var(--cinnabar)"
              : node.tier === "F"
              ? "transparent"
              : "var(--foreground)"
          }
          stroke="var(--card)"
          strokeWidth="1.5"
        />
      </g>

      {/* Label — tangential annotation */}
      <g transform={`translate(${lx + labelDx} ${ly})`}>
        <text
          x={0}
          y={0}
          fill="currentColor"
          opacity={isHovered ? 1 : 0.7}
          fontSize="11"
          fontFamily="var(--font-sans)"
          textAnchor={anchor}
          dominantBaseline="middle"
          fontWeight={isHovered ? 600 : 500}
        >
          {node.name}
        </text>
        <text
          x={0}
          y={13}
          fill="currentColor"
          opacity="0.5"
          fontSize="9.5"
          fontFamily="var(--font-serif)"
          fontStyle="italic"
          textAnchor={anchor}
          dominantBaseline="middle"
        >
          {node.relationship}
        </text>
      </g>
    </g>
  );
}

function OrbitLabel({
  y,
  text,
  tone,
}: {
  y: number;
  text: string;
  tone: "default" | "muted" | "cinnabar";
}) {
  const fill =
    tone === "cinnabar"
      ? "var(--cinnabar)"
      : tone === "muted"
      ? "currentColor"
      : "currentColor";
  const opacity = tone === "cinnabar" ? 0.7 : tone === "muted" ? 0.35 : 0.45;
  return (
    <g>
      {/* Background ivory cut so text sits above ring */}
      <rect
        x={CENTER - 60}
        y={y - 7}
        width={120}
        height={14}
        fill="var(--background)"
      />
      <text
        x={CENTER}
        y={y + 1}
        fill={fill}
        opacity={opacity}
        fontSize="9"
        fontFamily="var(--font-sans)"
        fontWeight="500"
        letterSpacing="2"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {text}
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────
// UI bits
// ─────────────────────────────────────────────────────────────────────

function StatPill({
  zh,
  label,
  count,
  accent,
  dim,
}: {
  zh: string;
  label: string;
  count: number;
  accent?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className={`zh ${
          accent ? "text-[var(--cinnabar)]" : dim ? "text-foreground/40" : "text-foreground/85"
        }`}
        style={{ fontSize: "1.75rem", fontWeight: 600, lineHeight: 1 }}
      >
        {zh}
      </span>
      <div>
        <div
          className="font-serif text-[28px] tabular-nums leading-none"
          style={{ fontWeight: 600 }}
        >
          {count}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      className={`inline-flex h-5 min-w-[28px] items-center justify-center px-1.5 font-serif text-[11px] ${TIER_TONE[tier]}`}
      style={{
        fontVariant: "small-caps",
        letterSpacing: "0.03em",
        fontWeight: 600,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)",
      }}
      aria-label={`Tier ${tier}`}
    >
      {tier}
    </span>
  );
}

function Orbit({ ringTone }: { ringTone: "continuous" | "solid" | "dashed" }) {
  return (
    <span
      aria-hidden
      className="block h-2 w-8 shrink-0"
      style={{
        borderTop:
          ringTone === "continuous"
            ? "1.5px solid currentColor"
            : ringTone === "solid"
            ? "1px solid currentColor"
            : "1.5px dashed var(--cinnabar)",
        opacity: ringTone === "solid" ? 0.4 : 0.85,
      }}
    />
  );
}

function InsightCard({
  tone,
  zh,
  title,
  body,
}: {
  tone: "good" | "warn" | "neutral";
  zh: string;
  title: string;
  body: string;
}) {
  const accent =
    tone === "good"
      ? "border-l-[var(--jade)]"
      : tone === "warn"
      ? "border-l-[var(--cinnabar)]"
      : "border-l-foreground/30";
  return (
    <div
      className={`border border-foreground/12 border-l-[3px] bg-card p-4 ${accent}`}
    >
      <div className="flex items-baseline gap-2">
        <span className="zh text-[14px] text-foreground/85">{zh}</span>
        <h5 className="font-serif text-[14px] tracking-tight">{title}</h5>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/75">
        {body}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Insight builder — scans dataset for actionable patterns
// ─────────────────────────────────────────────────────────────────────

function buildInsights(nodes: StarNode[]) {
  const out: { tone: "good" | "warn" | "neutral"; zh: string; title: string; body: string }[] = [];

  // 1) Strongest supporter
  const topS = nodes.find((n) => n.tier === "S" && n.bucket === "support");
  if (topS) {
    out.push({
      tone: "good",
      zh: "助",
      title: `${topS.name} (${topS.stemZh}) อยู่ใกล้ที่สุด`,
      body: `${ELEM[topS.element].subTh} · ${topS.relationship} — ขอความช่วยเหลือได้ก่อนทำเรื่องใหญ่`,
    });
  }

  // 2) Earliest friction warning
  const topF = nodes.find((n) => n.bucket === "friction");
  if (topF) {
    out.push({
      tone: "warn",
      zh: "沖",
      title: `${topF.name} (${topF.stemZh}) ใกล้เกินในเดือนนี้`,
      body: `${ELEM[topF.element].subTh} · ${topF.relationship} — เลื่อนนัดยาวออก หรือ พบผ่านบุคคลที่ 3`,
    });
  }

  // 3) Bridge note
  const bridgeCount = nodes.filter((n) => n.bucket === "bridge").length;
  out.push({
    tone: "neutral",
    zh: "橋",
    title: `${bridgeCount} สะพานในเครือข่ายปัจจุบัน`,
    body: `คน neutral · ใช้เป็นทางผ่านไปกลุ่มอื่นได้ · อย่าใช้เป็น core team`,
  });

  // 4) Element gap
  const elements = new Set(nodes.map((n) => n.element));
  const meYS = ME.yongshen.filter((y) => !elements.has(y));
  if (meYS.length > 0) {
    out.push({
      tone: "neutral",
      zh: "缺",
      title: `ขาดธาตุ ${meYS.map((y) => ELEM[y].subTh).join(" · ")}`,
      body: `เครือข่ายของคุณยังไม่มีคนธาตุนี้ — ลองเปิดวงเพิ่ม`,
    });
  }

  return out;
}
