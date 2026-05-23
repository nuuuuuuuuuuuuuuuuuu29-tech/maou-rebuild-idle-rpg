export interface TraitEffect {
  goldBonus?: number;
  damageReduction?: number;
  trapAvoidance?: number;
  normalPowerBonus?: number;
  bossPowerBonus?: number;
  materialLootBonus?: number;
  failureDamageReduction?: number;
}

export interface TraitDefinition {
  id: string;
  name: string;
  description: string;
  effect: TraitEffect;
}

export const TRAITS: TraitDefinition[] = [
  {
    id: "small-fiend-instinct",
    name: "小鬼の勘",
    description: "がらくたの中から使える金目を見つける。",
    effect: { goldBonus: 0.02 },
  },
  {
    id: "bone-shield",
    name: "骨盾",
    description: "硬い体と鈍い痛覚で部隊の損耗を抑える。",
    effect: { damageReduction: 0.03 },
  },
  {
    id: "shadow-step",
    name: "影足",
    description: "危うい床や呪いの気配を避けて進む。",
    effect: { trapAvoidance: 0.03 },
  },
  {
    id: "quick-flame",
    name: "火急",
    description: "通常戦で素早く先手を取り、敵の構えを崩す。",
    effect: { normalPowerBonus: 0.01 },
  },
  {
    id: "wall-breaker",
    name: "破城",
    description: "首領戦で重い一撃を通し、守りを割る。",
    effect: { bossPowerBonus: 0.02 },
  },
  {
    id: "scout-eye",
    name: "探索眼",
    description: "通路の端に隠された通常素材を見落とさない。",
    effect: { materialLootBonus: 0.01 },
  },
  {
    id: "last-stand",
    name: "生還本能",
    description: "敗色が濃い時ほど、致命傷を避けて戻る。",
    effect: { failureDamageReduction: 0.03 },
  },
];

export const UNIT_TRAIT_IDS: Record<string, string> = {
  "cinder-goblin": "small-fiend-instinct",
  "thorn-kobold": "small-fiend-instinct",
  "dusk-batkin": "shadow-step",
  "bone-vanguard": "bone-shield",
  "iron-slime": "bone-shield",
  "spark-imp": "quick-flame",
  "grave-mage": "scout-eye",
  "ash-hound": "quick-flame",
  "veil-ghost": "last-stand",
  "plague-ratlord": "small-fiend-instinct",
  "mire-ogre": "wall-breaker",
  "blood-harpy": "quick-flame",
  "obsidian-knight": "bone-shield",
  "frost-lamia": "scout-eye",
  "chain-gargoyle": "bone-shield",
  "magma-troll": "wall-breaker",
  "umbral-witch": "scout-eye",
  "night-manticore": "last-stand",
  "void-reaper": "quick-flame",
  "abyss-drake": "wall-breaker",
  "crown-lich": "last-stand",
  "eclipse-seraph": "last-stand",
};

export const getTraitDefinition = (id: string) => {
  const trait = TRAITS.find((entry) => entry.id === id);
  if (!trait) {
    throw new Error(`Unknown trait: ${id}`);
  }
  return trait;
};
