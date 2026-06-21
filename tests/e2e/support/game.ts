import { expect, type Page } from "@playwright/test";
import type { GameState } from "../../../src/types/game";
import { STORAGE_KEY } from "../fixtures/game-state";

export const openFreshGame = async (page: Page) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "魔王再建記" })).toBeVisible();
};

export const openGameWithState = async (page: Page, state: GameState) => {
  await page.goto("/");
  await page.evaluate(
    ({ key, value }) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: state },
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "魔王再建記" })).toBeVisible();
};

export const readSavedGame = (page: Page) =>
  page.evaluate((key) => {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as GameState) : null;
  }, STORAGE_KEY);

export const collectBrowserErrors = (page: Page) => {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  return errors;
};

export const openMobileMenuItem = async (page: Page, name: "司令部" | "図鑑" | "設定") => {
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.locator("#mobile-nav-menu").getByRole("button", { name }).click();
};
