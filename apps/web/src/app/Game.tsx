"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { achievementFor } from "./achievements";
import { CONVOY_MAX, Convoys, GATHER_REACH, lineUp, type ConvoyEvent } from "./convoy";
import { secondsUntil } from "./daylight";
import { ARRIVE, BOARD_REACH, DEPART, arrival, boardSpot, deckAt, departure, leaveSpot, rideOnDeck } from "./flight";
import { GarageMenu, fmtMiles } from "./GarageMenu";
import { currentGoal } from "./goals";
import { buildWorldOf } from "./island";
import { LANDMARKS, type LandmarkKind } from "./landmarks";
import { createMap } from "./map";
import { fmtAir, fmtTime, missionAt, startRun, tick, type Run } from "./mission-run";
import { stackTags, type TagBox } from "./name-tags";
import { CHAT_RANGE, LocalNet, MAX_CHAT, PoseGate, SupabaseNet, isAway, worldTopic, type Net, type NetHandlers, type Peer } from "./net";
import { FlightCard, LandmarkCard, Leaderboard, NamePanel, SignInPanel, SoloBanner, StarterPicker } from "./Panels";
import { KEY_TURN, clampOrbit, dragOrbit, photoName, zoomOrbit, type Orbit } from "./photo";
import { makeCar, noInput, step, yawRateOf, type Input } from "./physics";
import { countFound, eggKey, foundLine } from "./places";
import { createView, type Film, type Garage } from "./scene";
import { METRES_PER_MILE, STOCK_LOADOUT, itemKey, specFor, type Loadout } from "./shop";
import { GARAGE_NAMES } from "./showroom";
import { LocalStore, SupabaseStore, type Profile, type Store } from "./store";
import { currentSession, onSessionChange, onlineConfigured, signInWithGoogle, signOut, supabase } from "./supabase";
import { TIDE, ebbAt, untilEbb } from "./tide";
import { trainObstacles } from "./track";
import { VEHICLES, type VehicleId } from "./vehicles";
import type { Ground, Mission, Obstacle, SiteStyle, WorldId } from "./world";
import { WORLDS, flightFrom, isWorld } from "./worlds";

/** Physics runs at a fixed rate, independent of the display's refresh rate. */
const STEP = 1 / 120;
const ENTER_TIME = 2.3;
const LEAVE_TIME = 2.4;
/** How long the picture takes to come up from black. */
const RISE_TIME = 0.6;
/** The longest the opening shot hangs over the camp waiting for a tent. */
const HOVER_LIMIT = 4;
/** Miles bank on the server this often while driving signed in. */
const FLUSH_EVERY = 15;
/** Signed in, everyone shares one clock (so one sun and one train), counted from a fixed moment. */
const SHARED_EPOCH = 1_790_000_000;
/** Within this of the café, two players can become friends; and this close to each other. */
const CAFE_SLACK = 6;
const FRIEND_REACH = 16;
/** When the campground was full, try again this often. */
const RETRY_JOIN = 60;
/**
 * Where this browser last saw a signed-in player's truck, so a reload builds that world
 * first and not the valley and then the island. Only ever a guess: the profile decides.
 */
const WORLD_HINT = "gilbyy:world";
const hintedWorld = (): WorldId | null => {
  try {
    const v = window.localStorage.getItem(WORLD_HINT);
    return isWorld(v) ? v : null;
  } catch {
    return null;
  }
};
const hintWorld = (world: WorldId | null) => {
  try {
    if (world) window.localStorage.setItem(WORLD_HINT, world);
    else window.localStorage.removeItem(WORLD_HINT);
  } catch {
    // Storage is off: the next load builds the valley first, and swaps if it has to.
  }
};

/** What a start arch on the sandbar says while the sea covers it, `seconds` before the tide is next out. Never a countdown: the sea is in no hurry. */
const tideLine = (seconds: number) =>
  `The sand's under the sea for now.${!Number.isFinite(seconds) ? "" : seconds < 50 ? " The tide's nearly out." : ` The tide's out again in about ${Math.max(1, Math.round(seconds / 60))} min.`}`;

const COMPASS = ["N", "·", "NE", "·", "E", "·", "SE", "·", "S", "·", "SW", "·", "W", "·", "NW", "·"];
const COMPASS_ITEM = 28;
const COMPASS_VIEW = COMPASS_ITEM * 8;
/** Metres a second to miles an hour, for the speedometer. */
const MPH = 3600 / METRES_PER_MILE;

type Mode = "boot" | "pick" | "drive" | "entering" | "garage" | "leaving" | "map" | "flying" | "photo";
type Presence = "solo" | "local" | "joining" | "online" | "full" | "away";
type Prompt =
  | { kind: "garage"; style: SiteStyle }
  /** At a start arch. `wait` is how many seconds until the tide lets it start (tide.ts): 0 for now, and for a course that needs no tide. */
  | { kind: "mission"; mission: Mission; wait: number }
  | { kind: "friend"; id: string; name: string; asked: boolean }
  /** At the door of the bank, church, school or casino (ADR 0012). */
  | { kind: "landmark"; id: LandmarkKind }
  /** On the apron behind the plane's tail (ADR 0014). */
  | { kind: "flight"; to: WorldId }
  /** At the convoy's arch, or gathering one: `lead` in bold, then `rest`. `act` if E does something. */
  | { kind: "convoy"; lead: string; rest: string; act: boolean }
  | null;
/** `crew` is the rest of a convoy or race: their names and how many flags each has passed. `place` is mine in a race. */
/** `air` is set on a course with a ramp: the longest the truck has been off the ground so far, shown in place of the clock. */
type RunHud = { name: string; clock: number; air: number | null; gate: number; of: number; through: boolean; crew: { name: string; passed: number }[]; place: number | null } | null;
type ChatShown = { key: number; from: string; text: string };

type Actions = {
  act(): void;
  leave(): void;
  toggleMap(): void;
  look(v: VehicleId): void;
  pick(v: VehicleId): void;
  preview(v: VehicleId, l: Loadout): void;
  buy(key: string): Promise<string | null>;
  /** Pays the fare and boards. Resolves to why not, or null once the truck is on its way up the ramp. */
  fly(): Promise<string | null>;
  fit(v: VehicleId, l: Loadout): void;
  setName(name: string): Promise<string | null>;
  leaderboard(): ReturnType<Store["leaderboard"]>;
  say(text: string): void;
  chatOpen(): boolean;
  /** Into photo mode from driving, or back out of it (ADR 0018). */
  photo(): void;
  /** Moves the photo camera round by a drag of so many pixels, or further off by `factor`. */
  turnPhoto(dx: number, dy: number): void;
  zoomPhoto(factor: number): void;
  /** Takes the picture. */
  snap(): void;
};
const noop = () => {};
/** At a start line before "go". Not the brake: held at a standstill, that reverses. */
const HELD: Input = { left: false, right: false, gas: false, brake: false };
/** Forces the on-screen prompt to be worked out again next frame. */
const STALE = "?";

const smooth = (lo: number, hi: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
const turnToward = (from: number, to: number, t: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
const wrapHalf = (t: number) => ((((t + 0.5) % 1) + 1) % 1) - 0.5;
/**
 * Hands a picture to the player: on a phone the share sheet, where Save Image puts it
 * with their photos; otherwise a download. Called straight from the key or the tap, as
 * sharing has to be.
 */
const keepPicture = (dataUrl: string, name: string) => {
  const raw = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const file = new File([bytes], name, { type: "image/png" });
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  if (window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    // Cancelling the sheet is a choice; anything else and it's saved the other way.
    navigator.share({ files: [file] }).catch((e: unknown) => {
      if (!(e instanceof DOMException && e.name === "AbortError")) download();
    });
  } else download();
};
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
/** What a course for friends is called in passing. */
const noun = (m: Mission) => (m.race ? "race" : "convoy");
/** Compass position, 0–1 clockwise from north, of a heading (0 faces +z, which is south). */
const bearingOf = (heading: number) => (((Math.PI - heading) / (Math.PI * 2)) % 1 + 1) % 1;

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const fullRef = useRef<HTMLCanvasElement>(null);
  const compassRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const cloudRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<Input>(noInput());
  const modeRef = useRef<Mode>("boot");
  const typingRef = useRef(false);
  const panelRef = useRef(false);
  /** Things the UI asks the game loop to do; the loop owns all the state. */
  const actions = useRef<Actions>({
    act: noop, leave: noop, toggleMap: noop, look: noop, pick: noop, preview: noop, fit: noop, say: noop,
    photo: noop, turnPhoto: noop, zoomPhoto: noop, snap: noop,
    buy: async () => null, fly: async () => null, setName: async () => null, leaderboard: async () => [], chatOpen: () => false,
  });
  const turnRef = useRef(0);

  const [mode, setMode] = useState<Mode>("boot");
  const [ready, setReady] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [garageStyle, setGarageStyle] = useState<SiteStyle>("workshop");
  const [toast, setToast] = useState<string | null>(null);
  const [presence, setPresence] = useState<Presence>("solo");
  const [online, setOnline] = useState(false);
  const [people, setPeople] = useState(1);
  const [naming, setNaming] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [board, setBoard] = useState(false);
  const [visiting, setVisiting] = useState<LandmarkKind | null>(null);
  const [boarding, setBoarding] = useState<WorldId | null>(null);
  const [run, setRun] = useState<RunHud>(null);
  const [count, setCount] = useState<number | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [chat, setChat] = useState<ChatShown[]>([]);
  const [canChat, setCanChat] = useState(false);
  const [canPhoto, setCanPhoto] = useState(true);

  useEffect(() => {
    typingRef.current = typing;
    panelRef.current = naming || signingIn || board || visiting !== null || boarding !== null;
  }, [typing, naming, signingIn, board, visiting, boarding]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    // For checking things by screenshot: ?hour=22 starts the clock there, ?garage=2 parks
    // you at a garage's door, ?at=x,z,heading drops you anywhere, ?airport parks you behind
    // the plane, ?world=island starts single player there, ?rig= skips the picker,
    // ?miles= starts single player with miles to spend, ?net=local plays across tabs of
    // this browser with no account, ?tide=low or high holds the island's tide there.
    // Not linked from anywhere.
    const params = new URLSearchParams(window.location.search);
    const localNet = params.get("net") === "local";
    const worldParam = params.get("world");
    /** Where single player starts: the valley, unless the address says otherwise. Nothing is saved, so nowhere else. */
    const soloWorld: WorldId = isWorld(worldParam) ? worldParam : "valley";

    // Signed in, the truck is wherever its last flight left it. The profile says where, but
    // not for a moment yet, so start with this browser's best guess and swap if it's wrong.
    let world = buildWorldOf(isWorld(worldParam) ? worldParam : ((onlineConfigured && !localNet && hintedWorld()) || "valley"));
    let courses = world.missions.filter((m) => m.crew === 1);
    let crewCourses = world.missions.filter((m) => m.crew > 1);
    let store: Store = new LocalStore("local", null, soloWorld);
    let net: Net | null = null;
    /** A channel for one world's players, once it's known who this is. Each world has its own (net.ts). */
    let netFor: ((world: WorldId) => Net) | null = null;
    const rigParam = VEHICLES.find((v) => v.id === params.get("rig"))?.id ?? null;
    let rig: VehicleId = rigParam ?? "bluff";
    let loadout: Loadout = { ...STOCK_LOADOUT };
    let spec = specFor(rig, loadout);
    const car = makeCar(world, world.start.x, world.start.z, world.start.heading, spec);
    let view: ReturnType<typeof createView>;
    try {
      view = createView(canvas, world, rig, loadout);
    } catch {
      if (fadeRef.current) fadeRef.current.style.opacity = "0";
      return; // No WebGL. The fog-coloured backdrop is all there is to see.
    }
    const mapOf = () => createMap(world, (key) => store.discover(key), (cell) => store.explore(cell));
    let map = mapOf();
    let pitches = world.pitches;

    // The opening. Signed in, the truck belongs at a tent, and which one isn't known for a
    // second or two. So the picture comes up on a shot high over the camp, and the camera
    // comes down to the truck once it is where it belongs (`land`). If the truck is put
    // somewhere new after that, the picture dips to black so the move isn't seen (`dip`).
    let opening = onlineConfigured && !localNet && !params.has("at") && !params.has("garage") && !params.has("airport");
    let rising = opening ? 0 : -1;
    if (fadeRef.current) fadeRef.current.style.opacity = opening ? "1" : "0";
    if (opening) view.flyIn();
    const land = () => {
      if (opening) view.land();
      opening = false;
    };
    const dip = () => {
      rising = 0;
      view.cut();
      if (fadeRef.current) fadeRef.current.style.opacity = "1";
    };

    const at = (params.get("at") ?? "").split(",").map(Number);
    const startHour = Number(params.get("hour"));
    /** How far out the tide is held, in metres below high water, or null to let it come and go. */
    const heldTide = params.get("tide") === "low" ? TIDE.fall : params.get("tide") === "high" ? 0 : null;
    const startGarage = view.garages[Number(params.get("garage"))];

    // The physics sees the train and other players' trucks as obstacles on top of the static world.
    let moving: Obstacle[] = [];
    // Through `world`, not a copy of it: a flight puts another world up.
    const ground: Ground = {
      height: (x, z) => world.height(x, z),
      waterAt: (x, z) => world.waterAt(x, z),
      slipAt: (x, z) => world.slipAt(x, z),
      limit: world.limit,
      obstaclesNear: (x, z) => {
        const still = world.obstaclesNear(x, z);
        const near = moving.filter((o) => Math.abs(o.x - x) < 24 && Math.abs(o.z - z) < 24);
        return near.length ? [...still, ...near] : still;
      },
    };

    const setModeBoth = (m: Mode) => {
      modeRef.current = m;
      setMode(m);
    };

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let shared = false;
    let time = params.has("hour") && Number.isFinite(startHour) ? secondsUntil(startHour) : 0;
    let first = true;
    let lastDistance = 0;
    let unbanked = 0;
    let bankClock = 0;
    /** The speedometer's reading, eased so bumps don't make it flicker. */
    let gauge = 0;
    let flushClock = 0;
    let nearGarage = -1;
    let landmarkHere: LandmarkKind | null = null;
    /** Whether the truck is waiting behind the plane, where E opens the flight's card. */
    let flightHere = false;
    /**
     * A flight in progress (ADR 0014): which half of its film is showing (`out` of this
     * world, or `in` to the next), how far into it, and where the truck was when it boarded.
     */
    let trip: { to: WorldId; leg: "out" | "in"; t: number; from: { x: number; z: number; heading: number } } | null = null;
    /** The truck came here by plane, so it isn't moved to its tent when one is found. */
    let landed = false;
    let cut = { garage: -1, t: 0, from: { x: 0, z: 0, heading: 0 } };
    let toastTimer = 0;
    let running: Run | null = null;
    let runIndex = -1;
    let shownRun = "";
    let shownPrompt = "";
    let target: { x: number; z: number } | null = null;
    let targetClock = 0;
    let tent = -1;
    let retryClock = 0;
    let lastPose = { x: car.x, z: car.z };
    const gate = new PoseGate();
    const peers = new Map<string, Peer>();
    const friends = new Map<string, string>();
    const askedBy = new Set<string>();
    const bubbles = new Map<string, { text: string; until: number }>();
    /** Each tag's element, the words it was measured with and its size, and how far up it's drawn (null while off screen). */
    const tags = new Map<string, { el: HTMLDivElement; text: string; w: number; h: number; lift: number | null }>();
    /** Where `stackTags` last put each tag, and when. */
    let tagLifts = new Map<string, number>();
    let tagsAt = 0;
    let friendHere: { id: string; name: string } | null = null;
    let chatKey = 0;
    // A convoy or a race: what E does at its arch, my time through its finish while the
    // others come in, and a race's results once everyone is through.
    const convoysOf = () => new Convoys(() => store.get().id, (msg) => net?.convoy(msg), world.missions);
    let convoys = convoysOf();
    let convoyAct: (() => void) | null = null;
    let throughIn: number | null = null;
    let raceOver: string | null = null;
    // The longest jump at each ramp since the page loaded. A line on screen, like a race's result: kept nowhere.
    const bestAir = new Map<string, number>();
    // Presence as the loop sees it, alongside the copy React renders.
    let presenceNow: Presence = "solo";
    const present = (p: Presence) => {
      presenceNow = p;
      setPresence(p);
    };

    const say = (msg: string, seconds = 5) => {
      setToast(msg);
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setToast(null), seconds * 1000);
    };
    const nameOf = (id: string) => peers.get(id)?.name ?? friends.get(id) ?? "Someone";

    /** Matches a canvas's pixels to its box. Setting either side clears it, so only when it's wrong. */
    const sizeCanvas = (c: HTMLCanvasElement | null) => {
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
    };
    const resize = () => {
      view.resize();
      sizeCanvas(miniRef.current);
      sizeCanvas(fullRef.current);
    };
    resize();
    window.addEventListener("resize", resize);

    const placeOnGround = (x: number, z: number, heading: number, sink: number) => {
      car.x = x;
      car.z = z;
      car.heading = heading;
      car.y = world.height(x, z) + spec.ride - sink;
      car.vy = 0;
      car.speed = car.side = 0;
      car.pitch = car.roll = car.pitchV = car.rollV = 0;
      car.steer = 0;
      car.grounded = true;
      car.groundY = world.height(x, z);
    };

    /** `tell` is false for a look in the picker, which isn't a choice the others need to hear about. */
    const fitRig = (v: VehicleId, l: Loadout, tell = true) => {
      rig = v;
      loadout = l;
      spec = specFor(v, l);
      view.setRig(v, l);
      if (tell) net?.update({ vehicle: v, loadout: l });
    };

    // ——— Progress ———

    let shownMiles = -1;
    let shownLook = "";
    let unsubscribe = () => {};
    const attach = (s: Store) => {
      unsubscribe();
      store = s;
      map.setFound(s.get().found, true);
      map.setExplored(s.explored(), true);
      const sync = () => {
        const p = store.get();
        map.setFound(p.found);
        const look = `${p.vehicle}|${JSON.stringify(p.loadout)}|${p.owned.length}|${p.goals.length}|${p.found.length}|${p.name}|${p.world}`;
        if (Math.floor(p.balance * 10) !== shownMiles || look !== shownLook) {
          shownMiles = Math.floor(p.balance * 10);
          shownLook = look;
          setProfile(p);
        }
      };
      unsubscribe = store.subscribe(sync);
      sync();
      setOnline(store.online);
    };
    attach(store);

    /**
     * Takes down the world that's up and puts up another: its ground, its map, its courses
     * and its tents. The truck is put at its start, to be moved from there.
     */
    const enterWorld = (id: WorldId) => {
      world = buildWorldOf(id);
      view.setWorld(world);
      map = mapOf();
      map.setFound(store.get().found, true);
      map.setExplored(store.explored(), true);
      courses = world.missions.filter((m) => m.crew === 1);
      crewCourses = world.missions.filter((m) => m.crew > 1);
      convoys = convoysOf();
      pitches = world.pitches;
      moving = [];
      nearGarage = -1;
      landmarkHere = friendHere = target = null;
      flightHere = false;
      shownPrompt = STALE;
      placeOnGround(world.start.x, world.start.z, world.start.heading, 0);
    };

    /** An achievement just earned, announced once the truck is back on the road. */
    let cheer: string | null = null;
    const goal = (id: string) => {
      if (store.get().goals.includes(id)) return;
      store.markGoal(id);
      cheer = achievementFor(id)?.name ?? cheer;
    };

    // ——— Other players ———

    const refreshFriends = async () => {
      const list = await store.friends();
      friends.clear();
      for (const f of list) friends.set(f.id, peers.get(f.id)?.name ?? f.name);
      net?.listen([...friends.keys()]);
    };

    const showChat = (from: string, text: string) => {
      bubbles.set(from, { text, until: performance.now() / 1000 + 8 });
      const key = ++chatKey;
      setChat((c) => [...c.slice(-4), { key, from: from === store.get().id ? "You" : nameOf(from), text }]);
      window.setTimeout(() => setChat((c) => c.filter((l) => l.key !== key)), 14000);
    };

    /** Tells the others where the truck is when it's due, or at once if someone `asked`. */
    const sharePose = (now: number, asked = false) => {
      const m = modeRef.current;
      if (!net || tent < 0 || m === "boot" || m === "pick") return;
      const pose = { x: car.x, y: car.y, z: car.z, heading: car.heading, pitch: car.pitch, roll: car.roll, speed: car.speed, steer: car.steer, turn: yawRateOf(car, spec) };
      // In photo mode the truck stands still here, so it does there too, rather than being guessed on down the road.
      if (m === "photo") Object.assign(pose, { speed: 0, turn: 0 });
      if (!asked && !gate.due(pose, now, peers.size + 1)) return;
      net.sendPose(pose);
      gate.sent(pose, now);
    };

    const handlers: NetHandlers = {
      peers(list) {
        // Someone new hasn't heard where we are (a parked truck sends nothing), so tell them.
        if (list.some((p) => !peers.has(p.id))) gate.forget();
        peers.clear();
        for (const p of list) {
          peers.set(p.id, p);
          if (friends.has(p.id)) friends.set(p.id, p.name);
          if (store instanceof LocalStore) store.rememberName(p.id, p.name);
        }
        view.remotes.sync(list);
        setPeople(list.length + 1);
      },
      pose: (id, pose) => view.remotes.pose(id, pose, performance.now() / 1000),
      // Answered here, not on the next frame: a tab in the background draws no frames.
      wanted: () => sharePose(performance.now() / 1000, true),
      asked(from) {
        askedBy.add(from);
        store.noteAsked(from);
        say(`${nameOf(from)} wants to be friends. Press F next to them at the café.`, 7);
        shownPrompt = STALE;
      },
      friended(from) {
        store.noteAsked(from);
        void refreshFriends().then(() => say(`You and ${nameOf(from)} are friends now. Press T near them to chat.`, 7));
      },
      convoy: (msg) => onConvoy(convoys.hear(msg, performance.now() / 1000, (id) => friends.has(id))),
      chat(line) {
        if (!friends.has(line.from)) return;
        const them = view.remotes.positions().find((p) => p.id === line.from);
        if (!them || Math.hypot(them.x - car.x, them.z - car.z) > CHAT_RANGE) return;
        showChat(line.from, line.text);
      },
    };

    /** Takes a tent in the shared valley; spawns there if you haven't driven off yet. */
    const join = async () => {
      const me = store.get();
      if (!net || !me.name) return;
      present("joining");
      const result = await net.join({ id: me.id, name: me.name, vehicle: rig, loadout });
      if (cancelled) return;
      if ("error" in result) {
        present("full");
        say(`Couldn't reach the other drivers (${result.error}). Driving alone for now.`, 7);
        return;
      }
      if ("full" in result) {
        present("full");
        say("All 30 tents are taken, so no one new can join right now. Driving alone; we'll keep trying.", 8);
        return;
      }
      tent = result.tent;
      present(localNet ? "local" : "online");
      const bay = pitches[tent].parking;
      const m = modeRef.current;
      const placed = params.has("at") || params.has("garage");
      if (!placed && !landed && (m === "boot" || m === "pick" || (m === "drive" && car.distance < 30))) {
        placeOnGround(bay.x, bay.z, bay.heading, 0);
        // During the opening the truck hasn't been shown yet, and `boot` lands the camera on it.
        if (!opening) dip();
      }
      say(`Tent ${tent + 1} is yours.`);
      await refreshFriends();
    };

    // ——— Away ———

    // A tab left in the background, or a game nobody is touching, gives its tent back so
    // someone else can have it, and takes one again the moment the player returns. This
    // runs on a timer, not in the frame loop, because a hidden tab draws no frames.
    let touchedAt = Date.now();
    let hiddenAt = document.hidden ? Date.now() : 0;
    let leftAt = 0;
    const goAway = () => {
      if (!net || tent < 0) return;
      if (convoys.state) giveUp(`You were away, so you've left the ${noun(convoys.state.mission)}.`);
      net.leave();
      leftAt = Date.now();
      tent = -1;
      peers.clear();
      view.remotes.sync([]);
      setPeople(1);
      present("away");
      void store.flush();
    };
    const comeBack = () => {
      if (presenceNow !== "away") return;
      present("joining");
      // If this comes right on the heels of leaving, let the old channel finish closing first.
      window.setTimeout(() => !cancelled && void join(), Math.max(0, 1000 - (Date.now() - leftAt)));
    };
    const touched = () => {
      touchedAt = Date.now();
      comeBack();
    };
    const onVisibility = () => {
      hiddenAt = document.hidden ? Date.now() : 0;
      if (!document.hidden) touched();
    };
    const awayCheck = window.setInterval(() => {
      const now = Date.now();
      if (isAway(hiddenAt ? (now - hiddenAt) / 1000 : 0, (now - touchedAt) / 1000)) goAway();
    }, 15000);
    window.addEventListener("keydown", touched);
    window.addEventListener("pointerdown", touched);
    document.addEventListener("visibilitychange", onVisibility);

    /** Signed in (or testing across tabs): load the profile, ask for a name, take a tent. */
    const boot = async () => {
      if (localNet) {
        const id = `tab-${Math.random().toString(36).slice(2, 8)}`;
        attach(new LocalStore(id, null, soloWorld));
        netFor = (w) => new LocalNet(id, handlers, worldTopic(w));
      } else {
        const session = await currentSession();
        const sb = supabase();
        if (session && sb) {
          try {
            attach(await SupabaseStore.open(sb));
            netFor = (w) => new SupabaseNet(sb, session.user.id, handlers, worldTopic(w));
          } catch {
            say("Couldn't load your garage. Driving solo for now.");
          }
        }
        hintWorld(store.online ? store.get().world : null);
      }
      if (cancelled) return;
      // The world that was built first was a guess. If the truck is somewhere else, go
      // there before anything more is shown.
      if (store.get().world !== world.id) {
        enterWorld(store.get().world);
        dip();
        if (opening) view.flyIn();
      }
      if (netFor) net = netFor(world.id);
      const miles = Number(params.get("miles"));
      if (!store.online && miles > 0) store.addMiles(miles);
      if (store.online) shared = true;
      if (localNet) shared = true;
      if (shared) time = Date.now() / 1000 - SHARED_EPOCH;

      const p = store.get();
      if (p.vehicle) fitRig(p.vehicle, p.loadout);
      else if (rigParam && !store.online) {
        await store.buy(itemKey("vehicle", rigParam));
        if (!(await store.equip(rigParam, loadout))) fitRig(rigParam, loadout);
      }
      if (net && p.name) {
        const joining = join();
        // Take the tent before coming down to the truck, but don't hang over the camp for
        // long if the valley is slow to answer.
        if (opening) await Promise.race([joining, new Promise((r) => setTimeout(r, HOVER_LIMIT * 1000))]);
      }
      if (cancelled) return;
      setModeBoth(store.get().vehicle ? "drive" : "pick");
      if (net && !p.name) setNaming(true);
      land();
    };
    void boot();

    // Sign-in lands back on this page (or in another tab): start again as that player.
    let hadSession: boolean | null = null;
    const stopWatching = onSessionChange((session) => {
      const has = Boolean(session);
      if (hadSession !== null && has !== hadSession) window.location.reload();
      hadSession = has;
    });

    // ——— What the UI can ask for ———

    actions.current.look = (v) => {
      if (modeRef.current === "pick") fitRig(v, loadout, false);
    };
    actions.current.pick = (v) => {
      void store.equip(v, loadout).then((err) => {
        if (err) return say(err);
        fitRig(v, loadout);
        setModeBoth("drive");
      });
    };
    actions.current.preview = (v, l) => view.previewShowroom(v, l);
    actions.current.buy = async (key) => {
      await store.flush();
      const err = await store.buy(key);
      if (!err) goal("buy");
      return err;
    };
    actions.current.fly = async () => {
      const spot = boardSpot(world.airport);
      if (modeRef.current !== "drive" || trip || running || convoys.state || Math.hypot(car.x - spot.x, car.z - spot.z) > BOARD_REACH + 2) {
        return "Pull up behind the plane first.";
      }
      const to = flightFrom(world.id);
      inputRef.current = noInput();
      // What's been driven since the last bank counts toward the fare.
      store.addMiles(unbanked);
      unbanked = 0;
      const err = await store.fly(to);
      if (err || cancelled) return err;
      if (store.online) hintWorld(to);
      // Aboard. The others here see the truck go: each world's players have their own channel.
      if (net) {
        net.leave();
        net = null;
        tent = -1;
        peers.clear();
        view.remotes.sync([]);
        setPeople(1);
        present("joining");
      }
      trip = { to, leg: "out", t: 0, from: { x: car.x, z: car.z, heading: car.heading } };
      setPrompt(null);
      shownPrompt = "";
      setBoarding(null);
      setModeBoth("flying");
      return null;
    };
    actions.current.fit = (v, l) => {
      void store.equip(v, l).then((err) => {
        if (err) return say(err);
        fitRig(v, l);
        view.previewShowroom(v, l);
      });
    };
    actions.current.setName = async (name) => {
      const err = await store.setName(name);
      if (!err) {
        setNaming(false);
        net?.update({ name: store.get().name ?? name });
        if (tent < 0) void join();
      }
      return err;
    };
    actions.current.leaderboard = () => store.leaderboard();
    actions.current.chatOpen = () => nearbyFriends().length > 0;
    actions.current.say = (text) => {
      const t = text.trim().slice(0, MAX_CHAT);
      const to = nearbyFriends();
      if (!t || !net || !to.length) return;
      net.say(to, t);
      showChat(store.get().id, t);
    };

    const nearbyFriends = () =>
      view.remotes.positions().filter((p) => friends.has(p.id) && Math.hypot(p.x - car.x, p.z - car.z) < CHAT_RANGE).map((p) => p.id);

    /** Seconds until the tide has `m` dry and it can be started: 0 if it can be now, as any course off the sandbar always can. */
    const tideWait = (m: Mission) => (m.ebb === undefined ? 0 : heldTide === null ? untilEbb(time, m.ebb) : heldTide >= m.ebb ? 0 : Infinity);

    /** E (or the on-screen button): whatever is on offer here. */
    actions.current.act = () => {
      if (modeRef.current !== "drive") return;
      if (convoyAct) return convoyAct();
      if (nearGarage >= 0 && !running) {
        inputRef.current = noInput();
        cut = { garage: nearGarage, t: 0, from: { x: car.x, z: car.z, heading: car.heading } };
        void store.flush();
        setPrompt(null);
        shownPrompt = "";
        setModeBoth("entering");
        return;
      }
      const m = !running && !convoys.state && missionAt(courses, car.x, car.z);
      if (m) {
        // Under the sea for now: the prompt says how long until it isn't.
        if (tideWait(m) > 0) return;
        // Line up just behind the start arch, facing the first gate.
        placeOnGround(m.start.x - Math.sin(m.start.heading) * 7, m.start.z - Math.cos(m.start.heading) * 7, m.start.heading, 0);
        running = startRun(m);
        runIndex = world.missions.indexOf(m);
        lastPose = { x: car.x, z: car.z };
        setPrompt(null);
        shownPrompt = "";
        return;
      }
      if (flightHere) {
        inputRef.current = noInput();
        setBoarding(flightFrom(world.id));
        return;
      }
      if (landmarkHere && !running && !convoys.state) {
        inputRef.current = noInput();
        // Looking inside is what finds an easter egg (ADR 0016). It pays nothing.
        store.discover(eggKey(landmarkHere));
        setVisiting(landmarkHere);
        return;
      }
      if (friendHere) befriend(friendHere.id);
    };

    const befriend = (id: string) => {
      const name = nameOf(id);
      void store.requestFriend(id).then((r) => {
        if (typeof r === "object") return say(r.error);
        if (r === "friends") {
          net?.friended(id);
          void refreshFriends();
          say(`You and ${name} are friends now. Press T near them to chat.`, 7);
        } else {
          net?.ask(id);
          say(`Asked ${name}. They press F next to you to accept.`, 6);
        }
        shownPrompt = STALE;
      });
    };

    actions.current.leave = () => {
      if (modeRef.current !== "garage") return;
      cut.t = 0;
      if (fadeRef.current) fadeRef.current.style.opacity = "1";
      setModeBoth("leaving");
    };
    actions.current.toggleMap = () => {
      if (modeRef.current === "drive") {
        inputRef.current = noInput();
        setModeBoth("map");
        requestAnimationFrame(() => sizeCanvas(fullRef.current));
      } else if (modeRef.current === "map") setModeBoth("drive");
    };

    // ——— Photo mode (ADR 0018) ———

    /** The orbit asked for, round the truck. The view eases the camera after it. */
    let orbit: Orbit = { yaw: 0, pitch: 0.5, dist: 14 };
    actions.current.photo = () => {
      const m = modeRef.current;
      if (m === "photo") {
        inputRef.current = noInput();
        // Straight back behind the truck, as if the viewfinder were put down.
        view.cut();
        setModeBoth("drive");
        return;
      }
      if (m !== "drive") return;
      // A run's clock, and the others in a convoy or a race, don't stop for a picture.
      if (running) return say("No photos during a run. Finish it, or Esc to give up.");
      if (convoys.state) return say(`No photos while you're in a ${noun(convoys.state.mission)}.`);
      inputRef.current = noInput();
      orbit = view.photoStart(car);
      setModeBoth("photo");
      sharePose(performance.now() / 1000, true);
    };
    actions.current.turnPhoto = (dx, dy) => void (orbit = dragOrbit(orbit, dx, dy));
    actions.current.zoomPhoto = (factor) => void (orbit = zoomOrbit(orbit, factor));
    actions.current.snap = () => {
      if (modeRef.current !== "photo") return;
      keepPicture(view.snap(), photoName(new Date()));
      // A soft flash, as a shutter would.
      const flash = flashRef.current;
      if (!flash) return;
      flash.style.transition = "none";
      flash.style.opacity = "0.55";
      void flash.offsetWidth;
      flash.style.transition = "opacity 600ms ease-out";
      flash.style.opacity = "0";
    };
    const onWheel = (e: WheelEvent) => {
      if (modeRef.current !== "photo") return;
      // Not the page's zoom, which a pinch on a trackpad would otherwise be.
      e.preventDefault();
      actions.current.zoomPhoto(Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0015)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const giveUp = (why: string) => {
      running = null;
      runIndex = -1;
      throughIn = null;
      convoys.leave();
      setRun(null);
      setCount(null);
      shownRun = "";
      shownPrompt = STALE;
      view.showRun(-1, 0, time);
      say(why);
    };

    // ——— Convoys ———

    const names = (ids: string[]) => {
      const n = ids.map(nameOf);
      // A big crew doesn't fit on the line: the first two, and how many more.
      if (n.length > 3) return `${n[0]}, ${n[1]} and ${n.length - 2} others`;
      return n.length < 2 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
    };

    /** Lines up behind the arch, with the others in their places, and counts down. */
    const setOff = (m: Mission, slot: number, crew: string[]) => {
      if (modeRef.current === "map" || modeRef.current === "photo") setModeBoth("drive");
      inputRef.current = noInput();
      const at = lineUp(m, slot);
      placeOnGround(at.x, at.z, at.heading, 0);
      crew.forEach((id, i) => {
        const spot = lineUp(m, i);
        if (i !== slot) view.remotes.jump(id, spot.x, spot.z, spot.heading, performance.now() / 1000);
      });
      view.cut();
      running = startRun(m);
      runIndex = world.missions.indexOf(m);
      throughIn = null;
      raceOver = null;
      lastPose = { x: car.x, z: car.z };
      shownPrompt = STALE;
      // The others need to see us in line now, not when the truck next moves.
      gate.forget();
      sharePose(performance.now() / 1000, true);
    };

    /** What the convoy's (or race's) agreement has to say, as it happens. */
    const onConvoy = (events: ConvoyEvent[]) => {
      const me = store.get().id;
      for (const e of events) {
        const what = noun(e.mission);
        if (e.kind === "called" && !convoys.state) say(`${nameOf(e.leader)} is gathering a ${what}. Follow the compass to join.`, 7);
        else if (e.kind === "joined") say(e.who === me ? `You're in ${nameOf(convoys.state?.leader ?? "")}'s ${what}. Wait here to set off together.` : `${nameOf(e.who)} joined the ${what}.`);
        else if (e.kind === "go") setOff(e.mission, e.slot, e.crew);
        else if (e.kind === "left") say(`${nameOf(e.who)} left the ${what}.`);
        else if (e.kind === "off") say(`${nameOf(e.leader)} called off the ${what}.`);
        else if (e.kind === "home" && e.mission.race) {
          // Everyone was paid at their own finish (`runOn`); this is just how it went.
          throughIn = null;
          setRun(null);
          shownRun = "";
          // The first three, and me wherever I came: ten times don't fit on a line.
          const places = e.times.map((t, i) => ({ mine: t.id === me, text: `${ordinal(i + 1)} ${t.id === me ? "you" : nameOf(t.id)} ${fmtTime(t.seconds)}` }));
          raceOver = `Race over: ${places.filter((p, i) => i < 3 || p.mine).map((p) => p.text).join(" · ")}`;
          say(raceOver, 9);
        } else if (e.kind === "home") {
          const m = e.mission;
          const seconds = throughIn ?? 0;
          throughIn = null;
          setRun(null);
          shownRun = "";
          void store.completeMission(m, seconds, e.with).then((res) => {
            goal("mission");
            if ("paid" in res) say(`Convoy home together in ${fmtTime(seconds)}. +${fmtMiles(res.paid)} mi`, 7);
            else say(`Convoy home in ${fmtTime(seconds)}. ${res.error}`, 7);
          });
        }
        shownPrompt = STALE;
      }
    };

    /** At the arch of a convoy or a race, or gathering one: what's on offer. Sets `convoyAct`. */
    const convoyPrompt = (): Prompt => {
      convoyAct = null;
      const s = convoys.state;
      if (running || s?.phase === "running") return null;
      const from = (m: Mission) => Math.hypot(car.x - m.start.x, car.z - m.start.z);
      const m = s?.mission ?? crewCourses.find((c) => from(c) < GATHER_REACH);
      if (!m) return null;
      const what = noun(m);
      if (s) {
        // Drive off from the arch and you've left.
        if (from(m) > GATHER_REACH * 2) {
          giveUp(s.leader === store.get().id ? `You drove off, so the ${what}'s off.` : `You drove off, so you've left the ${what}.`);
          return null;
        }
        const others = convoys.others().map((d) => d.id);
        if (s.leader !== store.get().id) {
          const lead = nameOf(s.leader);
          return convoys.mine()
            ? { kind: "convoy", lead: `In ${lead}'s ${what}`, rest: ` · waiting for ${lead} to set off · Esc to leave`, act: false }
            : { kind: "convoy", lead: `Asking to join ${lead}'s ${what}`, rest: "…", act: false };
        }
        if (!others.length) return { kind: "convoy", lead: `Gathering a ${what}`, rest: " · waiting for friends to drive up · Esc to stop", act: false };
        convoyAct = () => onConvoy(convoys.go(performance.now() / 1000));
        return { kind: "convoy", lead: `Set off with ${names(others)}`, rest: others.length < CONVOY_MAX - 1 ? " · or wait for more" : "", act: true };
      }
      if (Math.abs(car.speed) > 5) return null;
      const call = convoys.callFor(m.id);
      if (call) {
        if (call.crew.length >= CONVOY_MAX) return { kind: "convoy", lead: `${nameOf(call.leader)}'s ${what} is full`, rest: "", act: false };
        convoyAct = () => convoys.join(call.id, performance.now() / 1000);
        return { kind: "convoy", lead: `Join ${nameOf(call.leader)}'s ${what}`, rest: ` · ${m.blurb}`, act: true };
      }
      const rest = ` · ${m.blurb}`;
      if (!net || tent < 0) return { kind: "convoy", lead: m.name, rest: `${rest} · sign in to drive it with friends`, act: false };
      if (![...peers.keys()].some((id) => friends.has(id))) return { kind: "convoy", lead: m.name, rest: `${rest} · none of your friends are here yet`, act: false };
      convoyAct = () => convoys.gather(m, performance.now() / 1000);
      const pay = m.race ? `up to ${fmtMiles(m.reward)} mi for everyone who finishes` : `up to ${fmtMiles(m.reward)} mi each`;
      return { kind: "convoy", lead: `Gather a ${what} here`, rest: ` · your friends will hear · ${pay}`, act: true };
    };

    // ——— Keys ———

    const keyMap: Record<string, keyof Input> = {
      ArrowLeft: "left", a: "left", A: "left",
      ArrowRight: "right", d: "right", D: "right",
      ArrowUp: "gas", w: "gas", W: "gas",
      ArrowDown: "brake", s: "brake", S: "brake",
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const m = modeRef.current;
      // The menus, panels and chat box have their own keys.
      if (m === "garage" || m === "pick" || typingRef.current || panelRef.current) return;
      const k = e.key;
      if ((k === "m" || k === "M") && !e.repeat) {
        actions.current.toggleMap();
        e.preventDefault();
        return;
      }
      if (m === "map" && k === "Escape") {
        actions.current.toggleMap();
        return;
      }
      if (m === "photo") {
        // The arrows move the camera round, below; these do the rest.
        const zoom = k === "+" || k === "=" ? 1 / 1.15 : k === "-" || k === "_" ? 1.15 : 0;
        const snap = k === " " || k === "Enter";
        const back = k === "Escape" || k === "p" || k === "P";
        if (zoom || snap || back) {
          e.preventDefault();
          if (zoom) actions.current.zoomPhoto(zoom);
          else if (!e.repeat) (snap ? actions.current.snap : actions.current.photo)();
          return;
        }
      }
      if (m === "drive" && !e.repeat) {
        if (k === "e" || k === "E" || k === "Enter" || ((k === "f" || k === "F") && friendHere)) {
          actions.current.act();
          e.preventDefault();
          return;
        }
        if (k === "Escape" && (running || convoys.state)) {
          const s = convoys.state;
          const what = s && noun(s.mission);
          return giveUp(!s ? "Run abandoned." : s.phase === "gathering" && s.leader === store.get().id ? `The ${what}'s off.` : `You've left the ${what}.`);
        }
        if ((k === "l" || k === "L") && !e.repeat) {
          setBoard(true);
          return;
        }
        if (k === "p" || k === "P") {
          actions.current.photo();
          return;
        }
        if ((k === "t" || k === "T") && nearbyFriends().length) {
          inputRef.current = noInput();
          setTyping(true);
          e.preventDefault();
          return;
        }
      }
      const control = keyMap[k];
      if (!control) return;
      e.preventDefault();
      if (m !== "drive" && m !== "photo") return;
      inputRef.current[control] = true;
      if (m === "drive") setShowHint(false);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const control = keyMap[e.key];
      if (control) inputRef.current[control] = false;
    };
    const onBlur = () => (inputRef.current = noInput());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    if (params.has("garage") && startGarage) {
      placeOnGround(startGarage.approach.x, startGarage.approach.z, startGarage.heading + Math.PI, 0);
    } else if (params.has("airport")) {
      const spot = boardSpot(world.airport);
      placeOnGround(spot.x, spot.z, spot.heading, 0);
    } else if (at.length >= 2 && at.every(Number.isFinite)) placeOnGround(at[0], at[1], at[2] ?? 0, 0);

    // ——— The flight ———

    /** What the truck's wheels stand on during the film: the ramp and the hold's floor, as well as the apron. */
    const deck: Ground = { ...ground, height: (x, z) => world.height(x, z) + deckAt(world.airport, x, z) };

    /** The film is over: the truck is on the apron of the other world, and is the player's again. */
    const arrive = () => {
      const spot = leaveSpot(world.airport);
      placeOnGround(spot.x, spot.z, spot.heading, 0);
      trip = null;
      landed = true;
      lastDistance = car.distance;
      lastPose = { x: car.x, z: car.z };
      if (cloudRef.current) cloudRef.current.style.opacity = "0";
      setModeBoth("drive");
      say(world.id === "island" ? `The island. The flight home is ${WORLDS.valley.fare} mi, whenever you have them.` : "Back in the valley.", 8);
      if (netFor && store.get().name) {
        net = netFor(world.id);
        void join();
      }
    };

    /**
     * Runs the flight's film on by `dt` and says what to show. The truck goes where the
     * film puts it; the other world is put up while the picture is lost in cloud.
     */
    const flyOn = (dt: number): Film | null => {
      if (!trip) return null;
      trip.t += dt;
      if (trip.leg === "out" && trip.t >= DEPART.end) {
        enterWorld(trip.to);
        trip = { ...trip, leg: "in", t: 0 };
      }
      const a = world.airport;
      const frame = trip.leg === "out" ? departure(a, trip.from, trip.t) : arrival(a, Math.min(trip.t, ARRIVE.end));
      if (frame.truck) {
        const on = rideOnDeck(a, frame.truck, spec.wheelbase, spec.ride);
        const moved = Math.hypot(frame.truck.x - car.x, frame.truck.z - car.z);
        Object.assign(car, frame.truck, {
          y: on.y, pitch: on.pitch, roll: 0, vy: 0, side: 0, steer: 0, pitchV: 0, rollV: 0, grounded: true, groundY: on.y - spec.ride,
          // Not driven, but its wheels should turn as if it were.
          speed: Math.min(12, moved / Math.max(dt, 1e-3)),
        });
      }
      const cloud = cloudRef.current;
      if (cloud) {
        cloud.style.opacity = String(frame.cloud);
        cloud.style.backgroundColor = view.haze();
      }
      if (trip.leg === "in" && trip.t >= ARRIVE.end) arrive();
      return { frame, ground: deck };
    };

    // ——— Garages ———

    /** The truck drives itself into the garage while the door opens, then the screen fades. */
    const animateEnter = (g: Garage, dt: number) => {
      cut.t += dt;
      const t = cut.t;
      view.setDoor(cut.garage, smooth(0, 1, t));
      const u = smooth(0.45, 2.0, t);
      const { from } = cut;
      const bx = (1 - u) ** 2 * from.x + 2 * u * (1 - u) * g.approach.x + u * u * g.inside.x;
      const bz = (1 - u) ** 2 * from.z + 2 * u * (1 - u) * g.approach.z + u * u * g.inside.z;
      const px = car.x;
      const pz = car.z;
      const sink = g.sink * smooth(0.55, 1, u);
      placeOnGround(bx, bz, turnToward(from.heading, g.heading + Math.PI, Math.min(1, u * 1.8)), sink);
      if (g.sink) car.pitch = -0.25 * smooth(0.5, 0.7, u) * (1 - smooth(0.92, 1, u));
      car.speed = Math.hypot(car.x - px, car.z - pz) / Math.max(dt, 1e-3);
      if (fadeRef.current) fadeRef.current.style.opacity = String(smooth(1.4, ENTER_TIME, t));
      if (t >= ENTER_TIME) {
        view.openShowroom(g.style, rig, loadout);
        setGarageStyle(g.style);
        goal("garage");
        cut.t = 0;
        setModeBoth("garage");
      }
    };

    /** And back out again: fade in, reverse out of the door (or up the ramp), the door shuts. */
    const animateLeave = (g: Garage, dt: number) => {
      cut.t += dt;
      const t = cut.t;
      const u = smooth(0.2, 1.7, t);
      view.setDoor(cut.garage, 1 - smooth(1.7, 2.4, t));
      const px = car.x;
      const pz = car.z;
      placeOnGround(g.inside.x + (g.approach.x - g.inside.x) * u, g.inside.z + (g.approach.z - g.inside.z) * u, g.heading + Math.PI, g.sink * (1 - smooth(0, 0.5, u)));
      if (g.sink) car.pitch = -0.22 * smooth(0, 0.15, u) * (1 - smooth(0.4, 0.6, u));
      car.speed = -Math.hypot(car.x - px, car.z - pz) / Math.max(dt, 1e-3);
      if (fadeRef.current) fadeRef.current.style.opacity = String(1 - smooth(0, 0.7, t));
      if (t >= LEAVE_TIME) {
        car.speed = -1;
        lastDistance = car.distance;
        setModeBoth("drive");
      }
    };

    // ——— Each frame ———

    /** Name tags and speech bubbles over the trucks, placed in screen space and kept apart. */
    const drawTags = (now: number) => {
      const layer = tagsRef.current;
      if (!layer) return;
      const ease = 1 - Math.exp(-10 * Math.min(0.1, Math.max(0, now - tagsAt)));
      tagsAt = now;
      const me = store.get().id;
      const list = view.remotes.tags();
      const mine = bubbles.get(me);
      if (mine) list.push({ id: me, name: "", x: car.x, y: car.y + view.carTop() + 1.1, z: car.z });
      const seen = new Set<string>();
      const shown: TagBox[] = [];
      for (const t of list) {
        const at = view.project(t.x, t.y, t.z);
        let tag = tags.get(t.id);
        if (!tag) {
          const el = document.createElement("div");
          el.className = "absolute left-0 top-0 flex flex-col items-center gap-1 whitespace-nowrap will-change-transform";
          el.innerHTML = '<span data-say class="max-w-[14rem] whitespace-normal rounded-xl bg-black/45 px-2.5 py-1 text-center text-xs text-[rgba(255,246,232,0.95)] backdrop-blur"></span><span data-name class="text-[11px] font-semibold tracking-wide text-[rgba(255,246,232,0.85)] drop-shadow"></span>';
          layer.appendChild(el);
          tag = { el, text: "", w: 0, h: 0, lift: null };
          tags.set(t.id, tag);
        }
        const { el } = tag;
        seen.add(t.id);
        const bubble = bubbles.get(t.id);
        const sayEl = el.querySelector<HTMLSpanElement>("[data-say]")!;
        const nameEl = el.querySelector<HTMLSpanElement>("[data-name]")!;
        const speaking = bubble && bubble.until > now ? bubble.text : "";
        if (sayEl.textContent !== speaking) sayEl.textContent = speaking;
        sayEl.style.display = speaking ? "" : "none";
        const label = t.name + (friends.has(t.id) ? " ★" : "");
        if (nameEl.textContent !== label) nameEl.textContent = label;
        if (!at || at.far > 260) {
          el.style.opacity = "0";
          tag.lift = null;
          continue;
        }
        el.style.opacity = String(1 - smooth(160, 260, at.far));
        // Kept clear of the screen's edges, so a bubble is never cut off.
        const x = Math.max(120, Math.min(layer.clientWidth - 120, at.x));
        shown.push({ id: t.id, x, y: Math.max(40, at.y), w: tag.w, h: tag.h, far: at.far });
      }
      // Measured only when the words change, and only after every tag's words are in, so
      // the page is laid out at most once a frame for it.
      for (const b of shown) {
        const tag = tags.get(b.id)!;
        const text = tag.el.textContent ?? "";
        if (tag.text !== text) {
          tag.text = text;
          tag.w = tag.el.offsetWidth;
          tag.h = tag.el.offsetHeight;
        }
        b.w = tag.w;
        b.h = tag.h;
      }
      // Trucks side by side would have their tags on one another: the further ones go up.
      tagLifts = stackTags(shown, tagLifts);
      for (const b of shown) {
        const tag = tags.get(b.id)!;
        const want = tagLifts.get(b.id) ?? 0;
        // A tag just come into view starts where it belongs; after that it eases there.
        tag.lift = tag.lift === null ? want : tag.lift + (want - tag.lift) * ease;
        // Centred here and only here: a Tailwind `translate-*` class is the CSS `translate`
        // property, which would shift the tag a second time on top of this transform.
        tag.el.style.transform = `translate(${b.x}px, ${b.y - tag.lift}px) translate(-50%, -100%)`;
      }
      for (const [id, tag] of tags) {
        if (!seen.has(id)) {
          tag.el.remove();
          tags.delete(id);
        }
      }
    };

    /** The guidance mark on the compass: the nearest thing the current goal is about. */
    const aim = (dt: number) => {
      targetClock -= dt;
      if (targetClock <= 0) {
        targetClock = 0.5;
        // The guidance is about the valley: its garages, its café.
        const g = world.id === "valley" ? currentGoal(store.get().goals, store.online || localNet) : null;
        const nearest = (list: { x: number; z: number }[]) =>
          list.reduce<{ x: number; z: number } | null>((best, p) => (!best || Math.hypot(p.x - car.x, p.z - car.z) < Math.hypot(best.x - car.x, best.z - car.z) ? p : best), null);
        // A friend gathering a convoy or a race comes before the guidance; once in one, the course leads.
        const call = convoys.state ? undefined : convoys.callsOut()[0];
        const called = call ? (crewCourses.find((c) => c.id === call.mission)?.start ?? null) : null;
        target =
          running || convoys.state ? null
          : called ? called
          : !g ? null
          : g.target === "garage" ? nearest(view.garages.map((x) => x.approach))
          : g.target === "cafe" ? view.cafe
          : null;
        const cafe = view.cafe;
        if (g?.id === "cafe" && cafe && Math.hypot(cafe.x - car.x, cafe.z - car.z) < cafe.r + CAFE_SLACK) goal("cafe");
      }
      const mark = markRef.current;
      if (!mark) return;
      // On a run, the mark points at the next gate instead.
      const gateNext = running && running.clock >= 0 ? running.mission.gates[running.next] : null;
      const to = gateNext ?? target;
      if (!to || Math.hypot(to.x - car.x, to.z - car.z) < 12) {
        mark.style.opacity = "0";
        return;
      }
      const off = wrapHalf(bearingOf(Math.atan2(to.x - car.x, to.z - car.z)) - bearingOf(car.heading)) * COMPASS.length * COMPASS_ITEM;
      const edge = COMPASS_VIEW / 2 + 10;
      mark.style.opacity = "1";
      // `translate`, not `transform`: the diamond's `rotate-45` is the `rotate` property, and a
      // transform would slide it along the rotated axis, diagonally off the compass.
      mark.style.translate = `${Math.max(-edge, Math.min(edge, off))}px 0`;
    };

    /** What's on offer where the truck is: a garage door, a start arch, a friend to make. */
    const lookAround = () => {
      let found = -1;
      view.garages.forEach((g, i) => {
        if (Math.hypot(car.x - g.approach.x, car.z - g.approach.z) < 7 && Math.abs(car.speed) < 5) found = i;
      });
      nearGarage = running || convoys.state ? -1 : found;
      const m = !running && !convoys.state && found < 0 && Math.abs(car.speed) < 5 ? missionAt(courses, car.x, car.z) : null;
      convoyAct = null;
      const together = found < 0 && !m ? convoyPrompt() : null;

      const still = !running && !convoys.state && found < 0 && !m && !together && Math.abs(car.speed) < 5;
      const board = boardSpot(world.airport);
      flightHere = still && Math.hypot(car.x - board.x, car.z - board.z) < BOARD_REACH;
      landmarkHere = (still && !flightHere && view.landmarks.find((l) => Math.hypot(car.x - l.x, car.z - l.z) < 7)?.kind) || null;

      friendHere = null;
      const cafe = view.cafe;
      if (cafe && !running && found < 0 && !m && !together && net && Math.hypot(car.x - cafe.x, car.z - cafe.z) < cafe.r + CAFE_SLACK) {
        let best = FRIEND_REACH;
        for (const p of view.remotes.positions()) {
          const d = Math.hypot(p.x - car.x, p.z - car.z);
          if (d < best && !friends.has(p.id) && Math.hypot(p.x - cafe.x, p.z - cafe.z) < cafe.r + CAFE_SLACK) {
            best = d;
            friendHere = { id: p.id, name: nameOf(p.id) };
          }
        }
      }

      const next: Prompt =
        found >= 0 ? { kind: "garage", style: view.garages[found].style }
        : m ? { kind: "mission", mission: m, wait: tideWait(m) }
        : together ? together
        : flightHere ? { kind: "flight", to: flightFrom(world.id) }
        : landmarkHere ? { kind: "landmark", id: landmarkHere }
        : friendHere ? { kind: "friend", id: friendHere.id, name: friendHere.name, asked: askedBy.has(friendHere.id) }
        : null;
      const key = !next ? ""
        : next.kind === "garage" ? `garage:${next.style}`
        : next.kind === "mission" ? `mission:${next.mission.id}:${next.wait > 0 ? tideLine(next.wait) : ""}`
        : next.kind === "convoy" ? `convoy:${next.lead}${next.rest}${next.act}`
        : next.kind === "landmark" ? `landmark:${next.id}`
        : next.kind === "flight" ? `flight:${next.to}`
        : `friend:${next.id}${next.asked}`;
      if (key !== shownPrompt) {
        shownPrompt = key;
        setPrompt(next);
      }
    };

    /** The mission in progress: countdown, gates, finish. */
    const runOn = (dt: number) => {
      if (!running) return;
      const r = running;
      const ev = tick(r, dt, lastPose, car, car.grounded);
      if (r.clock < 0) setCount(Math.ceil(-r.clock));
      if (ev?.kind === "go") {
        setCount(0);
        window.setTimeout(() => setCount(null), 700);
      } else if (ev?.kind === "lost") return giveUp(convoys.state ? `Too far off the course, so you've left the ${noun(convoys.state.mission)}.` : "Too far off the course. Run abandoned.");
      else if (ev?.kind === "gate") onConvoy(convoys.passed(r.next, performance.now() / 1000));
      else if (ev?.kind === "finish") {
        const m = r.mission;
        const seconds = ev.seconds;
        running = null;
        runIndex = -1;
        setRun(null);
        shownRun = "";
        view.showRun(-1, 0, time);
        if (convoys.state?.mission.race) {
          // Through, and paid now; the results come when everyone is through (`onConvoy`).
          throughIn = seconds;
          const crew = convoys.state.with;
          const events = convoys.passed(r.next, performance.now() / 1000, seconds);
          const place = convoys.state ? convoys.place() : 0;
          onConvoy(events);
          void store.completeMission(m, seconds, crew).then((res) => {
            goal("mission");
            const paid = "paid" in res ? `+${fmtMiles(res.paid)} mi` : res.error;
            say(raceOver ? `${raceOver}. ${paid}` : `Through in ${fmtTime(seconds)}, ${ordinal(place)} so far. ${paid}`, 8);
          });
          return;
        }
        if (convoys.state) {
          // Through, and the convoy is home when the others are. Paid then (`onConvoy`).
          throughIn = seconds;
          onConvoy(convoys.passed(r.next, performance.now() / 1000));
          if (convoys.state) say("Through the finish. Wait for the others; the convoy's home when they're through.", 6);
          return;
        }
        // A jump is told for its time in the air, and paid like any other course however long that was.
        const before = bestAir.get(m.id);
        if (m.ramp) bestAir.set(m.id, Math.max(before ?? 0, ev.air));
        const how = !m.ramp ? `${m.name} in ${fmtTime(seconds)}`
          : before === undefined ? `${m.name}: ${fmtAir(ev.air)} in the air`
          : ev.air > before ? `${m.name}: ${fmtAir(ev.air)} in the air, your longest yet`
          : `${m.name}: ${fmtAir(ev.air)} in the air (your longest is ${fmtAir(before)})`;
        void store.completeMission(m, seconds).then((res) => {
          goal("mission");
          if ("paid" in res) say(`${how}. +${fmtMiles(res.paid)} mi`, 7);
          else say(`${how}. ${res.error}`, 7);
        });
        return;
      }
      view.showRun(runIndex, r.next, time);
      showRun(r.mission, Math.max(0, r.clock), r.next, false, r.air);
    };

    /** The line at the top during a run: the course, the clock, the next flag, and with friends where the others are. */
    const showRun = (m: Mission, clock: number, gate: number, through: boolean, aloft = 0) => {
      const crew = convoys.others().map((d) => ({ name: nameOf(d.id), passed: d.passed }));
      const place = m.race && convoys.state ? convoys.place() : null;
      const air = m.ramp ? aloft : null;
      const hud = `${m.id}|${gate}|${Math.floor(clock)}|${air?.toFixed(1)}|${through}|${place}|${crew.map((c) => `${c.name}:${c.passed}`).join(",")}`;
      if (hud === shownRun) return;
      shownRun = hud;
      setRun({ name: m.name, clock, air, gate, of: m.gates.length, through, crew, place });
    };

    const frame = (nowMs: number) => {
      // Never negative: the first frame's timestamp can be a hair earlier than `last` was set.
      const dt = Math.max(0, Math.min((nowMs - last) / 1000, 0.1));
      last = nowMs;
      const now = nowMs / 1000;
      const m = modeRef.current;
      const garage = view.garages[cut.garage];
      time = shared ? Date.now() / 1000 - SHARED_EPOCH : time + (m === "garage" || m === "map" || m === "photo" ? 0 : dt);

      onConvoy(convoys.tick(now));
      // Through the finish, waiting for the rest of the convoy.
      if (!running && throughIn !== null && convoys.state) showRun(convoys.state.mission, throughIn, convoys.state.mission.gates.length, true);

      if (rising >= 0) {
        rising += dt;
        if (fadeRef.current) fadeRef.current.style.opacity = String(1 - smooth(0, RISE_TIME, rising));
        if (rising >= RISE_TIME) rising = -1;
      }

      if (m === "garage") {
        // Lights up inside: the fade from driving in clears over half a second.
        cut.t += dt;
        if (fadeRef.current) fadeRef.current.style.opacity = String(1 - smooth(0, 0.5, cut.t));
        view.renderShowroom(dt, turnRef.current);
        turnRef.current = 0;
      } else if (m === "map") {
        const full = fullRef.current;
        const g = full?.getContext("2d");
        if (full && g) {
          const lead = view.trainCars()[0];
          const train = lead && map.explored(lead.x, lead.z) ? { x: lead.x, z: lead.z, heading: lead.yaw } : undefined;
          const players = view.remotes.positions().map((p) => ({ ...p, friend: friends.has(p.id) }));
          map.drawFull(g, full.width, car, { train, players });
        }
      } else if (m === "photo") {
        // The world stands still. Held arrows move the camera round the truck: each the way it points.
        const i = inputRef.current;
        const turn = KEY_TURN * dt;
        orbit = clampOrbit({
          yaw: orbit.yaw + (Number(i.right) - Number(i.left)) * turn,
          pitch: orbit.pitch + (Number(i.gas) - Number(i.brake)) * turn * 0.6,
          dist: orbit.dist,
        });
        view.photo(car, orbit, dt);
      } else {
        // A flight: the film places the truck and the plane, and directs the camera.
        const film = m === "flying" ? flyOn(dt) : null;
        // The tide is wherever the clock has it; only the island's sea has one.
        world.setTide(heldTide ?? ebbAt(time));
        if (m === "drive") {
          moving = [...trainObstacles(view.trainCars(), world.height), ...view.remotes.obstacles()];
          lastPose = { x: car.x, z: car.z };
          acc += dt;
          // Held at a start line until "go": the suspension settles, the truck doesn't roll.
          const held = running !== null && running.clock < 0;
          const input = held ? HELD : inputRef.current;
          while (acc >= STEP) {
            if (held) car.speed = car.side = 0;
            step(car, input, STEP, ground, spec);
            acc -= STEP;
          }
          runOn(dt);
          lookAround();
          if (cheer) {
            say(`Achievement: ${cheer}`, 6);
            cheer = null;
          }
        } else if (m === "entering" && garage) animateEnter(garage, dt);
        else if (m === "leaving" && garage) animateLeave(garage, dt);

        // Odometer: miles bank once a second, and reach the server every so often.
        unbanked += Math.max(0, car.distance - lastDistance) / METRES_PER_MILE;
        lastDistance = car.distance;
        bankClock += dt;
        if (bankClock > 1) {
          bankClock = 0;
          store.addMiles(unbanked);
          unbanked = 0;
        }
        flushClock += dt;
        if (store.online && flushClock > FLUSH_EVERY) {
          flushClock = 0;
          void store.flush();
        }

        sharePose(now);
        if (net && presenceNow === "full") {
          retryClock += dt;
          if (retryClock > RETRY_JOIN) {
            retryClock = 0;
            void join();
          }
        }

        if (!film) map.reveal(car.x, car.z);
        view.render(car, dt, time, spec, m === "boot" || m === "pick", film);
        drawTags(now);
        aim(dt);
        if (Math.floor(now * 2) !== Math.floor((now - dt) * 2)) {
          setCanChat(nearbyFriends().length > 0);
          setCanPhoto(!running && !convoys.state);
        }

        const mini = miniRef.current;
        // The minimap unmounts while you're in a garage, so check its size each frame. Both
        // sides: a new canvas is 300 by 150, and 300 is exactly the width wanted on a
        // desktop retina screen, which left it half as tall as it was drawn.
        sizeCanvas(mini);
        const g = mini?.getContext("2d");
        if (mini && g) {
          const lead = view.trainCars()[0];
          const train = lead && map.explored(lead.x, lead.z) ? { x: lead.x, z: lead.z, heading: lead.yaw } : undefined;
          const players = view.remotes.positions().map((p) => ({ ...p, friend: friends.has(p.id) }));
          map.drawMini(g, mini.width, car, { train, players });
        }
      }

      // Compass bearing: north is −z, east is +x.
      if (compassRef.current) {
        const at = (COMPASS.length * (1 + bearingOf(car.heading)) + 0.5) * COMPASS_ITEM;
        compassRef.current.style.transform = `translateX(${COMPASS_VIEW / 2 - at}px)`;
      }
      // Speedometer: whole miles an hour, written only when the number changes.
      gauge += (Math.abs(car.speed) - gauge) * (1 - Math.exp(-dt * 8));
      const mph = String(Math.round(gauge * MPH));
      if (speedRef.current && speedRef.current.textContent !== mph) speedRef.current.textContent = mph;
      if (first) {
        first = false;
        setReady(true);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onUnload = () => {
      store.addMiles(unbanked);
      unbanked = 0;
      void store.flush();
      convoys.leave();
      net?.leave();
    };
    window.addEventListener("pagehide", onUnload);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearInterval(awayCheck);
      window.removeEventListener("keydown", touched);
      window.removeEventListener("pointerdown", touched);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(toastTimer);
      onUnload();
      unsubscribe();
      stopWatching();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onUnload);
      canvas.removeEventListener("wheel", onWheel);
      for (const tag of tags.values()) tag.el.remove();
      view.dispose();
    };
  }, []);

  const hold = (control: keyof Input) => ({
    onPointerDown: () => {
      if (modeRef.current !== "drive") return;
      inputRef.current[control] = true;
      setShowHint(false);
    },
    onPointerUp: () => void (inputRef.current[control] = false),
    onPointerLeave: () => void (inputRef.current[control] = false),
  });

  // Dragging across the picture turns the camera round the truck: in the garage, and in
  // photo mode, where two fingers also pinch it nearer or further.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const canvasDrag = {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const was = pointers.current.get(e.pointerId);
      if (!was) return;
      const m = modeRef.current;
      const [dx, dy] = [e.clientX - was.x, e.clientY - was.y];
      if (pointers.current.size === 2 && m === "photo") {
        const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)![1];
        const before = Math.hypot(was.x - other.x, was.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (before > 0 && after > 0) actions.current.zoomPhoto(before / after);
      } else if (pointers.current.size === 1) {
        if (m === "garage") turnRef.current -= dx * 0.004;
        else if (m === "photo") actions.current.turnPhoto(dx, dy);
      }
      was.x = e.clientX;
      was.y = e.clientY;
    },
    onPointerUp: (e: React.PointerEvent) => void pointers.current.delete(e.pointerId),
    onPointerCancel: (e: React.PointerEvent) => void pointers.current.delete(e.pointerId),
  };

  const look = useCallback((v: VehicleId) => actions.current.look(v), []);
  const pick = useCallback((v: VehicleId) => actions.current.pick(v), []);
  const loadBoard = useCallback(() => actions.current.leaderboard(), []);

  const driving = mode === "drive" || mode === "entering" || mode === "leaving";
  // The guidance is about the valley's garages and café; the island has none.
  const goal = profile?.world === "valley" ? currentGoal(profile.goals, online || presence === "local") : null;
  const solo = !online && presence !== "local";

  return (
    <div className="relative h-[100dvh] w-full select-none overflow-hidden bg-[#efb08c]">
      <canvas
        ref={canvasRef}
        {...canvasDrag}
        className={`block h-full w-full touch-none transition-opacity duration-[1500ms] ${ready ? "opacity-100" : "opacity-0"}`}
      />
      <div ref={tagsRef} className={`pointer-events-none absolute inset-0 overflow-hidden ${driving ? "" : "hidden"}`} />
      {/* Cloud: the colour of the haze, over everything, while a flight changes worlds (ADR 0014). The loop sets both. */}
      <div ref={cloudRef} className="pointer-events-none absolute inset-0 opacity-0" />
      {/* Black from the first paint when there may be a tent to wait for; the effect lifts it. */}
      <div ref={fadeRef} className={`pointer-events-none absolute inset-0 bg-black ${onlineConfigured ? "opacity-100" : "opacity-0"}`} />
      {/* The shutter's flash in photo mode. */}
      <div ref={flashRef} className="pointer-events-none absolute inset-0 bg-[rgba(255,246,232,1)] opacity-0" />

      {mode !== "photo" && (
        <h1 className="pointer-events-none absolute left-5 top-4 text-lg font-semibold tracking-tight text-[rgba(255,246,232,0.78)] drop-shadow-sm">
          gilbyy
        </h1>
      )}
      {driving && goal && !run && (
        <p className="pointer-events-none absolute left-5 top-11 max-w-[15rem] text-xs leading-snug text-[rgba(255,246,232,0.72)] drop-shadow">
          {goal.text}
        </p>
      )}

      {driving && (
        <>
          {/* Compass strip: three laps of the points, slid so the heading sits in the middle. */}
          <div
            className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_30%,#000_70%,transparent)]"
            style={{ width: COMPASS_VIEW }}
          >
            <div ref={compassRef} className="flex will-change-transform">
              {[...COMPASS, ...COMPASS, ...COMPASS].map((p, i) => (
                <span
                  key={i}
                  className="shrink-0 text-center text-[11px] font-semibold tracking-wider text-[rgba(255,246,232,0.78)] drop-shadow-sm"
                  style={{ width: COMPASS_ITEM }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
          {/* Where the guidance points: a small mark under the compass. */}
          <div className="pointer-events-none absolute left-1/2 top-[2.1rem] h-0 w-0">
            <div ref={markRef} className="absolute -left-[5px] h-2.5 w-2.5 rotate-45 rounded-[2px] bg-[rgba(255,211,107,0.95)] opacity-0 shadow transition-opacity" />
          </div>

          {/* Signed in: a dot and your name in the corner. It opens the panel that signs you out. */}
          {online && (
            <button
              onClick={() => setBoard(true)}
              title={profile?.name ? `Signed in as ${profile.name}` : "Signed in"}
              className="absolute right-4 top-3.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[rgba(255,246,232,0.78)] drop-shadow-sm sm:right-5"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[rgba(168,222,150,0.95)]" />
              <span className="max-w-[3.5rem] truncate sm:max-w-[11rem]">{profile?.name ?? "Signed in"}</span>
            </button>
          )}

          {/* Minimap, speedometer and odometer: top-right on phones (clear of the thumbs), bottom-left otherwise. */}
          <div className="absolute right-4 top-12 flex flex-col items-center gap-1 sm:bottom-5 sm:left-5 sm:right-auto sm:top-auto">
            <canvas ref={miniRef} className="pointer-events-none h-[104px] w-[104px] rounded-full drop-shadow-md sm:h-[150px] sm:w-[150px]" />
            <p className="pointer-events-none -mb-1 text-[rgba(255,246,232,0.82)] drop-shadow-sm">
              <span ref={speedRef} className="text-base font-semibold tabular-nums">0</span>
              <span className="ml-1 text-[10px] font-semibold tracking-wide text-[rgba(255,246,232,0.6)]">mph</span>
            </p>
            <button
              onClick={() => setBoard(true)}
              className="text-[11px] font-semibold tracking-wide text-[rgba(255,246,232,0.7)] drop-shadow-sm"
              title="Leaderboard (L)"
            >
              {fmtMiles(profile?.balance ?? 0)} mi
              {(presence === "online" || presence === "local") && <span className="font-normal text-[rgba(255,246,232,0.5)]"> · {people} here</span>}
            </button>
            {/* On a phone, under the odometer: the row of driving buttons has no room for it. A keyboard has P. */}
            {canPhoto && mode === "drive" && (
              <button
                onClick={() => actions.current.photo()}
                className="mt-1.5 h-11 w-11 rounded-full border border-white/25 bg-black/20 text-xs text-white/75 backdrop-blur sm:hidden"
              >
                photo
              </button>
            )}
          </div>
        </>
      )}

      {/* The keys that aren't driving, kept on the right edge for keyboards. Talk only works with a friend near. */}
      {driving && (
        <ul className="pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 flex-col gap-1.5 text-[11px] font-medium tracking-wide text-[rgba(255,246,232,0.82)] drop-shadow sm:flex">
          {[
            { key: "M", label: "map" },
            { key: "L", label: "leaderboard" },
            { key: "P", label: "photo", note: canPhoto ? "" : "not on a course" },
            { key: "T", label: "talk", note: canChat ? "" : "when a friend is near" },
          ].map((k) => (
            <li key={k.key} className="flex items-center gap-2">
              <span className="w-5 rounded border border-white/40 text-center text-[10px] font-semibold">{k.key}</span>
              <span>
                {k.label}
                {k.note && <span className="text-[rgba(255,246,232,0.6)]"> · {k.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {driving && solo && !run && <SoloBanner canSignIn={onlineConfigured} onSignIn={() => setSigningIn(true)} />}

      {run && driving && (
        <div className="pointer-events-none absolute inset-x-4 top-11 text-center text-sm text-[rgba(255,246,232,0.9)] drop-shadow">
          <span className="font-semibold">{run.name}</span> · {run.air === null ? fmtTime(run.clock) : `${fmtAir(run.air)} in the air`} · {run.through ? "through" : `${Math.min(run.gate + 1, run.of)}/${run.of}`}
          {run.place !== null && <span className="font-semibold"> · {ordinal(run.place)}</span>}
          {/* Up to three others by name; a bigger crew as a count, which is what fits. */}
          {run.crew.length <= 3 ? run.crew.map((c, i) => (
            <span key={i} className="text-[rgba(255,246,232,0.7)]">
              {" "}· {c.name} {c.passed >= run.of ? "through" : `${Math.min(c.passed + 1, run.of)}/${run.of}`}
            </span>
          )) : (
            <span className="text-[rgba(255,246,232,0.7)]">
              {" "}· {run.crew.filter((c) => c.passed >= run.of).length} of {run.crew.length} others through
            </span>
          )}
          <span className="ml-2 hidden text-xs text-[rgba(255,246,232,0.5)] sm:inline">{run.crew.length || run.through ? "Esc to leave" : "Esc to give up"}</span>
        </div>
      )}
      {count !== null && driving && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-semibold text-[rgba(255,246,232,0.92)] drop-shadow-lg">
          {count > 0 ? count : "Go"}
        </div>
      )}

      {toast && driving && (
        <p className="pointer-events-none absolute inset-x-4 top-[6.5rem] text-center text-sm text-[rgba(255,246,232,0.88)] drop-shadow sm:top-24">
          {toast}
        </p>
      )}

      {/* Recent chat, and the box to type in. */}
      {driving && (chat.length > 0 || typing) && (
        <div className="absolute bottom-40 left-4 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-1 sm:bottom-[13.5rem] sm:left-5">
          {chat.map((l) => (
            <p key={l.key} className="pointer-events-none text-xs text-[rgba(255,246,232,0.88)] drop-shadow">
              <b className="font-semibold">{l.from}</b> {l.text}
            </p>
          ))}
          {typing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                actions.current.say(draft);
                setDraft("");
                setTyping(false);
              }}
            >
              <input
                autoFocus
                maxLength={MAX_CHAT}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setTyping(false);
                }}
                onBlur={() => setTyping(false)}
                placeholder="Say something to nearby friends"
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-[rgba(255,246,232,0.95)] outline-none backdrop-blur placeholder:text-[rgba(255,246,232,0.4)]"
              />
            </form>
          )}
        </div>
      )}

      <p
        className={`pointer-events-none absolute inset-x-0 bottom-28 text-center text-sm text-[rgba(255,246,232,0.78)] drop-shadow transition-opacity duration-700 sm:bottom-10 ${
          showHint && ready && mode === "drive" && !prompt && !run ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="hidden sm:inline">arrows or WASD to drive</span>
        <span className="sm:hidden">hold ▲ to drive</span>
      </p>

      {prompt && mode === "drive" && (
        <div className="absolute inset-x-0 bottom-28 flex justify-center px-4 sm:bottom-10">
          <button
            onClick={() => actions.current.act()}
            disabled={(prompt.kind === "convoy" && !prompt.act) || (prompt.kind === "mission" && prompt.wait > 0)}
            className="max-w-md rounded-full border border-white/25 bg-black/30 px-4 py-2 text-sm text-[rgba(255,246,232,0.9)] backdrop-blur"
          >
            {(prompt.kind !== "convoy" || prompt.act) && !(prompt.kind === "mission" && prompt.wait > 0) && (
              <span className="mr-2 hidden rounded border border-white/30 px-1.5 text-xs sm:inline">{prompt.kind === "friend" ? "F" : "E"}</span>
            )}
            {prompt.kind === "garage" && <>Enter {GARAGE_NAMES[prompt.style].replace(/^The /, "the ")}</>}
            {prompt.kind === "mission" && prompt.wait === 0 && (
              <>
                Start <b className="font-semibold">{prompt.mission.name}</b>
                <span className="text-[rgba(255,246,232,0.6)]"> · {prompt.mission.blurb} · up to {fmtMiles(prompt.mission.reward)} mi</span>
              </>
            )}
            {prompt.kind === "mission" && prompt.wait > 0 && (
              <>
                <b className="font-semibold">{prompt.mission.name}</b>
                <span className="text-[rgba(255,246,232,0.6)]"> · {tideLine(prompt.wait)}</span>
              </>
            )}
            {prompt.kind === "friend" && (prompt.asked ? <>Accept {prompt.name}&apos;s friend request</> : <>Ask {prompt.name} to be friends</>)}
            {prompt.kind === "landmark" && <>Look in at {LANDMARKS[prompt.id].place}</>}
            {prompt.kind === "flight" && (
              <>
                Board the plane to <b className="font-semibold">{WORLDS[prompt.to].name}</b>
                <span className="text-[rgba(255,246,232,0.6)]"> · {fmtMiles(WORLDS[prompt.to].fare)} mi</span>
              </>
            )}
            {prompt.kind === "convoy" && (
              <>
                <b className="font-semibold">{prompt.lead}</b>
                <span className="text-[rgba(255,246,232,0.6)]">{prompt.rest}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Photo mode: nothing on screen but how to work it, the shutter, and the way back. */}
      {mode === "photo" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-7">
          <div className="pointer-events-auto flex items-center gap-8">
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                actions.current.photo();
              }}
              className="h-11 w-11 rounded-full border border-white/25 bg-black/20 text-xs text-white/75 backdrop-blur"
            >
              back
            </button>
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                actions.current.snap();
              }}
              aria-label="Take a picture"
              title="Take a picture (Space)"
              className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[rgba(255,246,232,0.9)] bg-black/15 shadow-lg backdrop-blur active:scale-95"
            >
              <span className="h-12 w-12 rounded-full bg-[rgba(255,246,232,0.85)]" />
            </button>
            <span className="h-11 w-11" />
          </div>
          <p className="text-center text-xs text-[rgba(255,246,232,0.78)] drop-shadow">
            <span className="hidden sm:inline">drag or arrows to move round · scroll to zoom · Space to take a picture · Esc to go back</span>
            <span className="sm:hidden">drag to move round · pinch to zoom</span>
          </p>
        </div>
      )}

      {mode === "map" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm" onClick={() => actions.current.toggleMap()}>
          <canvas ref={fullRef} className="aspect-square w-[min(88vw,82dvh)] rounded-2xl shadow-2xl" />
          <p className="absolute bottom-4 text-center text-xs text-[rgba(255,246,232,0.6)]">
            {profile && <span className="block tabular-nums text-[rgba(255,246,232,0.85)]">{foundLine(countFound(profile.found, profile.world), profile.world)} found</span>}
            M or Esc to close
          </p>
        </div>
      )}

      {mode === "garage" && profile && (
        <GarageMenu
          style={garageStyle}
          profile={profile}
          online={online}
          onPreview={(v, l) => actions.current.preview(v, l)}
          onBuy={(key) => actions.current.buy(key)}
          onFit={(v, l) => actions.current.fit(v, l)}
          onLeave={() => actions.current.leave()}
        />
      )}

      {mode === "pick" && !naming && <StarterPicker onLook={look} onPick={pick} />}
      {naming && <NamePanel onSave={(name) => actions.current.setName(name)} />}
      {signingIn && <SignInPanel onGoogle={signInWithGoogle} onClose={() => setSigningIn(false)} />}
      {visiting && <LandmarkCard kind={visiting} onClose={() => setVisiting(null)} />}
      {boarding && profile && (
        <FlightCard to={boarding} balance={profile.balance} saved={online} onBoard={() => actions.current.fly()} onClose={() => setBoarding(null)} />
      )}
      {board && (
        <Leaderboard
          online={online || presence === "local"}
          load={loadBoard}
          onClose={() => setBoard(false)}
          onSignOut={online ? () => void signOut().then(() => window.location.reload()) : undefined}
        />
      )}

      {/* Touch controls; a keyboard is assumed at sm and up. */}
      {mode === "drive" && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 sm:hidden">
          <div className="flex gap-3">
            <TouchButton label="◀" {...hold("left")} />
            <TouchButton label="▶" {...hold("right")} />
          </div>
          <div className="mb-1 flex gap-2">
            <button
              onClick={() => actions.current.toggleMap()}
              className="h-11 w-11 rounded-full border border-white/25 bg-black/20 text-xs text-white/75 backdrop-blur"
            >
              map
            </button>
            {canChat && (
              <button
                onClick={() => setTyping(true)}
                className="h-11 w-11 rounded-full border border-white/25 bg-black/20 text-xs text-white/75 backdrop-blur"
              >
                chat
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <TouchButton label="▼" {...hold("brake")} />
            <TouchButton label="▲" {...hold("gas")} />
          </div>
        </div>
      )}
    </div>
  );
}

function TouchButton({ label, ...handlers }: { label: string } & React.ComponentProps<"button">) {
  return (
    <button
      {...handlers}
      aria-hidden
      tabIndex={-1}
      className="h-16 w-16 touch-none rounded-full border border-white/25 bg-black/20 text-xl text-white/75 backdrop-blur select-none"
    >
      {label}
    </button>
  );
}
