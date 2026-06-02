import { createClient } from "@supabase/supabase-js";

const app = document.querySelector("#v3-app");

const VERSION = "V3.4";
const ADMIN_EMAIL = "lyl549439629@gmail.com";
const REPORT_STATE_ID = "current";
const ASSET_BUCKET = "report-assets";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);
const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseKey) : null;

const defaultTheme = {
  background: {
    url: "/images/gopark-background.jpg",
    opacity: 0.65,
  },
  cards: {},
};

const state = {
  baseReport: null,
  report: null,
  theme: structuredClone(defaultTheme),
  loading: true,
  error: "",
  isAdminMode: new URLSearchParams(window.location.search).get("admin") === "1",
  session: null,
  isAdmin: false,
  authMessage: "",
  editorOpen: false,
  draft: null,
  saving: false,
  uploading: "",
  activeDetailKey: "",
  expandedTableRows: {},
  lightbox: null,
};

const overviewKeys = ["hacking_progress", "clp_draw_pit"];
const contentKeys = ["fountain_programme", "additional_works", "defect"];

let lightboxDrag = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function clone(value) {
  return structuredClone(value);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isEmptyObject(value) {
  return isObject(value) && Object.keys(value).length === 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function mergeTheme(theme) {
  return {
    ...clone(defaultTheme),
    ...(isObject(theme) ? theme : {}),
    background: {
      ...defaultTheme.background,
      ...(isObject(theme?.background) ? theme.background : {}),
    },
    cards: {
      ...(isObject(theme?.cards) ? theme.cards : {}),
    },
  };
}

function normalizeColumnId(value, index) {
  return String(value || `column_${index + 1}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || `column_${index + 1}`;
}

function parseProgrammeDate(status) {
  const text = String(status || "");
  const range = text.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\/(\d{1,2})/);
  if (range) {
    return {
      start: `${range[1].padStart(2, "0")}/${range[3].padStart(2, "0")}`,
      end: `${range[2].padStart(2, "0")}/${range[3].padStart(2, "0")}`,
    };
  }

  const single = text.match(/(\d{1,2})\/(\d{1,2})/);
  if (single) {
    const value = `${single[1].padStart(2, "0")}/${single[2].padStart(2, "0")}`;
    return { start: value, end: value };
  }

  return { start: "", end: "" };
}

function checklistToGantt(checklist = []) {
  return checklist.map((item, index) => {
    const dates = parseProgrammeDate(item.status);
    const completed = Boolean(item.checked) || String(item.status || "").toLowerCase() === "completed";
    return {
      id: item.id || makeId(`task_${index + 1}`),
      task: item.label || "",
      status: item.status || "",
      start: dates.start,
      end: dates.end,
      completed,
    };
  });
}

function normalizeGantt(section) {
  if (Array.isArray(section.gantt)) {
    section.gantt = section.gantt.map((item, index) => ({
      id: item.id || makeId(`task_${index + 1}`),
      task: item.task ?? item.label ?? "",
      status: item.status ?? "",
      start: item.start ?? parseProgrammeDate(item.status).start,
      end: item.end ?? parseProgrammeDate(item.status).end,
      completed: Boolean(item.completed ?? item.checked),
    }));
    delete section.checklist;
    return;
  }

  if (Array.isArray(section.checklist)) {
    section.gantt = checklistToGantt(section.checklist);
    delete section.checklist;
  }
}

function normalizeTable(section) {
  const original = section.table;
  if (!original) return;

  if (Array.isArray(original)) {
    section.table = {
      columns: [
        { id: "works", label: "Works" },
        { id: "status", label: "Status" },
      ],
      rows: original.map((row, index) => ({
        id: row.id || makeId(`row_${index + 1}`),
        cells: {
          works: row.works || "",
          status: row.status || "",
        },
        media: Array.isArray(row.media) ? row.media : [],
      })),
    };
    return;
  }

  const columns = Array.isArray(original.columns) && original.columns.length
    ? original.columns.map((column, index) => ({
        id: normalizeColumnId(column.id || column.label, index),
        label: column.label || column.id || `Column ${index + 1}`,
      }))
    : [
        { id: "works", label: "Works" },
        { id: "status", label: "Status" },
      ];

  const rows = Array.isArray(original.rows)
    ? original.rows.map((row, index) => {
        const cells = {};
        columns.forEach((column) => {
          cells[column.id] =
            row.cells?.[column.id] ??
            row[column.id] ??
            (column.id === "works" ? row.works : column.id === "status" ? row.status : "") ??
            "";
        });

        return {
          id: row.id || makeId(`row_${index + 1}`),
          cells,
          media: Array.isArray(row.media) ? row.media : [],
        };
      })
    : [];

  section.table = { columns, rows };
}

function normalizeReport(report) {
  const next = clone(report);
  next.sections = (next.sections || []).map((section) => {
    const normalized = { ...section };
    if (normalized.section_key === "fountain_programme") normalizeGantt(normalized);
    if (normalized.table) normalizeTable(normalized);
    return normalized;
  });
  return next;
}

function sectionByKey(key, report = state.report) {
  return report?.sections?.find((section) => section.section_key === key);
}

function metric(section, label) {
  return section?.metrics?.find((item) => item.label === label)?.value || "";
}

function progressPercent(section) {
  const value = metric(section, "Progress");
  const match = value.match(/[0-9.]+/);
  return match ? Math.min(100, Number(match[0])) : 0;
}

function sectionCardTheme(section) {
  return state.theme.cards?.[section.section_key] || {};
}

function readableTextColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) return "";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.58 ? "#17181c" : "#f7f8f8";
}

function cardStyle(section) {
  const card = sectionCardTheme(section);
  if (!card.background) return "";
  const ink = readableTextColor(card.background);
  return ` style="--card-bg: ${escapeAttr(card.background)}; ${ink ? `--card-ink: ${ink}; --card-muted: ${ink}; --card-subtle: ${ink}; --card-tertiary: ${ink};` : ""}"`;
}

function applyTheme() {
  const background = state.theme.background || defaultTheme.background;
  document.documentElement.style.setProperty("--report-bg-url", `url("${background.url || defaultTheme.background.url}")`);
  document.documentElement.style.setProperty("--report-bg-opacity", String(background.opacity ?? defaultTheme.background.opacity));
}

async function init() {
  try {
    const response = await fetch("/data/report.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load report (${response.status}).`);
    state.baseReport = normalizeReport(await response.json());
    state.report = clone(state.baseReport);

    if (supabase) {
      await initSupabase();
      await loadPublishedState();
    }
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    applyTheme();
    render();
  }
}

async function initSupabase() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  await refreshAdmin();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    await refreshAdmin();
    render();
  });
}

async function refreshAdmin() {
  state.isAdmin = false;
  if (!supabase || !state.session) return;

  const { data, error } = await supabase.rpc("is_report_admin");
  if (error) {
    state.authMessage = error.message;
    return;
  }
  state.isAdmin = Boolean(data);
}

async function loadPublishedState() {
  const { data, error } = await supabase
    .from("report_page_state")
    .select("report, theme")
    .eq("id", REPORT_STATE_ID)
    .maybeSingle();

  if (error) {
    state.authMessage = `Published edits unavailable: ${error.message}`;
    return;
  }

  if (data?.report && !isEmptyObject(data.report)) {
    state.report = normalizeReport(data.report);
  }

  state.theme = mergeTheme(data?.theme);
}

function renderLoading() {
  app.innerHTML = `
    <main class="v3-boot">
      <p class="v3-eyebrow">Morning Meeting Report</p>
      <h1>Loading report</h1>
    </main>
  `;
}

function renderError() {
  app.innerHTML = `
    <main class="v3-boot">
      <section class="v3-alert">
        <p class="v3-eyebrow">Report unavailable</p>
        <h1>Unable to load report</h1>
        <p>${escapeHtml(state.error)}</p>
      </section>
    </main>
  `;
}

function renderMetaPills(report) {
  const header = report.report_header;
  return `
    <div class="v3-meta">
      <span>${escapeHtml(header.reporter)}</span>
      <span>${escapeHtml(header.date)}</span>
    </div>
  `;
}

function renderLastUpdatedCard(report) {
  return `
    <div class="v3-hero-updated" aria-label="Last updated">
      <p class="v3-eyebrow">Last Updated</p>
      <strong>${escapeHtml(report.report_header.date)}</strong>
    </div>
  `;
}

function renderFactList(section) {
  return `
    <dl class="v3-facts">
      ${(section.metrics || [])
        .filter((item) => item.label !== "Progress")
        .map(
          (item) => `
            <div class="v3-fact">
              <dt>${escapeHtml(item.label)}</dt>
              <dd>${escapeHtml(item.value)}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function renderMediaPreview(section) {
  const media = section.media || [];
  if (!media.length) return "";
  return `
    <button class="v3-card-media" type="button" data-action="open-section-lightbox" data-section-key="${escapeAttr(section.section_key)}" data-media-index="0" aria-label="Open ${escapeAttr(section.title)} image">
      <img src="${escapeAttr(media[0].url)}" alt="${escapeAttr(media[0].caption || section.title)}" loading="lazy" />
      ${media.length > 1 ? `<span>${media.length} images</span>` : ""}
    </button>
  `;
}

function renderProgressCard(section) {
  const percent = progressPercent(section);
  const progress = metric(section, "Progress");

  return `
    <article class="v3-progress-card" id="${escapeAttr(section.section_key)}" data-detail-key="${escapeAttr(section.section_key)}" role="button" tabindex="0"${cardStyle(section)}>
      ${renderMediaPreview(section)}
      <div class="v3-card-head">
        <div>
          <h3>${escapeHtml(section.title)}</h3>
          ${section.subtitle ? `<p>${escapeHtml(section.subtitle)}</p>` : ""}
        </div>
        ${progress ? `<strong class="v3-progress-number">${escapeHtml(progress)}</strong>` : ""}
      </div>
      ${
        progress
          ? `<div class="v3-progress-track" aria-label="Progress ${escapeHtml(progress)}"><span style="width: ${percent}%"></span></div>`
          : ""
      }
      ${renderFactList(section)}
    </article>
  `;
}

function dateOrdinal(value) {
  const match = String(value || "").match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  return Number(match[2]) * 31 + Number(match[1]);
}

function ganttBounds(tasks) {
  const values = tasks.flatMap((item) => [dateOrdinal(item.start), dateOrdinal(item.end)]).filter(Number.isFinite);
  if (!values.length) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max: min === max ? min + 1 : max };
}

function ganttStyle(item, bounds) {
  const start = dateOrdinal(item.start);
  const end = dateOrdinal(item.end || item.start);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "left: 0%; width: 50%;";
  }

  const span = bounds.max - bounds.min;
  const left = ((start - bounds.min) / span) * 100;
  const rawWidth = Math.max(((end - start) / span) * 100, 14);
  const width = clamp(rawWidth * 0.5, 14, 100 - left);
  return `left: ${clamp(left, 0, 100)}%; width: ${width}%;`;
}

function ganttStatus(item) {
  if (item.status) return item.status;
  if (item.start && item.end && item.start !== item.end) return `${item.start} - ${item.end}`;
  if (item.start) return item.start;
  return "TBC";
}

function renderGantt(section) {
  const tasks = section.gantt || [];
  const bounds = ganttBounds(tasks);

  return `
    <div class="v3-gantt">
      ${tasks
        .map(
          (item) => `
            <div class="v3-gantt-row ${item.completed ? "is-complete" : ""}">
              <div class="v3-gantt-label">
                <strong>${escapeHtml(item.task)}</strong>
                <span>${escapeHtml(ganttStatus(item))}</span>
              </div>
              <div class="v3-gantt-track" aria-label="${escapeAttr(item.task)} ${escapeAttr(ganttStatus(item))}">
                <span style="${ganttStyle(item, bounds)}">${escapeHtml(item.completed ? "Completed" : ganttStatus(item))}</span>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function tableColumns(section) {
  return section.table?.columns || [];
}

function tableRows(section) {
  return section.table?.rows || [];
}

function tableGridStyle(section) {
  const columns = tableColumns(section);
  const minWidth = Math.max(columns.length * 180, 360);
  return {
    table: ` style="min-width: ${minWidth}px"`,
    row: ` style="grid-template-columns: repeat(${Math.max(columns.length, 1)}, minmax(180px, 1fr))"`,
  };
}

function tableCellValue(row, column) {
  return row.cells?.[column.id] || "";
}

function renderRowMedia(section, row, rowIndex) {
  const media = row.media || [];
  return `
    <div class="v3-table-row-media">
      ${
        media.length
          ? media
              .map(
                (item, mediaIndex) => `
                  <button class="v3-row-media-frame" type="button" data-action="open-row-lightbox" data-section-key="${escapeAttr(section.section_key)}" data-row-id="${escapeAttr(row.id)}" data-media-index="${mediaIndex}" aria-label="Open row ${rowIndex + 1} image">
                    <img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.caption || `Row ${rowIndex + 1}`)}" loading="lazy" />
                    ${item.caption ? `<span>${escapeHtml(item.caption)}</span>` : ""}
                  </button>
                `,
              )
              .join("")
          : '<div class="v3-row-media-placeholder">No row image added</div>'
      }
    </div>
  `;
}

function renderTable(section) {
  const columns = tableColumns(section);
  const rows = tableRows(section);
  const style = tableGridStyle(section);
  const expandedRowId = state.expandedTableRows[section.section_key];

  return `
    <div class="v3-table-scroll">
      <div class="v3-table"${style.table} role="table">
        <div class="v3-table-row v3-table-head" role="row"${style.row}>
          ${columns.map((column) => `<span role="columnheader">${escapeHtml(column.label)}</span>`).join("")}
        </div>
        ${
          rows.length
            ? rows
                .map(
                  (row, rowIndex) => `
                    <div class="v3-table-row" role="row"${style.row}>
                      ${columns
                        .map(
                          (column) => `
                            <button class="v3-table-cell" type="button" role="cell" data-action="toggle-table-row" data-section-key="${escapeAttr(section.section_key)}" data-row-id="${escapeAttr(row.id)}">
                              ${tableCellValue(row, column) ? escapeHtml(tableCellValue(row, column)) : '<span class="v3-muted">blank / no status</span>'}
                            </button>
                          `,
                        )
                        .join("")}
                    </div>
                    ${expandedRowId === row.id ? renderRowMedia(section, row, rowIndex) : ""}
                  `,
                )
                .join("")
            : `<div class="v3-table-empty">No rows</div>`
        }
      </div>
    </div>
  `;
}

function renderContentSection(section) {
  const content = section.gantt ? renderGantt(section) : renderTable(section);

  return `
    <article class="v3-panel" id="${escapeAttr(section.section_key)}" data-detail-key="${escapeAttr(section.section_key)}" role="button" tabindex="0"${cardStyle(section)}>
      ${renderMediaPreview(section)}
      <div class="v3-panel-head">
        <div>
          <h2>${escapeHtml(section.title)}</h2>
          ${section.subtitle ? `<p>${escapeHtml(section.subtitle)}</p>` : ""}
        </div>
      </div>
      ${content}
    </article>
  `;
}

function renderTopbar() {
  const adminControls = state.isAdminMode ? renderAdminControls() : "";
  return `
    <header class="v3-topbar">
      <a class="v3-brand" href="/" aria-label="Open Morning Meeting Report">
        <span class="v3-brand-mark"></span>
        <span>Morning Meeting Report</span>
      </a>
      <nav class="v3-actions" aria-label="Report actions">
        ${adminControls}
        <span>${VERSION}</span>
      </nav>
    </header>
  `;
}

function renderAdminControls() {
  if (!hasSupabaseConfig) return `<span>Supabase not configured</span>`;

  if (!state.session) {
    return `
      <form class="v3-admin-login" data-admin-login>
        <input name="email" type="email" value="${ADMIN_EMAIL}" aria-label="Admin email" required />
        <button type="submit">Email link</button>
      </form>
    `;
  }

  if (!state.isAdmin) {
    return `
      <span>Not authorized</span>
      <button type="button" data-action="logout">Logout</button>
    `;
  }

  return `
    <button type="button" data-action="open-editor">Edit</button>
    <button type="button" data-action="logout">Logout</button>
  `;
}

function renderAuthNotice() {
  if (!state.isAdminMode || !state.authMessage) return "";
  return `<div class="v3-admin-notice">${escapeHtml(state.authMessage)}</div>`;
}

function renderReport() {
  const report = state.report;
  const header = report.report_header;
  const progressSections = overviewKeys.map((key) => sectionByKey(key)).filter(Boolean);
  const contentSections = contentKeys.map((key) => sectionByKey(key)).filter(Boolean);

  app.innerHTML = `
    ${renderTopbar()}
    ${renderAuthNotice()}
    <main class="v3-shell">
      <section class="v3-content">
        <section class="v3-hero">
          <p class="v3-eyebrow">${escapeHtml(header.scope)}</p>
          <h1>${escapeHtml(header.title)}</h1>
          <p>${escapeHtml(header.subject)}</p>
          ${renderLastUpdatedCard(report)}
          ${renderMetaPills(report)}
        </section>

        <section class="v3-progress-overview" aria-label="Progress overview">
          <div class="v3-section-title">
            <p class="v3-eyebrow">Current progress</p>
            <h2>Progress Overview</h2>
          </div>
          <div class="v3-progress-grid">
            ${progressSections.map(renderProgressCard).join("")}
          </div>
        </section>

        <section class="v3-content-list" aria-label="Report details">
          ${contentSections.map(renderContentSection).join("")}
        </section>
      </section>
    </main>
    ${state.activeDetailKey ? renderDetailModal(sectionByKey(state.activeDetailKey)) : ""}
    ${state.lightbox ? renderLightbox() : ""}
    ${state.editorOpen && state.draft ? renderEditor() : ""}
  `;
}

function renderDetailModal(section) {
  if (!section) return "";
  return `
    <div class="v3-modal-backdrop" data-action="close-detail">
      <section class="v3-detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <button class="v3-icon-button" type="button" data-action="close-detail" aria-label="Close detail">×</button>
        <div>
          <h2 id="detail-title">${escapeHtml(section.title)}</h2>
          ${section.subtitle ? `<p>${escapeHtml(section.subtitle)}</p>` : ""}
        </div>
        ${renderDetailMedia(section)}
        ${section.metrics ? renderFactList(section) : ""}
        ${section.gantt ? renderGantt(section) : ""}
        ${section.table ? renderTable(section) : ""}
      </section>
    </div>
  `;
}

function renderDetailMedia(section) {
  const media = section.media || [];
  if (!media.length) return `<p class="v3-empty-media">No images added</p>`;
  return `
    <div class="v3-detail-media">
      ${media
        .map(
          (item, mediaIndex) => `
            <figure>
              <button class="v3-detail-image-button" type="button" data-action="open-section-lightbox" data-section-key="${escapeAttr(section.section_key)}" data-media-index="${mediaIndex}" aria-label="Open ${escapeAttr(item.caption || section.title)}">
                <img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.caption || section.title)}" />
              </button>
              ${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ""}
            </figure>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderLightbox() {
  const lightbox = state.lightbox;
  const item = lightbox.items[lightbox.index];
  const count = lightbox.items.length;
  return `
    <div class="v3-lightbox" data-action="close-lightbox" role="dialog" aria-modal="true" aria-label="Image viewer">
      <div class="v3-lightbox-toolbar">
        <span>${escapeHtml(item.caption || `Image ${lightbox.index + 1}`)}</span>
        <div>
          ${count > 1 ? `<button type="button" data-action="prev-lightbox">Prev</button><button type="button" data-action="next-lightbox">Next</button>` : ""}
          <button type="button" data-action="reset-lightbox">Reset</button>
          <button type="button" data-action="close-lightbox">Close</button>
        </div>
      </div>
      <div class="v3-lightbox-stage">
        <img class="v3-lightbox-image" src="${escapeAttr(item.url)}" alt="${escapeAttr(item.caption || "Report image")}" draggable="false" style="transform: translate(${lightbox.x}px, ${lightbox.y}px) scale(${lightbox.scale});" />
      </div>
      <p class="v3-lightbox-hint">Command/Ctrl + mouse wheel to zoom. Drag to pan. Double click to reset.</p>
    </div>
  `;
}

function renderEditor() {
  const draft = state.draft;
  const report = draft.report;
  const theme = draft.theme;

  return `
    <div class="v3-editor-backdrop">
      <aside class="v3-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div class="v3-editor-head">
          <div>
            <p class="v3-eyebrow">Admin editor</p>
            <h2 id="editor-title">Publish ${VERSION} edits</h2>
          </div>
          <button class="v3-icon-button" type="button" data-action="close-editor" aria-label="Close editor">×</button>
        </div>

        <div class="v3-editor-actions">
          <button type="button" data-action="save-editor" ${state.saving ? "disabled" : ""}>${state.saving ? "Saving..." : "Save / Publish"}</button>
          <button type="button" data-action="close-editor">Cancel</button>
        </div>

        ${state.uploading ? `<p class="v3-admin-notice">Uploading ${escapeHtml(state.uploading)}...</p>` : ""}
        ${state.authMessage ? `<p class="v3-admin-notice">${escapeHtml(state.authMessage)}</p>` : ""}

        <div class="v3-editor-scroll">
          ${renderThemeEditor(theme)}
          ${renderHeaderEditor(report.report_header)}
          ${(report.sections || []).map((section, index) => renderSectionEditor(section, index, theme)).join("")}
        </div>
      </aside>
    </div>
  `;
}

function renderField(label, value, attrs) {
  return `
    <label class="v3-field">
      <span>${escapeHtml(label)}</span>
      <input type="text" value="${escapeAttr(value)}" ${attrs} />
    </label>
  `;
}

function renderTextArea(label, value, attrs) {
  return `
    <label class="v3-field">
      <span>${escapeHtml(label)}</span>
      <textarea rows="3" ${attrs}>${escapeHtml(value)}</textarea>
    </label>
  `;
}

function renderThemeEditor(theme) {
  return `
    <section class="v3-editor-section">
      <h3>Background</h3>
      ${renderField("Background URL", theme.background?.url || "", 'data-edit="theme.background.url"')}
      <label class="v3-field">
        <span>Background opacity</span>
        <input type="number" min="0" max="1" step="0.05" value="${escapeAttr(theme.background?.opacity ?? 0.65)}" data-edit="theme.background.opacity" />
      </label>
      <label class="v3-file-field">
        <span>Upload background image</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload-background />
      </label>
    </section>
  `;
}

function renderHeaderEditor(header) {
  return `
    <section class="v3-editor-section">
      <h3>Report Header</h3>
      ${renderField("Scope", header.scope, 'data-header-field="scope"')}
      ${renderField("Title", header.title, 'data-header-field="title"')}
      ${renderTextArea("Subject", header.subject, 'data-header-field="subject"')}
      ${renderField("Reporter", header.reporter, 'data-header-field="reporter"')}
      ${renderField("Date", header.date, 'data-header-field="date"')}
    </section>
  `;
}

function renderSectionEditor(section, sectionIndex, theme) {
  const cardColor = theme.cards?.[section.section_key]?.background || "#f8fafc";
  return `
    <section class="v3-editor-section">
      <div class="v3-editor-section-title">
        <h3>${escapeHtml(section.title)}</h3>
        <label>
          <span>Card color</span>
          <input type="color" value="${escapeAttr(cardColor)}" data-card-color="${escapeAttr(section.section_key)}" />
        </label>
      </div>
      ${renderField("Title", section.title, `data-section-index="${sectionIndex}" data-section-field="title"`)}
      ${renderField("Subtitle", section.subtitle || "", `data-section-index="${sectionIndex}" data-section-field="subtitle"`)}
      ${section.metrics ? renderMetricEditor(section.metrics, sectionIndex) : ""}
      ${section.gantt ? renderGanttEditor(section.gantt, sectionIndex) : ""}
      ${section.table ? renderTableEditor(section.table, sectionIndex) : ""}
      ${renderMediaEditor(section, sectionIndex)}
    </section>
  `;
}

function renderMetricEditor(metrics, sectionIndex) {
  return `
    <div class="v3-editor-group">
      <h4>Metrics</h4>
      ${metrics
        .map(
          (item, metricIndex) => `
            <div class="v3-editor-row">
              <input type="text" value="${escapeAttr(item.label)}" data-section-index="${sectionIndex}" data-metric-index="${metricIndex}" data-metric-field="label" aria-label="Metric label" />
              <input type="text" value="${escapeAttr(item.value)}" data-section-index="${sectionIndex}" data-metric-index="${metricIndex}" data-metric-field="value" aria-label="Metric value" />
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderGanttEditor(tasks, sectionIndex) {
  return `
    <div class="v3-editor-group">
      <h4>Compact Gantt</h4>
      ${tasks
        .map(
          (item, taskIndex) => `
            <div class="v3-editor-row is-gantt-row">
              <input type="checkbox" ${item.completed ? "checked" : ""} data-section-index="${sectionIndex}" data-gantt-index="${taskIndex}" data-gantt-field="completed" aria-label="Completed" />
              <input type="text" value="${escapeAttr(item.task)}" data-section-index="${sectionIndex}" data-gantt-index="${taskIndex}" data-gantt-field="task" aria-label="Task" />
              <input type="text" value="${escapeAttr(item.status)}" data-section-index="${sectionIndex}" data-gantt-index="${taskIndex}" data-gantt-field="status" aria-label="Status" />
              <input type="text" value="${escapeAttr(item.start)}" data-section-index="${sectionIndex}" data-gantt-index="${taskIndex}" data-gantt-field="start" aria-label="Start" placeholder="DD/MM" />
              <input type="text" value="${escapeAttr(item.end)}" data-section-index="${sectionIndex}" data-gantt-index="${taskIndex}" data-gantt-field="end" aria-label="End" placeholder="DD/MM" />
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTableEditor(table, sectionIndex) {
  const columns = table.columns || [];
  const rows = table.rows || [];
  return `
    <div class="v3-editor-group">
      <div class="v3-editor-group-head">
        <h4>Table</h4>
        <div>
          <button type="button" data-action="add-table-column" data-section-index="${sectionIndex}">Add column</button>
          <button type="button" data-action="add-table-row" data-section-index="${sectionIndex}">Add row</button>
        </div>
      </div>
      <div class="v3-editor-table-columns">
        ${columns
          .map(
            (column, columnIndex) => `
              <div>
                <input type="text" value="${escapeAttr(column.label)}" data-section-index="${sectionIndex}" data-column-index="${columnIndex}" data-table-column-field="label" aria-label="Column title" />
                <button type="button" data-action="remove-table-column" data-section-index="${sectionIndex}" data-column-index="${columnIndex}" ${columns.length <= 1 ? "disabled" : ""}>Delete</button>
              </div>
            `,
          )
          .join("")}
      </div>
      <div class="v3-editor-table-rows">
        ${
          rows.length
            ? rows
                .map(
                  (row, rowIndex) => `
                    <div class="v3-editor-table-row">
                      <div class="v3-editor-row-head">
                        <strong>Row ${rowIndex + 1}</strong>
                        <button type="button" data-action="remove-table-row" data-section-index="${sectionIndex}" data-row-index="${rowIndex}">Delete row</button>
                      </div>
                      <div class="v3-editor-table-cells">
                        ${columns
                          .map(
                            (column) => `
                              <label class="v3-field">
                                <span>${escapeHtml(column.label)}</span>
                                <input type="text" value="${escapeAttr(row.cells?.[column.id] || "")}" data-section-index="${sectionIndex}" data-row-index="${rowIndex}" data-column-id="${escapeAttr(column.id)}" data-table-cell-field="value" />
                              </label>
                            `,
                          )
                          .join("")}
                      </div>
                      ${renderRowMediaEditor(row, sectionIndex, rowIndex)}
                    </div>
                  `,
                )
                .join("")
            : '<p class="v3-empty-media">No rows</p>'
        }
      </div>
    </div>
  `;
}

function renderRowMediaEditor(row, sectionIndex, rowIndex) {
  const media = row.media || [];
  return `
    <div class="v3-editor-group is-nested">
      <label class="v3-file-field">
        <span>Upload row image</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload-row-image="${rowIndex}" data-section-index="${sectionIndex}" />
      </label>
      <div class="v3-editor-media-list">
        ${
          media.length
            ? media
                .map(
                  (item, mediaIndex) => `
                    <div>
                      <img src="${escapeAttr(item.url)}" alt="" />
                      <input type="text" value="${escapeAttr(item.caption || "")}" data-section-index="${sectionIndex}" data-row-index="${rowIndex}" data-row-media-index="${mediaIndex}" data-row-media-field="caption" aria-label="Row image caption" />
                      <button type="button" data-action="remove-row-media" data-section-index="${sectionIndex}" data-row-index="${rowIndex}" data-row-media-index="${mediaIndex}">Remove</button>
                    </div>
                  `,
                )
                .join("")
            : '<p class="v3-empty-media">No row images added</p>'
        }
      </div>
    </div>
  `;
}

function renderMediaEditor(section, sectionIndex) {
  const media = section.media || [];
  return `
    <div class="v3-editor-group">
      <h4>Section images</h4>
      <label class="v3-file-field">
        <span>Upload section image</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload-section="${sectionIndex}" />
      </label>
      <div class="v3-editor-media-list">
        ${
          media.length
            ? media
                .map(
                  (item, mediaIndex) => `
                    <div>
                      <img src="${escapeAttr(item.url)}" alt="" />
                      <input type="text" value="${escapeAttr(item.caption || "")}" data-section-index="${sectionIndex}" data-media-index="${mediaIndex}" data-media-field="caption" aria-label="Image caption" />
                      <button type="button" data-action="remove-media" data-section-index="${sectionIndex}" data-media-index="${mediaIndex}">Remove</button>
                    </div>
                  `,
                )
                .join("")
            : '<p class="v3-empty-media">No images added</p>'
        }
      </div>
    </div>
  `;
}

async function sendMagicLink(form) {
  if (!supabase) return;
  const email = new FormData(form).get("email");
  state.authMessage = "Sending login email...";
  render();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}${window.location.pathname}?admin=1`,
      shouldCreateUser: true,
    },
  });

  state.authMessage = error ? error.message : `Login email sent to ${email}.`;
  render();
}

async function logout() {
  if (!supabase) return;
  await supabase.auth.signOut();
  state.session = null;
  state.isAdmin = false;
  state.editorOpen = false;
  state.draft = null;
  render();
}

function openEditor() {
  state.draft = {
    report: normalizeReport(state.report),
    theme: clone(state.theme),
  };
  state.editorOpen = true;
  render();
}

function closeEditor() {
  state.editorOpen = false;
  state.draft = null;
  state.saving = false;
  state.uploading = "";
  render();
}

async function saveEditor() {
  if (!supabase || !state.isAdmin || !state.draft) return;
  state.saving = true;
  state.authMessage = "";
  render();

  const report = normalizeReport(state.draft.report);
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("report_page_state").upsert({
    id: REPORT_STATE_ID,
    report,
    theme: state.draft.theme,
    updated_by: userData.user?.id,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    state.authMessage = error.message;
    state.saving = false;
    render();
    return;
  }

  state.report = clone(report);
  state.theme = mergeTheme(state.draft.theme);
  state.editorOpen = false;
  state.draft = null;
  state.saving = false;
  applyTheme();
  render();
}

function updateDraftFromInput(target) {
  if (!state.draft) return;

  const sectionIndex = Number(target.dataset.sectionIndex);

  if (target.dataset.edit === "theme.background.url") {
    state.draft.theme.background.url = target.value;
  } else if (target.dataset.edit === "theme.background.opacity") {
    state.draft.theme.background.opacity = Number(target.value);
  } else if (target.dataset.headerField) {
    state.draft.report.report_header[target.dataset.headerField] = target.value;
  } else if (target.dataset.sectionField) {
    state.draft.report.sections[sectionIndex][target.dataset.sectionField] = target.value;
  } else if (target.dataset.metricField) {
    const metricIndex = Number(target.dataset.metricIndex);
    state.draft.report.sections[sectionIndex].metrics[metricIndex][target.dataset.metricField] = target.value;
  } else if (target.dataset.ganttField) {
    const taskIndex = Number(target.dataset.ganttIndex);
    const value = target.dataset.ganttField === "completed" ? target.checked : target.value;
    state.draft.report.sections[sectionIndex].gantt[taskIndex][target.dataset.ganttField] = value;
  } else if (target.dataset.tableColumnField) {
    const columnIndex = Number(target.dataset.columnIndex);
    state.draft.report.sections[sectionIndex].table.columns[columnIndex].label = target.value;
  } else if (target.dataset.tableCellField) {
    const rowIndex = Number(target.dataset.rowIndex);
    const columnId = target.dataset.columnId;
    state.draft.report.sections[sectionIndex].table.rows[rowIndex].cells[columnId] = target.value;
  } else if (target.dataset.mediaField) {
    const mediaIndex = Number(target.dataset.mediaIndex);
    state.draft.report.sections[sectionIndex].media[mediaIndex][target.dataset.mediaField] = target.value;
  } else if (target.dataset.rowMediaField) {
    const rowIndex = Number(target.dataset.rowIndex);
    const mediaIndex = Number(target.dataset.rowMediaIndex);
    state.draft.report.sections[sectionIndex].table.rows[rowIndex].media[mediaIndex][target.dataset.rowMediaField] = target.value;
  } else if (target.dataset.cardColor) {
    const key = target.dataset.cardColor;
    state.draft.theme.cards ||= {};
    state.draft.theme.cards[key] = { ...(state.draft.theme.cards[key] || {}), background: target.value };
  }
}

function draftTable(sectionIndex) {
  return state.draft.report.sections[sectionIndex].table;
}

function addTableColumn(sectionIndex) {
  const table = draftTable(sectionIndex);
  const id = makeId("column");
  table.columns.push({ id, label: "New column" });
  table.rows.forEach((row) => {
    row.cells[id] = "";
  });
  render();
}

function removeTableColumn(sectionIndex, columnIndex) {
  const table = draftTable(sectionIndex);
  if (table.columns.length <= 1) return;
  const [removed] = table.columns.splice(columnIndex, 1);
  table.rows.forEach((row) => {
    delete row.cells[removed.id];
  });
  render();
}

function addTableRow(sectionIndex) {
  const table = draftTable(sectionIndex);
  const cells = {};
  table.columns.forEach((column) => {
    cells[column.id] = "";
  });
  table.rows.push({ id: makeId("row"), cells, media: [] });
  render();
}

function removeTableRow(sectionIndex, rowIndex) {
  draftTable(sectionIndex).rows.splice(rowIndex, 1);
  render();
}

async function uploadAsset(file, folder) {
  if (!supabase || !file || !state.isAdmin) return null;
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}-${safeName}.${extension}`.replace(`.${extension}.${extension}`, `.${extension}`);

  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl, caption: file.name };
}

async function uploadBackground(file) {
  try {
    state.uploading = file.name;
    render();
    const uploaded = await uploadAsset(file, "backgrounds");
    if (!uploaded) return;
    state.draft.theme.background.url = uploaded.url;
  } catch (error) {
    state.authMessage = error.message;
  } finally {
    state.uploading = "";
    render();
  }
}

async function uploadSectionImage(file, sectionIndex) {
  try {
    state.uploading = file.name;
    render();
    const section = state.draft.report.sections[sectionIndex];
    const uploaded = await uploadAsset(file, `sections/${section.section_key}`);
    if (!uploaded) return;
    section.media ||= [];
    section.media.push(uploaded);
  } catch (error) {
    state.authMessage = error.message;
  } finally {
    state.uploading = "";
    render();
  }
}

async function uploadRowImage(file, sectionIndex, rowIndex) {
  try {
    state.uploading = file.name;
    render();
    const section = state.draft.report.sections[sectionIndex];
    const row = section.table.rows[rowIndex];
    const uploaded = await uploadAsset(file, `tables/${section.section_key}/${row.id}`);
    if (!uploaded) return;
    row.media ||= [];
    row.media.push(uploaded);
  } catch (error) {
    state.authMessage = error.message;
  } finally {
    state.uploading = "";
    render();
  }
}

function removeMedia(sectionIndex, mediaIndex) {
  const section = state.draft?.report.sections[sectionIndex];
  if (!section?.media) return;
  section.media.splice(mediaIndex, 1);
  render();
}

function removeRowMedia(sectionIndex, rowIndex, mediaIndex) {
  const media = state.draft?.report.sections[sectionIndex]?.table?.rows?.[rowIndex]?.media;
  if (!media) return;
  media.splice(mediaIndex, 1);
  render();
}

function openDetail(key) {
  state.activeDetailKey = key;
  render();
}

function closeDetail() {
  state.activeDetailKey = "";
  render();
}

function toggleTableRow(sectionKey, rowId) {
  state.expandedTableRows[sectionKey] = state.expandedTableRows[sectionKey] === rowId ? "" : rowId;
  render();
}

function openLightbox(items, index = 0) {
  if (!items.length) return;
  state.lightbox = {
    items,
    index,
    scale: 1,
    x: 0,
    y: 0,
  };
  render();
}

function sectionMediaItems(sectionKey) {
  return sectionByKey(sectionKey)?.media || [];
}

function rowMediaItems(sectionKey, rowId) {
  const section = sectionByKey(sectionKey);
  return tableRows(section).find((row) => row.id === rowId)?.media || [];
}

function openSectionLightbox(sectionKey, mediaIndex) {
  openLightbox(sectionMediaItems(sectionKey), mediaIndex);
}

function openRowLightbox(sectionKey, rowId, mediaIndex) {
  openLightbox(rowMediaItems(sectionKey, rowId), mediaIndex);
}

function closeLightbox() {
  state.lightbox = null;
  lightboxDrag = null;
  render();
}

function resetLightbox() {
  if (!state.lightbox) return;
  state.lightbox.scale = 1;
  state.lightbox.x = 0;
  state.lightbox.y = 0;
  render();
}

function moveLightbox(step) {
  if (!state.lightbox) return;
  const count = state.lightbox.items.length;
  state.lightbox.index = (state.lightbox.index + step + count) % count;
  state.lightbox.scale = 1;
  state.lightbox.x = 0;
  state.lightbox.y = 0;
  render();
}

function applyLightboxTransform() {
  const image = app.querySelector(".v3-lightbox-image");
  if (!image || !state.lightbox) return;
  image.style.transform = `translate(${state.lightbox.x}px, ${state.lightbox.y}px) scale(${state.lightbox.scale})`;
}

function zoomLightbox(delta) {
  if (!state.lightbox) return;
  state.lightbox.scale = clamp(state.lightbox.scale + delta, 0.5, 4);
  applyLightboxTransform();
}

app.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-admin-login]");
  if (!form) return;
  event.preventDefault();
  sendMagicLink(form);
});

app.addEventListener("click", (event) => {
  const actionElement = event.target.closest("[data-action]");
  const action = actionElement?.dataset.action;

  if (action === "open-editor") {
    openEditor();
    return;
  }
  if (action === "close-editor") {
    closeEditor();
    return;
  }
  if (action === "save-editor") {
    saveEditor();
    return;
  }
  if (action === "logout") {
    logout();
    return;
  }
  if (action === "add-table-column") {
    addTableColumn(Number(actionElement.dataset.sectionIndex));
    return;
  }
  if (action === "remove-table-column") {
    removeTableColumn(Number(actionElement.dataset.sectionIndex), Number(actionElement.dataset.columnIndex));
    return;
  }
  if (action === "add-table-row") {
    addTableRow(Number(actionElement.dataset.sectionIndex));
    return;
  }
  if (action === "remove-table-row") {
    removeTableRow(Number(actionElement.dataset.sectionIndex), Number(actionElement.dataset.rowIndex));
    return;
  }
  if (action === "remove-media") {
    removeMedia(Number(actionElement.dataset.sectionIndex), Number(actionElement.dataset.mediaIndex));
    return;
  }
  if (action === "remove-row-media") {
    removeRowMedia(Number(actionElement.dataset.sectionIndex), Number(actionElement.dataset.rowIndex), Number(actionElement.dataset.rowMediaIndex));
    return;
  }
  if (action === "toggle-table-row") {
    toggleTableRow(actionElement.dataset.sectionKey, actionElement.dataset.rowId);
    return;
  }
  if (action === "open-section-lightbox") {
    openSectionLightbox(actionElement.dataset.sectionKey, Number(actionElement.dataset.mediaIndex));
    return;
  }
  if (action === "open-row-lightbox") {
    openRowLightbox(actionElement.dataset.sectionKey, actionElement.dataset.rowId, Number(actionElement.dataset.mediaIndex));
    return;
  }
  if (action === "prev-lightbox") {
    moveLightbox(-1);
    return;
  }
  if (action === "next-lightbox") {
    moveLightbox(1);
    return;
  }
  if (action === "reset-lightbox") {
    resetLightbox();
    return;
  }
  if (action === "close-lightbox") {
    if (event.target === actionElement || actionElement.tagName === "BUTTON") closeLightbox();
    return;
  }
  if (action === "close-detail") {
    if (event.target === actionElement || actionElement.tagName === "BUTTON") closeDetail();
    return;
  }

  const interactive = event.target.closest("a, button, input, textarea, select, label");
  const detailCard = event.target.closest("[data-detail-key]");
  if (!interactive && detailCard) {
    openDetail(detailCard.dataset.detailKey);
  }
});

app.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.lightbox) {
    closeLightbox();
    return;
  }
  if (event.key === "Escape" && state.activeDetailKey) closeDetail();
  const detailCard = event.target.closest("[data-detail-key]");
  if (detailCard && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openDetail(detailCard.dataset.detailKey);
  }
});

app.addEventListener("input", (event) => {
  updateDraftFromInput(event.target);
});

app.addEventListener("change", (event) => {
  updateDraftFromInput(event.target);
  if (event.target.matches("[data-upload-background]") && event.target.files?.[0]) {
    uploadBackground(event.target.files[0]);
  }
  if (event.target.matches("[data-upload-section]") && event.target.files?.[0]) {
    uploadSectionImage(event.target.files[0], Number(event.target.dataset.uploadSection));
  }
  if (event.target.matches("[data-upload-row-image]") && event.target.files?.[0]) {
    uploadRowImage(event.target.files[0], Number(event.target.dataset.sectionIndex), Number(event.target.dataset.uploadRowImage));
  }
});

app.addEventListener(
  "wheel",
  (event) => {
    if (!state.lightbox || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    zoomLightbox(event.deltaY < 0 ? 0.12 : -0.12);
  },
  { passive: false },
);

app.addEventListener("pointerdown", (event) => {
  if (!state.lightbox || !event.target.closest(".v3-lightbox-stage")) return;
  lightboxDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: state.lightbox.x,
    y: state.lightbox.y,
  };
  event.target.closest(".v3-lightbox-stage").setPointerCapture(event.pointerId);
});

app.addEventListener("pointermove", (event) => {
  if (!state.lightbox || !lightboxDrag || lightboxDrag.pointerId !== event.pointerId) return;
  state.lightbox.x = lightboxDrag.x + event.clientX - lightboxDrag.startX;
  state.lightbox.y = lightboxDrag.y + event.clientY - lightboxDrag.startY;
  applyLightboxTransform();
});

app.addEventListener("pointerup", (event) => {
  if (lightboxDrag?.pointerId === event.pointerId) lightboxDrag = null;
});

app.addEventListener("dblclick", (event) => {
  if (!state.lightbox || !event.target.closest(".v3-lightbox-stage")) return;
  resetLightbox();
});

function render() {
  if (state.loading) {
    renderLoading();
    return;
  }

  if (state.error || !state.report) {
    renderError();
    return;
  }

  applyTheme();
  renderReport();
}

init();
