import type { CombatLogEntry, ExpeditionRecord } from "../types/game";

export type CombatLogEntryView = NonNullable<ExpeditionRecord["battleLog"]>[number];

export type CombatLogDisplayItem =
  | {
      kind: "heading";
      key: string;
      battleNumber: number;
      enemyName?: string;
    }
  | {
      kind: "entry";
      key: string;
      entry: CombatLogEntryView;
      index: number;
      displayText: string;
      mergedDamageEntry?: CombatLogEntryView;
    };

export const getEncounterEnemyName = (entry: CombatLogEntryView) => {
  if (entry.actorName) {
    return entry.actorName;
  }

  const quotedName = entry.text.match(/「([^」]+)」/u) ?? entry.text.match(/"([^"]+)"/u);
  return quotedName?.[1];
};

const isAttackEntry = (entry: CombatLogEntry) => entry.type === "allyAttack" || entry.type === "enemyAttack";

const hasHpChange = (entry: CombatLogEntry) =>
  typeof entry.hpBefore === "number" && typeof entry.hpAfter === "number";

const isMatchingDamageEntry = (attack: CombatLogEntry, next?: CombatLogEntry) => {
  if (!next || next.type !== "damage") {
    return false;
  }

  if (!attack.targetName || next.actorName !== attack.targetName) {
    return false;
  }

  if (!hasHpChange(next)) {
    return false;
  }

  if (typeof attack.hpBefore === "number" && attack.hpBefore !== next.hpBefore) {
    return false;
  }

  if (typeof attack.hpAfter === "number" && attack.hpAfter !== next.hpAfter) {
    return false;
  }

  if (attack.turn !== next.turn) {
    return false;
  }

  return true;
};

const withHpChangeText = (attack: CombatLogEntry, damage: CombatLogEntry) =>
  `${attack.text}（HP ${damage.hpBefore} → ${damage.hpAfter}）`;

export const buildCombatLogDisplayItems = (entries: CombatLogEntryView[]): CombatLogDisplayItem[] => {
  let battleNumber = 0;
  const items: CombatLogDisplayItem[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];

    if (entry.type === "encounter") {
      battleNumber += 1;
      items.push({
        kind: "heading",
        key: `combat-heading-${entry.id}-${index}`,
        battleNumber,
        enemyName: getEncounterEnemyName(entry),
      });
    }

    const next = entries[index + 1];
    if (isAttackEntry(entry) && isMatchingDamageEntry(entry, next)) {
      items.push({
        kind: "entry",
        key: `${entry.id}-${index}-compact-${next.id}`,
        entry,
        index,
        displayText: withHpChangeText(entry, next),
        mergedDamageEntry: next,
      });
      index += 1;
      continue;
    }

    items.push({
      kind: "entry",
      key: `${entry.id}-${index}`,
      entry,
      index,
      displayText: entry.text,
    });
  }

  return items;
};
