"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { secondsUntil } from "./daylight";
import { GarageMenu, fmtMiles } from "./GarageMenu";
import { currentGoal } from "./goals";
import { createMap } from "./map";
import { fmtTime, missionAt, startRun, tick, type Run } from "./mission-run";
import { CHAT_RANGE, LocalNet, MAX_CHAT, PoseGate, SupabaseNet, type Net, type NetHandlers, type Peer } from "./net";
import { Leaderboard, NamePanel, SignInPanel, SoloBanner, StarterPicker } from "./Panels";
import { makeCar, noInput, step, type Input } from "./physics";
import { createView, type Garage } from "./scene";
import { METRES_PER_MILE, STOCK_LOADOUT, itemKey, specFor, type Loadout } from "./shop";
import { GARAGE_NAMES } from "./showroom";
import { LocalStore, SupabaseStore, type Profile, type Store } from "./store";
import { currentSession, onSessionChange, onlineConfigured, signInWithEmail, signInWithGoogle, signOut, supabase } from "./supabase";
import { trainObstacles } from "./track";
import { VEHICLES, type VehicleId } from "./vehicles";
import { buildWorld, campPitches, START, type Ground, type Mission, type Obstacle, type SiteStyle } from "./world";

/** Physics runs at a fixed rate, independent of the display's refresh rate. */
const STEP = 1 / 120;
const ENTER_TIME = 2.3;
const LEAVE_TIME = 2.4;
/** Miles bank on the server this often while driving signed in. */
const FLUSH_EVERY = 15;
/** Signed in, everyone shares one clock (so one sun and one train), counted from a fixed moment. */
const SHARED_EPOCH = 1_790_000_000;
/** Within this of the café, two players can become friends; and this close to each other. */
const CAFE_SLACK = 6;
const FRIEND_REACH = 16;
/** When the campground was full, try again this often. */
const RETRY_JOIN = 60;

const COMPASS = ["N", "·", "NE", "·", "E", "·", "SE", "·", "S", "·", "SW", "·", "W", "·", "NW", "·"];
const COMPASS_ITEM = 28;
const COMPASS_VIEW = COMPASS_ITEM * 8;

type Mode = "boot" | "pick" | "drive" | "entering" | "garage" | "leaving" | "map";
type Presence = "solo" | "local" | "joining" | "online" | "full";
type Prompt =
  | { kind: "garage"; style: SiteStyle }
  | { kind: "mission"; mission: Mission }
  | { kind: "friend"; id: string; name: string; asked: boolean }
  | null;
type RunHud = { name: string; clock: number; gate: number; of: number } | null;
type ChatShown = { key: number; from: string; text: string };

type Actions = {
  act(): void;
  leave(): void;
  toggleMap(): void;
  look(v: VehicleId): void;
  pick(v: VehicleId): void;
  preview(v: VehicleId, l: Loadout): void;
  buy(key: string): Promise<string | null>;
  fit(v: VehicleId, l: Loadout): void;
  setName(name: string): Promise<string | null>;
  leaderboard(): ReturnType<Store["leaderboard"]>;
  say(text: string): void;
  chatOpen(): boolean;
};
const noop = () => {};
const HELD: Input = { left: false, right: false, gas: false, brake: true };
/** Forces the on-screen prompt to be worked out again next frame. */
const STALE = "?";

const smooth = (lo: number, hi: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
const turnToward = (from: number, to: number, t: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
const wrapHalf = (t: number) => ((((t + 0.5) % 1) + 1) % 1) - 0.5;
/** Compass position, 0–1 clockwise from north, of a heading (0 faces +z, which is south). */
const bearingOf = (heading: number) => (((Math.PI - heading) / (Math.PI * 2)) % 1 + 1) % 1;

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const fullRef = useRef<HTMLCanvasElement>(null);
  const compassRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<Input>(noInput());
  const modeRef = useRef<Mode>("boot");
  const typingRef = useRef(false);
  const panelRef = useRef(false);
  /** Things the UI asks the game loop to do; the loop owns all the state. */
  const actions = useRef<Actions>({
    act: noop, leave: noop, toggleMap: noop, look: noop, pick: noop, preview: noop, fit: noop, say: noop,
    buy: async () => null, setName: async () => null, leaderboard: async () => [], chatOpen: () => false,
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
  const [run, setRun] = useState<RunHud>(null);
  const [count, setCount] = useState<number | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [chat, setChat] = useState<ChatShown[]>([]);
  const [canChat, setCanChat] = useState(false);

  useEffect(() => {
    typingRef.current = typing;
    panelRef.current = naming || signingIn || board;
  }, [typing, naming, signingIn, board]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    // For checking things by screenshot: ?hour=22 starts the clock there, ?garage=2 parks
    // you at a garage's door, ?at=x,z,heading drops you anywhere, ?rig= skips the picker,
    // ?miles= starts single player with miles to spend, ?net=local plays across tabs of
    // this browser with no account. Not linked from anywhere.
    const params = new URLSearchParams(window.location.search);
    const localNet = params.get("net") === "local";

    const world = buildWorld();
    let store: Store = new LocalStore();
    let net: Net | null = null;
    const rigParam = VEHICLES.find((v) => v.id === params.get("rig"))?.id ?? null;
    let rig: VehicleId = rigParam ?? "bluff";
    let loadout: Loadout = { ...STOCK_LOADOUT };
    let spec = specFor(rig, loadout);
    const car = makeCar(world, START.x, START.z, START.heading, spec);
    let view: ReturnType<typeof createView>;
    try {
      view = createView(canvas, world, rig, loadout);
    } catch {
      return; // No WebGL. The fog-coloured backdrop is all there is to see.
    }
    const map = createMap(world);
    const pitches = campPitches();

    const at = (params.get("at") ?? "").split(",").map(Number);
    const startHour = Number(params.get("hour"));
    const startGarage = view.garages[Number(params.get("garage"))];

    // The physics sees the train and other players' trucks as obstacles on top of the static world.
    let moving: Obstacle[] = [];
    const ground: Ground = {
      height: world.height,
      waterAt: world.waterAt,
      slipAt: world.slipAt,
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
    let flushClock = 0;
    let nearGarage = -1;
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
    const tags = new Map<string, HTMLDivElement>();
    let friendHere: { id: string; name: string } | null = null;
    let chatKey = 0;
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

    const sizeCanvas = (c: HTMLCanvasElement | null) => {
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
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

    const fitRig = (v: VehicleId, l: Loadout) => {
      rig = v;
      loadout = l;
      spec = specFor(v, l);
      view.setRig(v, l);
      net?.update({ vehicle: v, loadout: l });
    };

    // ——— Progress ———

    let shownMiles = -1;
    let shownLook = "";
    let unsubscribe = () => {};
    const attach = (s: Store) => {
      unsubscribe();
      store = s;
      const sync = () => {
        const p = store.get();
        const look = `${p.vehicle}|${JSON.stringify(p.loadout)}|${p.owned.length}|${p.goals.length}|${p.name}`;
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

    const goal = (id: string) => store.markGoal(id);

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
      if (!placed && (m === "boot" || m === "pick" || (m === "drive" && car.distance < 30))) placeOnGround(bay.x, bay.z, bay.heading, 0);
      say(`Tent ${tent + 1} is yours.`);
      await refreshFriends();
    };

    /** Signed in (or testing across tabs): load the profile, ask for a name, take a tent. */
    const boot = async () => {
      if (localNet) {
        const id = `tab-${Math.random().toString(36).slice(2, 8)}`;
        attach(new LocalStore(id, null));
        net = new LocalNet(id, handlers);
      } else {
        const session = await currentSession();
        const sb = supabase();
        if (session && sb) {
          try {
            attach(await SupabaseStore.open(sb));
            net = new SupabaseNet(sb, session.user.id, handlers);
          } catch {
            say("Couldn't load your garage. Driving solo for now.");
          }
        }
      }
      if (cancelled) return;
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
      setModeBoth(store.get().vehicle ? "drive" : "pick");
      if (net) {
        if (!p.name) setNaming(true);
        else await join();
      }
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
      if (modeRef.current === "pick") fitRig(v, loadout);
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

    /** E (or the on-screen button): whatever is on offer here. */
    actions.current.act = () => {
      if (modeRef.current !== "drive") return;
      if (nearGarage >= 0 && !running) {
        inputRef.current = noInput();
        cut = { garage: nearGarage, t: 0, from: { x: car.x, z: car.z, heading: car.heading } };
        void store.flush();
        setPrompt(null);
        shownPrompt = "";
        setModeBoth("entering");
        return;
      }
      const m = !running && missionAt(world.missions, car.x, car.z);
      if (m) {
        // Line up just behind the start arch, facing the first gate.
        placeOnGround(m.start.x - Math.sin(m.start.heading) * 7, m.start.z - Math.cos(m.start.heading) * 7, m.start.heading, 0);
        running = startRun(m);
        runIndex = world.missions.indexOf(m);
        lastPose = { x: car.x, z: car.z };
        setPrompt(null);
        shownPrompt = "";
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

    const giveUp = (why: string) => {
      running = null;
      runIndex = -1;
      setRun(null);
      setCount(null);
      shownRun = "";
      view.showRun(-1, 0, time);
      say(why);
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
      if (m === "drive" && !e.repeat) {
        if (k === "e" || k === "E" || k === "Enter" || ((k === "f" || k === "F") && friendHere)) {
          actions.current.act();
          e.preventDefault();
          return;
        }
        if (k === "Escape" && running) return giveUp("Run abandoned.");
        if ((k === "l" || k === "L") && !e.repeat) {
          setBoard(true);
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
      if (m !== "drive") return;
      inputRef.current[control] = true;
      setShowHint(false);
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
    } else if (at.length >= 2 && at.every(Number.isFinite)) placeOnGround(at[0], at[1], at[2] ?? 0, 0);

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

    /** Name tags and speech bubbles over the trucks, placed in screen space. */
    const drawTags = (now: number) => {
      const layer = tagsRef.current;
      if (!layer) return;
      const me = store.get().id;
      const list = view.remotes.tags();
      const mine = bubbles.get(me);
      if (mine) list.push({ id: me, name: "", x: car.x, y: car.y + view.carTop() + 1.1, z: car.z });
      const seen = new Set<string>();
      for (const t of list) {
        const at = view.project(t.x, t.y, t.z);
        let el = tags.get(t.id);
        if (!el) {
          el = document.createElement("div");
          el.className = "absolute left-0 top-0 flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1 whitespace-nowrap will-change-transform";
          el.innerHTML = '<span data-say class="max-w-[14rem] whitespace-normal rounded-xl bg-black/45 px-2.5 py-1 text-center text-xs text-[rgba(255,246,232,0.95)] backdrop-blur"></span><span data-name class="text-[11px] font-semibold tracking-wide text-[rgba(255,246,232,0.85)] drop-shadow"></span>';
          layer.appendChild(el);
          tags.set(t.id, el);
        }
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
          continue;
        }
        el.style.opacity = String(1 - smooth(160, 260, at.far));
        // Kept clear of the screen's edges, so a bubble is never cut off.
        const x = Math.max(120, Math.min(layer.clientWidth - 120, at.x));
        el.style.transform = `translate(${x}px, ${Math.max(40, at.y)}px) translate(-50%, -100%)`;
      }
      for (const [id, el] of tags) {
        if (!seen.has(id)) {
          el.remove();
          tags.delete(id);
        }
      }
    };

    /** The guidance mark on the compass: the nearest thing the current goal is about. */
    const aim = (dt: number) => {
      targetClock -= dt;
      if (targetClock <= 0) {
        targetClock = 0.5;
        const g = currentGoal(store.get().goals, store.online || localNet);
        const nearest = (list: { x: number; z: number }[]) =>
          list.reduce<{ x: number; z: number } | null>((best, p) => (!best || Math.hypot(p.x - car.x, p.z - car.z) < Math.hypot(best.x - car.x, best.z - car.z) ? p : best), null);
        target =
          !g || running ? null
          : g.target === "garage" ? nearest(view.garages.map((x) => x.approach))
          : g.target === "mission" ? nearest(world.missions.map((m) => m.start))
          : g.target === "cafe" ? view.cafe
          : null;
        if (g?.id === "cafe" && Math.hypot(view.cafe.x - car.x, view.cafe.z - car.z) < view.cafe.r + CAFE_SLACK) goal("cafe");
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
      mark.style.transform = `translateX(${Math.max(-edge, Math.min(edge, off))}px)`;
    };

    /** What's on offer where the truck is: a garage door, a start arch, a friend to make. */
    const lookAround = () => {
      let found = -1;
      view.garages.forEach((g, i) => {
        if (Math.hypot(car.x - g.approach.x, car.z - g.approach.z) < 7 && Math.abs(car.speed) < 5) found = i;
      });
      nearGarage = running ? -1 : found;
      const m = !running && found < 0 && Math.abs(car.speed) < 5 ? missionAt(world.missions, car.x, car.z) : null;

      friendHere = null;
      const cafe = view.cafe;
      if (!running && found < 0 && !m && net && Math.hypot(car.x - cafe.x, car.z - cafe.z) < cafe.r + CAFE_SLACK) {
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
        : m ? { kind: "mission", mission: m }
        : friendHere ? { kind: "friend", id: friendHere.id, name: friendHere.name, asked: askedBy.has(friendHere.id) }
        : null;
      const key = next ? `${next.kind}:${"style" in next ? next.style : "mission" in next ? next.mission.id : `${next.id}${next.asked}`}` : "";
      if (key !== shownPrompt) {
        shownPrompt = key;
        setPrompt(next);
      }
    };

    /** The mission in progress: countdown, gates, finish. */
    const runOn = (dt: number) => {
      if (!running) return;
      const r = running;
      const ev = tick(r, dt, lastPose, car);
      if (r.clock < 0) setCount(Math.ceil(-r.clock));
      if (ev?.kind === "go") {
        setCount(0);
        window.setTimeout(() => setCount(null), 700);
      } else if (ev?.kind === "lost") return giveUp("Too far off the course. Run abandoned.");
      else if (ev?.kind === "finish") {
        const m = r.mission;
        const seconds = ev.seconds;
        running = null;
        runIndex = -1;
        setRun(null);
        shownRun = "";
        view.showRun(-1, 0, time);
        void store.completeMission(m, seconds).then((res) => {
          goal("mission");
          if ("paid" in res) say(`${m.name} in ${fmtTime(seconds)}. +${fmtMiles(res.paid)} mi`, 7);
          else say(`${m.name} in ${fmtTime(seconds)}. ${res.error}`, 7);
        });
        return;
      }
      view.showRun(runIndex, r.next, time);
      const hud = `${r.next}|${Math.floor(Math.max(0, r.clock))}`;
      if (hud !== shownRun) {
        shownRun = hud;
        setRun({ name: r.mission.name, clock: Math.max(0, r.clock), gate: r.next, of: r.mission.gates.length });
      }
    };

    const frame = (nowMs: number) => {
      const dt = Math.min((nowMs - last) / 1000, 0.1);
      last = nowMs;
      const now = nowMs / 1000;
      const m = modeRef.current;
      const garage = view.garages[cut.garage];
      time = shared ? Date.now() / 1000 - SHARED_EPOCH : time + (m === "garage" || m === "map" ? 0 : dt);

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
      } else {
        if (m === "drive") {
          moving = [...trainObstacles(view.trainCars()), ...view.remotes.obstacles()];
          lastPose = { x: car.x, z: car.z };
          acc += dt;
          // Held on the brakes at a start line until "go".
          const input = running && running.clock < 0 ? HELD : inputRef.current;
          while (acc >= STEP) {
            step(car, input, STEP, ground, spec);
            acc -= STEP;
          }
          runOn(dt);
          lookAround();
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

        if (net && tent >= 0 && m !== "boot" && m !== "pick") {
          const pose = { x: car.x, y: car.y, z: car.z, heading: car.heading, pitch: car.pitch, roll: car.roll, speed: car.speed, steer: car.steer };
          if (gate.due(pose, now, peers.size + 1)) {
            net.sendPose(pose);
            gate.sent(pose, now);
          }
        }
        if (net && presenceNow === "full") {
          retryClock += dt;
          if (retryClock > RETRY_JOIN) {
            retryClock = 0;
            void join();
          }
        }

        map.reveal(car.x, car.z);
        view.render(car, dt, time, spec, m === "boot" || m === "pick");
        drawTags(now);
        aim(dt);
        if (Math.floor(now * 2) !== Math.floor((now - dt) * 2)) setCanChat(nearbyFriends().length > 0);

        const mini = miniRef.current;
        // The minimap unmounts while you're in a garage, so check its size each frame.
        if (mini && mini.width !== Math.round(mini.clientWidth * Math.min(window.devicePixelRatio || 1, 2))) sizeCanvas(mini);
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
      net?.leave();
    };
    window.addEventListener("pagehide", onUnload);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(toastTimer);
      onUnload();
      unsubscribe();
      stopWatching();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onUnload);
      for (const el of tags.values()) el.remove();
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

  // In the garage, dragging across the picture turns the camera round the truck.
  const drag = useRef<number | null>(null);
  const showroomDrag = {
    onPointerDown: (e: React.PointerEvent) => void (drag.current = e.clientX),
    onPointerMove: (e: React.PointerEvent) => {
      if (drag.current === null || modeRef.current !== "garage") return;
      turnRef.current -= (e.clientX - drag.current) * 0.004;
      drag.current = e.clientX;
    },
    onPointerUp: () => void (drag.current = null),
    onPointerLeave: () => void (drag.current = null),
  };

  const look = useCallback((v: VehicleId) => actions.current.look(v), []);
  const pick = useCallback((v: VehicleId) => actions.current.pick(v), []);
  const loadBoard = useCallback(() => actions.current.leaderboard(), []);

  const driving = mode === "drive" || mode === "entering" || mode === "leaving";
  const goal = profile ? currentGoal(profile.goals, online || presence === "local") : null;
  const solo = !online && presence !== "local";

  return (
    <div className="relative h-[100dvh] w-full select-none overflow-hidden bg-[#efb08c]">
      <canvas
        ref={canvasRef}
        {...showroomDrag}
        className={`block h-full w-full touch-none transition-opacity duration-[1500ms] ${ready ? "opacity-100" : "opacity-0"}`}
      />
      <div ref={tagsRef} className={`pointer-events-none absolute inset-0 overflow-hidden ${driving ? "" : "hidden"}`} />
      <div ref={fadeRef} className="pointer-events-none absolute inset-0 bg-black opacity-0" />

      <h1 className="pointer-events-none absolute left-5 top-4 text-lg font-semibold tracking-tight text-[rgba(255,246,232,0.78)] drop-shadow-sm">
        gilbyy
      </h1>
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

          {/* Minimap and odometer: top-right on phones (clear of the thumbs), bottom-left otherwise. */}
          <div className="absolute right-4 top-12 flex flex-col items-center gap-1 sm:bottom-5 sm:left-5 sm:right-auto sm:top-auto">
            <canvas ref={miniRef} className="pointer-events-none h-[104px] w-[104px] rounded-full drop-shadow-md sm:h-[150px] sm:w-[150px]" />
            <button
              onClick={() => setBoard(true)}
              className="text-[11px] font-semibold tracking-wide text-[rgba(255,246,232,0.7)] drop-shadow-sm"
              title="Leaderboard (L)"
            >
              {fmtMiles(profile?.balance ?? 0)} mi
              {(presence === "online" || presence === "local") && <span className="font-normal text-[rgba(255,246,232,0.5)]"> · {people} here</span>}
            </button>
          </div>
        </>
      )}

      {driving && solo && !run && <SoloBanner canSignIn={onlineConfigured} onSignIn={() => setSigningIn(true)} />}

      {run && driving && (
        <div className="pointer-events-none absolute inset-x-0 top-11 text-center text-sm text-[rgba(255,246,232,0.9)] drop-shadow">
          <span className="font-semibold">{run.name}</span> · {fmtTime(run.clock)} · {Math.min(run.gate + 1, run.of)}/{run.of}
          <span className="ml-2 hidden text-xs text-[rgba(255,246,232,0.5)] sm:inline">Esc to give up</span>
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
        <span className="hidden sm:inline">arrows or WASD to drive · M for the map · L for miles</span>
        <span className="sm:hidden">hold ▲ to drive</span>
      </p>

      {prompt && mode === "drive" && (
        <div className="absolute inset-x-0 bottom-28 flex justify-center px-4 sm:bottom-10">
          <button
            onClick={() => actions.current.act()}
            className="max-w-md rounded-full border border-white/25 bg-black/30 px-4 py-2 text-sm text-[rgba(255,246,232,0.9)] backdrop-blur"
          >
            <span className="mr-2 hidden rounded border border-white/30 px-1.5 text-xs sm:inline">{prompt.kind === "friend" ? "F" : "E"}</span>
            {prompt.kind === "garage" && <>Enter {GARAGE_NAMES[prompt.style].replace(/^The /, "the ")}</>}
            {prompt.kind === "mission" && (
              <>
                Start <b className="font-semibold">{prompt.mission.name}</b>
                <span className="text-[rgba(255,246,232,0.6)]"> · {prompt.mission.blurb} · up to {fmtMiles(prompt.mission.reward)} mi</span>
              </>
            )}
            {prompt.kind === "friend" && (prompt.asked ? <>Accept {prompt.name}&apos;s friend request</> : <>Ask {prompt.name} to be friends</>)}
          </button>
        </div>
      )}

      {mode === "map" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm" onClick={() => actions.current.toggleMap()}>
          <canvas ref={fullRef} className="aspect-square w-[min(88vw,82dvh)] rounded-2xl shadow-2xl" />
          <p className="absolute bottom-4 text-xs text-[rgba(255,246,232,0.6)]">M or Esc to close</p>
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
      {signingIn && <SignInPanel onGoogle={signInWithGoogle} onEmail={signInWithEmail} onClose={() => setSigningIn(false)} />}
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
