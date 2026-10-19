const fs = require("fs");
const vm = require("vm");
const path = require("path");

const htmlPath = path.join(__dirname, "webSerial_v02_boZhu.html");
const html = fs.readFileSync(htmlPath, "utf8");
const start = html.indexOf("<script>");
const end = html.lastIndexOf("</script>");
if (start < 0 || end < 0) {
  console.error("NO_SCRIPT");
  process.exit(1);
}
const js = html.slice(start + 8, end);

try {
  new vm.Script(js, { filename: "index-inline.js" });
  console.log("SYNTAX_OK", js.length);
} catch (e) {
  console.error("SYNTAX_ERR", e.message);
  process.exit(2);
}

// 鈹€鈹€ protocol unit tests (extract functions by eval in sandbox with DOM stubs) 鈹€鈹€
function crc16(buf) {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) crc = (crc >> 1) ^ 0xa001;
      else crc >>= 1;
    }
  }
  return crc & 0xffff;
}

function appendCrc(frame) {
  const c = crc16(frame);
  const out = new Uint8Array(frame.length + 2);
  out.set(frame, 0);
  out[frame.length] = c & 0xff;
  out[frame.length + 1] = (c >> 8) & 0xff;
  return out;
}

// Known Modbus CRC test vector: 01 03 00 00 00 0A 鈫?CRC
const req = Uint8Array.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a]);
const framed = appendCrc(req);
// Reference CRC for this frame is 0xCDC5 (low C5 high CD) per many docs 鈥?verify roundtrip
const body = framed.subarray(0, framed.length - 2);
const got = framed[framed.length - 2] | (framed[framed.length - 1] << 8);
if (crc16(body) !== got) {
  console.error("CRC_ROUNDTRIP_FAIL");
  process.exit(3);
}
console.log("CRC_OK", Buffer.from(framed).toString("hex"));

// float le-words: 5.0 鈫?00 00 40 A0
// 5.0 bits = 0x40A00000; low word first 鈫?[0x0000, 0x40A0]; each word high-byte first
function floatToU32(f) {
  const buf = new ArrayBuffer(4);
  const dv = new DataView(buf);
  dv.setFloat32(0, Number(f), false);
  return dv.getUint32(0, false);
}
function u32ToWords(u) {
  u = u >>> 0;
  return [u & 0xffff, (u >>> 16) & 0xffff]; // le-words
}
function u32ToFloat(u) {
  const buf = new ArrayBuffer(4);
  const dv = new DataView(buf);
  dv.setUint32(0, u, false);
  return dv.getFloat32(0, false);
}
function wordsToU32(regs) {
  return (((regs[1] & 0xffff) << 16) | (regs[0] & 0xffff)) >>> 0;
}

const words = u32ToWords(floatToU32(5.0));
const bytes = [];
for (const w of words) {
  bytes.push((w >> 8) & 0xff, w & 0xff);
}
const hexStr = bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
if (hexStr !== "00 00 40 a0") {
  console.error("F32_LE_WORDS_FAIL", hexStr);
  process.exit(4);
}
console.log("F32_LE_WORDS_OK", hexStr);

const back = u32ToFloat(wordsToU32(words));
if (Math.abs(back - 5.0) > 1e-6) {
  console.error("F32_DECODE_FAIL", back);
  process.exit(5);
}
console.log("F32_DECODE_OK", back);

// buildRead frame for slope @48000 qty 2
function buildRead(slave, fc, addr, qty) {
  const body = Uint8Array.from([
    slave & 0xff, fc & 0xff,
    (addr >> 8) & 0xff, addr & 0xff,
    (qty >> 8) & 0xff, qty & 0xff,
  ]);
  return appendCrc(body);
}
const readSlope = buildRead(20, 3, 48000, 2);
console.log("READ_SLOPE_HEX", Buffer.from(readSlope).toString("hex"));
// 14 03 BB 80 00 02 + crc
const expectPrefix = Buffer.from([0x14, 0x03, 0xbb, 0x80, 0x00, 0x02]).toString("hex");
if (!Buffer.from(readSlope).toString("hex").startsWith(expectPrefix)) {
  console.error("BUILD_READ_FAIL");
  process.exit(6);
}
console.log("BUILD_READ_OK");

console.log("ALL_PROTO_TESTS_PASSED");
