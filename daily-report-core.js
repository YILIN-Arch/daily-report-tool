import {
  BASE_EDITABLE_CELLS,
  BLOCK_MATCH_RULES,
  ENTRY_CONFIG,
  HEADCOUNT_FIELDS,
  SIGNATORY_FIELDS,
  TEMPLATE_NAME,
} from "./daily-report-data.js";

const DAY_NUMBER_BASE_SERIAL = 44889;
const ENTRY_BY_KEY = new Map(ENTRY_CONFIG.map((entry) => [entry.key, entry]));
const ENTRY_BY_ROW = new Map(ENTRY_CONFIG.map((entry) => [entry.row, entry]));
const ENTRY_ANCHOR_BY_LABEL = new Map();

for (const entry of ENTRY_CONFIG) {
  if (!ENTRY_ANCHOR_BY_LABEL.has(entry.label)) {
    ENTRY_ANCHOR_BY_LABEL.set(entry.label, entry);
  }
}

const DYNAMIC_CLASSIFICATION_RULES = [
  { label: "水喉", keywords: ["水喉", "座廁", "坐廁", "龍頭", "去水", "駁喉", "面盤", "廁所腳", "喉"] },
  { label: "電氣", keywords: ["電氣", "電燈", "燈喉", "走廊燈", "MCB", "駁線", "掣箱", "電掣", "清掣"] },
  { label: "消防", keywords: ["消防", "消防頭", "消防喉", "花灑頭"] },
  { label: "假天花", keywords: ["天花", "骨架", "封底板", "石膏板", "釘角", "底骨", "底板"] },
  { label: "泥水", keywords: ["泥水", "泥底", "地台瓦", "牆身瓦", "廳地台", "廚房牆身", "廁所牆身", "批盪", "批蕩", "盪樓梯", "執平企直", "清場", "上料"] },
  { label: "釘板", keywords: ["釘板", "出柱頭", "釘模", "板模", "木模"] },
  { label: "油漆", keywords: ["油漆", "省油", "批灰", "製位批灰", "滑面", "批滑面"] },
  { label: "鋁窗", keywords: ["鋁窗", "冷氣機窗", "窗仔", "唧膠"] },
  { label: "門框", keywords: ["門框"] },
  { label: "廚櫃", keywords: ["廚櫃", "櫥櫃", "廚房櫃"] },
  { label: "水櫃", keywords: ["水櫃"] },
  { label: "鐵器", keywords: ["鐵器", "扶手", "欄杆", "鐵閘"] },
  { label: "台面石", keywords: ["台面石", "檯面石"] },
  { label: "雲石", keywords: ["雲石", "石屎", "石材"] },
  { label: "玻璃欄河", keywords: ["玻璃欄河", "欄河", "欄杆玻璃"] },
  { label: "玻璃幕牆", keywords: ["玻璃幕牆", "幕牆", "玻璃幕"] },
  { label: "防水", keywords: ["防水", "試水", "滲水"] },
  { label: "防火板", keywords: ["防火板"] },
  { label: "弱電", keywords: ["弱電", "網線", "喉通", "線槽"] },
  { label: "電訊商", keywords: ["電訊", "數碼通", "掣面"] },
  { label: "大冷", keywords: ["大冷", "風槽", "風喉"] },
  { label: "細冷", keywords: ["細冷", "銅喉", "散熱", "背板", "冷氣"] },
  { label: "煤氣", keywords: ["煤氣", "氣喉"] },
  { label: "浴屏", keywords: ["浴屏"] },
  { label: "預制間牆板", keywords: ["預制間牆板", "間牆板"] },
  { label: "墨斗", keywords: ["墨斗", "彈線"] },
  { label: "什項", keywords: ["清垃圾", "打鑿", "打炮", "保護", "基仔"] },
];

const CUSTOM_LINE_HEAD_RULES = [
  {
    label: "木門",
    anchorLabel: "門框",
    aliases: ["木門", "木门", "木製門", "木制門", "木製门", "木制门"],
  },
];

const HEADCOUNT_KEY_ALIASES = {
  staffregular: "staffRegular",
  staffovertime: "staffOvertime",
  labourregular: "labourRegular",
  labourovertime: "labourOvertime",
  miscregular: "miscRegular",
  miscovertime: "miscOvertime",
  security: "security",
  職員正班: "staffRegular",
  職員加班: "staffOvertime",
  平水正班: "labourRegular",
  平水平什正班: "labourRegular",
  平水加班: "labourOvertime",
  平水平什加班: "labourOvertime",
  男女什工正班: "miscRegular",
  男女什工加班: "miscOvertime",
  看更: "security",
};

function todayLocalIso() {
  const now = new Date();
  return datePartsToIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function datePartsToIso(year, month, day) {
  return `${year}-${`${month}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
}

function sanitizeText(value) {
  return String(value ?? "").trim();
}

function normalizeComparableText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/凎/g, "淦")
    .replace(/恆/g, "恒")
    .replace(/拓高/g, "托高")
    .replace(/[\s_/()（）\-]+/g, "")
    .replace(/[：:;,，。；]/g, "")
    .toLowerCase();
}

function createEntryDraft(entry) {
  return {
    key: entry.key,
    row: entry.row,
    group: entry.group,
    label: entry.label,
    contractor: entry.contractor,
    count: "",
    summary: "",
  };
}

function createEmptyReport() {
  return {
    rawText: "",
    entries: ENTRY_CONFIG.map((entry) => createEntryDraft(entry)),
    dynamicEntries: [],
    parsedEntries: [],
    ignoredLines: [],
    ambiguousBlocks: [],
  };
}

function cloneReport(report = {}) {
  return {
    rawText: coerceValueToString(report.rawText),
    entries: ENTRY_CONFIG.map((config) => {
      const existing = (report.entries || []).find((entry) => entry.key === config.key) || {};
      return {
        ...createEntryDraft(config),
        ...existing,
        count: coerceValueToString(existing.count),
        summary: coerceValueToString(existing.summary),
      };
    }),
    dynamicEntries: (report.dynamicEntries || []).map((entry) => ({
      ...entry,
      sources: [...(entry.sources || [])],
      matchedKeywords: [...(entry.matchedKeywords || [])],
    })),
    parsedEntries: (report.parsedEntries || []).map((entry) => ({
      ...entry,
      sources: [...(entry.sources || [])],
      matchedKeywords: [...(entry.matchedKeywords || [])],
    })),
    ignoredLines: [...(report.ignoredLines || [])],
    ambiguousBlocks: (report.ambiguousBlocks || []).map((block) => ({ ...block })),
  };
}

function reportFromDraft(draft, rawText = "") {
  return cloneReport({
    rawText,
    entries: draft.entries,
    dynamicEntries: draft.dynamicEntries,
    parsedEntries: draft.parsedEntries,
    ignoredLines: draft.ignoredLines,
    ambiguousBlocks: draft.ambiguousBlocks,
  });
}

function applyReportToDraft(draft, report) {
  const nextReport = cloneReport(report);
  return {
    ...draft,
    entries: nextReport.entries,
    dynamicEntries: nextReport.dynamicEntries,
    parsedEntries: nextReport.parsedEntries,
    ignoredLines: nextReport.ignoredLines,
    ambiguousBlocks: nextReport.ambiguousBlocks,
  };
}

function parseIntegerString(value) {
  if (value === "" || value === null || value === undefined) {
    return { ok: true, number: null };
  }

  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    return { ok: false, number: null };
  }

  return { ok: true, number: Number(text) };
}

function appendDistinctSummary(existing, next) {
  const left = sanitizeText(existing);
  const right = sanitizeText(next);
  if (!left) return right;
  if (!right) return left;
  if (left.includes(right)) return left;
  return `${left}; ${right}`;
}

function resetParsedDraft(baseDraft) {
  const nextDraft = cloneDraft(baseDraft);
  nextDraft.entries = ENTRY_CONFIG.map((entry) => createEntryDraft(entry));
  nextDraft.dynamicEntries = [];
  nextDraft.parsedEntries = [];
  nextDraft.ignoredLines = [];
  nextDraft.ambiguousBlocks = [];
  return nextDraft;
}

function createWeatherDraft(value = {}) {
  return {
    morning: sanitizeText(value.morning),
    afternoon: sanitizeText(value.afternoon),
  };
}

function hasWeatherValue(weather) {
  return Boolean(sanitizeText(weather?.morning) || sanitizeText(weather?.afternoon));
}

function getLegacyWeatherFallback(draft) {
  const weatherByDate = draft.weatherByDate || {};
  if (Object.keys(weatherByDate).length) return null;
  return hasWeatherValue(draft.weather) ? createWeatherDraft(draft.weather) : null;
}

function resolveWeatherEditDate(draft, preferredDate = "") {
  const preferred = canonicalizeDate(preferredDate);
  const selectedDates = sortDates(draft.selectedDates || []);
  if (preferred && (!selectedDates.length || selectedDates.includes(preferred))) return preferred;
  if (selectedDates.length === 1) return selectedDates[0];
  return selectedDates[0] || todayLocalIso();
}

function computeSummarySegments(summary, limits) {
  const text = sanitizeText(summary).replace(/\r\n/g, "\n");
  if (!text) return { ok: true, segments: limits.map(() => "") };

  const segments = limits.map(() => "");
  segments[0] = text;
  return { ok: true, segments };
}

function coerceValueToString(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value);
}

function hasPeopleCount(line) {
  return /\d+\s*人/.test(line);
}

function isUnknownHeaderCandidate(line) {
  const text = sanitizeText(line);
  if (!text || hasPeopleCount(text)) return false;
  if (text.length > 18) return false;
  if (/[；;，,。:：|｜]/.test(text)) return false;
  if (/\d+\s*\/?\s*f/i.test(text)) return false;
  if (/^(日期|上午|下午|天氣|weather|date)$/i.test(text)) return false;
  return /[\p{Script=Han}A-Za-z]/u.test(text);
}

function splitWorkItems(lines) {
  return lines
    .join("\n")
    .replace(/\r\n/g, "\n")
    .split(/\n|；|;/)
    .map((item) => sanitizeText(item))
    .filter(Boolean);
}

function estimateSummaryRowHeight(summary) {
  const text = sanitizeText(summary);
  if (!text) return null;

  const explicitLines = text.split(/\n/).length;
  const workItemLines = splitWorkItems([text]).length;
  const wrappedLines = Math.ceil(text.length / 54);
  const lineCount = Math.max(explicitLines, workItemLines, wrappedLines, 1);
  return Math.max(17.25, lineCount * 15);
}

function countPeopleInText(text) {
  return [...String(text).matchAll(/(\d+)\s*人/g)].reduce(
    (sum, match) => sum + Number(match[1]),
    0,
  );
}

function normalizeDisplayLineHead(value) {
  const text = sanitizeText(value);
  const customRule = CUSTOM_LINE_HEAD_RULES.find((rule) =>
    rule.aliases.some((alias) => normalizeComparableText(alias) === normalizeComparableText(text)),
  );
  return customRule?.label || text;
}

function getAnchorForLineHead(label, preferredAnchorLabel = "") {
  const normalizedLabel = normalizeComparableText(label);
  const exactEntry = ENTRY_CONFIG.find((entry) => normalizeComparableText(entry.label) === normalizedLabel);
  if (exactEntry) return exactEntry;

  const customRule = CUSTOM_LINE_HEAD_RULES.find(
    (rule) => normalizeComparableText(rule.label) === normalizedLabel,
  );
  if (customRule) {
    return ENTRY_ANCHOR_BY_LABEL.get(customRule.anchorLabel) || ENTRY_ANCHOR_BY_LABEL.get("什項");
  }

  if (preferredAnchorLabel) {
    return ENTRY_ANCHOR_BY_LABEL.get(preferredAnchorLabel) || ENTRY_ANCHOR_BY_LABEL.get("什項");
  }

  return ENTRY_ANCHOR_BY_LABEL.get("什項") || ENTRY_CONFIG[0];
}

function findExplicitLineHead(title) {
  const text = sanitizeText(title);
  if (!text) return null;
  const normalizedTitle = normalizeComparableText(text);

  const customCandidates = CUSTOM_LINE_HEAD_RULES.flatMap((rule) =>
    rule.aliases.map((alias) => ({
      label: rule.label,
      alias,
      anchor: getAnchorForLineHead(rule.label),
    })),
  );
  const templateCandidates = [...new Set(ENTRY_CONFIG.map((entry) => entry.label))].map((label) => ({
    label,
    alias: label,
    anchor: getAnchorForLineHead(label),
  }));

  const candidates = [...customCandidates, ...templateCandidates]
    .filter((candidate) => normalizedTitle.includes(normalizeComparableText(candidate.alias)))
    .sort((left, right) => normalizeComparableText(right.alias).length - normalizeComparableText(left.alias).length);

  for (const candidate of candidates) {
    const contractor = sanitizeText(text.replace(new RegExp(candidate.alias, "gi"), ""));
    if (contractor) {
      return {
        label: candidate.label,
        contractor,
        anchor: candidate.anchor,
        matchedKeywords: [candidate.alias],
        needsReview: false,
      };
    }
  }

  const separated = text.match(/^(.+?)[\s　/／｜|:：-]+([^\s　/／｜|:：-]{1,8})$/);
  if (separated) {
    const contractor = sanitizeText(separated[1]);
    const label = normalizeDisplayLineHead(separated[2]);
    if (contractor && label) {
      return {
        label,
        contractor,
        anchor: getAnchorForLineHead(label),
        matchedKeywords: [label],
        needsReview: false,
      };
    }
  }

  return null;
}

function classifyDynamicEntry(title, contentItems) {
  const explicitLineHead = findExplicitLineHead(title);
  if (explicitLineHead) {
    return {
      ok: true,
      label: explicitLineHead.label,
      contractor: explicitLineHead.contractor,
      anchor: explicitLineHead.anchor,
      score: 99,
      matchedKeywords: explicitLineHead.matchedKeywords,
      needsReview: explicitLineHead.needsReview,
    };
  }

  const sourceText = `${title}\n${contentItems.join("\n")}`;
  const normalizedSource = normalizeComparableText(sourceText);
  const scored = DYNAMIC_CLASSIFICATION_RULES.map((rule) => {
    const matchedKeywords = [];
    let score = 0;
    for (const keyword of rule.keywords) {
      const normalizedKeyword = normalizeComparableText(keyword);
      if (normalizedKeyword && normalizedSource.includes(normalizedKeyword)) {
        matchedKeywords.push(keyword);
        score += Math.max(1, Math.min(3, normalizedKeyword.length));
      }
    }
    if (normalizedSource.includes(normalizeComparableText(rule.label))) {
      matchedKeywords.push(rule.label);
      score += 4;
    }
    return { ...rule, score, matchedKeywords: [...new Set(matchedKeywords)] };
  })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!scored.length) {
    return {
      ok: false,
      reason: "未能根據工作內容判斷工種，請補充更明確的工種描述。",
    };
  }

  if (scored[1] && scored[0].score === scored[1].score) {
    return {
      ok: false,
      reason: `工作內容同時匹配「${scored[0].label}」和「${scored[1].label}」，請手動拆分或補充工種。`,
    };
  }

  const anchor = ENTRY_ANCHOR_BY_LABEL.get(scored[0].label);
  if (!anchor) {
    return {
      ok: false,
      reason: `已判斷為「${scored[0].label}」，但樣板內沒有可複製的工種行。`,
    };
  }

  return {
    ok: true,
    label: scored[0].label,
    contractor: sanitizeText(title),
    anchor,
    score: scored[0].score,
    matchedKeywords: scored[0].matchedKeywords,
  };
}

function cleanupStandaloneSummary(line, entry) {
  return sanitizeText(line)
    .replace(new RegExp(entry.label, "g"), "")
    .replace(new RegExp(entry.contractor, "g"), "")
    .replace(/[|｜]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,，:：;\- ]+|[,，:：;\- ]+$/g, "");
}

function findEntryFromShape(shape) {
  if (!shape || typeof shape !== "object") return null;
  if (shape.key && ENTRY_BY_KEY.has(shape.key)) return ENTRY_BY_KEY.get(shape.key);
  if (shape.row && ENTRY_BY_ROW.has(Number(shape.row))) {
    return ENTRY_BY_ROW.get(Number(shape.row));
  }

  const label = normalizeComparableText(shape.label);
  const contractor = normalizeComparableText(shape.contractor);
  const matches = ENTRY_CONFIG.filter((entry) => {
    if (contractor && normalizeComparableText(entry.contractor) === contractor) return true;
    if (label && normalizeComparableText(entry.label) === label) return true;
    return false;
  });

  return matches.length === 1 ? matches[0] : null;
}

function matchEntryFromText(line) {
  const normalized = normalizeComparableText(line);

  for (const rule of BLOCK_MATCH_RULES) {
    const requireAll = rule.requireAll || [];
    if (
      requireAll.length &&
      requireAll.every((part) => normalized.includes(normalizeComparableText(part)))
    ) {
      return { entry: ENTRY_BY_KEY.get(rule.key), ambiguous: false, reason: "" };
    }

    if ((rule.match || []).some((alias) => normalized === normalizeComparableText(alias))) {
      return { entry: ENTRY_BY_KEY.get(rule.key), ambiguous: false, reason: "" };
    }
  }

  const contractorMatches = ENTRY_CONFIG.filter(
    (entry) => normalized === normalizeComparableText(entry.contractor),
  );
  if (contractorMatches.length === 1) {
    return { entry: contractorMatches[0], ambiguous: false, reason: "" };
  }
  if (contractorMatches.length > 1) {
    return {
      entry: null,
      ambiguous: true,
      reason: `${line} 對應多個模板行，請補充工種，例如「力佳消防」或「力佳大冷」。`,
    };
  }

  const containedMatches = ENTRY_CONFIG.filter((entry) => {
    const contractor = normalizeComparableText(entry.contractor);
    const label = normalizeComparableText(entry.label);
    return normalized.includes(contractor) || normalized.includes(label);
  });
  if (containedMatches.length === 1) {
    return { entry: containedMatches[0], ambiguous: false, reason: "" };
  }
  if (containedMatches.length > 1) {
    const exactRule = BLOCK_MATCH_RULES.find((rule) =>
      (rule.requireAll || []).every((part) => normalized.includes(normalizeComparableText(part))),
    );
    if (exactRule) return { entry: ENTRY_BY_KEY.get(exactRule.key), ambiguous: false, reason: "" };

    return {
      entry: null,
      ambiguous: true,
      reason: `${line} 匹配到多個模板行，請補充判頭或工種。`,
    };
  }

  return { entry: null, ambiguous: false, reason: "" };
}

function applyFieldLine(draft, line, weatherDate) {
  const dateMatch = line.match(/(?:日期|date)\s*[:：]?\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2})/i);
  if (dateMatch) {
    const date = canonicalizeDate(dateMatch[1]);
    if (date) draft.selectedDates = [date];
    return { handled: true, weatherDate: date || weatherDate };
  }

  const fieldPatterns = [
    { period: "morning", pattern: /(?:上午天氣|上午weather|morning weather|上午)\s*[:：]?\s*(.+)$/i },
    { period: "afternoon", pattern: /(?:下午天氣|下午weather|afternoon weather|下午)\s*[:：]?\s*(.+)$/i },
  ];

  for (const fieldPattern of fieldPatterns) {
    const match = line.match(fieldPattern.pattern);
    if (match) {
      setWeatherForDate(draft, weatherDate, fieldPattern.period, normalizeWeather(match[1]));
      return { handled: true, weatherDate };
    }
  }

  for (const field of HEADCOUNT_FIELDS) {
    const variants = [
      field.label,
      field.shortLabel,
      field.label.replace(/\s+/g, ""),
      field.shortLabel.replace(/\s+/g, ""),
    ];
    for (const variant of variants) {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = line.match(new RegExp(`${escaped}\\s*[:：]?\\s*(\\d+)`, "i"));
      if (match) {
        draft.headcount[field.key] = match[1];
        return { handled: true, weatherDate };
      }
    }
  }

  return { handled: false, weatherDate };
}

function normalizeWeather(value) {
  const text = sanitizeText(value);
  if (/雨/.test(text)) return "雨";
  if (/晴|天晴/.test(text)) return "晴";
  if (/陰|阴|多雲|多云/.test(text)) return "陰";
  return text;
}

function addParsedEntry(draft, entry, count, summary, sourceTitle) {
  const target = draft.entries.find((item) => item.key === entry.key);
  if (!target) return;

  if (count) {
    target.count = `${Number(target.count || 0) + count}`;
  }
  if (summary) {
    target.summary = appendDistinctSummary(target.summary, summary);
  }

  const existingParsed = draft.parsedEntries.find((item) => item.key === entry.key);
  if (existingParsed) {
    existingParsed.count += count;
    existingParsed.summary = appendDistinctSummary(existingParsed.summary, summary);
    existingParsed.sources.push(sourceTitle);
  } else {
    draft.parsedEntries.push({
      key: entry.key,
      row: entry.row,
      label: entry.label,
      contractor: entry.contractor,
      count,
      summary,
      sources: [sourceTitle],
    });
  }
}

function createDynamicEntryKey(anchorKey, label, contractor) {
  const normalizedLabel = normalizeComparableText(label).slice(0, 16) || "unknownlabel";
  const normalizedContractor = normalizeComparableText(contractor).slice(0, 24) || "unknown";
  return `dynamic_${anchorKey}_${normalizedLabel}_${normalizedContractor}`;
}

function addDynamicEntry(draft, classification, contractor, count, summary, sourceTitle) {
  const targetContractor = sanitizeText(classification.contractor || contractor);
  const key = createDynamicEntryKey(classification.anchor.key, classification.label, targetContractor);
  if (!draft.dynamicEntries) draft.dynamicEntries = [];

  const existing = draft.dynamicEntries.find((item) => item.key === key);
  if (existing) {
    existing.count += count;
    existing.summary = appendDistinctSummary(existing.summary, summary);
    existing.sources.push(sourceTitle);
    existing.matchedKeywords = [
      ...new Set([...(existing.matchedKeywords || []), ...(classification.matchedKeywords || [])]),
    ];
  } else {
    draft.dynamicEntries.push({
      key,
      anchorKey: classification.anchor.key,
      anchorRow: classification.anchor.row,
      group: classification.anchor.group,
      label: classification.label,
      contractor: targetContractor,
      count,
      summary,
      sources: [sourceTitle],
      matchedKeywords: classification.matchedKeywords || [],
      needsReview: Boolean(classification.needsReview),
      isDynamic: true,
    });
  }

  const existingParsed = draft.parsedEntries.find((item) => item.key === key);
  if (existingParsed) {
    existingParsed.count += count;
    existingParsed.summary = appendDistinctSummary(existingParsed.summary, summary);
    existingParsed.sources.push(sourceTitle);
    existingParsed.matchedKeywords = [
      ...new Set([...(existingParsed.matchedKeywords || []), ...(classification.matchedKeywords || [])]),
    ];
  } else {
    draft.parsedEntries.push({
      key,
      row: classification.anchor.row + 0.1,
      anchorKey: classification.anchor.key,
      anchorRow: classification.anchor.row,
      label: classification.label,
      contractor: targetContractor,
      count,
      summary,
      sources: [sourceTitle],
      matchedKeywords: classification.matchedKeywords || [],
      needsReview: Boolean(classification.needsReview),
      isDynamic: true,
    });
  }
}

function createPendingClassification() {
  const anchor = ENTRY_ANCHOR_BY_LABEL.get("什項") || ENTRY_CONFIG[0];
  return {
    ok: true,
    label: "待確認",
    anchor,
    score: 0,
    matchedKeywords: [],
    needsReview: true,
  };
}

function parseStandaloneEntryLine(draft, line) {
  const match = matchEntryFromText(line);
  if (match.ambiguous) {
    draft.ambiguousBlocks.push({ title: line, content: "", reason: match.reason });
    return true;
  }
  if (!match.entry) return false;

  const count = countPeopleInText(line);
  const summary = cleanupStandaloneSummary(line, match.entry);
  addParsedEntry(draft, match.entry, count, summary, line);
  return true;
}

function parseBlock(draft, block) {
  if (!block) return;
  const content = splitWorkItems(block.lines);
  if (!block.entry) {
    if (block.ambiguous) {
      draft.ambiguousBlocks.push({
        title: block.title,
        content: content.join("; "),
        reason: block.reason || "未能確定模板行。",
      });
      return;
    }

    if (!content.length) {
      draft.ignoredLines.push(block.title);
      return;
    }

    const count = content.reduce((sum, item) => sum + countPeopleInText(item), 0);
    const classification = classifyDynamicEntry(block.title, content);
    if (classification.ok) {
      addDynamicEntry(draft, classification, block.title, count, content.join("; "), block.title);
      return;
    }

    addDynamicEntry(draft, createPendingClassification(), block.title, count, content.join("; "), block.title);
    return;
  }

  if (!content.length) {
    draft.ignoredLines.push(block.title);
    return;
  }

  const count = content.reduce((sum, item) => sum + countPeopleInText(item), 0);
  addParsedEntry(draft, block.entry, count, content.join("; "), block.title);
}

function parseRawTextBlocks(rawText, baseDraft, options = {}) {
  const draft = resetParsedDraft(baseDraft);
  const lines = String(rawText ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  let currentBlock = null;
  let activeWeatherDate = resolveWeatherEditDate(draft, options.weatherDate);

  for (const rawLine of lines) {
    const line = sanitizeText(rawLine);
    if (!line) {
      parseBlock(draft, currentBlock);
      currentBlock = null;
      continue;
    }

    const fieldResult = applyFieldLine(draft, line, activeWeatherDate);
    if (fieldResult.handled) {
      activeWeatherDate = fieldResult.weatherDate || activeWeatherDate;
      continue;
    }

    const headerMatch = matchEntryFromText(line);
    const looksLikeHeader =
      !hasPeopleCount(line) &&
      (headerMatch.entry || headerMatch.ambiguous || isUnknownHeaderCandidate(line));
    if (looksLikeHeader) {
      parseBlock(draft, currentBlock);
      currentBlock = {
        title: line,
        entry: headerMatch.entry,
        ambiguous: headerMatch.ambiguous,
        reason: headerMatch.reason,
        lines: [],
      };
      continue;
    }

    if (currentBlock) {
      currentBlock.lines.push(line);
      continue;
    }

    if (!parseStandaloneEntryLine(draft, line)) {
      draft.ignoredLines.push(line);
    }
  }

  parseBlock(draft, currentBlock);
  return draft;
}

export function canonicalizeDate(value) {
  const text = sanitizeText(value).replace(/[./]/g, "-");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }

  return datePartsToIso(year, month, day);
}

export function getMonthKey(date) {
  const canonical = canonicalizeDate(date);
  return canonical ? canonical.slice(0, 7) : "";
}

export function getSheetNameForDate(date) {
  const canonical = canonicalizeDate(date);
  return canonical ? String(Number(canonical.slice(8, 10))) : "";
}

export function getMonthDays(monthKey) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const total = new Date(year, month, 0).getDate();
  return Array.from({ length: total }, (_, index) => datePartsToIso(year, month, index + 1));
}

export function sortDates(dates) {
  return [...new Set((dates || []).map(canonicalizeDate).filter(Boolean))].sort();
}

export function getDayNumber(date) {
  const canonical = canonicalizeDate(date);
  if (!canonical) return "";
  const [year, month, day] = canonical.split("-").map(Number);
  const excelSerial = Math.floor(Date.UTC(year, month - 1, day) / 86400000) + 25569;
  return excelSerial - DAY_NUMBER_BASE_SERIAL;
}

export function createEmptyDraft(defaultDate = todayLocalIso()) {
  return {
    templateName: TEMPLATE_NAME,
    selectedDates: [defaultDate],
    weather: {
      morning: "",
      afternoon: "",
    },
    weatherByDate: {
      [defaultDate]: {
        morning: "",
        afternoon: "",
      },
    },
    headcount: Object.fromEntries(HEADCOUNT_FIELDS.map((field) => [field.key, "0"])),
    signatories: Object.fromEntries(
      SIGNATORY_FIELDS.map((field) => [field.key, field.defaultValue || ""]),
    ),
    entries: ENTRY_CONFIG.map((entry) => createEntryDraft(entry)),
    dynamicEntries: [],
    parsedEntries: [],
    ignoredLines: [],
    ambiguousBlocks: [],
    reportsByDate: {
      [defaultDate]: createEmptyReport(),
    },
  };
}

export function cloneDraft(draft) {
  return {
    templateName: draft.templateName || TEMPLATE_NAME,
    selectedDates: sortDates(draft.selectedDates || []),
    weather: createWeatherDraft(draft.weather),
    weatherByDate: Object.fromEntries(
      Object.entries(draft.weatherByDate || {}).map(([date, weather]) => [
        date,
        createWeatherDraft(weather),
      ]),
    ),
    headcount: { ...draft.headcount },
    signatories: { ...draft.signatories },
    entries: (draft.entries || []).map((entry) => ({ ...entry })),
    dynamicEntries: (draft.dynamicEntries || []).map((entry) => ({
      ...entry,
      sources: [...(entry.sources || [])],
      matchedKeywords: [...(entry.matchedKeywords || [])],
    })),
    parsedEntries: (draft.parsedEntries || []).map((entry) => ({
      ...entry,
      sources: [...(entry.sources || [])],
      matchedKeywords: [...(entry.matchedKeywords || [])],
    })),
    ignoredLines: [...(draft.ignoredLines || [])],
    ambiguousBlocks: (draft.ambiguousBlocks || []).map((block) => ({ ...block })),
    reportsByDate: Object.fromEntries(
      Object.entries(draft.reportsByDate || {}).map(([date, report]) => [
        date,
        cloneReport(report),
      ]),
    ),
  };
}

export function getReportForDate(draft, date) {
  const canonical = canonicalizeDate(date) || resolveWeatherEditDate(draft);
  if (!canonical) return createEmptyReport();

  const reportsByDate = draft.reportsByDate || {};
  if (Object.prototype.hasOwnProperty.call(reportsByDate, canonical)) {
    return cloneReport(reportsByDate[canonical]);
  }

  return createEmptyReport();
}

export function setReportForDate(draft, date, report) {
  const canonical = canonicalizeDate(date) || resolveWeatherEditDate(draft);
  if (!canonical) return;
  if (!draft.reportsByDate) draft.reportsByDate = {};
  draft.reportsByDate[canonical] = cloneReport(report);
}

function getDraftForDate(draft, date) {
  return applyReportToDraft(cloneDraft(draft), getReportForDate(draft, date));
}

export function buildExportFilename(draft) {
  const dates = sortDates(draft.selectedDates || []);
  const monthKey = dates[0] ? getMonthKey(dates[0]) : getMonthKey(todayLocalIso());
  return `${TEMPLATE_NAME}_${monthKey}.xlsx`;
}

export function getWeatherForDate(draft, date) {
  const canonical = canonicalizeDate(date) || resolveWeatherEditDate(draft);
  const weatherByDate = draft.weatherByDate || {};
  if (canonical && Object.prototype.hasOwnProperty.call(weatherByDate, canonical)) {
    return createWeatherDraft(weatherByDate[canonical]);
  }

  const fallback = getLegacyWeatherFallback(draft);
  return fallback || createWeatherDraft();
}

export function setWeatherForDate(draft, date, period, value) {
  const canonical = canonicalizeDate(date) || resolveWeatherEditDate(draft);
  if (!canonical || !["morning", "afternoon"].includes(period)) return;

  if (!draft.weatherByDate) draft.weatherByDate = {};
  draft.weatherByDate[canonical] = {
    ...getWeatherForDate(draft, canonical),
    [period]: sanitizeText(value),
  };
  draft.weather = createWeatherDraft(draft.weatherByDate[canonical]);
}

export function parseRawTextToDraft(rawText, baseDraft, options = {}) {
  const reportDate = canonicalizeDate(options.reportDate) || resolveWeatherEditDate(baseDraft, options.weatherDate);
  const scopedBaseDraft = reportDate ? getDraftForDate(baseDraft, reportDate) : baseDraft;
  const draft = parseRawTextBlocks(rawText, scopedBaseDraft, options);
  if (reportDate) {
    setReportForDate(draft, reportDate, reportFromDraft(draft, rawText));
  }

  return {
    draft,
    parsedEntries: draft.parsedEntries,
    ignoredLines: draft.ignoredLines,
    ambiguousBlocks: draft.ambiguousBlocks,
    parsedObject: serializeDraftForJson(draft),
  };
}

export function serializeDraftForJson(draft) {
  return {
    selectedDates: sortDates(draft.selectedDates || []),
    weather: { ...draft.weather },
    weatherByDate: Object.fromEntries(
      Object.entries(draft.weatherByDate || {}).map(([date, weather]) => [
        date,
        createWeatherDraft(weather),
      ]),
    ),
    headcount: { ...draft.headcount },
    entries: draft.entries
      .filter((entry) => sanitizeText(entry.count) || sanitizeText(entry.summary))
      .map((entry) => ({
        key: entry.key,
        row: entry.row,
        label: entry.label,
        contractor: entry.contractor,
        count: entry.count,
        summary: entry.summary,
      })),
    dynamicEntries: (draft.dynamicEntries || []).map((entry) => ({
      key: entry.key,
      anchorKey: entry.anchorKey,
      anchorRow: entry.anchorRow,
      label: entry.label,
      contractor: entry.contractor,
      count: entry.count,
      summary: entry.summary,
      matchedKeywords: [...(entry.matchedKeywords || [])],
      needsReview: Boolean(entry.needsReview),
    })),
    ignoredLines: [...(draft.ignoredLines || [])],
    ambiguousBlocks: [...(draft.ambiguousBlocks || [])],
    reportsByDate: Object.fromEntries(
      Object.entries(draft.reportsByDate || {}).map(([date, report]) => [
        date,
        cloneReport(report),
      ]),
    ),
  };
}

export function validateDraft(draft) {
  const errors = [];
  const warnings = [];
  const summarySegmentsByKey = {};
  const summarySegmentsByDate = {};
  const dates = sortDates(draft.selectedDates || []);
  const monthKeys = new Set(dates.map(getMonthKey));

  if (!dates.length) errors.push("請至少選擇一個日期。");
  if (monthKeys.size > 1) errors.push("多日期導出只支援同一月份，請分開導出。");

  for (const date of dates) {
    const weather = getWeatherForDate(draft, date);
    const displayDate = date.replaceAll("-", "/");
    if (!sanitizeText(weather.morning)) errors.push(`${displayDate} 請選擇上午天氣。`);
    if (!sanitizeText(weather.afternoon)) errors.push(`${displayDate} 請選擇下午天氣。`);
  }

  for (const field of HEADCOUNT_FIELDS) {
    const parsed = parseIntegerString(draft.headcount[field.key]);
    if (!parsed.ok) errors.push(`${field.shortLabel} 只能填非負整數。`);
  }

  let hasAnyEntry = false;
  const entryDates = dates.length ? dates : [""];
  for (const date of entryDates) {
    const scopedDraft = date ? getDraftForDate(draft, date) : draft;
    summarySegmentsByDate[date] = {};

    for (const entry of scopedDraft.entries) {
      const count = parseIntegerString(entry.count);
      if (!count.ok) errors.push(`${entry.label} / ${entry.contractor} 的人數只能填非負整數。`);
      if (sanitizeText(entry.count) || sanitizeText(entry.summary)) hasAnyEntry = true;

      const config = ENTRY_BY_KEY.get(entry.key);
      const summaryResult = computeSummarySegments(entry.summary, config.summaryLimits);
      summarySegmentsByDate[date][entry.key] = summaryResult.segments;
      if (!summarySegmentsByKey[entry.key]) summarySegmentsByKey[entry.key] = summaryResult.segments;
    }

    for (const entry of scopedDraft.dynamicEntries || []) {
      const count = parseIntegerString(entry.count);
      if (!count.ok) errors.push(`${entry.label} / ${entry.contractor} 的人數只能填非負整數。`);
      if (sanitizeText(entry.count) || sanitizeText(entry.summary)) hasAnyEntry = true;
    }
  }

  if (!hasAnyEntry) warnings.push("目前未識別到判頭工種。");
  if ((draft.ambiguousBlocks || []).length) warnings.push("有資料需要確認後才會寫入。");

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    summarySegmentsByKey,
    summarySegmentsByDate,
    dates,
    monthKey: dates[0] ? getMonthKey(dates[0]) : "",
  };
}

export function getEntryGroupsWithDraft(draft, onlyFilled = false) {
  return [
    {
      key: "all",
      title: "全部",
      entries: draft.entries.filter((entry) => {
        if (!onlyFilled) return true;
        return sanitizeText(entry.count) || sanitizeText(entry.summary);
      }),
    },
  ].filter((group) => group.entries.length > 0);
}

export function getPreviewModel(draft, previewDate = "") {
  const dates = sortDates(draft.selectedDates || []);
  const date = canonicalizeDate(previewDate) || dates[0] || todayLocalIso();
  const scopedDraft = getDraftForDate(draft, date);
  const fixedEntries = scopedDraft.entries.filter((entry) => sanitizeText(entry.count) || sanitizeText(entry.summary));
  const dynamicEntries = (scopedDraft.dynamicEntries || []).filter(
    (entry) => sanitizeText(entry.count) || sanitizeText(entry.summary),
  );
  const entries = [...fixedEntries, ...dynamicEntries].sort((left, right) => {
    const leftRow = Number(left.row || left.anchorRow || 999);
    const rightRow = Number(right.row || right.anchorRow || 999);
    if (leftRow !== rightRow) return leftRow - rightRow;
    if (left.isDynamic !== right.isDynamic) return left.isDynamic ? 1 : -1;
    return 0;
  });

  return {
    date,
    sheetName: getSheetNameForDate(date),
    dayNumber: getDayNumber(date),
    weather: getWeatherForDate(draft, date),
    headcount: HEADCOUNT_FIELDS.map((field) => ({
      ...field,
      value: draft.headcount[field.key] || "0",
    })),
    entries,
  };
}

export function resetWorksheetEditableCells(worksheet) {
  for (const cell of BASE_EDITABLE_CELLS) {
    worksheet.getCell(cell).value = null;
  }

  for (const field of HEADCOUNT_FIELDS) {
    worksheet.getCell(field.cell).value = 0;
  }

  for (const field of SIGNATORY_FIELDS) {
    worksheet.getCell(field.cell).value = "";
  }

  for (const entry of ENTRY_CONFIG) {
    worksheet.getCell(entry.countCell).value = null;
    for (const cell of entry.summaryCells) {
      worksheet.getCell(cell).value = null;
    }
  }
}

function cloneCellValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === "object") return JSON.parse(JSON.stringify(value));
  return value;
}

function cloneCellStyle(style) {
  return style ? JSON.parse(JSON.stringify(style)) : {};
}

function getRowMergeModels(worksheet, rowNumber) {
  return Object.values(worksheet._merges || {})
    .map((merge) => merge?.model)
    .filter((model) => model && model.top === rowNumber && model.bottom === rowNumber)
    .map((model) => ({ ...model }));
}

function captureTradeRowMergeLayouts(worksheet) {
  return new Map(
    ENTRY_CONFIG.map((entry) => [
      entry.row,
      getRowMergeModels(worksheet, entry.row).map((merge) => ({
        left: merge.left,
        right: merge.right,
      })),
    ]),
  );
}

function captureGroupColumnLayouts(worksheet) {
  const groupLayouts = new Map();
  const groupKeys = [...new Set(ENTRY_CONFIG.map((entry) => entry.group))];

  for (const groupKey of groupKeys) {
    const firstEntry = ENTRY_CONFIG.find((entry) => entry.group === groupKey);
    if (!firstEntry) continue;

    const merge = Object.values(worksheet._merges || {})
      .map((item) => item?.model)
      .find(
        (model) =>
          model &&
          model.left === 1 &&
          model.right === 1 &&
          model.top <= firstEntry.row &&
          model.bottom >= firstEntry.row,
      );
    const sourceCell = worksheet.getCell(merge?.top || firstEntry.row, 1);
    groupLayouts.set(groupKey, {
      value: cloneCellValue(sourceCell.value),
      style: cloneCellStyle(sourceCell.style),
    });
  }

  return groupLayouts;
}

function getMergeModelsIntersectingRow(worksheet, rowNumber) {
  return Object.entries(worksheet._merges || {})
    .map(([address, merge]) => ({ address, model: merge?.model }))
    .filter(Boolean)
    .filter(({ model }) => model && model.top <= rowNumber && model.bottom >= rowNumber)
    .map(({ address, model }) => ({ address, ...model }));
}

function resetMergesIntersectingRow(worksheet, rowNumber) {
  for (const merge of getMergeModelsIntersectingRow(worksheet, rowNumber)) {
    if (merge.top !== merge.bottom && merge.left === merge.right) continue;
    for (let row = merge.top; row <= merge.bottom; row += 1) {
      for (let column = merge.left; column <= merge.right; column += 1) {
        worksheet.getCell(row, column).unmerge();
      }
    }
    delete worksheet._merges[merge.address];
  }
}

function clearDynamicWritableCells(worksheet, rowNumber) {
  for (let column = 2; column <= 30; column += 1) {
    worksheet.getCell(rowNumber, column).value = null;
  }
}

function mergeRowRanges(worksheet, rowNumber, mergeRanges) {
  for (const merge of mergeRanges) {
    worksheet.mergeCells(
      rowNumber,
      merge.left,
      rowNumber,
      merge.right,
    );
  }
}

function copyRowLayout(worksheet, sourceRowNumber, targetRowNumber, mergeLayouts) {
  const sourceRow = worksheet.getRow(sourceRowNumber);
  const targetRow = worksheet.getRow(targetRowNumber);
  targetRow.height = sourceRow.height;
  resetMergesIntersectingRow(worksheet, targetRowNumber);

  const maxColumn = Math.max(39, worksheet.actualColumnCount || 0);
  for (let column = 1; column <= maxColumn; column += 1) {
    const sourceCell = worksheet.getCell(sourceRowNumber, column);
    const targetCell = worksheet.getCell(targetRowNumber, column);
    targetCell.value = cloneCellValue(sourceCell.value);
    targetCell.style = cloneCellStyle(sourceCell.style);
  }
  clearDynamicWritableCells(worksheet, targetRowNumber);
  mergeRowRanges(worksheet, targetRowNumber, mergeLayouts.get(sourceRowNumber) || []);
}

function writeDynamicEntryRow(worksheet, rowNumber, entry) {
  worksheet.getCell(`B${rowNumber}`).value = sanitizeText(entry.label);
  worksheet.getCell(`E${rowNumber}`).value = sanitizeText(entry.contractor);
  worksheet.getCell(`H${rowNumber}`).value = Number(entry.count || 0) || null;

  const summaryCell = worksheet.getCell(`K${rowNumber}`);
  summaryCell.value = sanitizeText(entry.summary) || null;
  summaryCell.alignment = {
    ...summaryCell.alignment,
    horizontal: "left",
    vertical: "top",
    wrapText: true,
    shrinkToFit: false,
  };

  const rowHeight = estimateSummaryRowHeight(entry.summary);
  if (rowHeight) {
    const row = worksheet.getRow(rowNumber);
    row.height = Math.max(Number(row.height || 17.25), rowHeight);
  }
}

function insertDynamicEntryRows(worksheet, dynamicEntries, mergeLayouts) {
  const entries = [...(dynamicEntries || [])]
    .filter((entry) => sanitizeText(entry.count) || sanitizeText(entry.summary))
    .sort((left, right) => {
      if (right.anchorRow !== left.anchorRow) return right.anchorRow - left.anchorRow;
      return 0;
    });

  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.anchorRow)) groups.set(entry.anchorRow, []);
    groups.get(entry.anchorRow).push(entry);
  }

  const insertedRows = [];
  for (const [anchorRow, groupEntries] of groups.entries()) {
    const lowerAnchorOffset = entries.filter((entry) => Number(entry.anchorRow) < Number(anchorRow)).length;
    groupEntries.forEach((entry, index) => {
      insertedRows.push({
        anchorRow: Number(anchorRow),
        row: Number(anchorRow) + 1 + lowerAnchorOffset + index,
        group: entry.group,
      });
    });
  }

  let insertedBeforeSignatures = insertedRows.filter((inserted) => inserted.row <= 48).length;
  for (const [anchorRow, groupEntries] of [...groups.entries()].sort((left, right) => right[0] - left[0])) {
    const insertAt = Number(anchorRow) + 1;
    for (const entry of [...groupEntries].reverse()) {
      worksheet.spliceRows(insertAt, 0, []);
      copyRowLayout(worksheet, Number(anchorRow), insertAt, mergeLayouts);
      writeDynamicEntryRow(worksheet, insertAt, entry);
    }
  }

  return { insertedBeforeSignatures, insertedRows };
}

function getFinalTradeRow(originalRow, insertedRows) {
  const offset = insertedRows.filter((inserted) => inserted.anchorRow < originalRow).length;
  return originalRow + offset;
}

function repairTradeRowMerges(worksheet, mergeLayouts, insertedRows) {
  const rowsToRepair = new Map();
  for (const entry of ENTRY_CONFIG) {
    rowsToRepair.set(getFinalTradeRow(entry.row, insertedRows), mergeLayouts.get(entry.row) || []);
  }
  for (const inserted of insertedRows) {
    rowsToRepair.set(inserted.row, mergeLayouts.get(inserted.anchorRow) || []);
  }

  for (const [rowNumber, mergeRanges] of [...rowsToRepair.entries()].sort((left, right) => left[0] - right[0])) {
    resetMergesIntersectingRow(worksheet, rowNumber);
    mergeRowRanges(worksheet, rowNumber, mergeRanges);
  }
}

function resetColumnAMergesInTradeArea(worksheet, firstRow, lastRow) {
  const merges = Object.entries(worksheet._merges || {})
    .map(([address, merge]) => ({ address, model: merge?.model }))
    .filter(
      ({ model }) =>
        model &&
        model.left === 1 &&
        model.right === 1 &&
        model.top <= lastRow &&
        model.bottom >= firstRow,
    );

  for (const merge of merges) {
    for (let row = merge.model.top; row <= merge.model.bottom; row += 1) {
      worksheet.getCell(row, 1).unmerge();
    }
    delete worksheet._merges[merge.address];
  }
}

function repairGroupColumnMerges(worksheet, groupLayouts, insertedRows) {
  const rowsByGroup = new Map();
  for (const entry of ENTRY_CONFIG) {
    const row = getFinalTradeRow(entry.row, insertedRows);
    if (!rowsByGroup.has(entry.group)) rowsByGroup.set(entry.group, []);
    rowsByGroup.get(entry.group).push(row);
  }
  for (const inserted of insertedRows) {
    if (!inserted.group) continue;
    if (!rowsByGroup.has(inserted.group)) rowsByGroup.set(inserted.group, []);
    rowsByGroup.get(inserted.group).push(inserted.row);
  }

  const allRows = [...rowsByGroup.values()].flat();
  if (!allRows.length) return;
  resetColumnAMergesInTradeArea(worksheet, Math.min(...allRows), Math.max(...allRows));

  for (const [groupKey, rows] of rowsByGroup.entries()) {
    const top = Math.min(...rows);
    const bottom = Math.max(...rows);
    const layout = groupLayouts.get(groupKey) || {};
    worksheet.mergeCells(top, 1, bottom, 1);
    const cell = worksheet.getCell(top, 1);
    cell.value = cloneCellValue(layout.value);
    cell.style = cloneCellStyle(layout.style);
  }
}

function shiftCellRow(cellAddress, rowOffset) {
  const match = String(cellAddress).match(/^([A-Z]+)(\d+)$/);
  if (!match) return cellAddress;
  return `${match[1]}${Number(match[2]) + rowOffset}`;
}

export function applyDraftToWorksheet(worksheet, draft, validation = null, targetDate = "") {
  const nextValidation = validation || validateDraft(draft);
  if (!nextValidation.isValid) throw new Error(nextValidation.errors.join("\n"));

  const date = canonicalizeDate(targetDate) || nextValidation.dates[0];
  const scopedDraft = getDraftForDate(draft, date);
  const [year, month, day] = date.split("-").map(Number);
  const tradeRowMergeLayouts = captureTradeRowMergeLayouts(worksheet);
  const groupColumnLayouts = captureGroupColumnLayouts(worksheet);
  resetWorksheetEditableCells(worksheet);

  const weather = getWeatherForDate(draft, date);
  worksheet.getCell("E5").value = sanitizeText(weather.morning);
  worksheet.getCell("M5").value = sanitizeText(weather.afternoon);
  worksheet.getCell("X5").value = new Date(year, month - 1, day);
  worksheet.getCell("AA1").value = { formula: "$X5-44889" };
  worksheet.getCell("AB5").value = { formula: "WEEKDAY(X5)" };

  for (const field of HEADCOUNT_FIELDS) {
    const parsed = parseIntegerString(draft.headcount[field.key]);
    worksheet.getCell(field.cell).value = parsed.number ?? 0;
  }

  for (const entry of scopedDraft.entries) {
    const config = ENTRY_BY_KEY.get(entry.key);
    const count = parseIntegerString(entry.count).number;
    worksheet.getCell(config.countCell).value = count ?? null;

    const segments =
      nextValidation.summarySegmentsByDate?.[date]?.[entry.key] ||
      nextValidation.summarySegmentsByKey[entry.key] ||
      config.summaryCells.map(() => "");
    config.summaryCells.forEach((cell, index) => {
      const targetCell = worksheet.getCell(cell);
      targetCell.value = segments[index] || null;
      targetCell.alignment = {
        ...targetCell.alignment,
        horizontal: "left",
        vertical: "top",
        wrapText: true,
        shrinkToFit: false,
      };
    });

    const rowHeight = estimateSummaryRowHeight(entry.summary);
    if (rowHeight) {
      const row = worksheet.getRow(entry.row);
      row.height = Math.max(Number(row.height || 17.25), rowHeight);
    }
  }

  const { insertedBeforeSignatures, insertedRows } = insertDynamicEntryRows(
    worksheet,
    scopedDraft.dynamicEntries,
    tradeRowMergeLayouts,
  );
  repairTradeRowMerges(worksheet, tradeRowMergeLayouts, insertedRows);
  repairGroupColumnMerges(worksheet, groupColumnLayouts, insertedRows);

  for (const field of SIGNATORY_FIELDS) {
    worksheet.getCell(shiftCellRow(field.cell, insertedBeforeSignatures)).value = sanitizeText(
      draft.signatories[field.key],
    );
  }
}
