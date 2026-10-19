"""Generate the selected ST-605 numeric preset from the firmware regmap.h.

Addresses and types come only from the header; regmap.csv may be stale.
Use --check to verify generated outputs without modifying them.
"""
import argparse
import csv
import io
import json
from pathlib import Path
import re

# UI metadata only: unit and enabled. Addresses/types are never duplicated here.
FIELD_OPTIONS = {
    'runStatus': ('', True),
    'commStatus': ('', True),
    'calibStatus': ('', True),
    'configStatus': ('', False),
    'measureTarget': ('', False),
    'modbusAddr': ('', False),
    'modbusDatabits': ('bit', False),
    'modbusParity': ('', False),
    'modbusBaud': ('bps', False),
    'rtcSetApply': ('', False),
    'sampleCycle': ('s', True),
    'measureRange': ('', True),
    'measureRange2': ('', True),
    'command': ('', True),
    'calibType': ('', True),
    'solution': ('', True),
    'solution2': ('', True),
    'sensorValue': ('', True),
    'sensorValue_mA': ('mA', True),
    'temperatureValue': ('℃', True),
    'sensorValue2': ('', True),
    'sensorValue_mA2': ('mA', True),
    'copmensated_a': ('', True),
    'copmensated_b': ('', True),
    'copmensated_x': ('', True),
    'refError365': ('', True),
    'refError460': ('', True),
    'absError365': ('', True),
    'absError460': ('', True),
    'concentrationError': ('', True),
    'concentrationHeld': ('', True),
    'calibState': ('', True),
    'calibResult': ('', True),
    'calibCommand': ('', True),
    'temperatureStatus': ('', True),
    'temperatureHeld': ('', True),
    'temperatureRaw': ('', True),
    'temperatureResistance': ('Ω', True),
    'temperatureUpdatedMs': ('ms', False),
    'temperatureAgeMs': ('ms', False),
    'slope': ('', True),
    'intercept': ('', True),
    'colorSlope': ('', True),
    'colorIntercept': ('', True),
    'turbSlope': ('', True),
    'turbIntercept': ('', True),
    'rsvd1': ('', False),
    'rsvd2': ('', False),
    'ct365': ('', True),
    'cr365': ('', True),
    'ct460': ('', True),
    'cr460': ('', True),
    'ct621': ('', True),
    'cs621': ('', True),
    't365Gain': ('', True),
    'r365Gain': ('', True),
    't460Gain': ('', True),
    'r460Gain': ('', True),
    't621Gain': ('', True),
    's621Gain': ('', True),
    't365di': ('', True),
    'r365di': ('', True),
    't460di': ('', True),
    'r460di': ('', True),
    't621di': ('', True),
    'r621di': ('', True),
    't365Dark': ('', True),
    'r365Dark': ('', True),
    't460Dark': ('', True),
    'r460Dark': ('', True),
    't621Dark': ('', True),
    'r621Dark': ('', True),
    't365': ('', True),
    'r365': ('', True),
    't460': ('', True),
    'r460': ('', True),
    't621': ('', True),
    'r621': ('', True),
}
TYPES = {"uint16_t": "u16", "uint32_t": "u32", "float": "f32-le-words"}


def build_rows(header):
    fields = {}
    for ctype, name, address in re.findall(
        r"^\s*(uint16_t|uint32_t|float)\s+(\w+)\s*;\s*//\s*(\d{5})\b",
        header, re.MULTILINE,
    ):
        if name in fields:
            raise ValueError(f"Duplicate field: {name}")
        fields[name] = (int(address) - 1, TYPES[ctype])
    missing = FIELD_OPTIONS.keys() - fields.keys()
    if missing:
        raise ValueError(f"Fields missing from regmap.h: {sorted(missing)}")
    rows = []
    for name, (unit, enabled) in FIELD_OPTIONS.items():
        addr, typ = fields[name]
        rows.append(dict(name=name, slave=20, fc=3, addr=addr, type=typ,
                         scale=1, offset=0, unit=unit, enabled=enabled))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--regmap", type=Path, help="Current firmware regmap.h")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    source = args.regmap
    if source is None:
        firmware = root.parent.parent / "ST-605-NEW"
        candidates = sorted(firmware.glob("**/Middlewares/autoRegmap/regmap.h"))
        if len(candidates) != 1:
            parser.error("Pass --regmap with the current firmware regmap.h path")
        source = candidates[0]
    rows = build_rows(source.read_text(encoding="utf-8-sig"))
    csv_buf = io.StringIO(newline="")
    writer = csv.DictWriter(csv_buf, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows({**r, "enabled": int(r["enabled"])} for r in rows)
    html_path = root / "webSerial_v03_boZhu.html"
    html = html_path.read_text(encoding="utf-8")
    block = "const ST605_PRESET = [\n" + "\n".join(
        "  { " + ", ".join(f"{key}: {json.dumps(value, ensure_ascii=False)}"
                              for key, value in r.items()) + " }," for r in rows
    ) + "\n];"
    html, count = re.subn(r"const ST605_PRESET = \[.*?\];", lambda _: block,
                          html, count=1, flags=re.DOTALL)
    if count != 1:
        raise ValueError("ST605_PRESET not found")
    outputs = {root / "st605-registers.csv": csv_buf.getvalue().encode("utf-8-sig"),
               html_path: html.encode("utf-8")}
    for path, data in outputs.items():
        if args.check:
            if path.read_bytes() != data:
                raise SystemExit(f"Out of date: {path.name}; run generator without --check")
        else:
            path.write_bytes(data)
    print(f"{'Verified' if args.check else 'Generated'} {len(rows)} registers from {source}")


if __name__ == "__main__":
    main()
