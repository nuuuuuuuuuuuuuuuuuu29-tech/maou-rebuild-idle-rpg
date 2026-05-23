import { getTraitDefinition, TRAITS, UNIT_TRAIT_IDS, type TraitDefinition, type TraitEffect } from "../data/traits";
import type { GameUnit } from "../types/game";

export interface PartyTraitModifiers {
  goldBonus: number;
  damageReduction: number;
  trapAvoidance: number;
  normalPowerBonus: number;
  bossPowerBonus: number;
  materialLootBonus: number;
  failureDamageReduction: number;
  goldMultiplier: number;
  damageMultiplier: number;
  normalPowerMultiplier: number;
  bossPowerMultiplier: number;
  failureDamageMultiplier: number;
}

export const TRAIT_LIMITS = {
  goldBonus: 0.06,
  damageReduction: 0.08,
  trapAvoidance: 0.08,
  normalPowerBonus: 0.03,
  bossPowerBonus: 0.05,
  materialLootBonus: 0.03,
  failureDamageReduction: 0.08,
} as const;

const emptyModifiers = (): PartyTraitModifiers => ({
  goldBonus: 0,
  damageReduction: 0,
  trapAvoidance: 0,
  normalPowerBonus: 0,
  bossPowerBonus: 0,
  materialLootBonus: 0,
  failureDamageReduction: 0,
  goldMultiplier: 1,
  damageMultiplier: 1,
  normalPowerMultiplier: 1,
  bossPowerMultiplier: 1,
  failureDamageMultiplier: 1,
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const addEffect = (modifiers: PartyTraitModifiers, effect: TraitEffect) => ({
  ...modifiers,
  goldBonus: modifiers.goldBonus + (effect.goldBonus ?? 0),
  damageReduction: modifiers.damageReduction + (effect.damageReduction ?? 0),
  trapAvoidance: modifiers.trapAvoidance + (effect.trapAvoidance ?? 0),
  normalPowerBonus: modifiers.normalPowerBonus + (effect.normalPowerBonus ?? 0),
  bossPowerBonus: modifiers.bossPowerBonus + (effect.bossPowerBonus ?? 0),
  materialLootBonus: modifiers.materialLootBonus + (effect.materialLootBonus ?? 0),
  failureDamageReduction: modifiers.failureDamageReduction + (effect.failureDamageReduction ?? 0),
});

export const getUnitTrait = (unitOrTemplateId: GameUnit | string): TraitDefinition => {
  const templateId = typeof unitOrTemplateId === "string" ? unitOrTemplateId : unitOrTemplateId.templateId;
  const traitId = UNIT_TRAIT_IDS[templateId];
  return traitId ? getTraitDefinition(traitId) : TRAITS[0];
};

export const getPartyTraits = (units: GameUnit[]) => units.map((unit) => getUnitTrait(unit));

export const capTraitModifiers = (modifiers: PartyTraitModifiers): PartyTraitModifiers => {
  const capped = {
    ...modifiers,
    goldBonus: clamp(modifiers.goldBonus, 0, TRAIT_LIMITS.goldBonus),
    damageReduction: clamp(modifiers.damageReduction, 0, TRAIT_LIMITS.damageReduction),
    trapAvoidance: clamp(modifiers.trapAvoidance, 0, TRAIT_LIMITS.trapAvoidance),
    normalPowerBonus: clamp(modifiers.normalPowerBonus, 0, TRAIT_LIMITS.normalPowerBonus),
    bossPowerBonus: clamp(modifiers.bossPowerBonus, 0, TRAIT_LIMITS.bossPowerBonus),
    materialLootBonus: clamp(modifiers.materialLootBonus, 0, TRAIT_LIMITS.materialLootBonus),
    failureDamageReduction: clamp(modifiers.failureDamageReduction, 0, TRAIT_LIMITS.failureDamageReduction),
  };

  return {
    ...capped,
    goldMultiplier: 1 + capped.goldBonus,
    damageMultiplier: 1 - capped.damageReduction,
    normalPowerMultiplier: 1 + capped.normalPowerBonus,
    bossPowerMultiplier: 1 + capped.bossPowerBonus,
    failureDamageMultiplier: 1 - capped.failureDamageReduction,
  };
};

export const getPartyTraitModifiers = (units: GameUnit[]) =>
  capTraitModifiers(getPartyTraits(units).reduce((modifiers, trait) => addEffect(modifiers, trait.effect), emptyModifiers()));

const percent = (value: number) => `${Math.round(value * 100)}%`;

export const formatTraitEffect = (trait: TraitDefinition) => {
  const effect = trait.effect;
  const parts = [
    effect.goldBonus ? `獲得金額 +${percent(effect.goldBonus)}` : "",
    effect.damageReduction ? `被ダメージ -${percent(effect.damageReduction)}` : "",
    effect.trapAvoidance ? `罠リスク -${percent(effect.trapAvoidance)}` : "",
    effect.normalPowerBonus ? `通常戦評価 +${percent(effect.normalPowerBonus)}` : "",
    effect.bossPowerBonus ? `ボス戦評価 +${percent(effect.bossPowerBonus)}` : "",
    effect.materialLootBonus ? `通常素材入手率 +${percent(effect.materialLootBonus)}` : "",
    effect.failureDamageReduction ? `失敗時被害 -${percent(effect.failureDamageReduction)}` : "",
  ].filter(Boolean);

  return parts.join(" / ");
};

export const formatPartyTraitSummary = (modifiers: PartyTraitModifiers) => {
  const parts = [
    modifiers.goldBonus ? `金額 +${percent(modifiers.goldBonus)}` : "",
    modifiers.damageReduction ? `被害 -${percent(modifiers.damageReduction)}` : "",
    modifiers.trapAvoidance ? `罠 -${percent(modifiers.trapAvoidance)}` : "",
    modifiers.normalPowerBonus ? `通常戦 +${percent(modifiers.normalPowerBonus)}` : "",
    modifiers.bossPowerBonus ? `ボス戦 +${percent(modifiers.bossPowerBonus)}` : "",
    modifiers.materialLootBonus ? `素材 +${percent(modifiers.materialLootBonus)}` : "",
    modifiers.failureDamageReduction ? `失敗時被害 -${percent(modifiers.failureDamageReduction)}` : "",
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "特性補正なし";
};
