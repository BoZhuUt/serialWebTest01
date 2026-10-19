const fs = require("fs");
const vm = require("vm");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "webSerial_v02_boZhu.html"), "utf8");
const start = html.indexOf("<script>");
const end = html.lastIndexOf("</script>");
const js = html.slice(start + 8, end);

// DOM/browser stubs so the script can load without a real browser
const listeners = {};
const elCache = new Map();
function el(id) {
  if (elCache.has(id)) return elCache.get(id);
  const e = {
    id,
    value: id === "inpSlave" || id === "selBaud" ? "20" : "0",
    textContent: "",
    innerHTML: "",
    className: "",
    disabled: false,
    checked: false,
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {},
    children: [],
    scrollTop: 0,
    scrollHeight: 0,
    clientWidth: 800,
    clientHeight: 400,
    width: 0,
    height: 0,
    onclick: null,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getContext() {
      return {
        setTransform() {}, clearRect() {}, fillRect() {}, strokeRect() {},
        beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
        fillText() {}, measureText() { return { width: 20 }; },
        set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
        set font(v) {}, set textAlign(v) {}, set textBaseline(v) {},
      };
    },
  };
  if (id === "selBaud") e.value = "9600";
  if (id === "selData") e.value = "8";
  if (id === "selParity") e.value = "even";
  if (id === "selStop") e.value = "1";
  if (id === "inpSlave") e.value = "20";
  if (id === "inpInterval") e.value = "500";
  if (id === "inpTimeout") e.value = "300";
  if (id === "inpRetries") e.value = "1";
  if (id === "inpHistHours") e.value = "2";
  if (id === "selLayout") e.value = "4";
  if (id === "chkAddrFromOne") e.checked = false;
  elCache.set(id, e);
  return e;
}

const store = new Map();
const sandbox = {
  console,
  performance: { now: () => Date.now() },
  Date,
  Math,
  JSON,
  Number,
  String,
  Array,
  Object,
  Map,
  Set,
  Uint8Array,
  ArrayBuffer,
  DataView,
  Promise,
  Error,
  Infinity,
  NaN,
  isNaN,
  parseFloat,
  parseInt,
  encodeURIComponent,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  requestAnimationFrame: (fn) => { fn(); return 1; },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  navigator: {},
  document: {
    getElementById: (id) => el(id),
    createElement: () => el("tmp"),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    body: {
      appendChild() {},
      removeChild() {},
      children: [],
    },
  },
  window: {
    devicePixelRatio: 1,
    addEventListener() {},
  },
  confirm: () => true,
  alert: () => {},
  Blob: class { constructor(p) { this.p = p; } },
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  ResizeObserver: class { observe() {} disconnect() {} },
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(js, sandbox, { filename: "index-inline.js" });

// Access functions from the script via a late-eval trick: they were declared at top level
// in the script, so they should be on the context if they were function declarations.
const names = [
  "crc16", "appendCrc", "checkCrc", "buildRead", "buildWriteSingle", "buildWriteMulti",
  "decodeValue", "encodeValue", "wordCount", "buildMergeJobs", "parseReadResponse",
  "parseWriteResponse", "u32ToWords", "wordsToU32", "floatToU32", "u32ToFloat",
];
for (const n of names) {
  if (typeof sandbox[n] !== "function") {
    console.error("MISSING_FN", n);
    process.exit(1);
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
  console.log("OK", msg);
}

// CRC
const framed = sandbox.appendCrc(Uint8Array.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a]));
assert(sandbox.checkCrc(framed), "checkCrc roundtrip");
assert(!sandbox.checkCrc(Uint8Array.from([1, 2, 3, 4, 5, 6])), "checkCrc rejects bad");

// 5.0 float
const words = sandbox.encodeValue(5.0, "f32-le-words");
assert(words[0] === 0x0000 && words[1] === 0x40a0, "encode 5.0 le-words [0000,40A0] got " + words.map((x) => x.toString(16)));
const back = sandbox.decodeValue(words, "f32-le-words");
assert(Math.abs(back - 5.0) < 1e-6, "decode 5.0 got " + back);

// be-words
const be = sandbox.encodeValue(5.0, "f32-be-words");
assert(be[0] === 0x40a0 && be[1] === 0x0000, "encode 5.0 be-words");
assert(Math.abs(sandbox.decodeValue(be, "f32-be-words") - 5.0) < 1e-6, "decode 5.0 be-words");

// u16 / i16 / u32
assert(sandbox.encodeValue(300, "u16")[0] === 300, "u16 300");
assert(sandbox.decodeValue([0xffff], "i16") === -1, "i16 -1");
assert(sandbox.decodeValue([0x0000, 0x40a0], "f32") === 5, "f32 alias");
const u32w = sandbox.encodeValue(0x12345678, "u32");
assert(u32w[0] === 0x5678 && u32w[1] === 0x1234, "u32 le-words " + u32w.map((x) => x.toString(16)));
assert(sandbox.decodeValue(u32w, "u32") === 0x12345678, "u32 decode");

// buildRead slope
const read = sandbox.buildRead(20, 3, 48000, 2);
const hex = Buffer.from(read).toString("hex");
assert(hex.startsWith("1403bb800002"), "read slope frame " + hex);

// buildWriteSingle
const w1 = sandbox.buildWriteSingle(20, 43005, 5);
assert(w1[0] === 20 && w1[1] === 6, "write single fc6");
assert(w1[2] === 0xa7 && w1[3] === 0xfd, "write single addr 43005 got " + Buffer.from(w1.subarray(2, 4)).toString("hex"));
assert(w1[4] === 0 && w1[5] === 5, "write single value 5");

// buildWriteMulti for 5.0 float at 48000
const w2 = sandbox.buildWriteMulti(20, 48000, sandbox.encodeValue(5.0, "f32-le-words"));
assert(w2[1] === 0x10, "write multi fc16");
assert(w2[2] === 0xbb && w2[3] === 0x80, "write multi addr");
assert(w2[4] === 0 && w2[5] === 2 && w2[6] === 4, "write multi qty/bytes");
assert(w2[7] === 0 && w2[8] === 0 && w2[9] === 0x40 && w2[10] === 0xa0, "write multi data 00 00 40 A0 got " + Buffer.from(w2.subarray(7, 11)).toString("hex"));
assert(sandbox.checkCrc(w2), "write multi crc");

// merge jobs
const regs = [
  { name: "a", slave: 20, fc: 3, addr: 46000, type: "f32-le-words", enabled: true },
  { name: "b", slave: 20, fc: 3, addr: 46002, type: "f32-le-words", enabled: true },
  { name: "c", slave: 20, fc: 3, addr: 48000, type: "f32-le-words", enabled: true },
  { name: "d", slave: 20, fc: 3, addr: 41000, type: "u16", enabled: true },
  { name: "e", slave: 20, fc: 3, addr: 41001, type: "u16", enabled: false },
];
const jobs = sandbox.buildMergeJobs(regs);
// enabled: 41000 u16, 46000-46003 f32s, 48000-48001
// 41000 separate, 46000-46003 one job, 48000 one job
assert(jobs.length === 3, "merge jobs count " + jobs.length + " " + JSON.stringify(jobs.map((j) => ({ addr: j.addr, qty: j.qty }))));
assert(jobs.some((j) => j.addr === 41000 && j.qty === 1), "job status");
assert(jobs.some((j) => j.addr === 46000 && j.qty === 4), "job measure merged qty=4");
assert(jobs.some((j) => j.addr === 48000 && j.qty === 2), "job slope");

// parseReadResponse
const respBody = Uint8Array.from([
  20, 3, 4,
  0x00, 0x00, // low word of 5.0
  0x40, 0xa0, // high word
]);
const resp = sandbox.appendCrc(respBody);
const parsed = sandbox.parseReadResponse(resp, 20, 3, 2);
assert(!parsed.error, "parseRead ok " + parsed.error);
assert(parsed.regs[0] === 0 && parsed.regs[1] === 0x40a0, "parse regs");
const v = sandbox.decodeValue(parsed.regs, "f32-le-words");
assert(Math.abs(v - 5.0) < 1e-6, "parse+decode 5.0 got " + v);

// exception
const exBody = Uint8Array.from([20, 0x83, 0x02]);
const ex = sandbox.appendCrc(exBody);
const pex = sandbox.parseReadResponse(ex, 20, 3, 2);
assert(!!(pex.error && pex.error.length > 0), "exception parse " + pex.error);

// write response
const wrBody = Uint8Array.from([20, 6, 0xbb, 0x80, 0x40, 0xa0]);
const wr = sandbox.appendCrc(wrBody);
const pwr = sandbox.parseWriteResponse(wr, 20, 6);
assert(pwr.ok && pwr.addr === 48000, "write resp parse");

// expectedFrameLen is internal; verify exception responses parse at 5 bytes
const ex5 = sandbox.appendCrc(Uint8Array.from([20, 0x83, 0x02]));
assert(ex5.length === 5, "exception frame is 5 bytes");
const pex5 = sandbox.parseReadResponse(ex5, 20, 3, 12);
assert(!!(pex5.error && pex5.error.length > 0), "exception parses without needing full read length: " + pex5.error);

// saveConfig must not replace register objects (would drop _id and freeze addr at 0)
const st = sandbox.__mbState;
assert(st && Array.isArray(st.cfg.registers), "debug state hook available");
st.cfg.registers.push({
  name: "reg1", slave: 20, fc: 3, addr: 48008, type: "u16",
  scale: 1, offset: 0, unit: "", enabled: true, _id: "test-id-1",
});
st.cfg.registers.push({
  name: "reg2", slave: 20, fc: 3, addr: 48009, type: "u16",
  scale: 1, offset: 0, unit: "", enabled: true, _id: "test-id-2",
});
const ref = st.cfg.registers[0];
sandbox.saveConfig();
assert(st.cfg.registers[0] === ref, "saveConfig keeps register object identity");
assert(st.cfg.registers[0]._id === "test-id-1", "saveConfig keeps _id");
assert(st.cfg.registers[0].addr === 48008, "saveConfig keeps addr 48008");
const jobs2 = sandbox.buildMergeJobs(st.cfg.registers);
assert(jobs2.some((j) => j.addr === 48008), "poll job uses edited addr, jobs=" + JSON.stringify(jobs2.map((j) => ({ a: j.addr, q: j.qty }))));
assert(!jobs2.some((j) => j.addr === 0), "no poll job for addr 0");
// 48008+48009 contiguous u16 should merge to one job qty 2
assert(jobs2.length === 1 && jobs2[0].addr === 48008 && jobs2[0].qty === 2, "contiguous u16 merge qty=2");

// addrFromOne: table 48001 鈫?wire PDU 48000
const chk = sandbox.document.getElementById("chkAddrFromOne");
assert(sandbox.toPduAddr(48000) === 48000, "fromZero keeps PDU");
chk.checked = true;
assert(sandbox.toPduAddr(48001) === 48000, "fromOne 48001鈫?8000 got " + sandbox.toPduAddr(48001));
assert(sandbox.toPduAddr(1) === 0, "fromOne 1鈫?");
assert(sandbox.toTableAddr(48000) === 48001, "toTableAddr fromOne");
chk.checked = false;

assert(typeof sandbox.exportDataCsv === "function", "exportDataCsv defined");
assert(typeof sandbox.updateAddrHeader === "function", "updateAddrHeader defined");
assert(typeof sandbox.withTimeout === "function", "withTimeout defined");

(async () => {
  // use real timers so withTimeout can fire
  sandbox.clearTimeout = clearTimeout;

  // wide CSV export: one row per timestamp, one column per register
  {
    const stW = sandbox.__mbState;
    stW.history.clear();
    stW.cfg.registers = [
      { name: "ct365", slave: 20, fc: 3, addr: 48016, type: "u16", enabled: true, _id: "a" },
      { name: "cr365", slave: 20, fc: 3, addr: 48017, type: "u16", enabled: true, _id: "b" },
    ];
    const t0 = 1700000000000;
    stW.history.set("ct365", [
      { t: t0, v: 4000, q: "good" },
      { t: t0 + 500, v: 4001, q: "good" },
    ]);
    stW.history.set("cr365", [
      { t: t0, v: 200, q: "good" },
      { t: t0 + 500, v: 201, q: "good" },
    ]);
    let captured = null;
    sandbox.downloadText = (filename, text) => {
      captured = { filename, text };
    };
    sandbox.exportDataCsv();
    assert(captured && captured.text.includes("SILOG"), "export starts with SILOG");
    assert(captured.text.includes("Poll definition:"), "export has poll definition");
    assert(captured.text.includes("time,ct365,cr365"), "export header is wide: " + captured.text.split("\r\n")[2]);
    const dataLines = captured.text.split("\r\n").filter((l) => /^\d{4}-/.test(l));
    assert(dataLines.length === 2, "two time rows, got " + dataLines.length);
    assert(dataLines[0].includes("4000") && dataLines[0].includes("200"), "row has both values");
    assert(dataLines[1].includes("4001") && dataLines[1].includes("201"), "second row values");
    assert(!captured.text.includes("quality"), "wide format has no quality column");
    console.log("WIDE_CSV_OK");
  }

  // disconnect must not hang even if reader.cancel / port.close never resolve
  const st = sandbox.__mbState;
  st.connected = true;
  st.disconnecting = false;
  st.waiting = null;
  st.writer = { releaseLock() {} };
  st.reader = {
    cancel: () => new Promise(() => {}), // 姘镐笉 resolve
    releaseLock() {},
  };
  st.readLoopPromise = new Promise(() => {}); // 姘镐笉 resolve
  st.port = {
    close: () => new Promise(() => {}), // 姘镐笉 resolve
  };
  const t0 = Date.now();
  await sandbox.disconnectSerial();
  const elapsed = Date.now() - t0;
  assert(elapsed < 2500, "disconnectSerial returns despite hung cancel/close, elapsed=" + elapsed + "ms");
  assert(st.connected === false, "disconnect sets connected=false");
  assert(st.disconnecting === false, "disconnect clears disconnecting");
  assert(st.port === null && st.reader === null && st.writer === null, "disconnect clears port handles");

  console.log("ALL_INTEGRATION_TESTS_PASSED");
  process.exit(0);
})().catch((e) => {
  console.error("FAIL async", e);
  process.exit(1);
});
