#!/usr/bin/env node

const path = require("node:path");

const COMPILED_ROOT = path.resolve(__dirname, "..", ".tmp-tests", "src");
const DEFAULT_TRIALS = 300;
const DEFAULT_SEED = 20260524;

const DUNGEON_IDS = [
  "ash-border-village",
  "black-glass-woods",
  "rust-chain-fort",
  "gray-vein-mine",
  "old-castle-moat",
  "blood-moon-chapel",
  "molten-bone-crater",
];

const STRATEGY_IDS = ["balanced", "safe", "rush", "loot"];

const MASTERY_PRESETS = {
  0: { level: 0, clearCount: 0, label: "mastery-none" },
  3: { level: 3, clearCount: 10, label: "mastery-lv3" },
  5: { level: 5, clearCount: 50, label: "mastery-lv5" },
};

const PARTY_PROFILES = {
  "initial-party": {
    name: "初期部隊",
    demonLordLevel: 1,
    units: [{ templateId: "cinder-goblin", level: 1 }],
  },
  "early-standard": {
    name: "序盤標準部隊",
    demonLordLevel: 3,
    units: [
      { templateId: "cinder-goblin", level: 3 },
      { templateId: "thorn-kobold", level: 3 },
      { templateId: "spark-imp", level: 2 },
    ],
  },
  "gold-party": {
    name: "金策向け部隊",
    demonLordLevel: 4,
    units: [
      { templateId: "cinder-goblin", level: 4 },
      { templateId: "thorn-kobold", level: 4 },
      { templateId: "plague-ratlord", level: 3 },
    ],
  },
  "defense-party": {
    name: "防御寄り部隊",
    demonLordLevel: 5,
    units: [
      { templateId: "bone-vanguard", level: 5 },
      { templateId: "iron-slime", level: 5 },
      { templateId: "obsidian-knight", level: 4 },
    ],
  },
  "exploration-party": {
    name: "探索向け部隊",
    demonLordLevel: 6,
    units: [
      { templateId: "dusk-batkin", level: 5 },
      { templateId: "grave-mage", level: 5 },
      { templateId: "frost-lamia", level: 5 },
    ],
  },
  "high-firepower": {
    name: "高火力部隊",
    demonLordLevel: 7,
    units: [
      { templateId: "mire-ogre", level: 7 },
      { templateId: "magma-troll", level: 6 },
      { templateId: "blood-harpy", level: 6 },
      { templateId: "umbral-witch", level: 6 },
    ],
  },
};

const SCENARIOS = [
  { id: "initial-party-ash", profileId: "initial-party", dungeonId: "ash-border-village", masteryLevel: 0 },
  { id: "initial-party-black", profileId: "initial-party", dungeonId: "black-glass-woods", masteryLevel: 0 },
  { id: "early-standard-black", profileId: "early-standard", dungeonId: "black-glass-woods", masteryLevel: 0 },
  { id: "early-standard-rust", profileId: "early-standard", dungeonId: "rust-chain-fort", masteryLevel: 0 },
  { id: "gold-party-rust-lv3", profileId: "gold-party", dungeonId: "rust-chain-fort", masteryLevel: 3 },
  { id: "defense-party-mine-lv3", profileId: "defense-party", dungeonId: "gray-vein-mine", masteryLevel: 3 },
  { id: "exploration-party-moat-lv3", profileId: "exploration-party", dungeonId: "old-castle-moat", masteryLevel: 3 },
  { id: "high-firepower-chapel-lv5", profileId: "high-firepower", dungeonId: "blood-moon-chapel", masteryLevel: 5 },
  { id: "high-firepower-crater-lv5", profileId: "high-firepower", dungeonId: "molten-bone-crater", masteryLevel: 5 },
];

const loadCompiled = (relativePath) => {
  try {
    return require(path.join(COMPILED_ROOT, relativePath));
  } catch (error) {
    console.error("Compiled game modules were not found.");
    console.error("Run: npm.cmd run sim:balance");
    console.error(`Missing module: ${relativePath}`);
    process.exit(1);
  }
};

const { DUNGEONS } = loadCompiled("data/dungeons.js");
const { STRATEGIES } = loadCompiled("data/strategies.js");
const { createInitialState, createUnit, getDemonExpToNext, getMaxPartySize } = loadCompiled("lib/progression.js");
const {
  advanceGame,
  createExpeditionDepartureSnapshotV1,
  createExpeditionRawOutcomeV1,
  getAdjustedDuration,
} = loadCompiled("lib/expedition.js");
const { getDungeonMasteryLevel } = loadCompiled("lib/mastery.js");
const { isRareDropItem } = loadCompiled("lib/rareDrops.js");
const { getPartyTraitModifiers } = loadCompiled("lib/traits.js");

const dungeonById = new Map(DUNGEONS.map((dungeon) => [dungeon.id, dungeon]));
const strategyById = new Map(STRATEGIES.map((strategy) => [strategy.id, strategy]));

const usage = () => `
Usage:
  npm.cmd run sim:balance
  npm.cmd run sim:balance -- --trials 1000 --seed 12345
  npm.cmd run sim:balance -- --json

Options:
  --trials <number>       Trials per scenario row. Default: ${DEFAULT_TRIALS}
  --seed <value>          Fixed seed for reproducible runs. Default: ${DEFAULT_SEED}
  --json                  Print JSON instead of console tables.
  --scenario <id>         Filter by scenario id.
  --dungeon <id>          Filter by dungeon id.
  --strategy <id>         Filter by strategy id.
  --mastery-level <0|3|5> Filter by mastery preset.
  --help                  Show this help.
`.trim();

const readOptionValue = (argv, index, option) => {
  const current = argv[index];
  if (current.includes("=")) {
    return { value: current.slice(current.indexOf("=") + 1), nextIndex: index };
  }

  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }

  return { value, nextIndex: index + 1 };
};

const parseArgs = (argv) => {
  const options = {
    trials: DEFAULT_TRIALS,
    seed: DEFAULT_SEED,
    json: false,
    help: false,
    scenario: undefined,
    dungeon: undefined,
    strategy: undefined,
    masteryLevel: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const option = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;

    if (option === "--help") {
      options.help = true;
    } else if (option === "--json") {
      options.json = true;
    } else if (option === "--trials") {
      const parsed = readOptionValue(argv, index, option);
      options.trials = Number.parseInt(parsed.value, 10);
      index = parsed.nextIndex;
    } else if (option === "--seed") {
      const parsed = readOptionValue(argv, index, option);
      options.seed = parsed.value;
      index = parsed.nextIndex;
    } else if (option === "--scenario") {
      const parsed = readOptionValue(argv, index, option);
      options.scenario = parsed.value;
      index = parsed.nextIndex;
    } else if (option === "--dungeon") {
      const parsed = readOptionValue(argv, index, option);
      options.dungeon = parsed.value;
      index = parsed.nextIndex;
    } else if (option === "--strategy") {
      const parsed = readOptionValue(argv, index, option);
      options.strategy = parsed.value;
      index = parsed.nextIndex;
    } else if (option === "--mastery-level") {
      const parsed = readOptionValue(argv, index, option);
      options.masteryLevel = Number.parseInt(parsed.value, 10);
      index = parsed.nextIndex;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(options.trials) || options.trials <= 0) {
    throw new Error("--trials must be a positive number.");
  }

  if (options.strategy && !STRATEGY_IDS.includes(options.strategy)) {
    throw new Error(`Unknown strategy: ${options.strategy}`);
  }

  if (options.dungeon && !DUNGEON_IDS.includes(options.dungeon)) {
    throw new Error(`Unknown or unsupported dungeon: ${options.dungeon}`);
  }

  if (options.masteryLevel !== undefined && !MASTERY_PRESETS[options.masteryLevel]) {
    throw new Error("--mastery-level must be one of: 0, 3, 5.");
  }

  return options;
};

const round = (value, digits = 2) => {
  const base = 10 ** digits;
  return Math.round((value + Number.EPSILON) * base) / base;
};

const percent = (value) => `${round(value * 100, 1)}%`;

const quantity = (items) => items.reduce((total, item) => total + item.quantity, 0);

const rareQuantity = (items) =>
  items.filter((item) => isRareDropItem(item.itemId)).reduce((total, item) => total + item.quantity, 0);

const compactTraitProfile = (modifiers) => {
  const parts = [
    modifiers.goldBonus ? `gold+${percent(modifiers.goldBonus)}` : "",
    modifiers.damageReduction ? `damage-${percent(modifiers.damageReduction)}` : "",
    modifiers.trapAvoidance ? `trap-${percent(modifiers.trapAvoidance)}` : "",
    modifiers.normalPowerBonus ? `normal+${percent(modifiers.normalPowerBonus)}` : "",
    modifiers.bossPowerBonus ? `boss+${percent(modifiers.bossPowerBonus)}` : "",
    modifiers.materialLootBonus ? `material+${percent(modifiers.materialLootBonus)}` : "",
    modifiers.failureDamageReduction ? `failureDamage-${percent(modifiers.failureDamageReduction)}` : "",
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "none";
};

const createParty = (profile, scenarioId) =>
  profile.units.map((unit, index) => {
    const created = createUnit(unit.templateId, {
      id: `${scenarioId}-unit-${index + 1}-${unit.templateId}`,
      level: unit.level,
      name: `${unit.templateId}-${unit.level}`,
    });
    return { ...created, currentHp: created.maxHp, status: "idle" };
  });

const makeState = (scenario) => {
  const profile = PARTY_PROFILES[scenario.profileId];
  const units = createParty(profile, scenario.id);
  const mastery = MASTERY_PRESETS[scenario.masteryLevel];
  const base = createInitialState();

  return {
    ...base,
    demonLordName: "Balance Simulation",
    demonLordLevel: profile.demonLordLevel,
    demonLordExp: 0,
    demonLordExpToNext: getDemonExpToNext(profile.demonLordLevel),
    maxPartySize: Math.max(getMaxPartySize(profile.demonLordLevel), units.length),
    unitCapacity: 50,
    itemCapacity: 200,
    units,
    inventory: [],
    activeExpedition: undefined,
    records: [],
    collection: {
      monsters: [...new Set(units.map((unit) => unit.templateId))],
      items: [],
      dungeons: [],
    },
    achievements: { unlocked: [] },
    bossRecords: [],
    dungeonMastery: mastery.clearCount > 0 ? [{ dungeonId: scenario.dungeonId, clearCount: mastery.clearCount }] : [],
    collectionRewards: { claimedIds: [] },
    selectedTitleId: undefined,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
};

const makeActiveExpedition = (state, scenario, strategy, trial) => {
  const durationSeconds = getAdjustedDuration(scenario.dungeonId, strategy);
  const startedAt = 1_700_000_000_000 + trial * 1_000_000;

  return {
    id: `sim-${scenario.id}-${strategy}-${trial}`,
    dungeonId: scenario.dungeonId,
    unitIds: state.units.map((unit) => unit.id),
    strategy,
    startedAt,
    endsAt: startedAt + durationSeconds * 1000,
    durationSeconds,
  };
};

const countTrapLikeEvents = (record) =>
  record.logs.filter((log) => log.type === "info" && log.message.includes("階:")).length;

const runTrial = (scenario, strategy, trial, rootSeed) => {
  const state = makeState(scenario);
  const activeMetadata = makeActiveExpedition(state, scenario, strategy, trial);
  const participantIds = new Set(activeMetadata.unitIds);
  const trialSeed = `${rootSeed}|${scenario.id}|${strategy}|${trial}`;
  const snapshot = createExpeditionDepartureSnapshotV1(state, activeMetadata);
  const activeExpedition = {
    ...activeMetadata,
    simulationVersion: 1,
    seed: trialSeed,
    snapshot,
    outcome: createExpeditionRawOutcomeV1(state, activeMetadata, trialSeed, snapshot),
  };
  const stateWithActive = {
    ...state,
    activeExpedition,
    units: state.units.map((unit) => ({ ...unit, status: "expedition" })),
    collection: {
      ...state.collection,
      dungeons: [...new Set([...state.collection.dungeons, scenario.dungeonId])],
    },
  };

  const finished = advanceGame(stateWithActive, activeExpedition.endsAt + 1);
  const record = finished.records[0];
  const rewards = record.rewards ?? {
    gold: 0,
    demonExp: 0,
    unitExp: 0,
    territory: 0,
    items: [],
    rescuedUnits: [],
  };
  const participantUpdates = finished.units.filter((unit) => participantIds.has(unit.id));

  return {
    status: record.status,
    rewards,
    downedUnits: participantUpdates.filter((unit) => unit.status === "downed" || unit.currentHp <= 0).length,
    participantCount: participantUpdates.length,
    trapLikeEvents: countTrapLikeEvents(record),
  };
};

const summarizeScenario = (scenario, strategy, trials, rootSeed) => {
  const dungeon = dungeonById.get(scenario.dungeonId);
  const strategyDefinition = strategyById.get(strategy);
  const profile = PARTY_PROFILES[scenario.profileId];
  const masteryPreset = MASTERY_PRESETS[scenario.masteryLevel];
  const units = createParty(profile, scenario.id);
  const traitProfile = compactTraitProfile(getPartyTraitModifiers(units));
  const totals = {
    success: 0,
    failure: 0,
    retreat: 0,
    gold: 0,
    demonExp: 0,
    unitExp: 0,
    territory: 0,
    rareTrials: 0,
    rareItems: 0,
    downedUnits: 0,
    participantUnits: 0,
    rescues: 0,
    items: 0,
    trapLikeEvents: 0,
  };

  for (let trial = 0; trial < trials; trial += 1) {
    const result = runTrial(scenario, strategy, trial, rootSeed);
    totals[result.status] += 1;
    totals.gold += result.rewards.gold;
    totals.demonExp += result.rewards.demonExp;
    totals.unitExp += result.rewards.unitExp;
    totals.territory += result.rewards.territory;
    totals.rareItems += rareQuantity(result.rewards.items);
    totals.rareTrials += rareQuantity(result.rewards.items) > 0 ? 1 : 0;
    totals.downedUnits += result.downedUnits;
    totals.participantUnits += result.participantCount;
    totals.rescues += result.rewards.rescuedUnits.length;
    totals.items += quantity(result.rewards.items);
    totals.trapLikeEvents += result.trapLikeEvents;
  }

  return {
    scenarioId: scenario.id,
    scenarioName: `${profile.name} / ${masteryPreset.label}`,
    dungeonId: dungeon.id,
    dungeonName: dungeon.name,
    strategy,
    strategyName: strategyDefinition.name,
    trials,
    successRate: round(totals.success / trials, 4),
    failureRate: round(totals.failure / trials, 4),
    retreatRate: round(totals.retreat / trials, 4),
    averageGold: round(totals.gold / trials, 2),
    averageDemonLordExp: round(totals.demonExp / trials, 2),
    averageUnitExp: round(totals.unitExp / trials, 2),
    averageTerritoryGain: round(totals.territory / trials, 2),
    rareDropRate: round(totals.rareTrials / trials, 4),
    averageRareItems: round(totals.rareItems / trials, 3),
    incapacitationRate: round(totals.participantUnits > 0 ? totals.downedUnits / totals.participantUnits : 0, 4),
    averageRescues: round(totals.rescues / trials, 3),
    averageItems: round(totals.items / trials, 3),
    trapEventRate: round(totals.trapLikeEvents / trials, 3),
    masteryLevel: getDungeonMasteryLevel(masteryPreset.clearCount),
    traitProfile,
  };
};

const buildScenarioRows = (options) => {
  const scenarioRows = [];
  const scenarios = SCENARIOS.filter((scenario) => {
    if (options.scenario && scenario.id !== options.scenario && scenario.profileId !== options.scenario) {
      return false;
    }
    if (options.dungeon && scenario.dungeonId !== options.dungeon) {
      return false;
    }
    if (options.masteryLevel !== undefined && scenario.masteryLevel !== options.masteryLevel) {
      return false;
    }
    return true;
  });

  const strategies = options.strategy ? [options.strategy] : STRATEGY_IDS;
  scenarios.forEach((scenario) => {
    strategies.forEach((strategy) => {
      scenarioRows.push({ scenario, strategy });
    });
  });

  if (scenarioRows.length === 0) {
    throw new Error("No scenarios matched the selected filters.");
  }

  return scenarioRows;
};

const tableRow = (row) => ({
  scenario: row.scenarioId,
  dungeon: row.dungeonId,
  strategy: row.strategy,
  trials: row.trials,
  successRate: percent(row.successRate),
  failureRate: percent(row.failureRate),
  retreatRate: percent(row.retreatRate),
  averageGold: row.averageGold,
  averageDemonLordExp: row.averageDemonLordExp,
  averageUnitExp: row.averageUnitExp,
  averageTerritoryGain: row.averageTerritoryGain,
  rareDropRate: percent(row.rareDropRate),
  averageRareItems: row.averageRareItems,
  incapacitationRate: percent(row.incapacitationRate),
  averageRescues: row.averageRescues,
  averageItems: row.averageItems,
  trapEventRate: row.trapEventRate,
  masteryLevel: row.masteryLevel,
  traitProfile: row.traitProfile,
});

const runSimulation = (options) =>
  buildScenarioRows(options).map(({ scenario, strategy }) =>
    summarizeScenario(scenario, strategy, options.trials, String(options.seed)),
  );

const main = () => {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
  } catch (error) {
    console.error(error.message);
    console.error("");
    console.error(usage());
    process.exit(1);
  }

  const rows = runSimulation(options);
  const payload = {
    tool: "maou-rebuild-balance-simulation",
    gameStateVersion: 5,
    seed: String(options.seed),
    trialsPerRow: options.trials,
    rowCount: rows.length,
    rows,
    notes: [
      "This tool uses synthetic in-memory GameState objects and never reads or writes localStorage.",
      "Rewards and outcomes are created once with an explicit per-trial seed, then applied through advanceGame.",
      "trapEventRate is derived from route/trap info logs because the current battle log does not expose a dedicated trap event type.",
    ],
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`魔王再建記 balance simulation`);
  console.log(`seed=${payload.seed} trialsPerRow=${payload.trialsPerRow} rows=${payload.rowCount}`);
  console.table(rows.map(tableRow));
  console.log("Note: trapEventRate is log-derived and should be treated as a directional trap/routing pressure metric.");
};

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_TRIALS,
  DEFAULT_SEED,
  DUNGEON_IDS,
  PARTY_PROFILES,
  SCENARIOS,
  STRATEGY_IDS,
  buildScenarioRows,
  parseArgs,
  runSimulation,
};
