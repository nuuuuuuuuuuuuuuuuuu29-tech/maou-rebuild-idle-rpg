import { createInitialState } from "../../../src/lib/progression";
import type { ExpeditionRecord, GameState } from "../../../src/types/game";

export const STORAGE_KEY = "maou-rebuild-state-v1";

const FIXED_TIME = Date.UTC(2026, 4, 13, 12, 0, 0);

export const createGameState = (overrides: Partial<GameState> = {}): GameState => ({
  ...createInitialState(),
  ...overrides,
  version: 5,
  updatedAt: FIXED_TIME,
});

const completedRecord: ExpeditionRecord = {
  id: "e2e-completed-expedition",
  dungeonId: "ash-border-village",
  dungeonName: "煤けた境界村",
  unitNames: ["ハイツメ"],
  strategy: "balanced",
  startedAt: FIXED_TIME - 30_000,
  endedAt: FIXED_TIME,
  status: "success",
  logs: [
    {
      id: "e2e-summary-1",
      at: FIXED_TIME,
      type: "success",
      message: "煤けた境界村から帰還した。",
    },
  ],
  rewards: {
    gold: 52,
    demonExp: 32,
    unitExp: 24,
    territory: 1,
    items: [],
    rescuedUnits: [],
  },
  encounteredEnemies: [
    {
      id: "cinder-skeleton",
      name: "煤けた骸骨兵",
      kind: "骸骨兵",
      hp: 30,
      attack: 8,
      defense: 4,
      speed: 6,
      flavor: "灰の道を守り続ける古い歩哨。",
      dungeonId: "ash-border-village",
    },
  ],
  battleLog: [
    {
      id: "e2e-encounter-1",
      turn: 0,
      type: "encounter",
      actorName: "煤けた骸骨兵",
      enemyId: "cinder-skeleton",
      text: "煤けた境界村で「煤けた骸骨兵」と遭遇した。",
    },
    {
      id: "e2e-ally-attack-1",
      turn: 1,
      type: "allyAttack",
      actorName: "ハイツメ",
      targetName: "煤けた骸骨兵",
      damage: 12,
      hpBefore: 30,
      hpAfter: 18,
      text: "ハイツメの攻撃。煤けた骸骨兵に 12 ダメージ。",
    },
    {
      id: "e2e-enemy-damage-1",
      turn: 1,
      type: "damage",
      actorName: "煤けた骸骨兵",
      hpBefore: 30,
      hpAfter: 18,
      text: "煤けた骸骨兵のHP: 30 → 18",
    },
    {
      id: "e2e-enemy-attack-1",
      turn: 1,
      type: "enemyAttack",
      actorName: "煤けた骸骨兵",
      targetName: "ハイツメ",
      damage: 7,
      hpBefore: 46,
      hpAfter: 39,
      text: "煤けた骸骨兵の反撃。ハイツメは 7 ダメージを受けた。",
    },
    {
      id: "e2e-ally-damage-1",
      turn: 1,
      type: "damage",
      actorName: "ハイツメ",
      hpBefore: 46,
      hpAfter: 39,
      text: "ハイツメのHP: 46 → 39",
    },
    {
      id: "e2e-ally-attack-2",
      turn: 2,
      type: "allyAttack",
      actorName: "ハイツメ",
      targetName: "煤けた骸骨兵",
      damage: 18,
      hpBefore: 18,
      hpAfter: 0,
      text: "ハイツメの攻撃。煤けた骸骨兵に 18 ダメージ。",
    },
    {
      id: "e2e-enemy-damage-2",
      turn: 2,
      type: "damage",
      actorName: "煤けた骸骨兵",
      hpBefore: 18,
      hpAfter: 0,
      text: "煤けた骸骨兵のHP: 18 → 0",
    },
    {
      id: "e2e-enemy-defeat-1",
      turn: 2,
      type: "defeatEnemy",
      actorName: "ハイツメ",
      targetName: "煤けた骸骨兵",
      text: "煤けた骸骨兵を撃破した。",
    },
    {
      id: "e2e-victory-1",
      turn: 3,
      type: "victory",
      text: "部隊は戦闘に勝利した。",
    },
    {
      id: "e2e-reward-1",
      turn: 3,
      type: "reward",
      text: "部隊は 52G と魔王EXP 32を持ち帰った。",
    },
  ],
};

export const createCompletedGameState = (): GameState =>
  createGameState({
    gold: 172,
    territoryLiberation: 1,
    records: [completedRecord],
    collection: {
      monsters: ["cinder-goblin"],
      items: ["iron-ration", "smoke-charm"],
      dungeons: ["ash-border-village"],
    },
  });
