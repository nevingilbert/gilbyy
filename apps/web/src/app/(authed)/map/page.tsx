import { HubNode } from "./HubNode";

const HUB_X = 380;
const HUB_Y = 300;
const NODE_R = 52;

const levels = [
  { id: "bets", label: "Bets", emoji: "🎲", href: "/bets", x: 640, y: 100, fill: "#2563eb" },
  { id: "meals", label: "Meals", emoji: "🍽️", href: "/meals", x: 100, y: 300, fill: "#ea580c" },
  { id: "karts", label: "Karts", emoji: "🏎️", href: "/karts", x: 380, y: 510, fill: "#dc2626" },
];

export default function MapPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-emerald-950 p-4">
      <h1 className="mb-2 text-5xl font-bold tracking-tight text-amber-300">gilbyy</h1>
      <p className="mb-8 text-sm text-emerald-400">pick a level</p>

      <div className="w-full max-w-2xl">
        <svg viewBox="0 0 760 620" className="w-full" aria-label="Gilbyy level map">
          {/* Roads */}
          {levels.map((level) => (
            <g key={level.id}>
              <line
                x1={HUB_X} y1={HUB_Y} x2={level.x} y2={level.y}
                stroke="#78350f" strokeWidth={22} strokeLinecap="round"
              />
              <line
                x1={HUB_X} y1={HUB_Y} x2={level.x} y2={level.y}
                stroke="#fbbf24" strokeWidth={5} strokeLinecap="round"
                strokeDasharray="18 14"
              />
            </g>
          ))}

          {/* Hub — client component for logout */}
          <HubNode />

          {/* Level nodes */}
          {levels.map((level) => (
            <a key={level.id} href={level.href}>
              <circle
                cx={level.x} cy={level.y} r={NODE_R}
                fill={level.fill} stroke="#fff" strokeWidth={3}
                style={{ cursor: "pointer" }}
              />
              <text
                x={level.x} y={level.y - 10}
                textAnchor="middle" fontSize={24}
                style={{ pointerEvents: "none" }}
              >
                {level.emoji}
              </text>
              <text
                x={level.x} y={level.y + 20}
                textAnchor="middle" fontSize={14} fontWeight="600" fill="#fff"
                style={{ pointerEvents: "none" }}
              >
                {level.label}
              </text>
            </a>
          ))}
        </svg>
      </div>
    </main>
  );
}
