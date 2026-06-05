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
    parsedEntries: (report.parsedEntries || []).map((entry) => ({
      ...entry,
      sources: [...(entry.sources || [])],
    })),
    ignoredLines: [...(report.ignoredLines || [])],
    ambiguousBlocks: (report.ambiguousBlocks || []).map((block) => ({ ...block })),
  };
}

function reportFromDraft(draft, rawText = "") {
  return cloneReport({
    rawText,
    entries: draft.entries,
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
    const looksLikeHeader = !hasPeopleCount(line) && (headerMatch.entry || headerMatch.ambiguous);
    if (looksLikeHeader) {
      parseBlock(draft, currentBlock);
      currentBlock = {
        title: line,
        entry: headerMatch.entry,
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
    parsedEntries: (draft.parsedEntries || []).map((entry) => ({
      ...entry,
      sources: [...(entry.sources || [])],
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
  return {
    date,
    sheetName: getSheetNameForDate(date),
    dayNumber: getDayNumber(date),
    weather: getWeatherForDate(draft, date),
    headcount: HEADCOUNT_FIELDS.map((field) => ({
      ...field,
      value: draft.headcount[field.key] || "0",
    })),
    entries: scopedDraft.entries.filter((entry) => sanitizeText(entry.count) || sanitizeText(entry.summary)),
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

export function applyDraftToWorksheet(worksheet, draft, validation = null, targetDate = "") {
  const nextValidation = validation || validateDraft(draft);
  if (!nextValidation.isValid) throw new Error(nextValidation.errors.join("\n"));

  const date = canonicalizeDate(targetDate) || nextValidation.dates[0];
  const scopedDraft = getDraftForDate(draft, date);
  const [year, month, day] = date.split("-").map(Number);
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

  for (const field of SIGNATORY_FIELDS) {
    worksheet.getCell(field.cell).value = sanitizeText(draft.signatories[field.key]);
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
}
