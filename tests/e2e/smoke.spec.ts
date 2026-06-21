import { expect, test } from "@playwright/test";
import { createCompletedGameState, createGameState } from "./fixtures/game-state";
import {
  collectBrowserErrors,
  openFreshGame,
  openGameWithState,
  openMobileMenuItem,
  readSavedGame,
} from "./support/game";

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

test("時計制御で遠征を完了し報酬と作戦記録を作成する", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.clock.install({ time: new Date("2026-05-13T12:00:00Z") });
  await openFreshGame(page);

  await page.getByRole("button", { name: "遠征", exact: true }).click();
  await page.getByRole("button", { name: "準備完了：遠征開始" }).click();
  await expect(page.getByRole("heading", { name: "進行中" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "記録", exact: true }).click();
  await expect(page.getByRole("heading", { name: "進行中" })).toBeVisible();

  await page.clock.fastForward(31_000);
  await expect(page.getByText("遠征完了", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今回増えたもの" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "敵遭遇と交戦記録" }).first()).toBeVisible();

  const saved = await readSavedGame(page);
  expect(saved?.activeExpedition).toBeUndefined();
  expect(saved?.records).toHaveLength(1);
  expect(saved?.gold).toBeGreaterThan(120);
  expect(browserErrors).toEqual([]);
});

test("固定記録で戦闘区切りとダメージ統合を再読み込み後も表示する", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await openGameWithState(page, createCompletedGameState());
  await page.getByRole("button", { name: "記録", exact: true }).click();

  const assertBattleLog = async () => {
    await expect(page.getByText("戦闘 1", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("煤けた骸骨兵", { exact: true }).first()).toBeVisible();
    await expect(page.locator(".combat-log-entry.is-allyAttack").first()).toContainText("HP 30 → 18");
    await expect(page.locator(".combat-log-entry.is-enemyAttack").first()).toContainText("HP 46 → 39");
    await expect(page.getByText("煤けた骸骨兵のHP: 30 → 18", { exact: true })).toHaveCount(0);
    await expect(page.locator(".combat-log-entry.is-defeatEnemy").first()).toContainText("撃破した");
    await expect(page.locator(".combat-log-entry.is-victory").first()).toContainText("勝利した");
    await expect(page.locator(".combat-log-entry.is-reward").first()).toContainText("52G");
  };

  await assertBattleLog();
  await page.reload();
  await page.getByRole("button", { name: "記録", exact: true }).click();
  await assertBattleLog();
  expect(browserErrors).toEqual([]);
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
  expect(browserErrors).toEqual([]);
});
