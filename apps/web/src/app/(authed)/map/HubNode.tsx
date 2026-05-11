"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/app/actions/auth";

const HUB_X = 380;
const HUB_Y = 300;
const NODE_R = 52;

export function HubNode() {
  const router = useRouter();

  async function handleClick() {
    if (!window.confirm("Sign out of Gilbyy?")) return;
    await signOut();
    router.push("/");
  }

  return (
    <g onClick={handleClick} style={{ cursor: "pointer" }} role="button" aria-label="Sign out">
      <circle
        cx={HUB_X}
        cy={HUB_Y}
        r={NODE_R}
        fill="#1e1b4b"
        stroke="#fbbf24"
        strokeWidth={4}
      />
      <text x={HUB_X} y={HUB_Y - 10} textAnchor="middle" fontSize={24}>
        🏠
      </text>
      <text x={HUB_X} y={HUB_Y + 20} textAnchor="middle" fontSize={13} fill="#c7d2fe">
        home
      </text>
    </g>
  );
}
