export type ExpeditionGuideStepId = "dungeon" | "units" | "strategy" | "item" | "start";
export type ExpeditionGuideStepStatus = "active" | "complete" | "pending" | "optional";

export interface ExpeditionGuideInput {
  dungeonSelected: boolean;
  selectedUnitCount: number;
  strategySelected: boolean;
  selectedDungeonName: string;
  firstDungeonName: string;
  strategyName: string;
  isFirstRun: boolean;
}

export interface ExpeditionGuideStep {
  id: ExpeditionGuideStepId;
  label: string;
  status: ExpeditionGuideStepStatus;
}

export interface ExpeditionGuideState {
  currentStep: ExpeditionGuideStepId;
  highlightTarget: ExpeditionGuideStepId;
  ready: boolean;
  title: string;
  body: string;
  steps: ExpeditionGuideStep[];
}

const getStatus = (step: ExpeditionGuideStepId, current: ExpeditionGuideStepId, completed: Set<ExpeditionGuideStepId>) => {
  if (step === "item") {
    return "optional";
  }
  if (step === current) {
    return "active";
  }
  return completed.has(step) ? "complete" : "pending";
};

export const getExpeditionGuideState = (input: ExpeditionGuideInput): ExpeditionGuideState => {
  const completed = new Set<ExpeditionGuideStepId>();

  if (input.dungeonSelected) {
    completed.add("dungeon");
  }
  if (input.selectedUnitCount > 0) {
    completed.add("units");
  }
  if (input.strategySelected) {
    completed.add("strategy");
  }

  let currentStep: ExpeditionGuideStepId = "start";
  let title = "準備完了。遠征開始できます";
  let body = `${input.selectedDungeonName}へ、${input.selectedUnitCount}体の配下を${input.strategyName}で送り出せます。持ち込みアイテムは任意です。`;

  if (!input.dungeonSelected) {
    currentStep = "dungeon";
    title = "まずダンジョンを選びましょう";
    body = input.isFirstRun
      ? `初回は${input.firstDungeonName}がおすすめです。短時間で結果を確認できます。`
      : "解放済みのダンジョンから、いま挑みたい遠征先を選びましょう。";
  } else if (input.selectedUnitCount === 0) {
    currentStep = "units";
    title = "次に配下を1体以上選びましょう";
    body = "待機中の魔物だけが出撃できます。迷ったら「おすすめ」表示の配下を選べば十分です。";
  } else if (!input.strategySelected) {
    currentStep = "strategy";
    title = "作戦方針を選びましょう";
    body = "初回はバランス重視がおすすめです。強行突破と戦利品重視は被害が増えやすくなります。";
  }

  const ready = currentStep === "start";
  const steps: ExpeditionGuideStep[] = [
    { id: "dungeon", label: "1. ダンジョン", status: getStatus("dungeon", currentStep, completed) },
    { id: "units", label: "2. 配下", status: getStatus("units", currentStep, completed) },
    { id: "strategy", label: "3. 作戦", status: getStatus("strategy", currentStep, completed) },
    { id: "item", label: "4. 持ち込み任意", status: "optional" },
    { id: "start", label: "5. 遠征開始", status: ready ? "active" : "pending" },
  ];

  return {
    currentStep,
    highlightTarget: currentStep,
    ready,
    title,
    body,
    steps,
  };
};
