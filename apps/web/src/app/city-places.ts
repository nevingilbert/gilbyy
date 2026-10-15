/**
 * San Francisco's parks, neighbourhoods and landmarks, written down by hand as real
 * longitudes and latitudes (west is negative), for city.ts to put on the map with
 * `toGame`. The streets come from the Census's own lines (city-data.ts); these are what
 * the street files don't say: where the parks and the beaches are, what sort of building
 * stands where, and where the famous things are. See ADR 0022.
 *
 * Where a park's edge is a street, its corner is named, so the edge lies on the street and
 * the houses on the far side of it stay where they are. Pure data.
 */

export type LonLat = readonly [number, number];
/** A street corner by its two streets' names, or a spot by longitude and latitude. */
export type Spot = LonLat | readonly [string, string];

/** What a park is underfoot. `wood` is planted thick with trees; `lawn` mostly open; `wild` the dry golden hills; `sand` a beach; `plaza` paved. */
export type ParkKind = "wood" | "lawn" | "wild" | "sand" | "plaza";
export type Park = { name: string; kind: ParkKind; edge: Spot[] };

export const PARKS: Park[] = [
  {
    name: "Golden Gate Park", kind: "lawn",
    edge: [["Fulton St", "Great Hwy"], ["Stanyan St", "Fulton St"], ["Stanyan St", "Oak St"], ["Baker St", "Oak St"], ["Baker St", "Fell St"], ["Fell St", "Stanyan St"], [-122.4535, 37.7663], [-122.4577, 37.7656], ["Great Hwy", "Lincoln Way"]],
  },
  {
    name: "the Presidio", kind: "wood",
    edge: [[-122.4466, 37.8062], [-122.4466, 37.7882], [-122.4590, 37.7872], [-122.4690, 37.7861], [-122.4770, 37.7857], [-122.4850, 37.7871], [-122.4880, 37.7905], [-122.4870, 37.8050], [-122.4800, 37.8120], [-122.4700, 37.8090], [-122.4560, 37.8075]],
  },
  {
    name: "Lands End", kind: "wild",
    edge: [[-122.5160, 37.7775], [-122.5110, 37.7772], [-122.5055, 37.7792], [-122.4985, 37.7808], [-122.4935, 37.7822], [-122.4920, 37.7880], [-122.4990, 37.7905], [-122.5160, 37.7850]],
  },
  { name: "Sutro Heights", kind: "wood", edge: [[-122.5122, 37.7795], [-122.5095, 37.7795], [-122.5095, 37.7772], [-122.5122, 37.7772]] },
  { name: "Twin Peaks", kind: "wild", edge: [[-122.4508, 37.7572], [-122.4438, 37.7575], [-122.4425, 37.7505], [-122.4462, 37.7478], [-122.4512, 37.7495]] },
  { name: "Mount Sutro", kind: "wood", edge: [[-122.4625, 37.7640], [-122.4535, 37.7642], [-122.4515, 37.7585], [-122.4545, 37.7545], [-122.4615, 37.7565]] },
  { name: "Buena Vista Park", kind: "wood", edge: [[-122.4432, 37.7703], [-122.4387, 37.7702], [-122.4384, 37.7664], [-122.4428, 37.7660]] },
  { name: "Corona Heights", kind: "wild", edge: [[-122.4398, 37.7662], [-122.4366, 37.7661], [-122.4366, 37.7637], [-122.4398, 37.7637]] },
  { name: "Mount Davidson", kind: "wood", edge: [[-122.4578, 37.7406], [-122.4522, 37.7407], [-122.4518, 37.7364], [-122.4572, 37.7360]] },
  { name: "Glen Canyon", kind: "wild", edge: [[-122.4462, 37.7442], [-122.4402, 37.7442], [-122.4392, 37.7362], [-122.4452, 37.7352]] },
  { name: "McLaren Park", kind: "wood", edge: [[-122.4292, 37.7232], [-122.4182, 37.7238], [-122.4102, 37.7222], [-122.4082, 37.7142], [-122.4222, 37.7140], [-122.4302, 37.7180]] },
  { name: "Bernal Heights", kind: "wild", edge: [[-122.4178, 37.7447], [-122.4118, 37.7452], [-122.4108, 37.7416], [-122.4172, 37.7410]] },
  { name: "Stern Grove", kind: "wood", edge: [[-122.4872, 37.7377], [-122.4742, 37.7377], [-122.4742, 37.7337], [-122.4872, 37.7341]] },
  { name: "Lake Merced", kind: "lawn", edge: [[-122.5055, 37.7342], [-122.4882, 37.7338], [-122.4832, 37.7232], [-122.4790, 37.7095], [-122.4955, 37.7075], [-122.5035, 37.7150]] },
  { name: "Fort Funston", kind: "sand", edge: [[-122.5072, 37.7245], [-122.5002, 37.7245], [-122.4992, 37.7070], [-122.5042, 37.7070]] },
  { name: "the zoo", kind: "wood", edge: [[-122.5068, 37.7352], [-122.4998, 37.7352], [-122.4998, 37.7298], [-122.5068, 37.7294]] },
  { name: "Baker Beach", kind: "sand", edge: [[-122.4870, 37.8000], [-122.4823, 37.7998], [-122.4813, 37.7880], [-122.4862, 37.7880]] },
  { name: "Crissy Field", kind: "lawn", edge: [[-122.4705, 37.8095], [-122.4475, 37.8085], [-122.4475, 37.8030], [-122.4705, 37.8035]] },
  { name: "Marina Green", kind: "lawn", edge: [[-122.4452, 37.8080], [-122.4342, 37.8080], [-122.4342, 37.8052], [-122.4452, 37.8052]] },
  { name: "Fort Mason", kind: "lawn", edge: [[-122.4342, 37.8075], [-122.4268, 37.8075], [-122.4268, 37.8032], [-122.4342, 37.8032]] },
  { name: "Aquatic Park", kind: "sand", edge: [[-122.4248, 37.8088], [-122.4208, 37.8088], [-122.4208, 37.8064], [-122.4248, 37.8064]] },
  { name: "Telegraph Hill", kind: "wood", edge: [[-122.4078, 37.8037], [-122.4038, 37.8037], [-122.4036, 37.8011], [-122.4076, 37.8010]] },
  { name: "Washington Square", kind: "lawn", edge: [["Powell St", "Union St"], ["Stockton St", "Union St"], ["Stockton St", "Filbert St"], ["Powell St", "Filbert St"]] },
  { name: "Alamo Square", kind: "lawn", edge: [["Steiner St", "Fulton St"], ["Steiner St", "Hayes St"], ["Scott St", "Hayes St"], ["Scott St", "Fulton St"]] },
  { name: "Dolores Park", kind: "lawn", edge: [["Dolores St", "18th St"], ["Church St", "18th St"], ["Church St", "20th St"], ["Dolores St", "20th St"]] },
  { name: "Lafayette Park", kind: "lawn", edge: [["Laguna St", "Washington St"], ["Gough St", "Washington St"], ["Gough St", "Sacramento St"], ["Laguna St", "Sacramento St"]] },
  { name: "Alta Plaza", kind: "lawn", edge: [["Steiner St", "Jackson St"], ["Scott St", "Jackson St"], ["Scott St", "Clay St"], ["Steiner St", "Clay St"]] },
  { name: "Duboce Park", kind: "lawn", edge: [["Scott St", "Duboce Ave"], ["Steiner St", "Duboce Ave"], ["Steiner St", "Hermann St"], ["Scott St", "Hermann St"]] },
  { name: "Union Square", kind: "plaza", edge: [["Powell St", "Post St"], ["Stockton St", "Post St"], ["Stockton St", "Geary St"], ["Powell St", "Geary St"]] },
  { name: "Civic Center", kind: "plaza", edge: [["Larkin St", "McAllister St"], ["Polk St", "McAllister St"], ["Polk St", "Grove St"], ["Larkin St", "Grove St"]] },
  { name: "Candlestick Point", kind: "wild", edge: [[-122.3902, 37.7142], [-122.3770, 37.7142], [-122.3770, 37.7072], [-122.3902, 37.7072]] },
  { name: "Bayview Hill", kind: "wild", edge: [[-122.3998, 37.7198], [-122.3938, 37.7198], [-122.3938, 37.7158], [-122.3998, 37.7158]] },
  { name: "Yerba Buena Island", kind: "wood", edge: [[-122.3725, 37.8135], [-122.3600, 37.8135], [-122.3600, 37.8055], [-122.3725, 37.8055]] },
  { name: "Alcatraz", kind: "wild", edge: [[-122.4255, 37.8285], [-122.4205, 37.8285], [-122.4205, 37.8250], [-122.4255, 37.8250]] },
  { name: "the Marin Headlands", kind: "wild", edge: [[-122.5300, 37.8600], [-122.4600, 37.8600], [-122.4700, 37.8280], [-122.5300, 37.8160]] },
];

/**
 * What sort of building stands where. Anywhere not named here is Victorian and Edwardian
 * row houses, two to four storeys with bay windows: most of the city.
 */
export type District = "rows" | "towers" | "midrise" | "chinatown" | "lofts" | "sheds" | "avenues" | "marina" | "barracks";
export const DISTRICTS: { district: District; edge: LonLat[] }[] = [
  // The Financial District, Transbay and Rincon Hill: the towers.
  { district: "towers", edge: [[-122.4088, 37.7968], [-122.3990, 37.7978], [-122.3925, 37.7955], [-122.3880, 37.7905], [-122.3885, 37.7848], [-122.3962, 37.7812], [-122.4052, 37.7826], [-122.4092, 37.7862]] },
  // Nob Hill, the Tenderloin, Polk Gulch and Civic Center: apartment blocks.
  { district: "midrise", edge: [[-122.4242, 37.7968], [-122.4092, 37.7978], [-122.4088, 37.7880], [-122.4122, 37.7802], [-122.4202, 37.7766], [-122.4252, 37.7800]] },
  // Chinatown and North Beach.
  { district: "chinatown", edge: [[-122.4152, 37.8052], [-122.4032, 37.8048], [-122.4040, 37.7975], [-122.4088, 37.7905], [-122.4112, 37.7930], [-122.4150, 37.7985]] },
  // South of Market, Mission Bay and the Dogpatch: lofts and old warehouses.
  { district: "lofts", edge: [[-122.4185, 37.7745], [-122.4082, 37.7822], [-122.3962, 37.7812], [-122.3870, 37.7840], [-122.3860, 37.7560], [-122.4005, 37.7570], [-122.4122, 37.7680]] },
  // The Bayview, Hunters Point and India Basin: sheds and yards.
  { district: "sheds", edge: [[-122.4010, 37.7545], [-122.3840, 37.7550], [-122.3560, 37.7320], [-122.3780, 37.7140], [-122.3960, 37.7260], [-122.4020, 37.7380]] },
  // The Richmond, the Sunset, Parkside and the south: the avenues' terraced stucco.
  { district: "avenues", edge: [[-122.5160, 37.7890], [-122.4585, 37.7885], [-122.4537, 37.7738], [-122.4600, 37.7660], [-122.4640, 37.7560], [-122.4710, 37.7400], [-122.4600, 37.7330], [-122.4300, 37.7300], [-122.4060, 37.7210], [-122.4040, 37.7070], [-122.5160, 37.7070]] },
  // The Marina and Cow Hollow.
  { district: "marina", edge: [[-122.4470, 37.8072], [-122.4262, 37.8062], [-122.4262, 37.7985], [-122.4470, 37.7985]] },
  // The Presidio's Main Post and Letterman, and Treasure Island: old army and navy buildings.
  { district: "barracks", edge: [[-122.4625, 37.8020], [-122.4470, 37.8020], [-122.4470, 37.7960], [-122.4625, 37.7960]] },
  { district: "barracks", edge: [[-122.3780, 37.8340], [-122.3580, 37.8340], [-122.3580, 37.8150], [-122.3780, 37.8150]] },
];

/** Places with a name, for city.ts to build something at. */
export const LANDMARKS = {
  coitTower: [-122.40583, 37.80239],
  transamerica: [-122.40276, 37.79520],
  salesforce: [-122.39718, 37.78970],
  bankOfAmerica: [-122.40375, 37.79195],
  ferryBuilding: [-122.39350, 37.79554],
  cityHall: [-122.41925, 37.77930],
  graceCathedral: [-122.41330, 37.79190],
  palaceOfFineArts: [-122.44838, 37.80293],
  sutroTower: [-122.45285, 37.75523],
  twinPeaks: [-122.44740, 37.75290],
  mountDavidson: [-122.45453, 37.73835],
  alcatraz: [-122.42300, 37.82680],
  ghirardelli: [-122.42290, 37.80590],
  pier39: [-122.41020, 37.80870],
  seaLions: [-122.41060, 37.80975],
  oraclePark: [-122.38930, 37.77860],
  chinatownGate: ["Grant Ave", "Bush St"],
  paintedLadies: ["Steiner St", "Hayes St"],
  castroTheatre: [-122.43480, 37.76205],
  missionDolores: [-122.42695, 37.76435],
  dutchWindmill: [-122.50910, 37.77080],
  murphyWindmill: [-122.50870, 37.76420],
  conservatory: [-122.46020, 37.77210],
  bison: [-122.49720, 37.76990],
  cliffHouse: [-122.51380, 37.77840],
  legionOfHonor: [-122.50080, 37.78450],
  fortPoint: [-122.47700, 37.81060],
  /** The Golden Gate's towers and the end of its northern approach, at Vista Point. */
  goldenGateSouth: [-122.47750, 37.81360],
  goldenGateNorth: [-122.47900, 37.82510],
  vistaPoint: [-122.48090, 37.83250],
  /** The Bay Bridge's western end, and the tunnel through Yerba Buena Island. */
  bayBridgeWest: [-122.38790, 37.78880],
  yerbaBuenaTunnel: [-122.36420, 37.81090],
  /** The Presidio's campground on Rob Hill, the only one in the city. */
  robHill: [-122.47180, 37.79260],
  /** Caltrain's terminal at Fourth and King. */
  fourthAndKing: ["King St", "4th St"],
  /** North Beach's square, with the café on it. */
  washingtonSquare: ["Columbus Ave", "Union St"],
  /** Lombard Street's crooked block runs between these. */
  lombardTop: ["Lombard St", "Hyde St"],
  lombardFoot: ["Lombard St", "Leavenworth St"],
} satisfies Record<string, Spot>;
