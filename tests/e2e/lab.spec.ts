import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

const sample = resolve("samples/resources-csv/sample-resources.csv");
const PANE = "http://127.0.0.1:18080";
const HOST = "http://127.0.0.1:18081";
const VENDOR_NAMES = /Hostinger|Cloudflare|Turnstile|Coder|VPS/;

/** Stubs the human-verification widget script: `callback` hands the token the siteverify mock accepts, or none at all. */
async function stubWidget(page: Page, token: string | null) {
  const body = token === null
    ? `window.turnstile = { render(el, opts) { el.textContent = "verification (stub, no token)"; return "w"; }, reset() {}, remove() {} };`
    : `window.turnstile = { render(el, opts) { el.textContent = "verification (stub)"; opts.callback(${JSON.stringify(token)}); return "w"; }, reset() {}, remove() {} };`;
  await page.route("https://challenges.cloudflare.com/**", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body }));
}

type Scope = Page | ReturnType<Page["frameLocator"]>;
async function uploadAndRun(scope: Scope) {
  await expect(scope.getByText("never connects to an Azure tenant")).toBeVisible();
  await scope.locator('input[type="file"]').setInputFiles(sample);
  await expect(scope.getByText(/29 data rows/)).toBeVisible();
  await scope.getByLabel("Destination region").selectOption("westus3");
  await scope.getByRole("button", { name: "Run assessment" }).click();
  await expect(scope.getByRole("heading", { name: "4. Summary" })).toBeVisible({ timeout: 30_000 });
}

test("journey through the pane: upload → questionnaire → results → detail → bundle → delete", async ({ page }) => {
  await stubWidget(page, "e2e-token");
  await page.goto(PANE + "/");
  await uploadAndRun(page);
  await expect(page.getByText("Need validation")).toBeVisible();
  await page.getByRole("row", { name: /hcwsamplestbillingprod/ }).click();
  await expect(page.getByRole("dialog")).toContainText("azure-storage-mover");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("tab", { name: "terraform/state-impact/README.md" }).click();
  await expect(page.locator("pre")).toContainText("removed.tf");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download output bundle/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^assessment-[0-9a-f]{8}\.zip$/);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete my data now" }).click();
  await expect(page.getByRole("heading", { name: "4. Summary" })).toBeHidden();
});

test("framed by the host page, the pane reports exactly loading → ready → working → ready, once per transition", async ({ page }) => {
  await stubWidget(page, "e2e-token");
  await page.goto(HOST + "/");
  const pane = page.frameLocator("#pane");
  await uploadAndRun(pane);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __hcwAddonMessages: Array<{ state: string }> }).__hcwAddonMessages.map((m) => m.state))).toEqual(["loading", "ready", "working", "ready"]);
  // Re-renders after the run (opening a detail dialog) emit nothing.
  await pane.getByRole("row", { name: /hcwsamplestbillingprod/ }).click();
  await expect(pane.getByRole("dialog")).toBeVisible();
  await pane.getByRole("button", { name: "Close" }).click();
  expect(await page.evaluate(() => (window as unknown as { __hcwAddonMessages: unknown[] }).__hcwAddonMessages.length)).toBe(4);
  // The sandbox has no allow-modals, so the explorer's confirm() is ignored by the browser; the pane's interim shim lets the delete proceed.
  await pane.getByRole("button", { name: "Delete my data now" }).click();
  await expect(pane.getByRole("heading", { name: "4. Summary" })).toBeHidden();
});

test("response headers carry the configured frame-ancestors, the AddOn identity and no x-frame-options", async ({ request }) => {
  for (const path of ["/", "/api/health", "/api/nope"]) {
    const r = await request.get(PANE + path);
    const csp = r.headers()["content-security-policy"] ?? "";
    expect(csp, path).toContain("frame-ancestors 'self' http://127.0.0.1:18081");
    expect(csp, path).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(csp, path).toContain("frame-src https://challenges.cloudflare.com");
    expect(r.headers()["x-frame-options"], path).toBeUndefined();
    expect(r.headers()["x-addon-id"], path).toBe("migration");
    expect(r.headers()["x-addon-version"], path).toMatch(/^\d+\.\d+\.\d+/);
  }
  const index = await request.get(PANE + "/");
  expect(index.headers()["cache-control"]).toBe("no-cache");
  const health = await (await request.get(PANE + "/api/health")).json();
  expect(health).toMatchObject({ ok: true, id: "migration", edition: "demo", siteOrigins: [HOST], turnstile: { required: true, siteKey: "1x00000000000000000000AA" } });
});

test("without a verification token the upload is refused (403) and the explorer shows its error", async ({ page }) => {
  await stubWidget(page, null);
  await page.goto(PANE + "/");
  await expect(page.getByText("never connects to an Azure tenant")).toBeVisible();
  const refused = page.waitForResponse((r) => r.url().endsWith("/api/assessments") && r.request().method() === "POST");
  await page.locator('input[type="file"]').setInputFiles(sample);
  await expect(page.getByText(/29 data rows/)).toBeVisible();
  await page.getByRole("button", { name: "Run assessment" }).click();
  expect((await refused).status()).toBe(403);
  await expect(page.getByRole("alert")).toContainText("human verification failed");
});

test("the pane never asks for credentials and shows no partner or vendor names", async ({ page }) => {
  await stubWidget(page, "e2e-token");
  await page.goto(PANE + "/");
  await expect(page.getByText("never connects to an Azure tenant")).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByText("Powered by")).toBeHidden();
  await expect(page.locator("body")).not.toContainText(VENDOR_NAMES, { useInnerText: true });
  await uploadAndRun(page);
  await expect(page.getByText("Powered by")).toBeHidden();
  await expect(page.locator("body")).not.toContainText(VENDOR_NAMES, { useInnerText: true });
});
