"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  X, Search, ZoomIn, ZoomOut, RotateCcw, Crosshair,
  TrendingUp, TrendingDown, Eye, EyeOff
} from 'lucide-react';

/* ============================================================
   AI SUPPLY CHAIN MAP — Bloomberg SPLC-inspired
   ============================================================ */

/* ---------- COLOR TOKENS ---------- */
const C = {
  bg:        '#000000',
  bg2:       '#0a0a0a',
  bg3:       '#141414',
  border:    '#2a2a2a',
  borderHi:  '#3a3a3a',
  orange:    '#ff8c00',
  orangeDim: '#cc6f00',
  amber:     '#ffb020',
  green:     '#00c853',
  greenDim:  '#1e7e34',
  red:       '#cc2f2f',
  redDim:    '#7d1a1a',
  maroon:    '#5a1212',
  grey:      '#6e6e6e',
  greyLi:    '#a0a0a0',
  white:     '#f5f5f5',
  yellow:    '#ffd60a',
  blue:      '#3b82f6',
  cyan:      '#00d9ff',
};

const COUNTRY = {
  US: { flag: '🇺🇸', label: 'US',  color: '#3b82f6' },
  TW: { flag: '🇹🇼', label: 'TW',  color: '#00c853' },
  KR: { flag: '🇰🇷', label: 'KR',  color: '#a855f7' },
  JP: { flag: '🇯🇵', label: 'JP',  color: '#ec4899' },
  NL: { flag: '🇳🇱', label: 'NL',  color: '#ff8c00' },
  CN: { flag: '🇨🇳', label: 'CN',  color: '#dc2626' },
  DE: { flag: '🇩🇪', label: 'DE',  color: '#fbbf24' },
  GB: { flag: '🇬🇧', label: 'UK',  color: '#60a5fa' },
};

/* ---------- DATA: COMPANIES ---------- */
/* AI / semiconductor supply chain — focused on TW↔US synergy */
const COMPANIES = {
  /* EDA & IP — Tier 0 */
  SNPS:  { ticker:'SNPS',  name:'Synopsys',       country:'US', cluster:'eda',     mcap:88,    aiExp:75, role:'EDA software, IP cores for chip design.' },
  CDNS:  { ticker:'CDNS',  name:'Cadence Design', country:'US', cluster:'eda',     mcap:75,    aiExp:80, role:'EDA / verification / IP. Core to every fabless designer.' },
  ARM:   { ticker:'ARM',   name:'Arm Holdings',   country:'GB', cluster:'eda',     mcap:135,   aiExp:60, role:'CPU IP licensed across mobile, server, AI accelerators.' },

  /* Semi Equipment — Tier 1 */
  ASML:  { ticker:'ASML',  name:'ASML Holding',   country:'NL', cluster:'equip',   mcap:280,   aiExp:70, role:'EUV / DUV litho monopoly. No leading-edge fab without ASML.' },
  AMAT:  { ticker:'AMAT',  name:'Applied Materials', country:'US', cluster:'equip', mcap:155,  aiExp:55, role:'Deposition / etch / CMP across nodes.' },
  LRCX:  { ticker:'LRCX',  name:'Lam Research',   country:'US', cluster:'equip',   mcap:115,   aiExp:60, role:'Etch + dep, dominant in NAND/DRAM tooling.' },
  KLAC:  { ticker:'KLAC',  name:'KLA Corp',       country:'US', cluster:'equip',   mcap:105,   aiExp:55, role:'Process control / inspection / metrology.' },
  TEL:   { ticker:'8035',  name:'Tokyo Electron', country:'JP', cluster:'equip',   mcap:90,    aiExp:55, role:'Coater/developer track, etch, cleaning.' },

  /* Foundry — Tier 2 */
  TSM:   { ticker:'2330',  name:'TSMC',           country:'TW', cluster:'foundry', mcap:1050,  aiExp:60, role:'Leading-edge foundry. N3/N2 + CoWoS advanced packaging.' },
  SSNLF: { ticker:'005930',name:'Samsung Foundry',country:'KR', cluster:'foundry', mcap:380,   aiExp:35, role:'Foundry + IDM. 2nd source advanced node.' },
  UMC:   { ticker:'2303',  name:'UMC',            country:'TW', cluster:'foundry', mcap:18,    aiExp:25, role:'Mature node foundry, RF/PMIC/display drivers.' },
  INTC:  { ticker:'INTC',  name:'Intel Foundry',  country:'US', cluster:'foundry', mcap:95,    aiExp:30, role:'IDM + foundry pivot. 18A node, US capacity.' },

  /* IC Design (FOCUS) — Tier 3 */
  NVDA:  { ticker:'NVDA',  name:'NVIDIA',         country:'US', cluster:'fabless', mcap:3500,  aiExp:90, role:'AI GPU leader. Hopper/Blackwell/Rubin platforms, CUDA moat.' },
  AMD:   { ticker:'AMD',   name:'AMD',            country:'US', cluster:'fabless', mcap:280,   aiExp:55, role:'MI300/MI325 AI accelerators + EPYC CPU.' },
  AVGO:  { ticker:'AVGO',  name:'Broadcom',       country:'US', cluster:'fabless', mcap:850,   aiExp:65, role:'Custom ASIC partner for Google TPU, networking silicon.' },
  MRVL:  { ticker:'MRVL',  name:'Marvell',        country:'US', cluster:'fabless', mcap:65,    aiExp:50, role:'Custom AI silicon (Amazon Trainium2), optical DSPs.' },
  MTK:   { ticker:'2454',  name:'MediaTek',       country:'TW', cluster:'fabless', mcap:75,    aiExp:35, role:'Mobile SoC, edge AI, partnering NVIDIA on Arm CPUs.' },
  QCOM:  { ticker:'QCOM',  name:'Qualcomm',       country:'US', cluster:'fabless', mcap:175,   aiExp:30, role:'Mobile SoC, AI PC chips, autos.' },

  /* OSAT — Tier 4 */
  ASX:   { ticker:'3711',  name:'ASE Technology', country:'TW', cluster:'osat',    mcap:25,    aiExp:40, role:'Largest OSAT. Advanced packaging, FOCoS.' },
  AMKR:  { ticker:'AMKR',  name:'Amkor',          country:'US', cluster:'osat',    mcap:7,     aiExp:35, role:'OSAT, Arizona advanced packaging w/ TSMC.' },
  PTI:   { ticker:'6239',  name:'Powertech',      country:'TW', cluster:'osat',    mcap:3.5,   aiExp:40, role:'Memory packaging / testing, HBM-related.' },

  /* Memory — Tier 4 */
  MU:    { ticker:'MU',    name:'Micron',         country:'US', cluster:'memory',  mcap:120,   aiExp:55, role:'DRAM/NAND. HBM3E shipping to NVIDIA.' },
  HYNIX: { ticker:'000660',name:'SK Hynix',       country:'KR', cluster:'memory',  mcap:130,   aiExp:60, role:'HBM dominant supplier to NVIDIA.' },
  SSNMM: { ticker:'005930',name:'Samsung Memory', country:'KR', cluster:'memory',  mcap:0,     aiExp:50, role:'DRAM/NAND/HBM. Qualifying HBM3E.' },
  NTC:   { ticker:'2408',  name:'Nanya Tech',     country:'TW', cluster:'memory',  mcap:5,     aiExp:25, role:'Niche DRAM, commodity / specialty.' },
  WBOND: { ticker:'2344',  name:'Winbond',        country:'TW', cluster:'memory',  mcap:2.5,   aiExp:20, role:'Niche DRAM, NOR flash.' },

  /* Memory Controller / Module — Tier 4.5 (TW strength) */
  PSON:  { ticker:'8299',  name:'Phison',         country:'TW', cluster:'memmod',  mcap:3.2,   aiExp:45, role:'NAND controller leader. AI SSD growth (aiDAPTIV+).' },
  SIMO:  { ticker:'SIMO',  name:'Silicon Motion', country:'TW', cluster:'memmod',  mcap:2.5,   aiExp:35, role:'SSD controllers, MonTitan enterprise.' },
  ADATA: { ticker:'3260',  name:'ADATA',          country:'TW', cluster:'memmod',  mcap:1.0,   aiExp:25, role:'Memory modules / SSDs / industrial.' },
  APCR:  { ticker:'8271',  name:'Apacer',         country:'TW', cluster:'memmod',  mcap:0.4,   aiExp:30, role:'Industrial / server memory modules.' },
  TSCD:  { ticker:'2451',  name:'Transcend',      country:'TW', cluster:'memmod',  mcap:0.9,   aiExp:20, role:'Industrial SSD / module maker.' },

  /* Substrate / PCB — Tier 4 */
  UNIMI: { ticker:'3037',  name:'Unimicron',      country:'TW', cluster:'pcb',     mcap:7,     aiExp:55, role:'ABF substrates for AI GPUs/CPUs. Capacity tight.' },
  NANYA: { ticker:'8046',  name:'Nan Ya PCB',     country:'TW', cluster:'pcb',     mcap:3,     aiExp:50, role:'ABF + HDI for AI server platforms.' },
  KINSU: { ticker:'3189',  name:'Kinsus',         country:'TW', cluster:'pcb',     mcap:1.5,   aiExp:45, role:'IC substrates, ABF expansion.' },
  IBIDN: { ticker:'4062',  name:'Ibiden',         country:'JP', cluster:'pcb',     mcap:6,     aiExp:55, role:'High-end ABF substrate, NVIDIA core supplier.' },

  /* Cooling / Power (TW heavy) — Tier 5 */
  DELTA: { ticker:'2308',  name:'Delta Electronics', country:'TW', cluster:'power', mcap:35,   aiExp:50, role:'Server power supplies, thermal, racks.' },
  LITEO: { ticker:'2301',  name:'Lite-On',        country:'TW', cluster:'power',   mcap:8,     aiExp:35, role:'Power supplies, cloud server power.' },
  AURAS: { ticker:'3324',  name:'Auras',          country:'TW', cluster:'power',   mcap:2.0,   aiExp:60, role:'Liquid cooling for AI servers.' },
  AVC:   { ticker:'3017',  name:'AVC',            country:'TW', cluster:'power',   mcap:5,     aiExp:55, role:'Thermal modules, AI server cooling.' },
  VRT:   { ticker:'VRT',   name:'Vertiv',         country:'US', cluster:'power',   mcap:45,    aiExp:65, role:'Data center power & thermal infrastructure.' },

  /* Networking / Optical — Tier 5 */
  COHR:  { ticker:'COHR',  name:'Coherent',       country:'US', cluster:'optical', mcap:14,    aiExp:55, role:'Optical transceivers for AI fabric.' },
  ALAB:  { ticker:'ALAB',  name:'Astera Labs',    country:'US', cluster:'optical', mcap:13,    aiExp:90, role:'PCIe/CXL retimers, scale-up AI fabric.' },
  CRDO:  { ticker:'CRDO',  name:'Credo',          country:'US', cluster:'optical', mcap:9,     aiExp:80, role:'AEC cables, SerDes for AI data center.' },

  /* EMS / Server ODM — Tier 6 (TW dominance) */
  FXC:   { ticker:'2317',  name:'Foxconn (Hon Hai)', country:'TW', cluster:'ems',   mcap:90,   aiExp:45, role:'Largest EMS. GB200 NVL72 racks. AI server #1.' },
  QCI:   { ticker:'2382',  name:'Quanta',         country:'TW', cluster:'ems',     mcap:36,    aiExp:55, role:'AI server ODM. NVIDIA HGX, Meta, Google.' },
  WIWY:  { ticker:'6669',  name:'Wiwynn',         country:'TW', cluster:'ems',     mcap:20,    aiExp:75, role:'Wistron subsidiary. Meta/MS hyperscale.' },
  WSTRN: { ticker:'3231',  name:'Wistron',        country:'TW', cluster:'ems',     mcap:14,    aiExp:40, role:'AI baseboard, HGX integration.' },
  INVTC: { ticker:'2356',  name:'Inventec',       country:'TW', cluster:'ems',     mcap:10,    aiExp:35, role:'AI server platforms, L10/L11 integration.' },
  SMCI:  { ticker:'SMCI',  name:'Supermicro',     country:'US', cluster:'ems',     mcap:25,    aiExp:80, role:'Liquid-cooled AI servers, NVIDIA reference.' },
  DELL:  { ticker:'DELL',  name:'Dell',           country:'US', cluster:'ems',     mcap:90,    aiExp:35, role:'AI server systems, enterprise channel.' },
  HPE:   { ticker:'HPE',   name:'HPE',            country:'US', cluster:'ems',     mcap:28,    aiExp:30, role:'AI servers + Cray, Juniper networking.' },

  /* CSPs / End Users — Tier 7 */
  MSFT:  { ticker:'MSFT',  name:'Microsoft',      country:'US', cluster:'csp',     mcap:3300,  aiExp:35, role:'Azure + OpenAI. Maia custom silicon.' },
  GOOGL: { ticker:'GOOGL', name:'Alphabet',       country:'US', cluster:'csp',     mcap:2400,  aiExp:30, role:'TPU v5/v6 (Trillium) + GPU buyer. Gemini.' },
  AMZN:  { ticker:'AMZN',  name:'Amazon AWS',     country:'US', cluster:'csp',     mcap:2300,  aiExp:25, role:'Trainium2/Inferentia + NVIDIA. Anthropic.' },
  META:  { ticker:'META',  name:'Meta',           country:'US', cluster:'csp',     mcap:1500,  aiExp:30, role:'MTIA + massive NVIDIA GPU buildout.' },
  ORCL:  { ticker:'ORCL',  name:'Oracle',         country:'US', cluster:'csp',     mcap:430,   aiExp:25, role:'OCI Gen2, NVIDIA superclusters.' },
  TSLA:  { ticker:'TSLA',  name:'Tesla / xAI',    country:'US', cluster:'csp',     mcap:900,   aiExp:30, role:'Dojo + xAI Colossus (NVIDIA H100/H200).' },
  AAPL:  { ticker:'AAPL',  name:'Apple',          country:'US', cluster:'csp',     mcap:3500,  aiExp:20, role:'On-device AI silicon, private cloud compute.' },

  /* ============ EXTENDED TAIWAN SUPPLY CHAIN ============ */

  /* IP / 矽智財 — joined into EDA cluster */
  EMEM:  { ticker:'3529', name:'eMemory',         country:'TW', cluster:'eda', mcap:5,   aiExp:55, role:'OTP/MTP 嵌入式記憶體 IP 全球龍頭。' },
  M31:   { ticker:'6643', name:'M31',             country:'TW', cluster:'eda', mcap:1.0, aiExp:65, role:'矽智財 IP，HPC/AI 高速介面。' },

  /* ASIC Design Service — NEW cluster */
  GUC:     { ticker:'3443', name:'Global Unichip',country:'TW', cluster:'asic_svc', mcap:6.0,  aiExp:85, role:'台積電 ASIC 設計服務子公司。高速 IO IP，HPC/AI 客製晶片。' },
  ALCHIP:  { ticker:'3661', name:'Alchip',        country:'TW', cluster:'asic_svc', mcap:11.0, aiExp:90, role:'AWS Trainium、Google ASIC 主要設計夥伴。AI 客製矽王者。' },
  FARADAY: { ticker:'3035', name:'Faraday',       country:'TW', cluster:'asic_svc', mcap:1.5,  aiExp:55, role:'聯電旗下 ASIC 設計服務，IP 池豐富。' },

  /* BMC / Networking IC — joined into fabless cluster */
  ASPEED: { ticker:'5274', name:'Aspeed',         country:'TW', cluster:'fabless', mcap:5.0, aiExp:80, role:'全球 BMC（伺服器管理晶片）龍頭。每台 AI 伺服器都需要。' },
  RTK:    { ticker:'2379', name:'Realtek',        country:'TW', cluster:'fabless', mcap:8.0, aiExp:25, role:'網通晶片、Switch IC。' },
  NTK:    { ticker:'3034', name:'Novatek',        country:'TW', cluster:'fabless', mcap:11.0,aiExp:15, role:'顯示驅動 IC、SoC。' },

  /* CCL 銅箔基板 — joined into pcb cluster */
  EMC:      { ticker:'2383', name:'Elite Material',country:'TW', cluster:'pcb', mcap:6.0, aiExp:65, role:'AI 伺服器 CCL 銅箔基板龍頭。' },
  ITEQ:     { ticker:'6213', name:'ITEQ',         country:'TW', cluster:'pcb', mcap:2.0, aiExp:55, role:'高速 CCL，AI 伺服器 PCB 上游。' },
  /* Server PCB makers — joined into pcb cluster */
  GCE:      { ticker:'2368', name:'GCE',          country:'TW', cluster:'pcb', mcap:2.5, aiExp:65, role:'伺服器 PCB 大廠，AI 受惠。' },
  TRIPOD:   { ticker:'3044', name:'Tripod',       country:'TW', cluster:'pcb', mcap:3.0, aiExp:50, role:'HDI 與伺服器 PCB。' },
  CHINPOON: { ticker:'2313', name:'Chin-Poon',    country:'TW', cluster:'pcb', mcap:1.2, aiExp:40, role:'HDI / 車用 / 伺服器 PCB。' },

  /* CoWoS Equipment — NEW cluster (TW strong here) */
  GUDENG:  { ticker:'3680', name:'Gudeng',        country:'TW', cluster:'cowos_eq', mcap:2.2, aiExp:75, role:'EUV photomask pod 龍頭，ASML 供應商。' },
  KYECTL:  { ticker:'3413', name:'Foxsemicon',    country:'TW', cluster:'cowos_eq', mcap:1.8, aiExp:60, role:'京鼎，鴻海集團半導體設備。' },
  SUNVI:   { ticker:'3583', name:'Sun Vision',    country:'TW', cluster:'cowos_eq', mcap:0.8, aiExp:65, role:'晶圓濕製程設備，CoWoS 相關。' },
  GALLANT: { ticker:'3131', name:'Gallant',       country:'TW', cluster:'cowos_eq', mcap:1.0, aiExp:60, role:'半導體濕製程清洗設備。' },

  /* PCB Equipment / AOI — NEW cluster */
  UTZ:     { ticker:'3563', name:'Utechzone',     country:'TW', cluster:'pcb_eq', mcap:0.8, aiExp:70, role:'AOI 自動光學檢測龍頭。' },
  CONTREL: { ticker:'3455', name:'Contrel',       country:'TW', cluster:'pcb_eq', mcap:0.5, aiExp:55, role:'AOI、PCB 製程檢測。' },
  CHSHENG: { ticker:'3579', name:'Chih Sheng',    country:'TW', cluster:'pcb_eq', mcap:0.4, aiExp:50, role:'PCB 曝光顯影設備。' },
  WANRUN:  { ticker:'6187', name:'Wan Run',       country:'TW', cluster:'pcb_eq', mcap:0.4, aiExp:50, role:'PCB 點膠 / 製程設備。' },

  /* Cooling / Thermal — joined into power cluster */
  HIPOW:   { ticker:'8410', name:'High Power',    country:'TW', cluster:'power', mcap:1.5, aiExp:80, role:'液冷板，AI 伺服器液冷主要供應。' },
  JENTECH: { ticker:'3653', name:'Jentech',       country:'TW', cluster:'power', mcap:1.5, aiExp:65, role:'TIM / Heat spreader。' },
  SUNON:   { ticker:'2421', name:'Sunon',         country:'TW', cluster:'power', mcap:1.5, aiExp:40, role:'伺服器風扇散熱模組。' },

  /* Server Mechanical — NEW cluster */
  CHENBRO: { ticker:'8210', name:'Chenbro',       country:'TW', cluster:'mech',  mcap:0.8, aiExp:65, role:'伺服器機殼。' },
  KSLIDE:  { ticker:'2059', name:'King Slide',    country:'TW', cluster:'mech',  mcap:2.0, aiExp:60, role:'伺服器滑軌，全球龍頭。' },
  LOTES:   { ticker:'3533', name:'Lotes',         country:'TW', cluster:'mech',  mcap:3.5, aiExp:75, role:'GPU/CPU socket、AI 連接器。' },

  /* Optical — joined into optical cluster */
  SHPHEN:  { ticker:'3363', name:'Shang Phen',    country:'TW', cluster:'optical', mcap:0.5, aiExp:55, role:'光纖陶瓷套圈，被動光元件。' },
  LUMENS:  { ticker:'4979', name:'Lumens Digital',country:'TW', cluster:'optical', mcap:0.4, aiExp:60, role:'光收發模組、AI 資料中心。' },
  BROWAVE: { ticker:'6442', name:'Browave',       country:'TW', cluster:'optical', mcap:0.3, aiExp:50, role:'光通訊濾光元件。' },

  /* Fab Facility / Cleanroom — NEW cluster */
  HCG:    { ticker:'2404', name:'HCG',            country:'TW', cluster:'fab_fac', mcap:1.5, aiExp:70, role:'廠務工程、潔淨室。台積電核心夥伴。' },
  MIC:    { ticker:'6196', name:'MIC',            country:'TW', cluster:'fab_fac', mcap:1.2, aiExp:60, role:'廠務、設備整合、潔淨室。' },
  ACTER:  { ticker:'5536', name:'Acter',          country:'TW', cluster:'fab_fac', mcap:0.7, aiExp:55, role:'潔淨室、半導體廠務工程。' },
};

/* ---------- TRADITIONAL CHINESE NAMES ---------- */
/* 台美廠以繁中為主；其他國家補上台灣常見譯名 */
const CN_NAMES = {
  // EDA & IP
  SNPS:  '新思科技',
  CDNS:  '益華電腦',
  ARM:   '安謀',
  // Equipment
  ASML:  '艾司摩爾',
  AMAT:  '應用材料',
  LRCX:  '科林研發',
  KLAC:  '科磊',
  TEL:   '東京威力科創',
  // Foundry
  TSM:   '台積電',
  SSNLF: '三星晶圓代工',
  UMC:   '聯電',
  INTC:  '英特爾',
  // Fabless
  NVDA:  '輝達',
  AMD:   '超微',
  AVGO:  '博通',
  MRVL:  '邁威爾',
  MTK:   '聯發科',
  QCOM:  '高通',
  // OSAT
  ASX:   '日月光',
  AMKR:  '艾克爾',
  PTI:   '力成',
  // Memory
  MU:    '美光',
  HYNIX: 'SK 海力士',
  SSNMM: '三星記憶體',
  NTC:   '南亞科',
  WBOND: '華邦電',
  // Memory Module / Controller
  PSON:  '群聯',
  SIMO:  '慧榮',
  ADATA: '威剛',
  APCR:  '宇瞻',
  TSCD:  '創見',
  // PCB / Substrate
  UNIMI: '欣興',
  NANYA: '南電',
  KINSU: '景碩',
  IBIDN: '揖斐電',
  // Power & Cooling
  DELTA: '台達電',
  LITEO: '光寶',
  AURAS: '雙鴻',
  AVC:   '奇鋐',
  VRT:   '維諦',
  // Optical / Networking
  COHR:  '高致',
  ALAB:  'Astera Labs',
  CRDO:  'Credo',
  // EMS / ODM
  FXC:   '鴻海',
  QCI:   '廣達',
  WIWY:  '緯穎',
  WSTRN: '緯創',
  INVTC: '英業達',
  SMCI:  '美超微',
  DELL:  '戴爾',
  HPE:   '慧與',
  // CSP / Hyperscaler
  MSFT:  '微軟',
  GOOGL: '字母控股',
  AMZN:  '亞馬遜',
  META:  'Meta',
  ORCL:  '甲骨文',
  TSLA:  '特斯拉',
  AAPL:  '蘋果',

  // === Extended TW supply chain ===
  // IP
  EMEM:  '力旺',
  M31:   'M31',
  // ASIC Service
  GUC:     '創意電子',
  ALCHIP:  '世芯-KY',
  FARADAY: '智原',
  // BMC / Switch IC
  ASPEED: '信驊',
  RTK:    '瑞昱',
  NTK:    '聯詠',
  // CCL & Server PCB
  EMC:      '台光電',
  ITEQ:     '聯茂',
  GCE:      '金像電',
  TRIPOD:   '健鼎',
  CHINPOON: '華通',
  // CoWoS Equipment
  GUDENG:  '家登',
  KYECTL:  '京鼎',
  SUNVI:   '辛耘',
  GALLANT: '弘塑',
  // PCB Equipment / AOI
  UTZ:     '牧德',
  CONTREL: '由田',
  CHSHENG: '志聖',
  WANRUN:  '萬潤',
  // Thermal
  HIPOW:   '高力',
  JENTECH: '健策',
  SUNON:   '建準',
  // Server Mechanical
  CHENBRO: '勤誠',
  KSLIDE:  '川湖',
  LOTES:   '嘉澤',
  // Optical
  SHPHEN:  '上詮',
  LUMENS:  '華星光',
  BROWAVE: '光聖',
  // Fab Facility
  HCG:    '漢唐',
  MIC:    '帆宣',
  ACTER:  '聖暉',
};

const cnOf = (id) => CN_NAMES[id] || COMPANIES[id]?.name || id;


const CLUSTERS = [
  { id:'eda',       label:'EDA & IP / 設計工具',      tier:0, side:'up',     icon:'code' },
  { id:'equip',     label:'半導體設備 / Semi Eq.',    tier:1, side:'up',     icon:'wrench' },
  { id:'cowos_eq',  label:'CoWoS 設備 / Adv Pkg Eq.', tier:1, side:'up_low', icon:'wrench' },
  { id:'pcb_eq',    label:'PCB 設備 / AOI',           tier:1, side:'up_low2',icon:'wrench' },
  { id:'fab_fac',   label:'廠務 / Fab Facility',      tier:1, side:'up_low3',icon:'wrench' },
  { id:'foundry',   label:'晶圓代工 / Foundry',       tier:2, side:'up',     icon:'box' },
  { id:'memory',    label:'記憶體 / DRAM·HBM',        tier:2, side:'up_low', icon:'database' },
  { id:'pcb',       label:'載板·PCB·CCL',             tier:2, side:'up_low2',icon:'layers' },
  { id:'fabless',   label:'IC 設計 / Fabless',        tier:3, side:'center', icon:'cpu' },
  { id:'asic_svc',  label:'ASIC 設計服務',            tier:3, side:'mid_low',icon:'cpu' },
  { id:'osat',      label:'封測 / OSAT',              tier:4, side:'mid',    icon:'box' },
  { id:'memmod',    label:'記憶體模組 / Module',      tier:4, side:'mid_low', icon:'hard-drive' },
  { id:'power',     label:'電源散熱 / Power·Cool',    tier:5, side:'mid_low2', icon:'activity' },
  { id:'optical',   label:'光通訊 / Optical',         tier:5, side:'mid_low3', icon:'link' },
  { id:'mech',      label:'伺服器機構 / Mechanical',  tier:5, side:'mid_low4', icon:'box' },
  { id:'ems',       label:'伺服器代工 / EMS',         tier:6, side:'down',   icon:'server' },
  { id:'csp',       label:'雲端客戶 / CSP',           tier:7, side:'down',   icon:'globe' },
];

/* ---------- EDGES: supply chain relationships ---------- */
/* type: 's' = supplier-to-customer (left to right flow)
   value: relative weight (0-100) used for line thickness & % label  */
const EDGES = [
  /* EDA/IP -> Fabless */
  ['SNPS','NVDA',55],['SNPS','AMD',45],['SNPS','AVGO',40],['SNPS','MTK',35],['SNPS','MRVL',35],['SNPS','QCOM',40],
  ['CDNS','NVDA',50],['CDNS','AMD',45],['CDNS','AVGO',40],['CDNS','MTK',35],['CDNS','MRVL',35],['CDNS','QCOM',40],
  ['ARM','NVDA',25],['ARM','MTK',60],['ARM','QCOM',55],['ARM','AMD',15],['ARM','AVGO',20],

  /* Equipment -> Foundry */
  ['ASML','TSM',45],['ASML','SSNLF',35],['ASML','INTC',30],
  ['AMAT','TSM',35],['AMAT','SSNLF',30],['AMAT','INTC',25],['AMAT','MU',30],['AMAT','HYNIX',28],
  ['LRCX','TSM',30],['LRCX','SSNLF',25],['LRCX','MU',40],['LRCX','HYNIX',38],
  ['KLAC','TSM',30],['KLAC','SSNLF',25],['KLAC','INTC',22],
  ['TEL','TSM',28],['TEL','SSNLF',26],['TEL','MU',25],

  /* Foundry -> Fabless */
  ['TSM','NVDA',90],['TSM','AMD',80],['TSM','AVGO',75],['TSM','MTK',70],['TSM','MRVL',65],['TSM','QCOM',75],['TSM','AAPL',80],
  ['SSNLF','QCOM',25],['SSNLF','NVDA',10],
  ['UMC','MTK',25],['UMC','QCOM',15],
  ['INTC','MSFT',12],['INTC','AMZN',10],

  /* Substrate -> Fabless (ABF for GPUs) */
  ['UNIMI','NVDA',55],['UNIMI','AMD',45],['UNIMI','AVGO',40],
  ['NANYA','NVDA',45],['NANYA','AMD',40],['NANYA','AVGO',35],
  ['KINSU','NVDA',30],['KINSU','AMD',25],
  ['IBIDN','NVDA',60],['IBIDN','AMD',35],

  /* Memory -> Fabless (HBM) */
  ['MU','NVDA',55],['MU','AMD',35],
  ['HYNIX','NVDA',75],['HYNIX','AMD',45],
  ['SSNMM','NVDA',20],['SSNMM','AMD',30],

  /* Memory -> Module makers */
  ['MU','PSON',40],['MU','ADATA',45],['MU','APCR',35],['MU','TSCD',40],
  ['SSNMM','PSON',35],['SSNMM','ADATA',40],['SSNMM','TSCD',35],
  ['HYNIX','PSON',30],['HYNIX','ADATA',30],

  /* Fabless -> OSAT (packaging) */
  ['NVDA','ASX',55],['AMD','ASX',45],['AVGO','ASX',50],['MTK','ASX',60],
  ['NVDA','AMKR',40],['AMD','AMKR',35],['AVGO','AMKR',30],
  ['MU','PTI',55],['HYNIX','PTI',35],

  /* Memory module -> EMS */
  ['PSON','FXC',50],['PSON','QCI',45],['PSON','WIWY',40],['PSON','SMCI',45],
  ['SIMO','FXC',40],['SIMO','QCI',35],
  ['ADATA','FXC',35],['ADATA','QCI',30],['ADATA','SMCI',30],
  ['APCR','WIWY',40],['APCR','INVTC',35],
  ['TSCD','INVTC',30],

  /* Fabless -> EMS (chips go into servers) */
  ['NVDA','FXC',80],['NVDA','QCI',85],['NVDA','WIWY',70],['NVDA','WSTRN',65],['NVDA','SMCI',90],['NVDA','INVTC',55],['NVDA','DELL',60],['NVDA','HPE',45],
  ['AMD','FXC',45],['AMD','QCI',55],['AMD','SMCI',55],['AMD','DELL',50],
  ['AVGO','FXC',35],['AVGO','QCI',40],['AVGO','WIWY',45],
  ['MRVL','FXC',30],['MRVL','QCI',30],

  /* Power/Cooling -> EMS */
  ['DELTA','FXC',55],['DELTA','QCI',50],['DELTA','WIWY',45],['DELTA','SMCI',60],
  ['LITEO','FXC',40],['LITEO','QCI',35],
  ['AURAS','FXC',45],['AURAS','QCI',50],['AURAS','WIWY',45],['AURAS','SMCI',55],
  ['AVC','FXC',45],['AVC','QCI',40],['AVC','SMCI',40],
  ['VRT','SMCI',55],['VRT','DELL',45],['VRT','HPE',40],

  /* Optical -> EMS / Hyperscalers */
  ['COHR','MSFT',35],['COHR','GOOGL',40],['COHR','META',45],['COHR','AMZN',35],
  ['ALAB','NVDA',55],['ALAB','AMD',40],['ALAB','SMCI',55],['ALAB','FXC',45],
  ['CRDO','MSFT',45],['CRDO','META',55],['CRDO','AMZN',40],

  /* EMS -> CSPs */
  ['FXC','MSFT',45],['FXC','META',55],['FXC','AMZN',40],['FXC','GOOGL',35],['FXC','ORCL',35],['FXC','TSLA',30],
  ['QCI','MSFT',45],['QCI','META',60],['QCI','GOOGL',55],['QCI','AMZN',40],['QCI','TSLA',45],
  ['WIWY','MSFT',75],['WIWY','META',80],['WIWY','AMZN',40],
  ['WSTRN','MSFT',45],['WSTRN','META',55],
  ['INVTC','GOOGL',55],['INVTC','MSFT',40],['INVTC','META',40],
  ['SMCI','MSFT',35],['SMCI','META',45],['SMCI','AMZN',30],['SMCI','TSLA',40],['SMCI','ORCL',45],
  ['DELL','ORCL',45],['DELL','MSFT',30],['DELL','TSLA',35],['DELL','META',30],
  ['HPE','MSFT',25],['HPE','GOOGL',25],

  /* Direct fabless -> CSP (custom silicon programs) */
  ['AVGO','GOOGL',65],['AVGO','META',45],
  ['MRVL','AMZN',60],['MRVL','GOOGL',30],
  ['NVDA','MSFT',35],['NVDA','META',40],['NVDA','GOOGL',25],['NVDA','AMZN',30],['NVDA','TSLA',35],['NVDA','ORCL',30],

  /* ============ EXTENDED TW SUPPLY CHAIN EDGES ============ */

  /* IP -> Fabless & ASIC service */
  ['EMEM','NVDA',35],['EMEM','AMD',30],['EMEM','MTK',45],['EMEM','GUC',55],['EMEM','ALCHIP',50],['EMEM','FARADAY',45],['EMEM','AVGO',25],['EMEM','MRVL',25],
  ['M31','MTK',35],['M31','GUC',45],['M31','ALCHIP',40],['M31','FARADAY',35],['M31','ASPEED',30],

  /* EDA -> ASIC service */
  ['SNPS','GUC',45],['SNPS','ALCHIP',50],['SNPS','FARADAY',40],
  ['CDNS','GUC',45],['CDNS','ALCHIP',45],['CDNS','FARADAY',40],
  ['ARM','GUC',35],['ARM','ALCHIP',45],['ARM','FARADAY',30],

  /* Foundry -> ASIC service & extended fabless */
  ['TSM','GUC',85],['TSM','ALCHIP',80],['TSM','ASPEED',60],['TSM','RTK',45],['TSM','NTK',40],
  ['UMC','FARADAY',50],['UMC','RTK',35],['UMC','NTK',45],['UMC','ASPEED',20],

  /* ASIC Service -> Hyperscalers */
  ['ALCHIP','AMZN',60],['ALCHIP','GOOGL',45],['ALCHIP','META',30],['ALCHIP','MSFT',25],
  ['GUC','AAPL',30],['GUC','AVGO',30],['GUC','GOOGL',25],
  ['FARADAY','MSFT',25],['FARADAY','AMZN',20],

  /* BMC / Networking IC -> EMS (every server has these) */
  ['ASPEED','FXC',75],['ASPEED','QCI',80],['ASPEED','WIWY',75],['ASPEED','WSTRN',65],['ASPEED','INVTC',55],['ASPEED','SMCI',80],['ASPEED','DELL',60],['ASPEED','HPE',55],
  ['RTK','FXC',40],['RTK','QCI',45],['RTK','GOOGL',30],['RTK','MSFT',25],
  ['NTK','AAPL',35],['NTK','FXC',25],

  /* CoWoS Equipment -> Foundry */
  ['GUDENG','ASML',55],['GUDENG','TSM',75],['GUDENG','INTC',25],['GUDENG','SSNLF',20],
  ['KYECTL','TSM',55],['KYECTL','SSNLF',30],
  ['SUNVI','TSM',60],['SUNVI','UMC',25],
  ['GALLANT','TSM',55],['GALLANT','UMC',25],

  /* Semi Equipment -> ASIC service via foundry chain (already covered) */

  /* CCL -> PCB / Substrate */
  ['EMC','UNIMI',55],['EMC','NANYA',45],['EMC','KINSU',40],['EMC','GCE',65],['EMC','TRIPOD',55],['EMC','CHINPOON',45],
  ['ITEQ','UNIMI',35],['ITEQ','NANYA',40],['ITEQ','GCE',50],['ITEQ','TRIPOD',45],['ITEQ','CHINPOON',40],

  /* PCB Equipment / AOI -> PCB makers */
  ['UTZ','UNIMI',50],['UTZ','NANYA',45],['UTZ','KINSU',40],['UTZ','GCE',55],['UTZ','TRIPOD',50],['UTZ','CHINPOON',45],
  ['CONTREL','UNIMI',35],['CONTREL','NANYA',40],['CONTREL','GCE',45],['CONTREL','TRIPOD',40],
  ['CHSHENG','UNIMI',30],['CHSHENG','GCE',40],['CHSHENG','TRIPOD',35],
  ['WANRUN','UNIMI',30],['WANRUN','GCE',35],['WANRUN','TRIPOD',30],

  /* Server PCB -> EMS (chips on boards into servers) */
  ['GCE','FXC',55],['GCE','QCI',60],['GCE','WIWY',55],['GCE','SMCI',50],['GCE','DELL',40],
  ['TRIPOD','FXC',45],['TRIPOD','QCI',50],['TRIPOD','WIWY',45],['TRIPOD','SMCI',35],
  ['CHINPOON','FXC',35],['CHINPOON','QCI',40],['CHINPOON','WSTRN',35],

  /* Server PCB -> Fabless (substrate-level partnerships) */
  ['GCE','NVDA',40],['TRIPOD','NVDA',35],

  /* Cooling -> EMS */
  ['HIPOW','FXC',55],['HIPOW','QCI',50],['HIPOW','WIWY',45],['HIPOW','SMCI',60],['HIPOW','DELTA',40],
  ['JENTECH','NVDA',55],['JENTECH','AMD',45],['JENTECH','AVGO',35],['JENTECH','MRVL',30],
  ['SUNON','FXC',50],['SUNON','QCI',45],['SUNON','WIWY',40],['SUNON','DELL',35],['SUNON','HPE',30],

  /* Server Mechanical -> EMS */
  ['CHENBRO','FXC',45],['CHENBRO','QCI',40],['CHENBRO','WIWY',40],['CHENBRO','SMCI',55],['CHENBRO','DELL',45],['CHENBRO','HPE',40],
  ['KSLIDE','FXC',55],['KSLIDE','QCI',60],['KSLIDE','WIWY',55],['KSLIDE','SMCI',65],['KSLIDE','DELL',55],['KSLIDE','HPE',45],
  ['LOTES','NVDA',55],['LOTES','AMD',45],['LOTES','FXC',55],['LOTES','QCI',60],['LOTES','SMCI',65],['LOTES','WIWY',50],

  /* Optical extended */
  ['SHPHEN','COHR',45],['SHPHEN','LUMENS',35],['SHPHEN','GOOGL',30],
  ['LUMENS','COHR',40],['LUMENS','ALAB',30],['LUMENS','MSFT',25],
  ['BROWAVE','COHR',35],['BROWAVE','META',25],

  /* Fab Facility -> Foundry */
  ['HCG','TSM',65],['HCG','UMC',25],['HCG','INTC',15],
  ['MIC','TSM',55],['MIC','UMC',20],
  ['ACTER','TSM',45],['ACTER','UMC',15],
];

/* ---------- THEMES (subtopic filters) ---------- */
const THEMES = {
  all: {
    label: '全鏈',
    sub: 'ALL',
    color: '#FF8C00',
    members: null, // null = include everything
  },
  cowos: {
    label: 'CoWoS 先進封裝',
    sub: 'ADV PKG',
    color: '#FFD700',
    members: new Set([
      'TSM','ASX','PTI','AMKR',
      'GUDENG','KYECTL','SUNVI','GALLANT',
      'ASML','AMAT','LRCX','KLAC','TEL',
      'UNIMI','NANYA','KINSU','IBIDN','EMC','ITEQ',
      'NVDA','AMD','AVGO','MRVL',
      'HCG','MIC','ACTER',
    ]),
  },
  cooling: {
    label: '液冷散熱',
    sub: 'COOLING',
    color: '#00D9FF',
    members: new Set([
      'AURAS','AVC','HIPOW','JENTECH','SUNON','DELTA','LITEO','VRT',
      'FXC','QCI','WIWY','WSTRN','INVTC','SMCI','DELL','HPE',
      'NVDA','AMD',
      'MSFT','META','AMZN','GOOGL','ORCL','TSLA',
    ]),
  },
  pcb: {
    label: 'PCB / CCL / 設備',
    sub: 'PCB',
    color: '#A855F7',
    members: new Set([
      'UNIMI','NANYA','KINSU','IBIDN',
      'EMC','ITEQ','GCE','TRIPOD','CHINPOON',
      'UTZ','CONTREL','CHSHENG','WANRUN',
      'NVDA','AMD','AVGO','MRVL',
      'FXC','QCI','WIWY','SMCI','DELL','HPE',
    ]),
  },
  asic: {
    label: 'ASIC 客製矽',
    sub: 'ASIC',
    color: '#10B981',
    members: new Set([
      'GUC','ALCHIP','FARADAY',
      'AVGO','MRVL',
      'TSM','ASX','PTI',
      'SNPS','CDNS','ARM',
      'EMEM','M31',
      'MU','HYNIX',
      'AAPL','GOOGL','AMZN','META','MSFT','TSLA','ORCL',
    ]),
  },
  hbm: {
    label: 'HBM 記憶體',
    sub: 'HBM',
    color: '#EC4899',
    members: new Set([
      'MU','HYNIX','SSNMM','NTC','WBOND',
      'PTI','ASX','AMKR',
      'AMAT','LRCX','KLAC','TEL','ASML',
      'NVDA','AMD','AVGO',
      'PSON','SIMO','ADATA','APCR','TSCD',
      'TSM',
    ]),
  },
  server: {
    label: '伺服器 ODM',
    sub: 'SERVER',
    color: '#F59E0B',
    members: new Set([
      'FXC','QCI','WIWY','WSTRN','INVTC','SMCI','DELL','HPE',
      'CHENBRO','KSLIDE','LOTES',
      'ASPEED','RTK',
      'DELTA','AURAS','AVC','HIPOW','JENTECH','SUNON','LITEO','VRT',
      'GCE','TRIPOD','CHINPOON','EMC','ITEQ',
      'PSON','SIMO','ADATA','APCR','TSCD','MU','HYNIX',
      'COHR','ALAB','CRDO','SHPHEN','LUMENS','BROWAVE',
      'NVDA','AMD','AVGO','MRVL',
      'MSFT','META','AMZN','GOOGL','ORCL','TSLA',
    ]),
  },
};

/* ---------- LAYOUT ---------- */
/* We do a column-based layout. Each cluster is a column, companies stack vertically. */
const VIEW_W = 1840;
const VIEW_H = 1080;
const COL_W = 200;
const COL_GAP = 36;
const NODE_W = 176;
const NODE_H = 64;
const NODE_GAP = 12;
const HEADER_H = 32;

function buildLayout(themeMembers /* Set|null */) {
  /* ---------- Step 1. Group ---------- */
  const byCluster = {};
  const allIds = Object.keys(COMPANIES).filter(id => !themeMembers || themeMembers.has(id));
  for (const id of allIds) {
    (byCluster[COMPANIES[id].cluster] ||= []).push(id);
  }
  // initial sort by market cap (stable starting point)
  for (const k of Object.keys(byCluster)) {
    byCluster[k].sort((a, b) => COMPANIES[b].mcap - COMPANIES[a].mcap);
  }

  /* ---------- Step 2. Tier / column geometry ----------
     Only include clusters that have ≥1 visible node. This collapses
     empty columns when a theme is selected. */
  const visibleClusters = CLUSTERS.filter(cl => (byCluster[cl.id] || []).length > 0);
  const tierGroups = {};
  for (const cl of visibleClusters) (tierGroups[cl.tier] ||= []).push(cl);
  const tiers = Object.keys(tierGroups).map(Number).sort((a, b) => a - b);
  const startX = 24;
  const colXByTier = {};
  tiers.forEach((t, i) => { colXByTier[t] = startX + i * (COL_W + COL_GAP); });

  /* ---------- Step 3. Layout computation ---------- */
  function recomputePositions() {
    const clusterPos = {};
    const nodePos = {};
    for (const tier of tiers) {
      const cls = tierGroups[tier];
      const x = colXByTier[tier];
      let y = 70;
      for (const cl of cls) {
        const ids = byCluster[cl.id] || [];
        const bodyH = ids.length * NODE_H + Math.max(0, ids.length - 1) * NODE_GAP + 14;
        const h = HEADER_H + bodyH;
        clusterPos[cl.id] = {
          x, y, w: COL_W, h, label: cl.label, tier, icon: cl.icon, count: ids.length,
        };
        ids.forEach((id, i) => {
          nodePos[id] = {
            x: x + (COL_W - NODE_W) / 2,
            y: y + HEADER_H + 6 + i * (NODE_H + NODE_GAP),
            w: NODE_W,
            h: NODE_H,
            clusterId: cl.id,
          };
        });
        y += h + 28;
      }
    }
    return { clusterPos, nodePos };
  }

  /* ---------- Step 4. Barycenter sweep — minimize edge crossings ----------
     For each cluster, sort its nodes by the average y-position of their
     connected neighbors. Repeat several passes for stability. */
  const adj = {};
  for (const [a, b] of EDGES) {
    (adj[a] ||= []).push(b);
    (adj[b] ||= []).push(a);
  }

  let { clusterPos, nodePos } = recomputePositions();

  const SWEEPS = 8;
  for (let pass = 0; pass < SWEEPS; pass++) {
    // alternate direction each pass for better convergence
    const tierOrder = pass % 2 === 0 ? tiers : [...tiers].reverse();
    for (const tier of tierOrder) {
      const cls = tierGroups[tier];
      for (const cl of cls) {
        const ids = byCluster[cl.id];
        if (!ids || ids.length < 2) continue;
        const bary = {};
        for (const id of ids) {
          const neighbors = (adj[id] || []).filter(n => nodePos[n]);
          if (neighbors.length === 0) {
            bary[id] = nodePos[id].y;
          } else {
            const sum = neighbors.reduce((s, n) => s + (nodePos[n].y + NODE_H / 2), 0);
            bary[id] = sum / neighbors.length;
          }
        }
        // stable sort: bary first, mcap as tiebreaker
        ids.sort((a, b) => {
          const d = bary[a] - bary[b];
          if (Math.abs(d) > 0.5) return d;
          return COMPANIES[b].mcap - COMPANIES[a].mcap;
        });
      }
    }
    ({ clusterPos, nodePos } = recomputePositions());
  }

  /* ---------- Step 5. Reorder clusters within a tier ----------
     Place clusters in vertical positions that minimize cross-tier travel.
     Use barycenter of all member nodes' connected neighbors. */
  for (const tier of tiers) {
    const cls = tierGroups[tier];
    if (cls.length < 2) continue;
    const clBary = {};
    for (const cl of cls) {
      const ids = byCluster[cl.id] || [];
      const vals = [];
      for (const id of ids) {
        for (const n of (adj[id] || [])) {
          if (nodePos[n]) vals.push(nodePos[n].y);
        }
      }
      clBary[cl.id] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    }
    cls.sort((a, b) => clBary[a.id] - clBary[b.id]);
  }
  ({ clusterPos, nodePos } = recomputePositions());

  // One final node-level barycenter sweep after cluster reorder
  for (let pass = 0; pass < 3; pass++) {
    for (const tier of tiers) {
      for (const cl of tierGroups[tier]) {
        const ids = byCluster[cl.id];
        if (!ids || ids.length < 2) continue;
        const bary = {};
        for (const id of ids) {
          const neighbors = (adj[id] || []).filter(n => nodePos[n]);
          bary[id] = neighbors.length
            ? neighbors.reduce((s, n) => s + (nodePos[n].y + NODE_H / 2), 0) / neighbors.length
            : nodePos[id].y;
        }
        ids.sort((a, b) => bary[a] - bary[b]);
      }
    }
    ({ clusterPos, nodePos } = recomputePositions());
  }

  /* ---------- Step 6. Vertical centering of short tiers ----------
     Make each tier's total content height visually centered against the
     tallest tier, so 3-node columns don't float at the top. */
  const tierHeights = {};
  for (const tier of tiers) {
    const cls = tierGroups[tier];
    let h = 0;
    for (const cl of cls) h += clusterPos[cl.id].h;
    h += Math.max(0, cls.length - 1) * 28;
    tierHeights[tier] = h;
  }
  const maxTierH = Math.max(...Object.values(tierHeights));

  for (const tier of tiers) {
    const offset = Math.floor((maxTierH - tierHeights[tier]) / 2);
    if (offset <= 0) continue;
    const cls = tierGroups[tier];
    for (const cl of cls) {
      clusterPos[cl.id].y += offset;
      for (const id of (byCluster[cl.id] || [])) {
        nodePos[id].y += offset;
      }
    }
  }

  /* ---------- Step 7. Pre-compute edge geometry ----------
     Bezier path string + label position calculated once per layout.
     This avoids recomputation inside every Edge render. */
  const edgeGeo = EDGES.map(([a, b, v], i) => {
    const from = nodePos[a], to = nodePos[b];
    if (!from || !to) return null;
    const x1 = from.x + from.w, y1 = from.y + from.h / 2;
    const x2 = to.x,            y2 = to.y + to.h / 2;
    const dx = Math.max(40, (x2 - x1) * 0.45);
    return {
      i, a, b, v,
      d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      cx: (x1 + x2) / 2,
      cy: (y1 + y2) / 2,
    };
  }).filter(Boolean);

  return { clusterPos, nodePos, byCluster, edgeGeo };
}

/* ---------- HELPERS ---------- */
const fmtMcap = (b) => {
  if (b >= 1000) return `$${(b/1000).toFixed(2)}T`;
  if (b >= 1)    return `$${b.toFixed(b < 10 ? 2 : 0)}B`;
  return `$${(b*1000).toFixed(0)}M`;
};
const aiBarColor = (pct) => pct >= 70 ? C.green : pct >= 40 ? C.amber : C.grey;

/* ============================================================
   SUB-COMPONENTS
   ============================================================ */

function ClusterHeader({ pos }) {
  return (
    <g>
      <rect x={pos.x} y={pos.y} width={pos.w} height={HEADER_H}
            fill={C.orange} stroke="#000" strokeWidth="0" />
      <text x={pos.x + 10} y={pos.y + HEADER_H/2 + 4}
            fontFamily="'JetBrains Mono', ui-monospace, monospace"
            fontSize="11" fontWeight="700" fill="#000" letterSpacing="0.6">
        {pos.label.toUpperCase()}
      </text>
      <text x={pos.x + pos.w - 10} y={pos.y + HEADER_H/2 + 4}
            textAnchor="end"
            fontFamily="'JetBrains Mono', ui-monospace, monospace"
            fontSize="10" fontWeight="700" fill="#000" opacity="0.7">
        {pos.count}
      </text>
    </g>
  );
}

function ClusterBox({ pos }) {
  return (
    <rect x={pos.x} y={pos.y + HEADER_H} width={pos.w} height={pos.h - HEADER_H}
          fill={C.bg2} stroke={C.border} strokeWidth="1" />
  );
}

const CompanyNode = React.memo(function CompanyNode({ id, pos, isSelected, isHovered, isDimmed, relationKind, onClick, onHover, onLeave }) {
  const co = COMPANIES[id];
  const country = COUNTRY[co.country];
  const cnName = cnOf(id);
  const useChinese = co.country === 'TW' || co.country === 'US' || CN_NAMES[id];

  // border color: relation kind highlights
  let stroke = C.borderHi;
  let borderW = 1;
  if (isSelected) { stroke = C.orange; borderW = 2; }
  else if (relationKind === 'supplier') { stroke = C.red; borderW = 1.5; }
  else if (relationKind === 'customer') { stroke = C.green; borderW = 1.5; }
  else if (relationKind === 'peer') { stroke = C.grey; borderW = 1.5; }
  else if (isHovered) { stroke = C.amber; borderW = 1.5; }

  const opacity = isDimmed ? 0.22 : 1;
  const isTW = co.country === 'TW';
  const isUS = co.country === 'US';

  // pick display name: Chinese for TW/US (and any company with a CN entry), otherwise English
  const displayName = useChinese ? cnName : co.name;
  const displayNameTrim = displayName.length > 14 ? displayName.slice(0, 13) + '…' : displayName;

  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      style={{ cursor: 'pointer', opacity, transition: 'opacity 0.15s' }}
      onClick={(e) => { e.stopPropagation(); onClick(id); }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={onLeave}
    >
      {/* selection glow */}
      {isSelected && (
        <rect x={-3} y={-3} width={NODE_W+6} height={NODE_H+6} rx="1"
              fill="none" stroke={C.orange} strokeWidth="1" opacity="0.4" />
      )}
      <rect width={NODE_W} height={NODE_H} fill={C.bg3} stroke={stroke} strokeWidth={borderW} />
      {/* country accent strip on left */}
      <rect width="3" height={NODE_H} fill={country.color} opacity="0.9" />

      {/* TOP ROW: ticker (left) + country tag (right) */}
      <text x="10" y="16"
            fontFamily="'JetBrains Mono', ui-monospace, monospace"
            fontSize="11" fontWeight="700" fill={isSelected ? C.orange : C.white}
            letterSpacing="0.5">
        {co.ticker}
      </text>
      <text x={NODE_W - 10} y="16" textAnchor="end"
            fontFamily="'JetBrains Mono', ui-monospace, monospace"
            fontSize="9" fontWeight="700" fill={country.color} letterSpacing="0.6">
        {country.label}{(isTW || isUS) ? ' ★' : ''}
      </text>

      {/* MAIN: Chinese / display name — larger, prominent */}
      <text x="10" y="36"
            fontFamily="'Noto Sans TC','PingFang TC','Microsoft JhengHei','Heiti TC','JetBrains Mono',sans-serif"
            fontSize="14" fontWeight="700" fill={isSelected ? C.orange : C.white}
            letterSpacing="0.5">
        {displayNameTrim}
      </text>

      {/* BOTTOM ROW: mcap + AI exposure mini bar */}
      <text x="10" y="55"
            fontFamily="'JetBrains Mono', ui-monospace, monospace"
            fontSize="10" fontWeight="600" fill={C.amber}>
        {fmtMcap(co.mcap)}
      </text>
      <g transform={`translate(${NODE_W - 56}, 47)`}>
        <text x="0" y="0"
              fontFamily="'JetBrains Mono', ui-monospace, monospace"
              fontSize="7" fill={C.grey}>AI</text>
        <rect x="14" y="-5" width="40" height="6" fill="#222" />
        <rect x="14" y="-5" width={40 * (co.aiExp/100)} height="6" fill={aiBarColor(co.aiExp)} />
        <text x="14" y="8"
              fontFamily="'JetBrains Mono', ui-monospace, monospace"
              fontSize="7" fontWeight="700" fill={aiBarColor(co.aiExp)}>{co.aiExp}%</text>
      </g>
    </g>
  );
});

/* Edge — uses precomputed bezier path (d), cx, cy from layout.
   Wrapped in React.memo so unrelated edges skip re-rendering on hover. */
const Edge = React.memo(function Edge({ d, cx, cy, value, kind, dimmed, highlighted, showLabel }) {
  let color = C.orange;
  if (kind === 'supplier')      color = C.red;
  else if (kind === 'customer') color = C.green;

  let opacity = highlighted ? 0.95 : 0.10;
  if (dimmed) opacity = 0.02;
  const strokeWidth = highlighted ? Math.max(1.2, value / 35) : 1;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} opacity={opacity} />
      {showLabel && highlighted && (
        <g>
          <rect
            x={cx - 14} y={cy - 8}
            width="28" height="14" rx="1"
            fill="#000" stroke={color} strokeWidth="0.8" opacity="0.95"
          />
          <text x={cx} y={cy + 3} textAnchor="middle"
                fontFamily="'JetBrains Mono', ui-monospace, monospace"
                fontSize="8" fontWeight="700" fill={color}>
            {value}%
          </text>
        </g>
      )}
    </g>
  );
});

/* Detail panel */
function DetailPanel({ id, onClose, onSelect, edgesIndex }) {
  if (!id) return null;
  const co = COMPANIES[id];
  const country = COUNTRY[co.country];
  const suppliers = edgesIndex.suppliers[id] || [];
  const customers = edgesIndex.customers[id] || [];
  const peers = Object.keys(COMPANIES).filter(k => k !== id && COMPANIES[k].cluster === co.cluster);

  return (
    <div
      className="absolute top-0 right-0 h-full z-30"
      style={{
        width: 400,
        background: '#000',
        borderLeft: `1px solid ${C.orange}`,
        boxShadow: '-12px 0 40px rgba(255,140,0,0.08)',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        color: C.white,
      }}
    >
      {/* header bar */}
      <div
        className="flex items-center justify-between px-4"
        style={{ height: 44, background: C.orange, color: '#000' }}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-wide text-[12px]">公司詳情 / SECURITY DETAIL</span>
          <span className="text-[10px] opacity-70">// SPLC</span>
        </div>
        <button onClick={onClose} className="hover:opacity-70" aria-label="Close">
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>

      <div className="overflow-y-auto" style={{ height: 'calc(100% - 44px)' }}>
        {/* identity block */}
        <div className="px-4 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-baseline justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <div
                  className="text-[22px] font-bold tracking-wider truncate"
                  style={{
                    color: C.white,
                    fontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif"
                  }}
                >
                  {cnOf(id)}
                </div>
                <div className="text-[13px] font-bold" style={{ color: C.orange }}>
                  {co.ticker}
                </div>
              </div>
              <div className="text-[11px] text-neutral-400 mt-1">{co.name}</div>
            </div>
            <div className="text-right shrink-0 ml-2">
              <div className="text-[10px]" style={{ color: country.color }}>
                {country.flag} {country.label}
              </div>
              <div className="text-[9px] text-neutral-500 mt-0.5 uppercase">{co.cluster}</div>
            </div>
          </div>
        </div>

        {/* key stats grid */}
        <div className="grid grid-cols-2 gap-px" style={{ background: C.border }}>
          <Stat label="市值 / MKT CAP"  value={fmtMcap(co.mcap)} highlight />
          <Stat label="AI 營收佔比"   value={`${co.aiExp}%`} color={aiBarColor(co.aiExp)} highlight />
          <Stat label="產業 / CLUSTER" value={co.cluster.toUpperCase()} />
          <Stat label="地區 / REGION"  value={`${country.flag} ${country.label}`} />
        </div>

        {/* business description */}
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="text-[9px] uppercase tracking-widest" style={{ color: C.orange }}>// 業務說明 BUSINESS</div>
          <div className="text-[11px] text-neutral-300 mt-2 leading-relaxed font-sans">
            {co.role}
          </div>
        </div>

        {/* AI exposure bar */}
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between">
            <div className="text-[9px] uppercase tracking-widest" style={{ color: C.orange }}>// AI 營收曝險</div>
            <div className="text-[11px] font-bold" style={{ color: aiBarColor(co.aiExp) }}>{co.aiExp}%</div>
          </div>
          <div className="h-2 mt-2" style={{ background: '#1a1a1a' }}>
            <div className="h-full" style={{ width: `${co.aiExp}%`, background: aiBarColor(co.aiExp) }} />
          </div>
          <div className="flex justify-between mt-1 text-[8px] text-neutral-600">
            <span>0%</span><span>50%</span><span>100%</span>
          </div>
        </div>

        {/* suppliers (red) */}
        <RelList
          title="上游供應商 / SUPPLIERS"
          color={C.red}
          icon={<TrendingUp size={11} />}
          items={suppliers}
          onSelect={onSelect}
        />

        {/* customers (green) */}
        <RelList
          title="下游客戶 / CUSTOMERS"
          color={C.green}
          icon={<TrendingDown size={11} />}
          items={customers}
          onSelect={onSelect}
        />

        {/* peers (grey) */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[9px] uppercase tracking-widest" style={{ color: C.grey }}>
              // 同業 / PEERS
            </div>
            <div className="text-[10px] text-neutral-500">{peers.length}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {peers.map(p => (
              <button
                key={p}
                onClick={() => onSelect(p)}
                className="px-2 py-1 text-[10px] hover:bg-neutral-800 transition flex items-center gap-1.5"
                style={{ background: '#0a0a0a', border: `1px solid ${C.border}`, color: C.greyLi }}
              >
                <span style={{ color: COUNTRY[COMPANIES[p].country].color }}>
                  {COUNTRY[COMPANIES[p].country].label}
                </span>
                <span className="text-white font-bold">{COMPANIES[p].ticker}</span>
                <span style={{ fontFamily: "'Noto Sans TC','PingFang TC',sans-serif" }}>
                  {cnOf(p)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 text-[9px] text-neutral-600" style={{ borderTop: `1px solid ${C.border}` }}>
          資料為示意用途，非投資建議 · Data illustrative only — not investment advice.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight, color }) {
  return (
    <div className="px-3 py-2.5" style={{ background: C.bg }}>
      <div className="text-[8px] uppercase tracking-widest text-neutral-500">{label}</div>
      <div
        className="text-[13px] mt-1 font-bold"
        style={{ color: color || (highlight ? C.amber : C.white) }}
      >
        {value}
      </div>
    </div>
  );
}

function RelList({ title, color, icon, items, onSelect }) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest" style={{ color }}>
          {icon} {title}
        </div>
        <div className="text-[10px] text-neutral-500">{items.length}</div>
      </div>
      {items.length === 0 ? (
        <div className="text-[10px] text-neutral-600 italic py-2">No connections in dataset.</div>
      ) : (
        <div className="space-y-1">
          {items
            .slice()
            .sort((a, b) => b.value - a.value)
            .map(({ id, value }) => {
              const c = COMPANIES[id];
              if (!c) return null;
              return (
                <button
                  key={id}
                  onClick={() => onSelect(id)}
                  className="w-full flex items-center justify-between px-2 py-1.5 group hover:bg-neutral-900 transition"
                  style={{ background: '#080808', border: `1px solid ${C.border}` }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-[9px] px-1.5 py-0.5"
                      style={{ background: COUNTRY[c.country].color + '33', color: COUNTRY[c.country].color }}
                    >
                      {COUNTRY[c.country].label}
                    </span>
                    <span className="text-[11px] font-bold text-white">{c.ticker}</span>
                    <span
                      className="text-[11px] truncate"
                      style={{
                        color: C.greyLi,
                        fontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif"
                      }}
                    >
                      {cnOf(id)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-12 h-1" style={{ background: '#1a1a1a' }}>
                      <div className="h-full" style={{ width: `${value}%`, background: color }} />
                    </div>
                    <span className="text-[10px] font-bold" style={{ color }}>{value}%</span>
                  </div>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ISOLATED SUB-COMPONENTS (own re-render lifecycle)
   ============================================================ */

/* Clock: ticks every second WITHOUT re-rendering the rest of the tree. */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{now.toISOString().slice(11, 19)} UTC</span>;
}

/* Ticker: 100 spans generated once, memoized so it never re-renders. */
const Ticker = React.memo(function Ticker() {
  const data = useMemo(() => {
    return Object.values(COMPANIES).map(c => ({
      ticker: c.ticker,
      country: c.country,
      positive: Math.random() > 0.4,
      pct: (Math.random() * 4).toFixed(2),
    }));
  }, []);

  return (
    <div className="ticker whitespace-nowrap py-1 text-[11px]" style={{ width: 'max-content' }}>
      {[...Array(2)].map((_, k) =>
        data.map((t, i) => (
          <span key={k+'-'+t.ticker+'-'+i} className="inline-flex items-center gap-1 mr-6">
            <span style={{ color: COUNTRY[t.country].color }}>{COUNTRY[t.country].label}</span>
            <span className="text-white font-bold">{t.ticker}</span>
            <span style={{ color: t.positive ? C.green : C.red }}>
              {t.positive ? '▲' : '▼'} {t.pct}%
            </span>
          </span>
        ))
      )}
    </div>
  );
});

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function SupplyChainMap() {
  const [selectedId, setSelectedId] = useState('NVDA');   // Detail panel open by default on NVDA
  const [hoverId, setHoverId] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const [filter, setFilter] = useState('');
  const [zoom, setZoom] = useState(0.55);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('all');
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef(null);

  // Build layout — depends on the active theme so we get a tight layout per subtopic
  const layout = useMemo(
    () => buildLayout(THEMES[currentTheme].members),
    [currentTheme]
  );

  // Reset pan when theme changes so the new layout fits the viewport.
  // Also: if the currently-selected node isn't in the new theme, fall back
  // to the highest-mcap visible node (so the detail panel stays meaningful).
  const selectedIdRef = useRef(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    const sid = selectedIdRef.current;
    if (sid && !layout.nodePos[sid]) {
      const visibleIds = Object.keys(COMPANIES).filter(id => layout.nodePos[id]);
      if (visibleIds.length) {
        visibleIds.sort((a, b) => COMPANIES[b].mcap - COMPANIES[a].mcap);
        setSelectedId(visibleIds[0]);
      }
    }
  }, [currentTheme, layout]);

  // Build edge index: per-company suppliers and customers
  const edgesIndex = useMemo(() => {
    const suppliers = {};  // for each company, who supplies it
    const customers = {};  // for each company, who it supplies (customers)
    for (const [a, b, v] of EDGES) {
      (customers[a] ||= []).push({ id: b, value: v });
      (suppliers[b] ||= []).push({ id: a, value: v });
    }
    return { suppliers, customers };
  }, []);

  // Active company for highlights = hover ?? selected
  const activeId = hoverId || selectedId;

  // Determine highlighted edges + connected nodes
  const { highlightedEdges, relatedNodes } = useMemo(() => {
    const he = new Set();
    const related = new Map(); // id -> 'supplier' | 'customer'
    if (activeId) {
      EDGES.forEach((e, i) => {
        const [a, b] = e;
        if (a === activeId) { he.add(i); related.set(b, 'customer'); }
        else if (b === activeId) { he.add(i); related.set(a, 'supplier'); }
      });
    }
    return { highlightedEdges: he, relatedNodes: related };
  }, [activeId]);

  // Filter (search) — match across ticker, English name, Chinese name, country, cluster.
  // Also constrained to companies visible under the active theme.
  const matchedIds = useMemo(() => {
    if (!filter.trim()) return null;
    const f = filter.toLowerCase().trim();
    const themeMembers = THEMES[currentTheme].members;
    return new Set(
      Object.keys(COMPANIES).filter(id => {
        if (themeMembers && !themeMembers.has(id)) return false;
        const c = COMPANIES[id];
        const cn = (CN_NAMES[id] || '').toLowerCase();
        return c.ticker.toLowerCase().includes(f)
          || c.name.toLowerCase().includes(f)
          || cn.includes(f)
          || c.country.toLowerCase().includes(f)
          || c.cluster.toLowerCase().includes(f);
      })
    );
  }, [filter, currentTheme]);

  // Ranked search suggestions (top 8) for the dropdown
  const searchSuggestions = useMemo(() => {
    if (!filter.trim()) return [];
    const f = filter.toLowerCase().trim();
    const score = (id) => {
      const c = COMPANIES[id];
      const cn = CN_NAMES[id] || '';
      // higher score = better match
      if (c.ticker.toLowerCase() === f) return 100;
      if (cn === filter.trim())          return 95;
      if (c.ticker.toLowerCase().startsWith(f)) return 80;
      if (cn.startsWith(filter.trim()))   return 78;
      if (c.name.toLowerCase().startsWith(f)) return 70;
      if (c.ticker.toLowerCase().includes(f)) return 50;
      if (cn.includes(filter.trim()))   return 48;
      if (c.name.toLowerCase().includes(f)) return 40;
      if (c.cluster.toLowerCase().includes(f)) return 20;
      if (c.country.toLowerCase().includes(f)) return 10;
      return 0;
    };
    return (matchedIds ? [...matchedIds] : [])
      .map(id => ({ id, s: score(id) }))
      .sort((a, b) => b.s - a.s || (COMPANIES[b.id].mcap - COMPANIES[a.id].mcap))
      .slice(0, 8)
      .map(({ id }) => id);
  }, [filter, matchedIds]);

  const [showSuggest, setShowSuggest] = useState(false);

  // Static layout dimensions — memoized so they're computed once
  const { totalW, totalH } = useMemo(() => {
    const tiers = [...new Set(CLUSTERS.map(c => c.tier))].sort((a, b) => a - b);
    const w = 24 + tiers.length * (COL_W + COL_GAP);
    const h = 80 + Math.max(...Object.values(layout.clusterPos).map(p => p.y + p.h));
    return { totalW: w, totalH: h };
  }, [layout]);

  /* ---- Pan/zoom handlers ----
     CRITICAL PERF: during drag, we bypass React entirely and write
     transform directly to the inner div via ref. Only on mouseup do we
     commit the final pan to state. This avoids 60 re-renders/sec. */
  const innerRef = useRef(null);
  const panRef = useRef({ x: 0, y: 0 });
  // keep panRef in sync with state pan whenever state changes externally (reset, focus, etc)
  useEffect(() => { panRef.current = pan; }, [pan]);

  const onCanvasMouseDown = (e) => {
    const tag = e.target.tagName;
    if (tag === 'svg' || tag === 'DIV' || e.target.getAttribute('data-backdrop') === '1') {
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
      e.preventDefault();
    }
  };
  const onMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const nx = dragStart.current.panX + (e.clientX - dragStart.current.x);
    const ny = dragStart.current.panY + (e.clientY - dragStart.current.y);
    panRef.current = { x: nx, y: ny };
    // direct DOM write — bypasses React reconciliation entirely
    if (innerRef.current) {
      innerRef.current.style.transform = `translate3d(${nx}px, ${ny}px, 0) scale(${zoom})`;
    }
  }, [isDragging, zoom]);
  const onMouseUp = useCallback(() => {
    setIsDragging(false);
    // commit final pan into React state so other subscribers see it
    setPan(panRef.current);
  }, []);
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
    }
  }, [isDragging, onMouseMove, onMouseUp]);

  const resetView = () => { setZoom(0.55); setPan({ x: 0, y: 0 }); };

  /* Stable event handlers — useCallback so React.memo on CompanyNode actually holds */
  const handleNodeClick = useCallback((cid) => setSelectedId(cid), []);
  const handleNodeHover = useCallback((id) => setHoverId(id), []);
  const handleNodeLeave = useCallback(() => setHoverId(null), []);

  /* ---- Focus on a specific node — pan & zoom to center it ---- */
  const focusOnNode = useCallback((id) => {
    const pos = layout.nodePos[id];
    const el = containerRef.current;
    if (!pos || !el) return;
    const rect = el.getBoundingClientRect();
    // detail panel takes 400px on the right — center the node in the remaining area
    const panelW = 400;
    const availW = Math.max(300, rect.width - panelW);
    const targetX = availW / 2;
    const targetY = rect.height / 2;
    const newZoom = 0.95;
    const nodeCenterX = (pos.x + pos.w / 2) * newZoom;
    const nodeCenterY = (pos.y + pos.h / 2) * newZoom;
    setZoom(newZoom);
    setPan({ x: targetX - nodeCenterX, y: targetY - nodeCenterY });
    setSelectedId(id);
    setShowSuggest(false);
  }, [layout]);

  // Wheel zoom — zoom toward the cursor position
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = -e.deltaY * 0.0015;
    setZoom(prev => {
      const next = Math.max(0.25, Math.min(2.2, prev * (1 + delta)));
      // Anchor zoom to cursor: adjust pan so the point under the cursor stays under the cursor.
      const scaleChange = next / prev;
      setPan(p => ({
        x: mouseX - (mouseX - p.x) * scaleChange,
        y: mouseY - (mouseY - p.y) * scaleChange,
      }));
      return next;
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return (
    <div
      className="w-full h-screen flex flex-col"
      style={{
        background: '#000',
        color: C.white,
        fontFamily: "'JetBrains Mono', ui-monospace, 'Menlo', 'Monaco', 'Courier New', monospace",
      }}
    >

      {/* ============== TOP BAR ============== */}
      <div
        className="flex items-center px-4"
        style={{ height: 36, background: C.orange, color: '#000', borderBottom: '1px solid #000' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-black blink" />
          <span className="text-[13px] font-bold tracking-widest">SPLC&nbsp;//&nbsp;AI 供應鏈地圖</span>
          <span className="text-[10px] opacity-70 ml-2">v2.6 — 台美聯動 TW↔US</span>
        </div>
        <div className="ml-6 flex items-center gap-3 text-[10px] font-semibold">
          <span className="px-2 py-0.5 bg-black/30">產業 / 半導體</span>
          <span className="px-2 py-0.5 bg-black/30">主題 / AI 基建</span>
          <span className="px-2 py-0.5 bg-black/30">節點 {Object.keys(COMPANIES).length}</span>
          <span className="px-2 py-0.5 bg-black/30">關係 {EDGES.length}</span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[11px] font-bold">
          <Clock />
        </div>
      </div>

      {/* ============== TICKER ROW ============== */}
      <div
        className="overflow-hidden"
        style={{ height: 26, background: '#080808', borderBottom: `1px solid ${C.border}` }}
      >
        <Ticker />
      </div>

      {/* ============== TOOLBAR ============== */}
      <div
        className="flex items-center px-3 gap-3 relative"
        style={{ height: 44, background: '#050505', borderBottom: `1px solid ${C.border}` }}
      >
        {/* SEARCH — with auto-complete dropdown */}
        <div className="relative flex-1 max-w-md">
          <div
            className="flex items-center gap-2 px-2"
            style={{
              height: 30,
              background: '#0a0a0a',
              border: `1px solid ${showSuggest && searchSuggestions.length ? C.orange : C.border}`,
              transition: 'border-color 0.15s',
            }}
          >
            <Search size={14} color={C.orange} />
            <input
              value={filter}
              onChange={(e) => { setFilter(e.target.value); setShowSuggest(true); }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 180)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchSuggestions.length > 0) {
                  focusOnNode(searchSuggestions[0]);
                  setFilter('');
                } else if (e.key === 'Escape') {
                  setFilter('');
                  setShowSuggest(false);
                  e.currentTarget.blur();
                }
              }}
              placeholder="搜尋台美廠商 · 代號 / 中文名 / 英文名 (Enter 跳轉)"
              className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-neutral-700"
              style={{
                color: C.white,
                letterSpacing: '0.3px',
                fontFamily: "'JetBrains Mono','Noto Sans TC',sans-serif"
              }}
            />
            {filter && (
              <button onClick={() => { setFilter(''); setShowSuggest(false); }}
                      className="text-neutral-600 hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Suggestions dropdown */}
          {showSuggest && filter.trim() && searchSuggestions.length > 0 && (
            <div
              className="absolute left-0 right-0 top-full z-40 mt-1"
              style={{ background: '#000', border: `1px solid ${C.orange}`, boxShadow: '0 8px 24px rgba(0,0,0,0.9)' }}
            >
              <div className="px-2 py-1 text-[9px] uppercase tracking-widest"
                   style={{ color: C.orange, borderBottom: `1px solid ${C.border}` }}>
                {searchSuggestions.length} 筆結果 · 點擊跳轉
              </div>
              {searchSuggestions.map((id, i) => {
                const c = COMPANIES[id];
                const cn = cnOf(id);
                return (
                  <button
                    key={id}
                    onMouseDown={(e) => { e.preventDefault(); focusOnNode(id); setFilter(''); }}
                    className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-neutral-900 transition group"
                    style={{
                      borderBottom: i < searchSuggestions.length - 1 ? `1px solid ${C.border}` : 'none',
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="text-[9px] px-1.5 py-0.5 font-bold shrink-0"
                        style={{
                          background: COUNTRY[c.country].color + '33',
                          color: COUNTRY[c.country].color,
                        }}
                      >
                        {COUNTRY[c.country].label}
                      </span>
                      <span className="text-[12px] font-bold text-white shrink-0"
                            style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                        {c.ticker}
                      </span>
                      <span className="text-[12px] truncate"
                            style={{
                              color: C.amber,
                              fontFamily: "'Noto Sans TC','PingFang TC',sans-serif"
                            }}>
                        {cn}
                      </span>
                      <span className="text-[10px] text-neutral-500 truncate hidden sm:inline">
                        {c.name}
                      </span>
                    </div>
                    <span className="text-[9px] text-neutral-600 shrink-0 ml-2 uppercase">
                      {c.cluster}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {showSuggest && filter.trim() && searchSuggestions.length === 0 && (
            <div
              className="absolute left-0 right-0 top-full z-40 mt-1 px-3 py-2 text-[10px]"
              style={{ background: '#000', border: `1px solid ${C.border}`, color: C.grey }}
            >
              無相符結果 · No matches for &quot;{filter}&quot;
            </div>
          )}
        </div>

        {/* Quick-jump chips: TW / US shortcut filters */}
        <div className="hidden md:flex items-center gap-1 text-[10px]">
          <button
            onClick={() => { setFilter('TW'); setShowSuggest(true); }}
            className="px-2 py-1 hover:bg-neutral-900 transition"
            style={{ border: `1px solid ${C.border}`, color: COUNTRY.TW.color }}
          >
            🇹🇼 台廠
          </button>
          <button
            onClick={() => { setFilter('US'); setShowSuggest(true); }}
            className="px-2 py-1 hover:bg-neutral-900 transition"
            style={{ border: `1px solid ${C.border}`, color: COUNTRY.US.color }}
          >
            🇺🇸 美廠
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto text-[10px]">
          <button
            onClick={() => selectedId && focusOnNode(selectedId)}
            disabled={!selectedId}
            className="flex items-center gap-1 px-2.5 py-1 hover:bg-neutral-900 transition disabled:opacity-30"
            style={{ border: `1px solid ${C.border}`, color: C.orange }}
            title="置中聚焦到目前選取的公司"
          >
            <Crosshair size={11} />
            置中
          </button>
          <button
            onClick={() => setShowLabels(s => !s)}
            className="flex items-center gap-1 px-2.5 py-1 hover:bg-neutral-900 transition"
            style={{ border: `1px solid ${C.border}`, color: showLabels ? C.orange : C.greyLi }}
          >
            {showLabels ? <Eye size={11} /> : <EyeOff size={11} />}
            邊線 %
          </button>
          <div className="flex items-center" style={{ border: `1px solid ${C.border}` }}>
            <button onClick={() => setZoom(z => Math.max(0.35, z - 0.1))} className="px-2 py-1 hover:bg-neutral-900">
              <ZoomOut size={11} />
            </button>
            <span className="px-2 text-[10px] text-neutral-400">{(zoom*100).toFixed(0)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="px-2 py-1 hover:bg-neutral-900">
              <ZoomIn size={11} />
            </button>
          </div>
          <button onClick={resetView} className="px-2 py-1 hover:bg-neutral-900" style={{ border: `1px solid ${C.border}` }}>
            <RotateCcw size={11} />
          </button>
        </div>
      </div>

      {/* ============== THEME PILL ROW ============== */}
      <div
        className="flex items-center gap-1.5 px-3 overflow-x-auto"
        style={{
          height: 36,
          background: '#050505',
          borderBottom: `1px solid ${C.border}`,
          whiteSpace: 'nowrap',
        }}
      >
        <span className="text-[9px] uppercase tracking-widest mr-1 shrink-0" style={{ color: C.grey }}>
          // 主題 THEME:
        </span>
        {Object.entries(THEMES).map(([key, t]) => {
          const active = currentTheme === key;
          const count = t.members ? t.members.size : Object.keys(COMPANIES).length;
          return (
            <button
              key={key}
              onClick={() => setCurrentTheme(key)}
              className="px-2.5 py-1 text-[10px] font-bold flex items-center gap-1.5 transition shrink-0"
              style={{
                background: active ? t.color : '#0a0a0a',
                color: active ? '#000' : t.color,
                border: `1px solid ${t.color}`,
                letterSpacing: '0.3px',
                opacity: active ? 1 : 0.85,
                fontFamily: "'Noto Sans TC','JetBrains Mono',sans-serif",
              }}
            >
              <span>{t.label}</span>
              <span
                className="text-[9px] px-1 rounded-sm"
                style={{
                  background: active ? 'rgba(0,0,0,0.25)' : t.color + '22',
                  color: active ? '#000' : t.color,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
        {currentTheme !== 'all' && (
          <span className="text-[9px] ml-2 shrink-0" style={{ color: C.amber }}>
            ◄ 主題已篩選 · 點「全鏈」回到完整圖
          </span>
        )}
      </div>

      {/* ============== MAIN STAGE ============== */}
      <div className="flex-1 relative overflow-hidden" ref={containerRef}>
        {/* Background grid */}
        <div className="absolute inset-0 grid-bg pointer-events-none" />

        {/* Canvas: pannable, zoomable */}
        <div
          className="absolute inset-0"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={onCanvasMouseDown}
          data-backdrop="1"
        >
          <div
            ref={innerRef}
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
              width: totalW,
              height: totalH,
              willChange: 'transform',
              transition: isDragging ? 'none' : 'transform 0.25s ease-out',
            }}
          >
            <svg
              width={totalW}
              height={totalH}
              viewBox={`0 0 ${totalW} ${totalH}`}
              style={{ display: 'block' }}
            >
              {/* Cluster column backgrounds */}
              {CLUSTERS.map(cl => {
                const p = layout.clusterPos[cl.id];
                return <ClusterBox key={'box-'+cl.id} pos={p} />;
              })}

              {/* EDGES (drawn behind nodes) */}
              <g>
                {layout.edgeGeo.map((eg) => {
                  const { i, a, b, v, d, cx, cy } = eg;
                  const isHighlighted = highlightedEdges.has(i);
                  const someActive = !!activeId;
                  let kind = null;
                  if (someActive) {
                    if (b === activeId) kind = 'supplier';
                    else if (a === activeId) kind = 'customer';
                  }
                  const matchDim = matchedIds && !(matchedIds.has(a) && matchedIds.has(b));
                  return (
                    <Edge
                      key={i}
                      d={d}
                      cx={cx}
                      cy={cy}
                      value={v}
                      kind={kind}
                      highlighted={isHighlighted}
                      dimmed={(someActive && !isHighlighted) || matchDim}
                      showLabel={showLabels}
                    />
                  );
                })}
              </g>

              {/* CLUSTER HEADERS (drawn after edges so they overlay) */}
              {CLUSTERS.map(cl => {
                const p = layout.clusterPos[cl.id];
                return <ClusterHeader key={'h-'+cl.id} pos={p} />;
              })}

              {/* NODES */}
              <g>
                {Object.keys(COMPANIES).map(id => {
                  const pos = layout.nodePos[id];
                  if (!pos) return null;
                  const isSelected = id === selectedId;
                  const isHovered = id === hoverId;
                  const someActive = !!activeId && activeId !== id;
                  const relKind = relatedNodes.get(id);
                  const isRelated = !!relKind;
                  const isDimmed =
                    (someActive && !isRelated && !isSelected && !isHovered) ||
                    (matchedIds && !matchedIds.has(id));
                  return (
                    <CompanyNode
                      key={id}
                      id={id}
                      pos={pos}
                      isSelected={isSelected}
                      isHovered={isHovered}
                      isDimmed={isDimmed}
                      relationKind={isSelected ? null : relKind}
                      onClick={handleNodeClick}
                      onHover={handleNodeHover}
                      onLeave={handleNodeLeave}
                    />
                  );
                })}
              </g>
            </svg>
          </div>
        </div>

        {/* ============== LEGEND (bottom-left, floating) ============== */}
        <div
          className="absolute bottom-4 left-4 z-20 px-3 py-2.5"
          style={{
            background: 'rgba(0,0,0,0.92)',
            border: `1px solid ${C.border}`,
            backdropFilter: 'blur(4px)',
            fontSize: 10,
          }}
        >
          <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: C.orange }}>
            // 圖例 / LEGEND
          </div>
          <div className="space-y-1.5">
            <LegendRow color={C.red}   label="上游供應商 SUPPLIER" />
            <LegendRow color={C.green} label="下游客戶 CUSTOMER" />
            <LegendRow color={C.orange} label="一般流向 DEFAULT FLOW" thin />
            <div className="pt-1 mt-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(COUNTRY).map(([code, info]) => (
                  <span key={code} className="text-[9px] flex items-center gap-1">
                    <span style={{
                      display:'inline-block', width:8, height:8,
                      background: info.color
                    }} />
                    <span style={{ color: info.color }}>{info.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ============== STATS HUD (bottom-right) ============== */}
        <div
          className="absolute bottom-4 right-4 z-20 px-3 py-2.5"
          style={{
            background: 'rgba(0,0,0,0.92)',
            border: `1px solid ${C.border}`,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: C.orange }}>
            // 目前焦點 / ACTIVE
          </div>
          {activeId ? (
            <div className="text-[10px]">
              <div className="flex items-center gap-2">
                <span style={{ color: COUNTRY[COMPANIES[activeId].country].color }}>
                  {COUNTRY[COMPANIES[activeId].country].flag}
                </span>
                <span className="font-bold text-white">{COMPANIES[activeId].ticker}</span>
                <span style={{
                  color: C.amber,
                  fontFamily: "'Noto Sans TC','PingFang TC',sans-serif"
                }}>
                  {cnOf(activeId)}
                </span>
                <span className="text-neutral-500 text-[9px]">{COMPANIES[activeId].name}</span>
              </div>
              <div className="flex gap-3 mt-1 text-[9px] text-neutral-400">
                <span>供應商: <span style={{ color: C.red }}>{(edgesIndex.suppliers[activeId] || []).length}</span></span>
                <span>客戶: <span style={{ color: C.green }}>{(edgesIndex.customers[activeId] || []).length}</span></span>
                <span>市值: <span style={{ color: C.amber }}>{fmtMcap(COMPANIES[activeId].mcap)}</span></span>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-neutral-500">將游標停在節點上…</div>
          )}
        </div>

        {/* ============== TIP (top-left small) ============== */}
        <div
          className="absolute top-3 left-3 z-20 px-2 py-1 text-[9px]"
          style={{ background: 'rgba(0,0,0,0.8)', border: `1px solid ${C.border}`, color: C.greyLi }}
        >
          <span style={{ color: C.orange }}>提示:</span>
          {' '}拖曳平移 · 滾輪縮放 · 點擊節點看詳情 · 滑鼠移上時亮供應鏈 · 搜尋框可跳轉
        </div>

        {/* ============== DETAIL PANEL ============== */}
        <DetailPanel
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onSelect={(id) => setSelectedId(id)}
          edgesIndex={edgesIndex}
        />
      </div>

      {/* ============== STATUS BAR ============== */}
      <div
        className="flex items-center justify-between px-4 text-[10px]"
        style={{ height: 24, background: '#050505', borderTop: `1px solid ${C.border}`, color: C.greyLi }}
      >
        <div className="flex items-center gap-4">
          <span>狀態:&nbsp;<span style={{ color: C.green }}>● LIVE</span></span>
          <span>焦點:&nbsp;<span style={{ color: C.orange }}>{selectedId ? `${selectedId} · ${cnOf(selectedId)}` : '—'}</span></span>
          <span>篩選:&nbsp;<span style={{ color: C.amber }}>{filter || '無'}</span></span>
        </div>
        <div className="flex items-center gap-4">
          <span>{(highlightedEdges.size > 0) ? `${highlightedEdges.size} 條供應鏈關係` : '尚未選取節點'}</span>
          <span style={{ color: C.grey }}>© SPLC TERMINAL · 示意資料 MOCK</span>
        </div>
      </div>
    </div>
  );
}

function LegendRow({ color, label, thin }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="22" height="6">
        <path d="M 0 3 Q 11 -1 22 3" stroke={color} strokeWidth={thin ? 1 : 1.6} fill="none" />
      </svg>
      <span style={{ color: '#a0a0a0' }}>{label}</span>
    </div>
  );
}
