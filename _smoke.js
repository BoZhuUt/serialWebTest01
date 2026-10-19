const path = require("path");
const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (err) => console.error("PAGEERROR", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("CONSOLE", msg.text());
  });
  await page.goto("http://127.0.0.1:8765/webSerial_v02_boZhu.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  // basic UI presence
  const checks = {
    title: await page.title(),
    connect: await page.locator("#btnConnect").innerText(),
    poll: await page.locator("#btnPollToggle").innerText(),
    views: await page.locator(".view").count(),
    presetBtn: await page.locator("#btnLoadPreset").count(),
    addrFromOne: await page.locator("#chkAddrFromOne").count(),
    exportData: await page.locator("#btnExportData").count(),
  };
  console.log("UI_CHECKS", JSON.stringify(checks));
  if (!checks.addrFromOne || !checks.exportData) {
    console.error("MISSING_NEW_CONTROLS");
    process.exit(1);
  }

  // addr-from-one toggle converts table addresses but keeps wire PDU
  await page.locator("#btnLoadPreset").click();
  await page.waitForTimeout(200);
  const pduBefore = await page.evaluate(() =>
    window.__mbState.cfg.registers.filter((r) => r.name === "slope").map((r) => r.addr)
  );
  await page.locator("#chkAddrFromOne").check();
  await page.waitForTimeout(150);
  const afterOne = await page.evaluate(() => ({
    table: window.__mbState.cfg.registers.filter((r) => r.name === "slope").map((r) => r.addr),
    pdu: window.__mbState.cfg.registers.filter((r) => r.name === "slope").map((r) => {
      // mirror toPduAddr
      return r.addr - 1;
    }),
  }));
  console.log("ADDR_TOGGLE", JSON.stringify({ pduBefore, afterOne }));
  if (!(afterOne.table[0] === (pduBefore[0] ?? 0) + 1 && afterOne.pdu[0] === pduBefore[0])) {
    console.error("ADDR_TOGGLE_FAIL");
    process.exit(1);
  }
  await page.locator("#chkAddrFromOne").uncheck();
  await page.waitForTimeout(100);
  const restored = await page.evaluate(() =>
    window.__mbState.cfg.registers.filter((r) => r.name === "slope").map((r) => r.addr)
  );
  if (restored[0] !== pduBefore[0]) {
    console.error("ADDR_TOGGLE_RESTORE_FAIL", restored, pduBefore);
    process.exit(1);
  }
  console.log("ADDR_TOGGLE_OK");

  // click ST-605 preset
  await page.locator("#btnLoadPreset").click();
  await page.waitForTimeout(300);
  const rows = await page.locator("#regBody tr").count();
  console.log("PRESET_ROWS", rows);
  if (rows < 20) {
    console.error("PRESET_ROWS_TOO_FEW");
    process.exit(1);
  }

  // clear table then add+edit 鈥?poll must see the edited addr (regression: saveConfig used to drop _id)
  page.on("dialog", (d) => d.accept());
  await page.locator("#btnClearRows").click();
  await page.waitForTimeout(100);
  await page.locator("#btnAddRow").click();
  await page.locator("#btnAddRow").click();
  await page.waitForTimeout(100);
  const addrInputs = page.locator('#regBody tr input[data-f="addr"]');
  await addrInputs.nth(0).fill("48008");
  await addrInputs.nth(1).fill("48009");
  await page.locator('#regBody tr select[data-f="type"]').nth(0).selectOption("u16");
  await page.locator('#regBody tr select[data-f="type"]').nth(1).selectOption("u16");
  await page.waitForTimeout(150);
  const live = await page.evaluate(() => {
    const regs = window.__mbState.cfg.registers;
    return regs.map((r) => ({ name: r.name, addr: r.addr, type: r.type, enabled: r.enabled }));
  });
  console.log("LIVE_REGS", JSON.stringify(live));
  const edited = live.some((r) => r.addr === 48008) && live.some((r) => r.addr === 48009);
  if (!edited) {
    console.error("EDIT_ADDR_FAIL 鈥?state still stale", live);
    process.exit(1);
  }
  const jobs = await page.evaluate(() => {
    // re-derive via same source poll uses
    const regs = window.__mbState.cfg.registers.filter((r) => r.enabled);
    return regs.map((r) => r.addr);
  });
  if (!jobs.includes(48008)) {
    console.error("POLL_ADDR_FAIL", jobs);
    process.exit(1);
  }
  console.log("EDIT_ADDR_OK", jobs);

  // layout switch
  await page.locator("#selLayout").selectOption("2");
  await page.waitForTimeout(200);
  const views2 = await page.locator(".view").count();
  console.log("LAYOUT_2_VIEWS", views2);

  await page.locator("#selLayout").selectOption("4");
  await page.waitForTimeout(200);

  await page.screenshot({ path: path.join(__dirname, "_smoke.png"), fullPage: true });
  console.log("SCREENSHOT_OK");
  await browser.close();
  console.log("UI_SMOKE_PASSED");
})().catch((e) => {
  console.error("UI_SMOKE_FAIL", e.message);
  process.exit(1);
});
