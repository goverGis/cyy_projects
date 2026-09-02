#!/usr/bin/env node
/**
 * 北京地理事件造数器
 * ---------------------------------------------------------------
 * 按真实商业 / 居住热点做高斯分布采样，生成带「业务量权重」的
 * 地理事件，用于 WebGIS 区域智能划分系统的演示与算法对比实验。
 *
 * 设计要点：
 *  1. 种子固定（mulberry32）→ 同一 seed 永远产出同一批数据，保证可复现。
 *  2. 权重不是随机数：emergency 高、discussion 低，贴合真实资源投放逻辑，
 *     划分算法在「权重不均」的数据上做出均衡才有说服力。
 *  3. 输出三件套：GeoJSON（地图直接加载）、CSV（Excel 核查）、JSON（种子脚本消费）。
 *
 * 用法：
 *   node generate.mjs --count 800 --seed 42 --out ../data
 *   node generate.mjs --help
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ----------------------------- 参数解析 ----------------------------- */
const argv = process.argv.slice(2);
const getArg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
};
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`用法: node generate.mjs [--count N] [--seed N] [--out DIR] [--city beijing]`);
  process.exit(0);
}

const COUNT = parseInt(getArg("count", "4000"), 10);
const SEED = parseInt(getArg("seed", "42"), 10);
const OUT = path.resolve(__dirname, getArg("out", "../../data"));
const CITY = getArg("city", "beijing");

/* --------------------------- 可复现随机数 --------------------------- */
// mulberry32：32-bit 种子 PRNG，比 Math.random 更适合做对照实验
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
// 标准正态（Box-Muller），用于高斯散布
const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const randInt = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;

/* ----------------------------- 城市热点 ----------------------------- */
// 坐标均为高德 GCJ-02（与前端地图体系一致，全程不纠偏）
const HOTSPOTS = {
  beijing: [
    { name: "国贸/CBD", lng: 116.461, lat: 39.909, w: 1.0, sigma: 0.013 },
    { name: "中关村", lng: 116.316, lat: 39.983, w: 1.0, sigma: 0.012 },
    { name: "五道口", lng: 116.337, lat: 39.992, w: 0.8, sigma: 0.010 },
    { name: "望京", lng: 116.470, lat: 40.000, w: 0.9, sigma: 0.013 },
    { name: "西单", lng: 116.374, lat: 39.907, w: 0.7, sigma: 0.009 },
    { name: "三里屯", lng: 116.455, lat: 39.937, w: 0.8, sigma: 0.010 },
    { name: "亦庄", lng: 116.506, lat: 39.795, w: 0.5, sigma: 0.016 },
    { name: "上地/西二旗", lng: 116.305, lat: 40.051, w: 0.9, sigma: 0.014 },
    { name: "通州北苑", lng: 116.658, lat: 39.909, w: 0.5, sigma: 0.018 },
    { name: "丰台科技园", lng: 116.279, lat: 39.858, w: 0.5, sigma: 0.015 },
  ],
};

/* ------------------------- 类型 / 类目 / 权重 ------------------------- */
// 类型占比：日常类高、急救类低（贴合真实事件频率）
const TYPE_MIX = [
  { type: "secondhand", p: 0.40 },
  { type: "discussion", p: 0.35 },
  { type: "lostfound", p: 0.18 },
  { type: "emergency", p: 0.07 },
];

const CATEGORIES = {
  secondhand: ["电子产品", "家具", "服装", "书籍", "运动器材", "宠物", "其他"],
  lostfound: ["证件", "电子产品", "钥匙", "宠物", "钱包", "其他"],
  discussion: ["社区公告", "邻里互助", "活动组织", "问题反馈", "其他"],
  emergency: ["轻度", "中度", "重度", "紧急"],
};

// 权重区间：emergency 资源需求最高，discussion 最低
const WEIGHT_RANGE = {
  secondhand: [1, 3],
  lostfound: [2, 5],
  discussion: [1, 2],
  emergency: [5, 15],
};

const TITLE_BANK = {
  secondhand: {
    电子产品: ["九成新 iPad 低价出", "闲置显卡出", "二手机械键盘", "iPhone 电池更换出"],
    家具: ["宜家书桌转让", "布艺沙发自提", "折叠床出", "实木餐桌"],
    服装: ["冬季大衣出", "全新运动鞋", "童装一批", "羽绒服低价"],
    书籍: ["考研资料打包", "教材回收", "小说合集", "专业书出"],
    运动器材: ["健身环出", "山地车转让", "瑜伽垫", "哑铃一对"],
    宠物: ["猫砂盆出", "宠物笼子", "猫爬架", "狗绳全新"],
    其他: ["杂物清理", "小家电出", "收纳箱一批", "阳台花架"],
  },
  lostfound: {
    证件: ["遗失身份证求助", "学生证丢失", "护照丢失急寻", "社保卡遗失"],
    电子产品: ["遗失 AirPods", "手机落出租车", "平板遗失", "智能手表丢失"],
    钥匙: ["家门钥匙遗失", "车钥匙丢失", "办公室钥匙", "快递柜钥匙"],
    宠物: ["猫咪走失急寻", "小狗走丢", "鹦鹉飞走", "兔子丢失"],
    钱包: ["钱包遗失", "卡包丢失", "皮夹子遗失", "零钱包"],
    其他: ["雨伞遗失", "保温杯丢失", "耳机遗失", "背包丢失"],
  },
  discussion: {
    社区公告: ["本周停水通知", "垃圾分类新规", "消防演练公告", "业主大会通知"],
    邻里互助: ["求借工具", "拼车同行", "代取快递", "二手搬家箱"],
    活动组织: ["周末篮球局", "亲子读书会", "社区市集", "夜跑团招募"],
    问题反馈: ["路灯不亮", "噪音投诉", "电梯故障", "绿化维护"],
    其他: ["闲置交换", "技能互换", "团购接龙", "失物招领点"],
  },
  emergency: {
    轻度: ["轻微擦伤求助", "小面积过敏", "轻微中暑", "低血糖求助"],
    中度: ["老人跌倒", "食物呛噎", "高热惊厥", "运动扭伤"],
    重度: ["胸痛胸闷", "意识模糊", "严重摔伤", "呼吸困难"],
    紧急: ["心脏骤停急救", "车祸伤员", "溺水救援", "燃气中毒"],
  },
};

const CONTACTS = ["138****1024", "159****8830", "微信同号", "133****5566", "社区站: 010-62**"];

/* ------------------------------ 生成 ------------------------------ */
const hotspots = HOTSPOTS[CITY] ?? HOTSPOTS.beijing;
const totalW = hotspots.reduce((s, h) => s + h.w, 0);

// 按热点权重分配数量
function allocateByHotspot() {
  const alloc = hotspots.map((h) => ({
    ...h,
    n: Math.round((h.w / totalW) * COUNT),
  }));
  // 修正取整误差
  const diff = COUNT - alloc.reduce((s, h) => s + h.n, 0);
  alloc[0].n += diff;
  return alloc;
}

function pickType() {
  const r = rnd();
  let acc = 0;
  for (const t of TYPE_MIX) {
    acc += t.p;
    if (r <= acc) return t.type;
  }
  return "secondhand";
}

/* --------------------------- 时间分布（P0：时间滑块用） --------------------------- */
// 固定在 2026-09-07 23:30 的「现在」，使造数可复现；覆盖过去 7 天（09-01 ~ 09-07）
const NOW = new Date("2026-09-07T23:30:00+08:00").getTime();
const DAYS = 7;
const MS_DAY = 86400000;
// 日权重：近期活动略多（演示「城市升温」趋势）
const dayWeights = Array.from({ length: DAYS }, (_, i) => 0.85 + 0.3 * (i / (DAYS - 1)));
const daySum = dayWeights.reduce((a, b) => a + b, 0);
// 各类型日周期活跃时段（小时区间；discussion 夜间偏多用 [19,26) 跨午夜）
const HOUR_RANGE = {
  secondhand: [10, 22],
  lostfound: [8, 21],
  emergency: [0, 24],
  discussion: [19, 26],
};
function pickDayOffset() {
  const r = rnd() * daySum;
  let acc = 0;
  for (let i = 0; i < DAYS; i++) { acc += dayWeights[i]; if (r <= acc) return i; }
  return DAYS - 1;
}
function pickHour(type) {
  const [s, e] = HOUR_RANGE[type] || [8, 22];
  const h = s + rnd() * (e - s);
  return Math.floor(h) % 24;
}
function makeCreatedAt(type) {
  const dayOffset = pickDayOffset();           // 0=6天前(09-01) ... 6=今天(09-07)
  const dayMs = NOW - (DAYS - 1 - dayOffset) * MS_DAY;
  const d = new Date(dayMs);
  d.setHours(pickHour(type), randInt(0, 59), randInt(0, 59), 0);
  return d.toISOString();
}

function makeEvent(idx, hotspot) {
  const type = pickType();
  const category = pick(CATEGORIES[type]);
  const [wMin, wMax] = WEIGHT_RANGE[type];
  // 权重加一点噪声，避免同一类目权重完全同质
  const weight = +(wMin + rnd() * (wMax - wMin)).toFixed(2);

  // 高斯散布（经纬度用不同 sigma 近似各向同性）
  const lng = +(hotspot.lng + gauss() * hotspot.sigma).toFixed(6);
  const lat = +(hotspot.lat + gauss() * hotspot.sigma * 0.78).toFixed(6);

  const titles = TITLE_BANK[type][category] ?? ["事件"];
  const title = pick(titles);
  const desc = `${hotspot.name}附近 · ${category} · ${title}`;
  const price = type === "secondhand" ? randInt(10, 2000) : null;

  return {
    id: `evt-${String(idx).padStart(4, "0")}`,
    type,
    title,
    description: desc,
    category,
    price,
    contact: pick(CONTACTS),
    weight,
    created_at: makeCreatedAt(type),
    latitude: lat,
    longitude: lng,
    status: "active",
    source: "generator",
    hotspot: hotspot.name,
  };
}

const alloc = allocateByHotspot();
const events = [];
let counter = 0;
for (const h of alloc) {
  for (let i = 0; i < h.n; i++) {
    events.push(makeEvent(counter++, h));
  }
}

/* ------------------------------ 输出 ------------------------------ */
fs.mkdirSync(OUT, { recursive: true });

// 1) JSON（种子脚本直接消费）
fs.writeFileSync(
  path.join(OUT, "events.json"),
  JSON.stringify({ city: CITY, seed: SEED, count: events.length, events }, null, 2)
    // 注意：上面的 events 已含 created_at 字段
);

// 2) GeoJSON（前端地图直接加载）
const geojson = {
  type: "FeatureCollection",
  metadata: { city: CITY, seed: SEED, count: events.length },
  features: events.map((e) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [e.longitude, e.latitude] },
    properties: {
      id: e.id,
      type: e.type,
      title: e.title,
      category: e.category,
      weight: e.weight,
      hotspot: e.hotspot,
    },
  })),
};
fs.writeFileSync(path.join(OUT, "events.geojson"), JSON.stringify(geojson, null, 2));

// 3) CSV（Excel 核查 / 算法离线处理）
const header = ["id", "type", "title", "category", "weight", "latitude", "longitude", "price", "contact", "hotspot", "created_at"];
const csv = [
  header.join(","),
  ...events.map((e) =>
    [e.id, e.type, e.title, e.category, e.weight, e.latitude, e.longitude, e.price ?? "", e.contact, e.hotspot, e.created_at]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  ),
].join("\n");
fs.writeFileSync(path.join(OUT, "events.csv"), "\ufeff" + csv);

/* ------------------------------ 汇总 ------------------------------ */
const byType = events.reduce((m, e) => ((m[e.type] = (m[e.type] || 0) + 1), m), {});
const byHot = events.reduce((m, e) => ((m[e.hotspot] = (m[e.hotspot] || 0) + 1), m), {});
const totalWeight = events.reduce((s, e) => s + e.weight, 0);

console.log("✅ 造数完成");
console.log(`   城市   : ${CITY}`);
console.log(`   种子   : ${SEED}`);
console.log(`   事件数 : ${events.length}`);
console.log("   按类型 :", byType);
console.log("   总权重 :", totalWeight.toFixed(1));
console.log("   按热点 :", byHot);
console.log(`   输出   : ${OUT}`);
console.log("           events.json / events.geojson / events.csv");
