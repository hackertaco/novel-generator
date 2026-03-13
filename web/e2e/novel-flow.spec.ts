import { test, expect } from "@playwright/test";

test.describe("Novel Generator Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Clear persisted Zustand store
    await page.goto("/genre");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("homepage redirects to genre page", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/genre/, { timeout: 5000 });
    await expect(page).toHaveURL(/\/genre/);
  });

  test("genre page shows 4 genre cards", async ({ page }) => {
    await page.goto("/genre");
    await expect(page.locator("h1")).toContainText("장르 선택");

    // Each genre is an h3 inside a button
    await expect(page.locator("h3", { hasText: "현대 판타지" })).toBeVisible();
    await expect(page.locator("h3", { hasText: "정통 판타지" })).toBeVisible();
    await expect(page.locator("h3", { hasText: "무협" })).toBeVisible();
    await expect(page.locator("h3", { hasText: "로맨스" })).toBeVisible();
  });

  test("next button is disabled until genre is selected", async ({ page }) => {
    await page.goto("/genre");

    const nextButton = page.locator("button", { hasText: "다음: 플롯 생성" });
    await expect(nextButton).toBeDisabled();

    // Click a genre card (the button containing the h3)
    await page.locator("h3", { hasText: "무협" }).click();
    await expect(nextButton).toBeEnabled();
  });

  test("selecting genre and navigating to plot page", async ({ page }) => {
    await page.goto("/genre");

    // Select genre
    await page.locator("h3", { hasText: "현대 판타지" }).click();

    // Click next
    await page.locator("button", { hasText: "다음: 플롯 생성" }).click();
    await page.waitForURL(/\/plot/, { timeout: 5000 });
    await expect(page).toHaveURL(/\/plot/);
  });

  test("plot page loads and shows mock plots", async ({ page }) => {
    await page.goto("/genre");
    await page.locator("h3", { hasText: "현대 판타지" }).click();
    await page.locator("button", { hasText: "다음: 플롯 생성" }).click();
    await page.waitForURL(/\/plot/);

    await expect(page.locator("h1")).toContainText("플롯 선택");

    // Wait for mock plots to load (should be fast since API falls back to mock)
    await expect(page.locator("h3", { hasText: "정점으로" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("h3", { hasText: "숨겨진 힘" })).toBeVisible();
    await expect(page.locator("h3", { hasText: "혼자서" })).toBeVisible();
  });

  test("can select a plot on plot page", async ({ page }) => {
    await page.goto("/genre");
    await page.locator("h3", { hasText: "현대 판타지" }).click();
    await page.locator("button", { hasText: "다음: 플롯 생성" }).click();
    await page.waitForURL(/\/plot/);

    // Wait for plots
    await expect(page.locator("h3", { hasText: "정점으로" })).toBeVisible({
      timeout: 10000,
    });

    // Next button should be disabled before selection
    const nextBtn = page.locator("button", { hasText: "다음: 미리보기" });
    await expect(nextBtn).toBeDisabled();

    // Click a plot card
    await page.locator("h3", { hasText: "정점으로" }).click();

    // Next button should now be enabled
    await expect(nextBtn).toBeEnabled();
  });

  test("regenerate button works on plot page", async ({ page }) => {
    await page.goto("/genre");
    await page.locator("h3", { hasText: "현대 판타지" }).click();
    await page.locator("button", { hasText: "다음: 플롯 생성" }).click();
    await page.waitForURL(/\/plot/);

    // Wait for initial plots
    await expect(page.locator("h3", { hasText: "정점으로" })).toBeVisible({
      timeout: 10000,
    });

    // Click regenerate
    await page.locator("button", { hasText: "다시 생성" }).click();

    // Plots should still be visible after regeneration (mock returns same data)
    await expect(page.locator("h3", { hasText: "정점으로" })).toBeVisible({
      timeout: 10000,
    });
  });

  test("back button on plot page returns to genre", async ({ page }) => {
    await page.goto("/genre");
    await page.locator("h3", { hasText: "현대 판타지" }).click();
    await page.locator("button", { hasText: "다음: 플롯 생성" }).click();
    await page.waitForURL(/\/plot/);

    await page.locator("button", { hasText: "이전" }).click();
    await page.waitForURL(/\/genre/);
    await expect(page).toHaveURL(/\/genre/);
  });

  test("reader page shows no-seed fallback", async ({ page }) => {
    await page.goto("/reader");
    await expect(page.getByText("시드가 없습니다")).toBeVisible();
    await expect(
      page.locator("button", { hasText: "처음부터 시작" }),
    ).toBeVisible();
  });

  test("reader fallback button navigates to genre", async ({ page }) => {
    await page.goto("/reader");
    await page.locator("button", { hasText: "처음부터 시작" }).click();
    await page.waitForURL(/\/genre/);
    await expect(page).toHaveURL(/\/genre/);
  });

  test("preview page shows no-seed fallback", async ({ page }) => {
    await page.goto("/preview");
    await expect(page.getByText("시드가 없습니다")).toBeVisible();
  });

  test("header is visible on all pages", async ({ page }) => {
    await page.goto("/genre");
    await expect(
      page.locator("header").locator("a", { hasText: "웹소설 생성기" }),
    ).toBeVisible();

    await page.goto("/plot");
    await expect(
      page.locator("header").locator("a", { hasText: "웹소설 생성기" }),
    ).toBeVisible();

    await page.goto("/reader");
    await expect(
      page.locator("header").locator("a", { hasText: "웹소설 생성기" }),
    ).toBeVisible();
  });
});
