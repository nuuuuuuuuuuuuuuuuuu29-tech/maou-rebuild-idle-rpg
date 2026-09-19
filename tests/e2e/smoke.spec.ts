import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createCompletedGameState, createGameState } from "./fixtures/game-state";
import {
  collectBrowserErrors,
  openFreshGame,
  openGameWithState,
  openMobileMenuItem,
  readSavedGame,
} from "./support/game";

const collectSameOriginHttpErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("response", (response) => {
    if (response.url().startsWith("http://127.0.0.1:4173") && response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  return errors;
};

test("新規セーブから主要画面を移動できる", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await openFreshGame(page);

  await expect(page.getByRole("navigation", { name: "主要画面" })).toBeVisible();

  await page.getByRole("button", { name: "配下" }).click();
  await expect(page.getByText("魔物ユニット", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "遠征", exact: true }).click();
  await expect(page.getByRole("heading", { name: "奪還する領地を選ぶ" })).toBeVisible();

  await page.getByRole("button", { name: "記録", exact: true }).click();
  await expect(page.getByRole("heading", { name: "遠征ログ" })).toBeVisible();

  await openMobileMenuItem(page, "司令部");
  await expect(page.getByRole("heading", { name: "雇用・物資・整理" })).toBeVisible();

  await openMobileMenuItem(page, "図鑑");
  await expect(page.getByRole("heading", { name: "再建の記録" })).toBeVisible();

  await openMobileMenuItem(page, "設定");
  await expect(page.getByRole("heading", { name: "セーブデータ管理" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("最安候補を雇用し所持金と仲間をリロード後も保持する", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await openFreshGame(page);
  await page.getByRole("button", { name: "司令部" }).click();

  const candidate = page.locator("article.recruitment-card").filter({
    has: page.getByRole("heading", { name: "煤牙ゴブリン" }),
  });
  const stats = candidate.getByLabel("煤牙ゴブリンの雇用時ステータス");

  await expect(stats).toContainText("初期Lv");
  await expect(stats).toContainText("最大HP");
  await expect(stats).toContainText("攻撃");
  await expect(stats).toContainText("防御");
  await expect(stats).toContainText("速度");
  await expect(stats).toContainText("雇用費");
  await expect(candidate).toContainText("特性");
  await expect(candidate).not.toContainText("undefined");
  await expect(candidate).not.toContainText("NaN");

  await candidate.getByRole("button", { name: "25G" }).click();
  await expect(page.getByRole("status")).toContainText("雇用しました");
  await expect(page.locator(".screen-heading .pill")).toHaveText("95G");
  await expect(page.getByRole("heading", { name: "魔物の雇用" }).locator(".." ).getByText("2/8")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "司令部" }).click();
  await expect(page.locator(".screen-heading .pill")).toHaveText("95G");
  await expect(page.getByRole("heading", { name: "魔物の雇用" }).locator(".." ).getByText("2/8")).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("移行バックアップに失敗しても画面操作で旧セーブを上書きしない", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const raw = JSON.stringify({ ...createGameState(), version: 5 });
  await page.goto("/");
  await page.evaluate((value) => {
    localStorage.clear();
    localStorage.setItem("maou-rebuild-state-v1", value);
  }, raw);
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("maou-rebuild-state-backup")) {
        throw new DOMException("Backup storage unavailable", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await page.reload();
  await expect(page.getByRole("status")).toContainText("自動保存を停止");
  await page.getByRole("button", { name: "司令部" }).click();
  const candidate = page.locator("article.recruitment-card").filter({
    has: page.getByRole("heading", { name: "煤牙ゴブリン" }),
  });
  await candidate.getByRole("button", { name: "25G" }).click();
  await expect(page.getByRole("status")).toContainText("雇用しました");
  await expect(page.locator(".screen-heading .pill")).toHaveText("95G");
  expect(await page.evaluate(() => localStorage.getItem("maou-rebuild-state-v1"))).toBe(raw);
  await page.reload();
  await expect(page.getByRole("status")).toContainText("自動保存を停止");
  expect(await page.evaluate(() => localStorage.getItem("maou-rebuild-state-v1"))).toBe(raw);
  expect(browserErrors).toEqual([]);
});

test("所持金不足では連打しても雇用されない", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await openGameWithState(page, createGameState({ gold: 0 }));
  await page.getByRole("button", { name: "司令部" }).click();

  const candidate = page.locator("article.recruitment-card").filter({
    has: page.getByRole("heading", { name: "煤牙ゴブリン" }),
  });
  const hireButton = candidate.getByRole("button", { name: "25G" });
  await hireButton.click({ clickCount: 2 });

  await expect(page.getByRole("status")).toContainText("足りません");
  const saved = await readSavedGame(page);
  expect(saved?.gold).toBe(0);
  expect(saved?.units).toHaveLength(1);
  expect(browserErrors).toEqual([]);
});

test("遠征準備で不足条件と出撃可能状態を確認できる", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await openFreshGame(page);
  await page.getByRole("button", { name: "遠征", exact: true }).click();

  await expect(page.getByText("煤けた境界村", { exact: true }).first()).toBeVisible();
  const unitButton = page.getByRole("button", { name: /ハイツメ/ });
  const startButton = page.getByRole("button", { name: /遠征開始|配下を選ぶ/ });

  await expect(startButton).toBeEnabled();
  await unitButton.click();
  await expect(startButton).toBeDisabled();
  await expect(page.getByText("不足条件: 出撃ユニットを1体以上選択してください。")).toBeVisible();

  await unitButton.click();
  await page.getByRole("button", { name: /安全重視/ }).click();
  await expect(page.getByRole("button", { name: "準備完了：遠征開始" })).toBeEnabled();
  expect(browserErrors).toEqual([]);
});

test("遠征準備でレアドロップ目標を切り替え、収集状況を再導出する", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const uncollectedState = createGameState({ demonLordLevel: 10 });
  await openGameWithState(page, uncollectedState);
  await page.getByRole("button", { name: "遠征", exact: true }).click();

  await page.getByRole("button", { name: /灰脈鉱坑/ }).click();
  const mineGoals = page.getByRole("region", { name: "レアドロップ目標 灰脈鉱坑" });
  await expect(mineGoals).toContainText("Rare");
  await expect(mineGoals).toContainText("？？？");
  await expect(mineGoals).toContainText("未入手 1 / 全1種");
  await expect(mineGoals).not.toContainText("落王の印片");

  await page.getByRole("button", { name: /熔骨火口/ }).click();
  const craterGoals = page.getByRole("region", { name: "レアドロップ目標 熔骨火口" });
  await expect(craterGoals.getByText("Epic", { exact: true })).toHaveCount(2);
  await expect(craterGoals).toContainText("未入手 3 / 全3種");

  await page.getByRole("button", { name: /煤けた境界村/ }).click();
  const emptyGoals = page.getByRole("region", { name: "レアドロップ目標 煤けた境界村" });
  await expect(emptyGoals).toContainText("このダンジョンにレアドロップ候補はありません");

  const goalLayout = await emptyGoals.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      fitsViewport: rect.left >= 0 && rect.right <= document.documentElement.clientWidth,
      noHorizontalScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });
  expect(goalLayout).toEqual({ fitsViewport: true, noHorizontalScroll: true });

  const collectedState = createGameState({
    demonLordLevel: 10,
    collection: {
      ...uncollectedState.collection,
      items: [...uncollectedState.collection.items, "fallen-signet"],
    },
  });
  await openGameWithState(page, collectedState);
  await page.getByRole("button", { name: "遠征", exact: true }).click();
  await page.getByRole("button", { name: /灰脈鉱坑/ }).click();

  const collectedGoals = page.getByRole("region", { name: "レアドロップ目標 灰脈鉱坑" });
  await expect(collectedGoals).toContainText("落王の印片");
  await expect(collectedGoals).toContainText("入手済み");
  await expect(collectedGoals).toContainText("このダンジョンのレアドロップは収集済みです");

  await page.reload();
  await page.getByRole("button", { name: "遠征", exact: true }).click();
  await page.getByRole("button", { name: /灰脈鉱坑/ }).click();
  await expect(page.getByRole("region", { name: "レアドロップ目標 灰脈鉱坑" })).toContainText("落王の印片");
  expect(browserErrors).toEqual([]);
});

test("時計制御で進行中遠征をreloadしても固定ログと報酬を一度だけ使用する", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.clock.install({ time: new Date("2026-05-13T12:00:00Z") });
  await openFreshGame(page);

  await page.getByRole("button", { name: "遠征", exact: true }).click();
  await page.getByRole("button", { name: "準備完了：遠征開始" }).click();
  await expect(page.getByRole("heading", { name: "進行中" })).toBeVisible();

  const startedSave = await readSavedGame(page);
  expect(startedSave?.version).toBe(6);
  expect(startedSave?.activeExpedition?.simulationVersion).toBe(1);
  expect(startedSave?.activeExpedition?.seed).toMatch(/^seed-v1-[0-9a-f]{32}$/);
  expect(startedSave?.activeExpedition?.snapshot.party).toHaveLength(1);
  expect(startedSave?.activeExpedition?.outcome.record.id).toBe(startedSave?.activeExpedition?.id);
  const rawOutcome = startedSave?.activeExpedition?.outcome;

  await page.reload();
  await page.getByRole("button", { name: "記録", exact: true }).click();
  await expect(page.getByRole("heading", { name: "進行中" })).toBeVisible();

  const activePanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: "進行中" }),
  });
  await page.clock.fastForward(15_000);
  const beforeReloadLogs = await activePanel.locator(".log-entry p").allTextContents();
  expect(beforeReloadLogs.length).toBeGreaterThan(0);
  expect(beforeReloadLogs).toEqual(rawOutcome?.record.logs.slice(0, beforeReloadLogs.length).map((log) => log.message));
  await expect(activePanel.locator(".log-entry.success, .log-entry.failure, .log-entry.retreat, .log-entry.loot, .log-entry.rescue")).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "記録", exact: true }).click();
  const reloadedPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: "進行中" }),
  });
  const afterReloadLogs = await reloadedPanel.locator(".log-entry p").allTextContents();
  expect(afterReloadLogs).toEqual(beforeReloadLogs);
  const reloadedSave = await readSavedGame(page);
  expect(reloadedSave?.activeExpedition?.seed).toBe(startedSave?.activeExpedition?.seed);
  expect(reloadedSave?.activeExpedition?.snapshot).toEqual(startedSave?.activeExpedition?.snapshot);
  expect(reloadedSave?.activeExpedition?.outcome).toEqual(rawOutcome);

  await page.clock.fastForward(10_000);
  const laterLogs = await reloadedPanel.locator(".log-entry p").allTextContents();
  expect(laterLogs.slice(0, beforeReloadLogs.length)).toEqual(beforeReloadLogs);
  expect(laterLogs.length).toBeGreaterThanOrEqual(beforeReloadLogs.length);

  await page.clock.fastForward(6_000);
  await expect(page.getByText("遠征完了", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今回増えたもの" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "敵遭遇と交戦記録" }).first()).toBeVisible();

  const saved = await readSavedGame(page);
  expect(saved?.activeExpedition).toBeUndefined();
  expect(saved?.records).toHaveLength(1);
  expect(saved?.gold).toBeGreaterThan(120);
  expect(saved?.records[0].logs.slice(0, laterLogs.length).map((log) => log.message)).toEqual(laterLogs);

  const completedSnapshot = {
    gold: saved?.gold,
    demonLordLevel: saved?.demonLordLevel,
    demonLordExp: saved?.demonLordExp,
    inventory: saved?.inventory,
    units: saved?.units,
    record: saved?.records[0],
  };
  await page.reload();
  const completedReload = await readSavedGame(page);
  expect({
    gold: completedReload?.gold,
    demonLordLevel: completedReload?.demonLordLevel,
    demonLordExp: completedReload?.demonLordExp,
    inventory: completedReload?.inventory,
    units: completedReload?.units,
    record: completedReload?.records[0],
  }).toEqual(completedSnapshot);
  expect(browserErrors).toEqual([]);
});

test("固定記録で戦闘区切りとダメージ統合を再読み込み後も表示する", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await openGameWithState(page, createCompletedGameState());
  await page.getByRole("button", { name: "記録", exact: true }).click();

  const assertBattleLog = async () => {
    const section = page.locator(".combat-log-section").first();
    const normalHeading = section.locator(".combat-log-battle-heading").nth(0);
    const bossHeading = section.locator(".combat-log-battle-heading").nth(1);

    await expect(normalHeading).toContainText("戦闘 1");
    await expect(normalHeading).toContainText("煤けた骸骨兵");
    await expect(normalHeading).not.toHaveClass(/is-boss/);
    await expect(normalHeading).not.toContainText("ボス戦");
    await expect(bossHeading).toHaveClass(/is-boss/);
    await expect(bossHeading).toContainText("ボス戦");
    await expect(bossHeading).toContainText("戦闘 2");
    await expect(bossHeading).toContainText("村鐘の番人");
    await expect(section.locator(".combat-log-entry.is-allyAttack").first()).toContainText("HP 30 → 18");
    await expect(section.locator(".combat-log-entry.is-enemyAttack").first()).toContainText("HP 46 → 39");
    await expect(section.locator(".combat-log-entry.is-allyAttack").last()).toContainText("HP 28 → 0");
    await expect(page.getByText("煤けた骸骨兵のHP: 30 → 18", { exact: true })).toHaveCount(0);
    await expect(section.locator(".combat-log-entry.is-defeatEnemy").first()).not.toHaveClass(/is-boss-defeat/);
    await expect(section.locator(".combat-log-entry.is-boss-defeat")).toContainText("ボス撃破");
    await expect(section.locator(".combat-log-entry.is-boss-defeat")).toContainText("村鐘の番人を撃破した");
    await expect(section.locator(".combat-log-entry.is-victory")).toContainText("勝利した");
    await expect(section.locator(".combat-log-entry.is-reward")).toContainText("52G");
  };

  await assertBattleLog();
  await page.reload();
  await page.getByRole("button", { name: "記録", exact: true }).click();
  await assertBattleLog();
  expect(browserErrors).toEqual([]);
});

test("設定画面から現在のセーブをJSONファイルへ書き出せる", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const httpErrors = collectSameOriginHttpErrors(page);
  const completed = createCompletedGameState();
  const state = createGameState({
    ...completed,
    demonLordName: "書出確認魔王",
    gold: 4321,
    records: completed.records,
  });
  await openGameWithState(page, state);
  const beforeRaw = await page.evaluate((key) => localStorage.getItem(key), "maou-rebuild-state-v1");
  await page.getByRole("button", { name: "設定", exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "セーブデータを書き出す" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^maou-rebuild-save-v6-\d{8}-\d{6}\.json$/);
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("export download path is missing");
  }
  const raw = await readFile(downloadPath, "utf8");
  const exported = JSON.parse(raw);

  expect(raw.endsWith("\n")).toBe(true);
  expect(exported.version).toBe(6);
  expect(exported.demonLordName).toBe("書出確認魔王");
  expect(exported.gold).toBe(4321);
  expect(exported.records).toHaveLength(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), "maou-rebuild-state-v1")).toBe(beforeRaw);
  expect(browserErrors).toEqual([]);
  expect(httpErrors).toEqual([]);
});

test("設定画面からv6セーブを読み込み、backupとreload後の状態を維持する", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const httpErrors = collectSameOriginHttpErrors(page);
  const current = createGameState({ demonLordName: "取込前魔王", gold: 123 });
  const completed = createCompletedGameState();
  const imported = createGameState({
    ...completed,
    demonLordName: "取込後魔王",
    demonLordLevel: 4,
    gold: 9876,
    records: completed.records,
  });
  await openGameWithState(page, current);
  const currentRaw = await page.evaluate((key) => localStorage.getItem(key), "maou-rebuild-state-v1");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("セーブデータファイルを選択").setInputFiles({
    name: "import-v6.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported), "utf8"),
  });

  await expect(page.locator(".notice")).toContainText("セーブデータを読み込みました");
  const settings = page.getByRole("heading", { name: "保存状態" }).locator("../..");
  await expect(settings).toContainText("取込後魔王");
  await expect(settings).toContainText("魔王Lv");
  await expect(settings).toContainText("4");
  await expect(settings).toContainText("1件");
  await expect.poll(async () => (await readSavedGame(page))?.gold).toBe(9876);
  const backup = await page.evaluate(({ storageKey, expectedRaw }) => {
    const key = Object.keys(localStorage).find((candidate) => candidate.includes("backup-pre-import"));
    return {
      key,
      value: key ? localStorage.getItem(key) : null,
      current: localStorage.getItem(storageKey),
      expectedRaw,
    };
  }, { storageKey: "maou-rebuild-state-v1", expectedRaw: currentRaw });
  expect(backup.key).toBeTruthy();
  expect(backup.value).toBe(currentRaw);
  expect(JSON.parse(backup.current ?? "{}").demonLordName).toBe("取込後魔王");

  await page.reload();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.getByText("取込後魔王", { exact: true })).toBeVisible();
  expect((await readSavedGame(page))?.gold).toBe(9876);
  expect((await readSavedGame(page))?.records).toHaveLength(1);
  expect(browserErrors).toEqual([]);
  expect(httpErrors).toEqual([]);
});

test("mobile設定でimport cancelと不正JSONを安全に拒否する", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const httpErrors = collectSameOriginHttpErrors(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const current = createGameState({ demonLordName: "保護対象魔王", gold: 2468 });
  await openGameWithState(page, current);
  const currentRaw = await page.evaluate((key) => localStorage.getItem(key), "maou-rebuild-state-v1");
  await openMobileMenuItem(page, "設定");

  const input = page.getByLabel("セーブデータファイルを選択");
  await expect(page.getByRole("button", { name: "セーブデータを書き出す" })).toBeVisible();
  await expect(page.getByText("セーブデータを読み込む", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "セーブデータを初期化" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await input.setInputFiles({
    name: "cancelled.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(createGameState({ gold: 9999 })), "utf8"),
  });
  await expect(page.getByRole("status").filter({ hasText: "読み込みをキャンセルしました" })).toBeVisible();
  await expect(input).toHaveValue("");
  expect(await page.evaluate((key) => localStorage.getItem(key), "maou-rebuild-state-v1")).toBe(currentRaw);

  page.once("dialog", (dialog) => dialog.accept());
  await input.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{ broken json", "utf8"),
  });
  await expect(page.locator(".notice")).toContainText("読み込めませんでした");
  expect(await page.evaluate((key) => localStorage.getItem(key), "maou-rebuild-state-v1")).toBe(currentRaw);
  await page.reload();
  expect((await readSavedGame(page))?.demonLordName).toBe("保護対象魔王");
  expect((await readSavedGame(page))?.gold).toBe(2468);
  await openMobileMenuItem(page, "設定");
  await expect(page.getByRole("button", { name: "セーブデータを書き出す" })).toBeVisible();
  await expect(page.getByRole("button", { name: "セーブデータを初期化" })).toBeVisible();
  const layout = await page.evaluate(() => ({
    noHorizontalScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    controlsFit: [...document.querySelectorAll<HTMLElement>(".save-transfer-actions .secondary-button, .danger-button")]
      .every((element) => element.getBoundingClientRect().right <= document.documentElement.clientWidth),
  }));
  expect(layout).toEqual({ noHorizontalScroll: true, controlsFit: true });
  expect(browserErrors).toEqual([]);
  expect(httpErrors).toEqual([]);
});

test("375px幅で雇用画面と戦闘ログに横スクロールやナビ重なりがない", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await openGameWithState(page, createCompletedGameState());

  await openMobileMenuItem(page, "司令部");
  const candidate = page.locator("article.recruitment-card").filter({
    has: page.getByRole("heading", { name: "煤牙ゴブリン" }),
  });
  await expect(candidate.getByLabel("煤牙ゴブリンの雇用時ステータス")).toBeVisible();

  const recruitmentFits = await candidate.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= document.documentElement.clientWidth;
  });
  expect(recruitmentFits).toBe(true);

  await page.getByRole("button", { name: "記録", exact: true }).click();
  await expect(page.locator(".combat-log-entry.is-allyAttack").first()).toBeVisible();
  await expect(page.locator(".combat-log-battle-heading.is-boss").first()).toContainText("村鐘の番人");
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const nav = document.querySelector<HTMLElement>(".nav-bar");
    const shell = document.querySelector<HTMLElement>(".app-shell");
    return {
      noHorizontalScroll: root.scrollWidth <= root.clientWidth,
      navVisible: Boolean(nav && nav.getBoundingClientRect().height > 0),
      contentClearance:
        nav && shell
          ? Number.parseFloat(getComputedStyle(shell).paddingBottom) >= nav.getBoundingClientRect().height
          : false,
    };
  });

  expect(layout).toEqual({ noHorizontalScroll: true, navVisible: true, contentClearance: true });
  const bossHeadingFits = await page.locator(".combat-log-battle-heading.is-boss").first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= document.documentElement.clientWidth;
  });
  expect(bossHeadingFits).toBe(true);
  expect(browserErrors).toEqual([]);
});
