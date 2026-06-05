import templateWorkbookUrl from "./日報表/西沙(工地B)_2B大樓T15日報表 - 2026-4.xlsx?url";
import {
  applyDraftToWorksheet,
  buildExportFilename,
  canonicalizeDate,
  cloneDraft,
  createEmptyDraft,
  getDayNumber,
  getMonthDays,
  getMonthKey,
  getPreviewModel,
  getReportForDate,
  getWeatherForDate,
  getSheetNameForDate,
  parseRawTextToDraft,
  setReportForDate,
  setWeatherForDate,
  sortDates,
  validateDraft,
} from "./daily-report-core.js";
import {
  TEMPLATE_NAME,
  TEMPLATE_TITLE,
  TEMPLATE_WORKBOOK_SOURCE,
  WEATHER_CHOICES,
} from "./daily-report-data.js";

const app = document.querySelector("#daily-report-app");
const AUTOPARSE_DELAY_MS = 500;

const state = {
  draft: createEmptyDraft(),
  calendarMonth: getMonthKey(createEmptyDraft().selectedDates[0]),
  previewDate: createEmptyDraft().selectedDates[0],
  message: "",
  error: "",
  exportBusy: false,
  lastDownloadedName: "",
};

let templateBufferPromise = null;
let excelJsModulePromise = null;
let lastObjectUrl = "";
let autoparseTimer = 0;
let isComposingRawInput = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDisplayDate(date) {
  const canonical = canonicalizeDate(date);
  if (!canonical) return "";
  return canonical.replaceAll("-", "/");
}

function formatMonthTitle(monthKey) {
  const [year, month] = String(monthKey || "").split("-");
  if (!year || !month) return "";
  return `${year}年${Number(month)}月`;
}

function sumParsedPeople() {
  return (getActiveReport().parsedEntries || []).reduce((sum, entry) => sum + Number(entry.count || 0), 0);
}

function getActivePreviewDate() {
  const dates = sortDates(state.draft.selectedDates);
  const previewDate = canonicalizeDate(state.previewDate);
  if (previewDate && dates.includes(previewDate)) return previewDate;
  return dates[0] || previewDate || "";
}

function getWeatherFilledCount(dates) {
  return dates.filter((date) => {
    const weather = getWeatherForDate(state.draft, date);
    return weather.morning && weather.afternoon;
  }).length;
}

function getActiveReport() {
  return getReportForDate(state.draft, getActivePreviewDate());
}

function setActiveRawText(rawText) {
  const date = getActivePreviewDate();
  const report = getReportForDate(state.draft, date);
  setReportForDate(state.draft, date, {
    ...report,
    rawText,
  });
}

function scheduleParse() {
  if (isComposingRawInput) return;
  window.clearTimeout(autoparseTimer);
  autoparseTimer = window.setTimeout(() => {
    runRawParse("自動整理完成");
  }, AUTOPARSE_DELAY_MS);
}

function runRawParse(message = "整理完成") {
  if (isComposingRawInput) return;
  const rawInputState = captureRawInputState();
  const activeDate = getActivePreviewDate();
  const result = parseRawTextToDraft(getActiveReport().rawText, state.draft, {
    reportDate: activeDate,
    weatherDate: getActivePreviewDate(),
  });
  state.draft = result.draft;
  state.message = message;
  state.error = "";
  render({ rawInputState });
}

function clearInput() {
  const activeDate = getActivePreviewDate();
  const result = parseRawTextToDraft("", state.draft, {
    reportDate: activeDate,
    weatherDate: activeDate,
  });
  state.draft = result.draft;
  state.message = "已清空輸入。";
  state.error = "";
  render();
}

function renderHeader() {
  return `
    <header class="dr-top">
      <div>
        <h1>日報表填充站</h1>
        <p>「${escapeHtml(TEMPLATE_NAME)}」</p>
      </div>
      <button type="button" class="dr-primary-action" data-action="export" ${state.exportBusy ? "disabled" : ""}>
        ${state.exportBusy ? "生成中..." : "下載 Excel"}
      </button>
    </header>
  `;
}

function renderInputPane() {
  const activeReport = getActiveReport();
  return `
    <section class="dr-pane dr-input-pane">
      <div class="dr-pane-toolbar">
        <span class="dr-pane-label">輸入</span>
        <div class="dr-button-row">
          <button type="button" data-action="parse">整理</button>
          <button type="button" data-action="clear">清空</button>
        </div>
      </div>
      <textarea
        class="dr-raw-input"
        data-kind="raw-text"
        spellcheck="false"
        placeholder="力佳消防
1/F 單位安裝消防頭 1人

海聯
33/F H單位封廁所天花2人；33/F A單位廚房天花2人"
      >${escapeHtml(activeReport.rawText)}</textarea>
    </section>
  `;
}

function getDetailValidationErrors(validation) {
  const handledByCheckCards = new Set([
    "請至少選擇一個日期。",
  ]);
  return validation.errors.filter((item) => !handledByCheckCards.has(item));
}

function renderCalendar() {
  const monthDays = getMonthDays(state.calendarMonth);
  const selectedDates = new Set(sortDates(state.draft.selectedDates));
  const firstDay = monthDays[0] ? new Date(monthDays[0]).getDay() : 0;
  const blanks = Array.from({ length: firstDay }, (_, index) => `<span class="dr-calendar-blank" aria-hidden="true" data-blank="${index}"></span>`).join("");
  const days = monthDays
    .map((date) => {
      const selected = selectedDates.has(date);
      return `
        <button
          type="button"
          class="dr-calendar-day ${selected ? "is-selected" : ""}"
          data-action="toggle-date"
          data-date="${date}"
          aria-pressed="${selected ? "true" : "false"}"
        >
          ${Number(date.slice(8, 10))}
        </button>
      `;
    })
    .join("");

  return `
    <div class="dr-calendar">
      <div class="dr-calendar-head">
        <button type="button" data-action="month-shift" data-shift="-1" aria-label="上一個月">‹</button>
        <span>${escapeHtml(formatMonthTitle(state.calendarMonth))}</span>
        <button type="button" data-action="month-shift" data-shift="1" aria-label="下一個月">›</button>
      </div>
      <div class="dr-calendar-week">
        <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
      </div>
      <div class="dr-calendar-grid">${blanks}${days}</div>
    </div>
  `;
}

function renderWeatherControl(period, label) {
  const value = getWeatherForDate(state.draft, getActivePreviewDate())[period];
  return `
    <div class="dr-weather-control">
      <span>${escapeHtml(label)}</span>
      <div>
        ${WEATHER_CHOICES.map(
          (choice) => `
            <button
              type="button"
              class="${value === choice ? "is-selected" : ""}"
              data-action="set-weather"
              data-period="${period}"
              data-weather="${choice}"
              aria-pressed="${value === choice ? "true" : "false"}"
            >
              ${choice}
            </button>
          `,
        ).join("")}
      </div>
    </div>
  `;
}

function renderCheckPane() {
  const validation = validateDraft(state.draft);
  const detailErrors = getDetailValidationErrors(validation);
  const selectedDates = sortDates(state.draft.selectedDates);
  const activeDate = getActivePreviewDate();
  const activeWeather = getWeatherForDate(state.draft, activeDate);
  const weatherFilledCount = getWeatherFilledCount(selectedDates);
  const activeReport = getActiveReport();
  const activeEntries = activeReport.parsedEntries.length;
  const pendingLineHeadCount = activeReport.parsedEntries.filter((entry) => entry.needsReview).length;
  const ignoredCount = activeReport.ignoredLines.length;
  const ambiguousCount = activeReport.ambiguousBlocks.length;
  const allWeatherFilled = selectedDates.length > 0 && weatherFilledCount === selectedDates.length;

  return `
    <section class="dr-pane dr-check-pane">
      <div class="dr-pane-toolbar">
        <span class="dr-pane-label">檢查</span>
        <span class="dr-template-source">${escapeHtml(TEMPLATE_WORKBOOK_SOURCE)} 樣板</span>
      </div>
      ${renderCalendar()}
      <div class="dr-weather-row">
        ${renderWeatherControl("morning", "上午天氣")}
        ${renderWeatherControl("afternoon", "下午天氣")}
      </div>
      <div class="dr-check-list">
        <div class="${selectedDates.length ? "is-ok" : "is-missing"}">
          <strong>日期</strong><span>${selectedDates.length ? `${selectedDates.length}日已選` : "未選擇"}</span>
        </div>
        <div class="${allWeatherFilled ? "is-ok" : "is-missing"}">
          <strong>天氣</strong><span>${selectedDates.length ? `${weatherFilledCount}/${selectedDates.length}日已填` : "未選擇日期"}</span>
        </div>
        <div class="${activeWeather.morning && activeWeather.afternoon ? "is-ok" : "is-missing"}">
          <strong>當前天氣</strong>
          <span>${activeDate ? formatDisplayDate(activeDate).slice(5) : "-"} 上午 ${activeWeather.morning || "-"} / 下午 ${activeWeather.afternoon || "-"}</span>
        </div>
        <div class="is-ok">
          <strong>判頭工種</strong><span>${activeEntries}項已識別 / ${sumParsedPeople()}人</span>
        </div>
        <div class="is-muted">
          <strong>未識別文字</strong><span>${ignoredCount}行已忽略</span>
        </div>
        <div class="${ambiguousCount ? "is-attention" : "is-ok"}">
          <strong>需確認</strong><span>${ambiguousCount}項</span>
        </div>
        <div class="${pendingLineHeadCount ? "is-attention" : "is-ok"}">
          <strong>待確認行頭</strong><span>${pendingLineHeadCount}項</span>
        </div>
      </div>
      ${detailErrors.length ? `<div class="dr-issue-block">${detailErrors.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</div>` : ""}
      ${activeReport.ambiguousBlocks.length ? renderAmbiguousBlocks(activeReport) : ""}
      ${state.error ? `<div class="dr-status dr-status-error">${escapeHtml(state.error)}</div>` : ""}
      ${state.message ? `<div class="dr-status dr-status-success">${escapeHtml(state.message)}</div>` : ""}
    </section>
  `;
}

function renderAmbiguousBlocks(report) {
  return `
    <div class="dr-ambiguous-list">
      ${report.ambiguousBlocks
        .map(
          (block) => `
            <p><strong>${escapeHtml(block.title)}</strong><span>${escapeHtml(block.reason)}</span></p>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderPreviewPane() {
  const dates = sortDates(state.draft.selectedDates);
  const activeDate = getActivePreviewDate();
  const previewDate = activeDate && dates.includes(activeDate) ? activeDate : dates[0];
  const preview = getPreviewModel(state.draft, previewDate);

  return `
    <section class="dr-pane dr-preview-pane">
      <div class="dr-pane-toolbar">
        <span class="dr-pane-label">預覽</span>
        <div class="dr-preview-tabs">
          ${dates
            .map(
              (date) => `
                <button
                  type="button"
                  class="${date === preview.date ? "is-selected" : ""}"
                  data-action="set-preview-date"
                  data-date="${date}"
                >
                  ${Number(date.slice(8, 10))}
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
      ${renderSheetPreview(preview)}
    </section>
  `;
}

function renderSheetPreview(preview) {
  const activeEntries = preview.entries.length ? preview.entries : [];
  return `
    <div class="dr-sheet">
      <div class="dr-sheet-row dr-company">
        <span>駿 輝 建 築 有 限 公 司</span>
        <span>第 ${escapeHtml(preview.dayNumber)} 天</span>
      </div>
      <div class="dr-sheet-row dr-title">${escapeHtml(TEMPLATE_TITLE)}</div>
      <div class="dr-sheet-row dr-meta">
        <span>天氣：上午 ${escapeHtml(preview.weather.morning || "-")}</span>
        <span>下午 ${escapeHtml(preview.weather.afternoon || "-")}</span>
        <span>日期：${escapeHtml(formatDisplayDate(preview.date))}</span>
        <span>Sheet ${escapeHtml(preview.sheetName)}</span>
      </div>
      <div class="dr-sheet-grid dr-sheet-head">
        <span>職別</span><span>職員</span><span>平水 / 平什</span><span>男女什工</span><span>看更</span>
      </div>
      <div class="dr-sheet-grid">
        <span>上班人數</span>
        <span>${escapeHtml(preview.headcount.find((item) => item.key === "staffRegular")?.value || "0")}</span>
        <span>${escapeHtml(preview.headcount.find((item) => item.key === "labourRegular")?.value || "0")}</span>
        <span>${escapeHtml(preview.headcount.find((item) => item.key === "miscRegular")?.value || "0")}</span>
        <span>${escapeHtml(preview.headcount.find((item) => item.key === "security")?.value || "0")}</span>
      </div>
      <div class="dr-trade-grid dr-trade-head">
        <span>工程總類</span><span>判頭</span><span>人數</span><span>進度簡況</span>
      </div>
      ${
        activeEntries.length
          ? activeEntries
              .map(
                (entry) => `
                  <div class="dr-trade-grid">
                    <span>${escapeHtml(entry.label)}</span>
                    <span>${escapeHtml(entry.contractor)}</span>
                    <span>${escapeHtml(entry.count || "")}</span>
                    <span>${escapeHtml(entry.summary || "")}</span>
                  </div>
                `,
              )
              .join("")
          : `<div class="dr-empty-preview">尚未識別到可寫入的工種資料</div>`
      }
    </div>
  `;
}

function captureRawInputState() {
  const target = document.activeElement;
  if (!(target instanceof HTMLTextAreaElement)) return null;
  if (target.dataset.kind !== "raw-text") return null;

  return {
    selectionStart: target.selectionStart,
    selectionEnd: target.selectionEnd,
    scrollTop: target.scrollTop,
    windowScrollX: window.scrollX,
    windowScrollY: window.scrollY,
  };
}

function restoreRawInputState(rawInputState) {
  if (!rawInputState) return;
  const target = app.querySelector('textarea[data-kind="raw-text"]');
  if (!(target instanceof HTMLTextAreaElement)) return;

  target.focus({ preventScroll: true });
  const textLength = target.value.length;
  target.setSelectionRange(
    Math.min(rawInputState.selectionStart, textLength),
    Math.min(rawInputState.selectionEnd, textLength),
  );
  target.scrollTop = rawInputState.scrollTop;
  window.scrollTo(rawInputState.windowScrollX, rawInputState.windowScrollY);
}

function render(options = {}) {
  app.innerHTML = `
    <main class="dr-shell">
      ${renderHeader()}
      <div class="dr-workbench">
        ${renderInputPane()}
        ${renderCheckPane()}
        ${renderPreviewPane()}
      </div>
    </main>
  `;
  restoreRawInputState(options.rawInputState);
}

async function getTemplateArrayBuffer() {
  if (!templateBufferPromise) {
    templateBufferPromise = fetch(templateWorkbookUrl).then(async (response) => {
      if (!response.ok) throw new Error(`無法讀取樣板檔案：${response.status}`);
      return response.arrayBuffer();
    });
  }
  return templateBufferPromise;
}

async function getExcelJs() {
  if (!excelJsModulePromise) {
    excelJsModulePromise = import("exceljs").then((module) => module.default || module);
  }
  return excelJsModulePromise;
}

function triggerDownload(blob, filename) {
  if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
  lastObjectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = lastObjectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function cloneWorksheet(workbook, sourceSheet, name) {
  const model = JSON.parse(JSON.stringify(sourceSheet.model));
  const clone = workbook.addWorksheet(name);
  clone.model = {
    ...model,
    id: clone.id,
    name,
  };
  return clone;
}

function findTemplateSheet(workbook, date) {
  const sheetName = getSheetNameForDate(date);
  const existing = workbook.getWorksheet(sheetName);
  if (existing) return existing;

  const day = Number(sheetName);
  const candidates = workbook.worksheets
    .map((sheet) => ({ sheet, day: Number(sheet.name) }))
    .filter((item) => Number.isFinite(item.day))
    .sort((left, right) => Math.abs(left.day - day) - Math.abs(right.day - day));

  return candidates[0]?.sheet || workbook.worksheets[0];
}

async function exportWorkbook() {
  const validation = validateDraft(state.draft);
  if (!validation.isValid) {
    state.error = "仍有必填資料未完成，請先處理檢查窗口。";
    state.message = "";
    render();
    return;
  }

  state.exportBusy = true;
  state.error = "";
  state.message = "";
  render();

  try {
    const buffer = await getTemplateArrayBuffer();
    const ExcelJS = await getExcelJs();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer.slice(0));
    workbook.calcProperties = {
      ...workbook.calcProperties,
      fullCalcOnLoad: true,
    };

    const selectedDates = validation.dates;
    const keepNames = new Set();
    for (const date of selectedDates) {
      const sheetName = getSheetNameForDate(date);
      let sheet = workbook.getWorksheet(sheetName);
      if (!sheet) {
        sheet = cloneWorksheet(workbook, findTemplateSheet(workbook, date), sheetName);
      }
      keepNames.add(sheetName);
      applyDraftToWorksheet(sheet, state.draft, validation, date);
    }

    for (const sheet of [...workbook.worksheets]) {
      if (!keepNames.has(sheet.name)) workbook.removeWorksheet(sheet.id);
    }

    const output = await workbook.xlsx.writeBuffer();
    const filename = buildExportFilename(state.draft);
    triggerDownload(
      new Blob([output], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      filename,
    );

    state.lastDownloadedName = filename;
    state.message = `已生成 ${selectedDates.length} 個 sheet：${filename}`;
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Excel 導出失敗。";
  } finally {
    state.exportBusy = false;
    render();
  }
}

function toggleDate(date) {
  const canonical = canonicalizeDate(date);
  if (!canonical) return;
  const dates = new Set(sortDates(state.draft.selectedDates));

  if (dates.has(canonical)) {
    dates.delete(canonical);
  } else {
    const month = getMonthKey(canonical);
    for (const item of [...dates]) {
      if (getMonthKey(item) !== month) dates.delete(item);
    }
    dates.add(canonical);
  }

  state.draft.selectedDates = sortDates([...dates]);
  state.previewDate = state.draft.selectedDates.includes(canonical)
    ? canonical
    : state.draft.selectedDates.includes(state.previewDate)
      ? state.previewDate
      : state.draft.selectedDates[0] || canonical;
  state.calendarMonth = getMonthKey(canonical);
  state.error = "";
  state.message = "";
  render();
}

function shiftMonth(delta) {
  const [year, month] = state.calendarMonth.split("-").map(Number);
  const next = new Date(year, month - 1 + Number(delta), 1);
  state.calendarMonth = `${next.getFullYear()}-${`${next.getMonth() + 1}`.padStart(2, "0")}`;
  render();
}

app.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (target.dataset.kind !== "raw-text") return;
  setActiveRawText(target.value);
  if (event.isComposing || isComposingRawInput) return;
  scheduleParse();
});

app.addEventListener("compositionstart", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (target.dataset.kind !== "raw-text") return;
  isComposingRawInput = true;
  window.clearTimeout(autoparseTimer);
});

app.addEventListener("compositionend", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (target.dataset.kind !== "raw-text") return;
  isComposingRawInput = false;
  setActiveRawText(target.value);
  scheduleParse();
});

app.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const actionTarget = target.closest("[data-action]");
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;
  if (action === "parse" && !isComposingRawInput) runRawParse("整理完成");
  if (action === "clear") clearInput();
  if (action === "export") exportWorkbook();
  if (action === "toggle-date") toggleDate(actionTarget.dataset.date || "");
  if (action === "month-shift") shiftMonth(actionTarget.dataset.shift || 0);
  if (action === "set-weather") {
    setWeatherForDate(
      state.draft,
      getActivePreviewDate(),
      actionTarget.dataset.period,
      actionTarget.dataset.weather || "",
    );
    state.error = "";
    state.message = "";
    render();
  }
  if (action === "set-preview-date") {
    state.previewDate = actionTarget.dataset.date || state.previewDate;
    render();
  }
});

render();
