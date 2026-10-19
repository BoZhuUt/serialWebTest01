# serialWebTest01 · Modbus RTU 上位机

单文件网页上位机（`webSerial_v03_boZhu.html`），基于 **Web Serial API**，面向 Pyxis **ST-605** 等 RS485 Modbus RTU 从站。

设计文档见 [DESIGN.md](./DESIGN.md)。

命名规则：`webSerial_vXX_boZhu.html`，其中 `XX` 为 git 提交次数（`git rev-list --count HEAD`，两位补零）。

## 功能

- 连接串口（默认 **9600 8E1**，从站 **20**）
- 寄存器表：手动编辑 + CSV 导入/导出 + ST-605 预设
- 功能码 **03 / 04 / 06 / 16**
- 周期轮询、连续地址合并读、写队列优先
- 最多 **4 个独立视图窗**（表格 / 曲线），时间窗与通道勾选互不干扰
- 「地址从 1 起」勾选，适配文档/表地址
- 「导出数据」保存采样历史
- 配置：localStorage 自动恢复 + JSON 导入导出

## 环境要求

| 项 | 要求 |
|----|------|
| 浏览器 | Chrome / Edge（Chromium，支持 Web Serial） |
| 打开方式 | `file://` 双击、`localhost` 或 HTTPS |
| 系统 | Windows / macOS / Linux（需能识别 USB 转串口） |

> 非 Chromium 浏览器会提示「Web Serial 不可用」。请关闭其它占用同一 COM 口的工具（如 ST605Export）。

## 快速开始

1. 双击打开 `webSerial_v03_boZhu.html`（或任意静态服务器）。
2. 点 **「ST-605 预设」** 载入默认寄存器表（PDU 地址）。
3. 按需勾选 **「地址从 1 起」**：勾选后表内按文档/表地址填写（如 48001），发帧自动减 1；不勾选则填 PDU 地址（如 48000）。
4. 点 **「连接串口」**，选择 COM 口；参数保持默认 9600 / 8 / E / 1。
5. 点 **「立即读」** 或 **「开始轮询」**。
6. 在视图窗点 **「通道」** 勾选要看的参数；可同时开短期 / 长期曲线。
7. 需要留档时点 **「导出数据」**，将采样历史存为 CSV。

### 地址约定

| 「地址从 1 起」 | 表内填写 | 发帧 PDU |
|----------------|----------|----------|
| 不勾选（默认） | 48000 | 48000 |
| 勾选 | 48001 | 48000 |

- 切换勾选时表内地址会自动 ±1，**线上 PDU 保持不变**。
- **寄存器 CSV 的 addr 列始终是 PDU 地址**（与 `regmap.csv` 一致），导入/导出自动换算。
- ST-605 表地址 **48001** = PDU **48000**；默认 `slope` 约 **5.0**（`f32-le-words`，字节 `00 00 40 A0`）。
- 写寄存器只改 RAM；持久化向 `command`（43005）写 **5**，本工具不自动保存设备参数。

## 导出数据

「导出数据」输出 **宽表** CSV（UTF-8 BOM，Excel 可直接作图）：

```text
SILOG
Poll definition: interval=500ms timeout=300ms retries=1 slave=20 9600 8even1 exported=...
time,ct365,cr365,temperature1,...
2026-10-16 18:00:44.123,4000,200,25.4
2026-10-16 18:00:44.623,4000,200,25.4
```

| 项 | 说明 |
|----|------|
| 结构 | **一行 = 一个采样时刻**，**一列 = 一个寄存器**（与常见 SILOG / 参数记录表一致） |
| 表头 | 第 1 行 `SILOG`，第 2 行轮询参数说明，第 3 行列名 |
| 时间 | 列 A，本机本地时间，含毫秒；同一轮轮询共用同一时间戳 |
| 范围 | 内存环形缓冲内全部 `good` 点，含各视图窗未勾选的通道 |
| 空格 | 某时刻该通道无成功点则留空 |
| 容量 | 受「历史 h」限制（默认 2 小时）；被丢弃的旧点无法再导出 |
| 时机 | 点击「导出数据」一次性导出，不会自动持续写盘 |
| 文件名 | `SILOG-YYYYMMDD-HHMMSS.csv` |

若需要更长历史，请把「历史 h」调大（30 min～8 h）后再开始采样。

## 寄存器 CSV 格式

```csv
name,slave,fc,addr,type,scale,offset,unit,enabled
temperature1,20,3,46002,f32-le-words,1,0,℃,1
slope,20,3,48000,f32-le-words,1,0,,1
```

| 字段 | 说明 |
|------|------|
| name | 显示名 / 图例 / 配置引用 |
| slave | 从站地址 1～247 |
| fc | 3=保持读 4=输入读 6=写单 16=写多 |
| addr | **PDU 地址**（发帧字节里的地址） |
| type | `u16` `i16` `u32` `i32` `f32-le-words`（默认） `f32-be-words` `f32` |
| scale / offset | 物理量 = raw × scale + offset |
| unit | 显示单位 |
| enabled | 是否参与周期读取 |

## JSON 配置

导出文件为完整配置（串口 / 轮询 / 寄存器表 / 视图 / 历史容量），可换机导入复用。字段见 `DESIGN.md` §4.6。

## 视图窗说明

| 操作 | 行为 |
|------|------|
| 模式 | 曲线 / 表格 |
| 通道 | 本窗多选，可与其它窗重复 |
| 时间窗 | 曲线模式有效（30s～8h） |
| autoY | 自动 Y 轴；关闭后可手填 min/max |
| 暂停 | 冻结本窗画面，后台仍采样 |
| 清空 | 清本窗显示（历史数据仍在后台） |
| 布局 | 1 / 2 / 4 格，最多 4 窗 |

## 快捷键

| 键 | 作用 |
|----|------|
| `R` | 立即读 |
| `P` | 开始 / 停止轮询 |

## 验收对照

按 `DESIGN.md` §8 清单：预设载入、连接、单行读、PDU 地址、合并读、FC16 写回、异常码、超时、多窗独立、JSON/CSV 往返、localStorage、`file://` 离线。

## 非目标（第一版）

时间线录制回放、线圈 01/02/05/15、多串口并行、FC08 诊断、云同步。

## 文件

| 文件 | 说明 |
|------|------|
| `webSerial_v03_boZhu.html` | 应用本体（`XX` = git 提交次数） |
| `st605-registers.csv` | ST-605 默认寄存器表 |
| `DESIGN.md` | 设计、协议约定、验证清单 |
| `README.md` | 本说明 |

### 更新 ST-605 预设

`_gen_preset.py` 从当前固件 `Middlewares/autoRegmap/regmap.h` 读取字段、表地址和类型，生成网页内置预设和 `st605-registers.csv`。旧 `regmap.csv` 的 46xxx 字段已过期，不应作为来源。地址统一转成 PDU（表地址减 1），32 位值低字在前。

```powershell
python _gen_preset.py --regmap "当前固件目录/Middlewares/autoRegmap/regmap.h"
python _gen_preset.py --regmap "当前固件目录/Middlewares/autoRegmap/regmap.h" --check
```

页面载入预设后，默认曲线显示 `sensorValue` 和 `temperatureValue`，清除旧读值和历史，并恢复 20 / 9600 / 8E1。已有浏览器配置需要重新点击「ST-605 预设」才会更新。

### v03 · 2026-10-19

- 按当前固件定义同步 78 项 ST-605 寄存器预设，新增可重复生成及一致性检查。
- 修复默认曲线通道、旧数据清理和 8E1 参数恢复。
- 左上角显示作者Bo、版本号与北京时间更新时间。
