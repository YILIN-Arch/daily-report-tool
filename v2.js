const app = document.querySelector("#v2-app");

const state = {
  report: null,
  loading: true,
  error: "",
};

const progressKeys = ["hacking_progress", "plaster_progress", "clp_draw_pit"];
const contentKeys = ["fountain_programme", "additional_works", "defect"];

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function init() {
  try {
    const response = await fetch("/data/report.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load report (${response.status}).`);
    state.report = await response.json();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

function sectionByKey(key) {
  return state.report.sections.find((section) => section.section_key === key);
}

function metric(section, label) {
  return section?.metrics?.find((item) => item.label === label)?.value || "";
}

function progressPercent(section) {
  const value = metric(section, "Progress");
  const match = value.match(/[0-9.]+/);
  return match ? Math.min(100, Number(match[0])) : 0;
}

function renderLoading() {
  app.innerHTML = `
    <main class="v2-boot">
      <p class="v2-eyebrow">Morning Meeting Report</p>
      <h1>Loading report</h1>
    </main>
  `;
}

function renderError() {
  app.innerHTML = `
    <main class="v2-boot">
      <section class="v2-alert">
        <p class="v2-eyebrow">Report unavailable</p>
        <h1>Unable to load report</h1>
        <p>${escapeHtml(state.error)}</p>
      </section>
    </main>
  `;
}

function renderMetaPills(report) {
  const header = report.report_header;
  return `
    <div class="v2-meta">
      <span>${escapeHtml(header.reporter)}</span>
      <span>${escapeHtml(header.date)}</span>
      <span>${escapeHtml(report.sourceFile)}</span>
    </div>
  `;
}

function renderRailItem(section) {
  const progress = metric(section, "Progress");
  const secondary =
    metric(section, "Remaining") ||
    metric(section, "Target") ||
    metric(section, "Forecast") ||
    metric(section, "As of");

  return `
    <a class="v2-rail-item" href="#${escapeHtml(section.section_key)}">
      <span>${escapeHtml(section.title)}</span>
      <strong>${escapeHtml(progress || secondary)}</strong>
      ${secondary && progress ? `<small>${escapeHtml(secondary)}</small>` : ""}
    </a>
  `;
}

function renderRail(report) {
  const header = report.report_header;
  const railSections = progressKeys.map(sectionByKey).filter(Boolean);

  return `
    <aside class="v2-rail" aria-label="Report index">
      <div class="v2-rail-block">
        <p class="v2-eyebrow">Report date</p>
        <strong>${escapeHtml(header.date)}</strong>
        <span>${escapeHtml(header.reporter)}</span>
      </div>
      <div class="v2-rail-block">
        <p class="v2-eyebrow">Source</p>
        <span>${escapeHtml(report.sourceFile)}</span>
      </div>
      <nav class="v2-rail-list" aria-label="Progress sections">
        ${railSections.map(renderRailItem).join("")}
      </nav>
    </aside>
  `;
}

function renderFactList(section) {
  return `
    <dl class="v2-facts">
      ${section.metrics
        .filter((item) => item.label !== "Progress")
        .map(
          (item) => `
            <div class="v2-fact">
              <dt>${escapeHtml(item.label)}</dt>
              <dd>${escapeHtml(item.value)}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function renderProgressCard(section) {
  const percent = progressPercent(section);
  const progress = metric(section, "Progress");

  return `
    <article class="v2-progress-card" id="${escapeHtml(section.section_key)}">
      <div class="v2-card-head">
        <div>
          <p class="v2-eyebrow">Slide ${escapeHtml(section.source_slide)}</p>
          <h3>${escapeHtml(section.title)}</h3>
          ${section.subtitle ? `<p>${escapeHtml(section.subtitle)}</p>` : ""}
        </div>
        ${progress ? `<strong class="v2-progress-number">${escapeHtml(progress)}</strong>` : ""}
      </div>
      ${
        progress
          ? `<div class="v2-progress-track" aria-label="Progress ${escapeHtml(progress)}"><span style="width: ${percent}%"></span></div>`
          : ""
      }
      ${renderFactList(section)}
    </article>
  `;
}

function renderChecklist(section) {
  return `
    <div class="v2-timeline">
      ${section.checklist
        .map(
          (item) => `
            <div class="v2-timeline-row ${item.checked ? "is-complete" : ""}">
              <span class="v2-check-dot" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                ${item.status ? `<span>${escapeHtml(item.status)}</span>` : ""}
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTable(section) {
  return `
    <div class="v2-table" role="table">
      <div class="v2-table-row v2-table-head" role="row">
        <span role="columnheader">Works</span>
        <span role="columnheader">Status</span>
      </div>
      ${section.table
        .map(
          (row) => `
            <div class="v2-table-row" role="row">
              <span role="cell">${escapeHtml(row.works)}</span>
              <span role="cell">${row.status ? escapeHtml(row.status) : '<span class="v2-muted">blank / no status</span>'}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderContentSection(section) {
  const content = section.checklist ? renderChecklist(section) : renderTable(section);

  return `
    <article class="v2-panel" id="${escapeHtml(section.section_key)}">
      <div class="v2-panel-head">
        <div>
          <p class="v2-eyebrow">Slide ${escapeHtml(section.source_slide)}</p>
          <h2>${escapeHtml(section.title)}</h2>
          ${section.subtitle ? `<p>${escapeHtml(section.subtitle)}</p>` : ""}
        </div>
      </div>
      ${content}
    </article>
  `;
}

function renderReport() {
  const report = state.report;
  const header = report.report_header;
  const progressSections = progressKeys.map(sectionByKey).filter(Boolean);
  const contentSections = contentKeys.map(sectionByKey).filter(Boolean);

  app.innerHTML = `
    <header class="v2-topbar">
      <a class="v2-brand" href="/" aria-label="Open v1 report">
        <span class="v2-brand-mark"></span>
        <span>Morning Meeting Report</span>
      </a>
      <nav class="v2-actions" aria-label="Version navigation">
        <a href="/v1.html">View v1</a>
        <span>v2</span>
      </nav>
    </header>

    <main class="v2-shell">
      ${renderRail(report)}
      <section class="v2-content">
        <section class="v2-hero">
          <p class="v2-eyebrow">${escapeHtml(header.scope)}</p>
          <h1>${escapeHtml(header.title)}</h1>
          <p>${escapeHtml(header.subject)}</p>
          ${renderMetaPills(report)}
        </section>

        <section class="v2-progress-overview" aria-label="Progress overview">
          <div class="v2-section-title">
            <p class="v2-eyebrow">Current progress</p>
            <h2>Progress Overview</h2>
          </div>
          <div class="v2-progress-grid">
            ${progressSections.map(renderProgressCard).join("")}
          </div>
        </section>

        <section class="v2-content-list" aria-label="Report details">
          ${contentSections.map(renderContentSection).join("")}
        </section>
      </section>
    </main>
  `;
}

function render() {
  if (state.loading) {
    renderLoading();
    return;
  }

  if (state.error || !state.report) {
    renderError();
    return;
  }

  renderReport();
}

init();
