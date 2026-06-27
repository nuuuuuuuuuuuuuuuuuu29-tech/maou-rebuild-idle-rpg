import { getEnemyCatalogForDungeon } from "../data/enemies";
import type {
  CombatEnemySnapshot,
  CombatLogEntry,
  DungeonDefinition,
  EnemyCharacterDefinition,
  ExpeditionRecord,
  ExpeditionRewards,
  ExpeditionState,
  GameUnit,
} from "../types/game";
import { randomRange, type Rng } from "./rng";

interface CombatReportInput {
  active: ExpeditionState;
  dungeon: DungeonDefinition;
  initialParty: GameUnit[];
  finalParty: GameUnit[];
  status: ExpeditionRecord["status"];
  rewards: ExpeditionRewards;
  rng: Rng;
}

interface CombatReport {
  battleLog: CombatLogEntry[];
  encounteredEnemies: CombatEnemySnapshot[];
}

interface RuntimeUnit {
  id: string;
  name: string;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

interface RuntimeEnemy {
  definition: EnemyCharacterDefinition;
  hp: number;
}

const clampHp = (value: number) => Math.max(0, Math.round(value));

const weightedPick = (enemies: EnemyCharacterDefinition[], rng: Rng) => {
  const totalWeight = enemies.reduce((sum, enemy) => sum + Math.max(1, enemy.weight), 0);
  let roll = rng() * totalWeight;
  for (const enemy of enemies) {
    roll -= Math.max(1, enemy.weight);
    if (roll <= 0) {
      return enemy;
    }
  }
  return enemies[0];
};

const makeEntry = (
  active: ExpeditionState,
  index: number,
  entry: Omit<CombatLogEntry, "id">,
): CombatLogEntry => ({
  id: `${active.id}-combat-${index}`,
  ...entry,
});

const toSnapshot = (enemy: EnemyCharacterDefinition): CombatEnemySnapshot => ({
  id: enemy.id,
  name: enemy.name,
  kind: enemy.kind,
  hp: enemy.hp,
  attack: enemy.attack,
  defense: enemy.defense,
  speed: enemy.speed,
  flavor: enemy.flavor,
  dungeonId: enemy.dungeonId,
  isBoss: enemy.isBoss,
});

const selectEncounterEnemies = (dungeon: DungeonDefinition, status: ExpeditionRecord["status"], rng: Rng) => {
  const catalog = getEnemyCatalogForDungeon(dungeon.id);
  const normalEnemies = catalog.filter((enemy) => !enemy.isBoss);
  const boss = catalog.find((enemy) => enemy.isBoss);
  const encounterCount = status === "success" ? 2 : 1 + Math.floor(rng() * 2);
  const encounters: EnemyCharacterDefinition[] = [];

  for (let index = 0; index < encounterCount && normalEnemies.length > 0; index += 1) {
    encounters.push(weightedPick(normalEnemies, rng));
  }

  if (status === "success" && boss) {
    encounters.push(boss);
  } else if (boss && dungeon.difficulty >= 5 && rng() < 0.35) {
    encounters.push(boss);
  }

  return encounters.slice(0, 3);
};

const makeRuntimeParty = (party: GameUnit[]): RuntimeUnit[] =>
  party.map((unit) => ({
    id: unit.id,
    name: unit.name,
    maxHp: Math.max(1, unit.maxHp),
    hp: Math.max(0, unit.currentHp),
    atk: unit.atk,
    def: unit.def,
    spd: unit.spd,
  }));

const pickAliveUnit = (party: RuntimeUnit[], rng: Rng) => {
  const alive = party.filter((unit) => unit.hp > 0);
  if (alive.length === 0) {
    return party[0];
  }
  return alive[Math.floor(rng() * alive.length)];
};

const chooseAttacker = (party: RuntimeUnit[], turn: number) => {
  const alive = party.filter((unit) => unit.hp > 0);
  if (alive.length === 0) {
    return party[0];
  }
  const sorted = [...alive].sort((a, b) => b.spd + b.atk * 0.12 - (a.spd + a.atk * 0.12));
  return sorted[turn % sorted.length];
};

const allyDamage = (unit: RuntimeUnit, enemy: RuntimeEnemy, finishingBlow: boolean, rng: Rng) => {
  const base = unit.atk * randomRange(rng, 0.62, 0.92) + unit.spd * 0.08 - enemy.definition.defense * randomRange(rng, 0.22, 0.36);
  const raw = Math.max(1, Math.round(base));
  if (finishingBlow) {
    return Math.max(1, enemy.hp);
  }
  if (enemy.hp <= 1) {
    return 1;
  }
  return Math.min(raw, Math.max(1, enemy.hp - 1));
};

const enemyDamage = (enemy: RuntimeEnemy, unit: RuntimeUnit, rng: Rng) => {
  const base = enemy.definition.attack * randomRange(rng, 0.48, 0.86) + enemy.definition.speed * 0.04 - unit.def * randomRange(rng, 0.18, 0.32);
  return Math.max(1, Math.round(base));
};

const pushHpDamageEntry = (
  logs: CombatLogEntry[],
  active: ExpeditionState,
  turn: number,
  indexRef: { value: number },
  actorName: string,
  hpBefore: number,
  hpAfter: number,
) => {
  logs.push(
    makeEntry(active, indexRef.value, {
      turn,
      type: "damage",
      actorName,
      hpBefore,
      hpAfter,
      text: `${actorName}のHP: ${hpBefore} → ${hpAfter}`,
    }),
  );
  indexRef.value += 1;
};

const rewardText = (rewards: ExpeditionRewards) => {
  const itemCount = rewards.items.reduce((sum, item) => sum + item.quantity, 0);
  const rescuedCount = rewards.rescuedUnits.length;
  const parts = [`${rewards.gold}G`, `魔王EXP ${rewards.demonExp}`, `配下EXP ${rewards.unitExp}`];
  if (rewards.territory > 0) {
    parts.push(`領地 +${rewards.territory}%`);
  }
  if (itemCount > 0) {
    parts.push(`戦利品 ${itemCount}個`);
  }
  if (rescuedCount > 0) {
    parts.push(`救出 ${rescuedCount}体`);
  }
  return `部隊は ${parts.join(" / ")} を持ち帰った。`;
};

export const createCombatReport = ({
  active,
  dungeon,
  initialParty,
  finalParty,
  status,
  rewards,
  rng,
}: CombatReportInput): CombatReport => {
  if (initialParty.length === 0) {
    return {
      battleLog: [
        makeEntry(active, 0, {
          turn: 0,
          type: "retreat",
          text: "出撃できる配下がいないため、部隊は門前で撤退した。",
        }),
      ],
      encounteredEnemies: [],
    };
  }

  const logs: CombatLogEntry[] = [];
  const indexRef = { value: 0 };
  const party = makeRuntimeParty(initialParty);
  const enemies = selectEncounterEnemies(dungeon, status, rng);
  const encountered = new Map<string, CombatEnemySnapshot>();

  enemies.forEach((definition, encounterIndex) => {
    const enemy: RuntimeEnemy = { definition, hp: definition.hp };
    encountered.set(definition.id, toSnapshot(definition));

    logs.push(
      makeEntry(active, indexRef.value, {
        turn: encounterIndex + 1,
        type: "encounter",
        enemyId: definition.id,
        actorName: definition.name,
        hpBefore: definition.hp,
        hpAfter: definition.hp,
        text: `${dungeon.name}で「${definition.name}」と遭遇した。${definition.kind} / HP ${definition.hp}。${definition.flavor}`,
      }),
    );
    indexRef.value += 1;

    const shouldDefeatEnemy = status === "success" || encounterIndex < enemies.length - 1;
    const maxTurns = definition.isBoss ? 4 : 3;

    for (let turn = 1; turn <= maxTurns; turn += 1) {
      const attacker = chooseAttacker(party, turn + encounterIndex);
      if (!attacker || attacker.hp <= 0) {
        break;
      }

      const finishingBlow = shouldDefeatEnemy && turn === maxTurns;
      const beforeEnemyHp = clampHp(enemy.hp);
      const damage = Math.max(1, allyDamage(attacker, enemy, finishingBlow, rng));
      enemy.hp = clampHp(enemy.hp - damage);
      logs.push(
        makeEntry(active, indexRef.value, {
          turn,
          type: "allyAttack",
          actorName: attacker.name,
          targetName: definition.name,
          enemyId: definition.id,
          damage,
          hpBefore: beforeEnemyHp,
          hpAfter: enemy.hp,
          text: `${attacker.name}の攻撃。${definition.name}に ${damage} ダメージ。`,
        }),
      );
      indexRef.value += 1;
      pushHpDamageEntry(logs, active, turn, indexRef, definition.name, beforeEnemyHp, enemy.hp);

      if (enemy.hp <= 0) {
        logs.push(
          makeEntry(active, indexRef.value, {
            turn,
            type: "defeatEnemy",
            actorName: attacker.name,
            targetName: definition.name,
            enemyId: definition.id,
            hpBefore: beforeEnemyHp,
            hpAfter: 0,
            text: `${definition.name}を撃破した。`,
          }),
        );
        indexRef.value += 1;
        break;
      }

      const target = pickAliveUnit(party, rng);
      if (!target || target.hp <= 0) {
        break;
      }
      const beforeUnitHp = clampHp(target.hp);
      const counterDamage = Math.max(1, enemyDamage(enemy, target, rng));
      target.hp = clampHp(target.hp - counterDamage);
      logs.push(
        makeEntry(active, indexRef.value, {
          turn,
          type: "enemyAttack",
          actorName: definition.name,
          targetName: target.name,
          enemyId: definition.id,
          damage: counterDamage,
          hpBefore: beforeUnitHp,
          hpAfter: target.hp,
          text: `${definition.name}の反撃。${target.name}は ${counterDamage} ダメージを受けた。`,
        }),
      );
      indexRef.value += 1;
      pushHpDamageEntry(logs, active, turn, indexRef, target.name, beforeUnitHp, target.hp);

      if (target.hp <= 0) {
        logs.push(
          makeEntry(active, indexRef.value, {
            turn,
            type: "defeatAlly",
            actorName: definition.name,
            targetName: target.name,
            enemyId: definition.id,
            hpBefore: beforeUnitHp,
            hpAfter: 0,
            text: `${target.name}は膝をつき、後衛が回収した。`,
          }),
        );
        indexRef.value += 1;
      }

      if (party.every((unit) => unit.hp <= 0)) {
        break;
      }
    }
  });

  const downedInResult = finalParty.filter((unit) => unit.currentHp <= 0);
  downedInResult.forEach((unit) => {
    if (!logs.some((entry) => entry.type === "defeatAlly" && entry.targetName === unit.name)) {
      logs.push(
        makeEntry(active, indexRef.value, {
          turn: enemies.length + 1,
          type: "defeatAlly",
          targetName: unit.name,
          hpBefore: 1,
          hpAfter: 0,
          text: `${unit.name}は帰還時に戦闘不能として報告された。`,
        }),
      );
      indexRef.value += 1;
    }
  });

  if (status === "success") {
    logs.push(
      makeEntry(active, indexRef.value, {
        turn: enemies.length + 1,
        type: "victory",
        text: "部隊は敵影を押し返し、奪還地点を確保した。",
      }),
    );
  } else {
    logs.push(
      makeEntry(active, indexRef.value, {
        turn: enemies.length + 1,
        type: "retreat",
        text:
          status === "failure"
            ? "部隊は敵勢を突破できず、損耗を抱えて撤退した。次は編成と作戦を見直す必要がある。"
            : "部隊はこれ以上の損耗を避け、地図と戦利品を抱えて撤退した。",
      }),
    );
  }
  indexRef.value += 1;

  logs.push(
    makeEntry(active, indexRef.value, {
      turn: enemies.length + 2,
      type: "reward",
      text: rewardText(rewards),
    }),
  );

  return {
    battleLog: logs,
    encounteredEnemies: [...encountered.values()],
  };
};
