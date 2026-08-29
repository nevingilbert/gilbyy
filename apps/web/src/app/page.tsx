import { Game } from "./Game";
import { LEVELS } from "./levels";

export default function HomePage() {
  return (
    <>
      <Game />
      {/* The game is a canvas, so the levels need a real link each for crawlers,
          screen readers, and anyone whose browser won't run it. */}
      <nav aria-label="Levels" className="bg-emerald-950 px-4 pb-6 text-center">
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {LEVELS.map((level) => (
            <li key={level.id}>
              <a href={level.href} className="text-emerald-400 underline hover:text-amber-300">
                {level.emoji} {level.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
