export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type UnitStatus = "idle" | "expedition" | "downed";

export type StrategyId = "balanced" | "safe" | "rush" | "loot";

export type ExpeditionStatus = "in_progress" | "success" | "failure" | "retreat";

export type LogType =
  | "info"
  | "battle"
  | "loot"
  | "rescue"
  | "success"
  | "failure"
  | "retreat";

export type CombatLogType =
  | "encounter"
  | "allyAttack"
  | "enemyAttack"
  | "damage"
  | "defeatEnemy"
  | "defeatAlly"
  | "retreat"
  | "victory"
  | "reward";

export type ItemType = "support" | "material" | "relic";

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface UnitTemplate {
  id: string;
  species: string;
  defaultName: string;
  emoji: string;
  rarity: Rarity;
  baseStats: Stats;
  growth: Stats;
  hireCost: number;
  unlockLevel: number;
  recoverySeconds: number;
  description: string;
}

export interface GameUnit {
  id: string;
  templateId: string;
  name: string;
  species: string;
  emoji: string;
  rarity: Rarity;
  level: number;
  exp: number;
  expToNext: number;
  maxHp: number;
  currentHp: number;
  atk: number;
  def: number;
  spd: number;
  status: UnitStatus;
  recoveryUntil?: number;
}

export interface ItemEffect {
  successBonus?: number;
  rewardMultiplier?: number;
  damageMultiplier?: number;
  lootBonus?: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  type: ItemType;
  price: number;
  sellPrice: number;
  unlockLevel: number;
  description: string;
  effect?: ItemEffect;
}

export interface InventoryItem {
  itemId: string;
  quantity: number;
}

export interface DungeonEnemy {
  id: string;
  name: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  logLine: string;
}

export interface EnemyCharacterDefinition {
  id: string;
  name: string;
  kind: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  flavor: string;
  dungeonId: string;
  dungeonName: string;
  weight: number;
  isBoss?: boolean;
}

export interface CombatEnemySnapshot {
  id: string;
  name: string;
  kind: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  flavor: string;
  dungeonId: string;
  isBoss?: boolean;
}

export interface CombatLogEntry {
  id: string;
  turn: number;
  type: CombatLogType;
  actorName?: string;
  targetName?: string;
  damage?: number;
  hpBefore?: number;
  hpAfter?: number;
  enemyId?: string;
  text: string;
}

export interface DungeonRewardItem {
  itemId: string;
  chance: number;
  min: number;
  max: number;
}

export interface DungeonDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlockLevel: number;
  recommendedLevel: number;
  floors: number;
  difficulty: number;
  durationSeconds: number;
  territoryReward: number;
  goldMin: number;
  goldMax: number;
  demonExp: number;
  unitExp: number;
  enemies: DungeonEnemy[];
  boss: DungeonEnemy;
  rewards: DungeonRewardItem[];
  rescuePool: string[];
}

export interface StrategyDefinition {
  id: StrategyId;
  name: string;
  description: string;
  successBonus: number;
  rewardMultiplier: number;
  durationMultiplier: number;
  damageMultiplier: number;
  lootBonus: number;
  unitExpMultiplier: number;
}

export interface ExpeditionState {
  id: string;
  dungeonId: string;
  unitIds: string[];
  strategy: StrategyId;
  itemId?: string;
  startedAt: number;
  endsAt: number;
  durationSeconds: number;
}

export interface LogEntry {
  id: string;
  at: number;
  type: LogType;
  message: string;
}

export interface RewardItemStack {
  itemId: string;
  quantity: number;
}

export type AchievementCategory = "expedition" | "battle" | "collection" | "growth";

export type AchievementRequirement =
  | { type: "expeditionCount"; count: number }
  | { type: "successCount"; count: number }
  | { type: "bossDefeats"; count: number }
  | { type: "demonLordLevel"; level: number }
  | { type: "collectionTotal"; count: number }
  | { type: "monsterCollection"; count: number }
  | { type: "itemCollection"; count: number }
  | { type: "dungeonCollection"; count: number }
  | { type: "rescuedUnits"; count: number }
  | { type: "rareRewards"; count: number };

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  requirement: AchievementRequirement;
}

export interface AchievementUnlock {
  achievementId: string;
  unlockedAt: number;
}

export interface AchievementState {
  unlocked: AchievementUnlock[];
}

export type TitleCategory =
  | "expedition"
  | "battle"
  | "growth"
  | "collection"
  | "mastery"
  | "rare"
  | "resilience";

export type TitleRequirement =
  | { type: "always" }
  | { type: "expeditionCount"; count: number }
  | { type: "successCount"; count: number }
  | { type: "failureOrRetreatCount"; count: number }
  | { type: "bossDefeats"; count: number }
  | { type: "demonLordLevel"; level: number }
  | { type: "territoryLiberation"; percent: number }
  | { type: "collectionTotal"; count: number }
  | { type: "monsterCollection"; count: number }
  | { type: "itemCollection"; count: number }
  | { type: "dungeonCollection"; count: number }
  | { type: "dungeonMasteryLevel"; level: number; dungeonId?: string }
  | { type: "rareRewards"; count: number };

export interface TitleDefinition {
  id: string;
  name: string;
  flavor: string;
  category: TitleCategory;
  requirement: TitleRequirement;
  priority: number;
  hiddenUntilUnlocked?: boolean;
}

export interface BossDefeatRecord {
  dungeonId: string;
  defeats: number;
  firstDefeatedAt?: number;
  lastDefeatedAt?: number;
}

export interface DungeonMasteryRecord {
  dungeonId: string;
  clearCount: number;
}

export type CollectionRewardTarget = "monsters" | "items" | "dungeons" | "total";

export interface CollectionRewardContent {
  gold?: number;
  demonExp?: number;
  items?: RewardItemStack[];
}

export interface CollectionRewardDefinition {
  id: string;
  title: string;
  description: string;
  target: CollectionRewardTarget;
  requiredCount: number;
  rewards: CollectionRewardContent;
}

export interface CollectionRewardState {
  claimedIds: string[];
}

export interface RescuedUnitSummary {
  unitId: string;
  name: string;
  species: string;
  rarity: Rarity;
}

export interface ExpeditionMvp {
  unitId: string;
  name: string;
  title: string;
  note: string;
}

export interface ExpeditionRewards {
  gold: number;
  demonExp: number;
  unitExp: number;
  territory: number;
  items: RewardItemStack[];
  rescuedUnits: RescuedUnitSummary[];
  mvp?: ExpeditionMvp;
}

export interface ExpeditionRecord {
  id: string;
  dungeonId: string;
  dungeonName: string;
  unitNames: string[];
  strategy: StrategyId;
  startedAt: number;
  endedAt: number;
  status: ExpeditionStatus;
  logs: LogEntry[];
  rewards?: ExpeditionRewards;
  battleLog?: CombatLogEntry[];
  encounteredEnemies?: CombatEnemySnapshot[];
}

export interface CollectionState {
  monsters: string[];
  items: string[];
  dungeons: string[];
}

export interface GameState {
  version: number;
  demonLordName: string;
  demonLordLevel: number;
  demonLordExp: number;
  demonLordExpToNext: number;
  gold: number;
  territoryLiberation: number;
  unitCapacity: number;
  itemCapacity: number;
  maxPartySize: number;
  units: GameUnit[];
  inventory: InventoryItem[];
  activeExpedition?: ExpeditionState;
  records: ExpeditionRecord[];
  collection: CollectionState;
  achievements: AchievementState;
  bossRecords: BossDefeatRecord[];
  dungeonMastery: DungeonMasteryRecord[];
  collectionRewards: CollectionRewardState;
  selectedTitleId?: string;
  tutorialDismissed?: boolean;
  createdAt: number;
  updatedAt: number;
}
