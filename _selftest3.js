const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "webSerial_v02_boZhu.html"), "utf8");

// All getElementById targets used in the script
const idRefs = new Set();
const re = /\$\("([^"]+)"\)/g;
let m;
while ((m = re.exec(html))) idRefs.add(m[1]);
// also document.getElementById
const re2 = /getElementById\("([^"]+)"\)/g;
while ((m = re2.exec(html))) idRefs.add(m[1]);

const htmlIds = new Set();
const reId = /\bid="([^"]+)"/g;
while ((m = reId.exec(html))) htmlIds.add(m[1]);

const missing = [...idRefs].filter((id) => !htmlIds.has(id));
if (missing.length) {
  console.error("MISSING_IDS", missing);
  process.exit(1);
}
console.log("IDS_OK", idRefs.size, "referenced,", htmlIds.size, "in html");

// required deliverable structure
const required = [
  "btnConnect", "btnDisconnect", "btnPollToggle", "btnReadOnce",
  "regBody", "viewGrid", "btnLoadPreset", "btnCsvImport", "btnCsvExport",
  "btnExportJson", "btnImportJson", "fileJson", "fileCsv",
];
for (const id of required) {
  if (!htmlIds.has(id)) {
    console.error("MISSING_REQUIRED", id);
    process.exit(1);
  }
}
console.log("REQUIRED_OK");

// ensure no external network deps
if (/<script[^>]+src=/i.test(html) || /<link[^>]+href=/i.test(html)) {
  console.error("EXTERNAL_DEP_FOUND");
  process.exit(1);
}
console.log("NO_EXTERNAL_DEPS");

// CSV exists and parses
const csv = fs.readFileSync(path.join(__dirname, "st605-registers.csv"), "utf8");
const lines = csv.trim().split(/\r?\n/);
if (lines[0] !== "name,slave,fc,addr,type,scale,offset,unit,enabled") {
  console.error("CSV_HEADER", lines[0]);
  process.exit(1);
}
if (lines.length < 20) {
  console.error("CSV_TOO_SHORT", lines.length);
  process.exit(1);
}
console.log("CSV_OK", lines.length - 1, "registers");

console.log("STRUCTURE_ALL_PASSED");
