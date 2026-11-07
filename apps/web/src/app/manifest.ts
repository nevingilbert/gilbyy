import type { MetadataRoute } from "next";
import { PALETTE } from "./palette";

/** Added to a home screen, the game opens on its own, full screen, in whichever way the phone is held. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gilbyy",
    short_name: "Gilbyy",
    description: "A little driving game. Load it up and drive around.",
    start_url: "/",
    display: "fullscreen",
    orientation: "any",
    background_color: PALETTE.fog,
    theme_color: PALETTE.fog,
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
