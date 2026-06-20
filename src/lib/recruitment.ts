import type { Stats } from "../types/game";

export interface RecruitmentDisplaySource {
  baseStats?: Partial<Stats>;
  hireCost?: number;
}

export interface RecruitmentStatRow {
  key: "level" | keyof Stats | "cost";
  label: string;
  value: number;
  suffix?: string;
}

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const getRecruitmentStatRows = (
  template: RecruitmentDisplaySource,
): RecruitmentStatRow[] => {
  const candidates: Array<RecruitmentStatRow | undefined> = [
    { key: "level", label: "初期Lv", value: 1 },
    finiteNumber(template.baseStats?.hp)
      ? { key: "hp", label: "最大HP", value: template.baseStats.hp }
      : undefined,
    finiteNumber(template.baseStats?.atk)
      ? { key: "atk", label: "攻撃", value: template.baseStats.atk }
      : undefined,
    finiteNumber(template.baseStats?.def)
      ? { key: "def", label: "防御", value: template.baseStats.def }
      : undefined,
    finiteNumber(template.baseStats?.spd)
      ? { key: "spd", label: "速度", value: template.baseStats.spd }
      : undefined,
    finiteNumber(template.hireCost)
      ? { key: "cost", label: "雇用費", value: template.hireCost, suffix: "G" }
      : undefined,
  ];

  return candidates.filter((row): row is RecruitmentStatRow => Boolean(row));
};
