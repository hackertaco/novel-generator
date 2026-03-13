import { test, expect } from "@playwright/test";

test.describe("Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Clear persisted Zustand store to ensure clean state
    await page.goto("/genre");
    await page.evaluate(() => localStorage.clear());
  });

  test("genre page renders with 200", async ({ page }) => {
    const response = await page.goto("/genre");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("장르 선택");
  });

  test("plot page renders with 200", async ({ page }) => {
    const response = await page.goto("/plot");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("플롯 선택");
  });

  test("preview page renders with 200", async ({ page }) => {
    const response = await page.goto("/preview");
    expect(response?.status()).toBe(200);
    // Without seed, shows fallback
    await expect(page.getByText("시드가 없습니다")).toBeVisible();
  });

  test("reader page renders with 200", async ({ page }) => {
    const response = await page.goto("/reader");
    expect(response?.status()).toBe(200);
    // Without seed, shows fallback
    await expect(page.getByText("시드가 없습니다")).toBeVisible();
  });

  test("API /api/plots returns 400 without genre", async ({ request }) => {
    const response = await request.post("/api/plots", {
      data: {},
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test("API /api/plots returns mock plots with genre", async ({ request }) => {
    const response = await request.post("/api/plots", {
      data: { genre: "현대 판타지" },
    });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.plots).toBeDefined();
    expect(Array.isArray(data.plots)).toBe(true);
    expect(data.plots.length).toBe(3);

    // Validate plot structure
    const plot = data.plots[0];
    expect(plot).toHaveProperty("id");
    expect(plot).toHaveProperty("title");
    expect(plot).toHaveProperty("logline");
    expect(plot).toHaveProperty("hook");
    expect(plot).toHaveProperty("arc_summary");
    expect(plot).toHaveProperty("key_twist");
    expect(Array.isArray(plot.arc_summary)).toBe(true);
  });

  test("API /api/seed returns 400 without required data", async ({
    request,
  }) => {
    const response = await request.post("/api/seed", {
      data: {},
    });
    expect(response.status()).toBe(400);
  });

  test("API /api/evaluate returns 400 without required data", async ({
    request,
  }) => {
    const response = await request.post("/api/evaluate", {
      data: {},
    });
    expect(response.status()).toBe(400);
  });
});
