// ---------------------------------------------------------------------------
// SEO AI Agent — Phase 1 frontend
// This file only ever talks to our own /api/* routes. It has no knowledge of
// which LLM provider is behind them — that's intentionally hidden in the
// backend's callLLM() abstraction so providers can change later.
// ---------------------------------------------------------------------------

const AGENTS = [
  { id: "head", name: "Head Agent", role: "Plans & coordinates", live: true },
  { id: "keyword", name: "Keyword Research Agent", role: "Phase 2", live: false },
  { id: "competitor", name: "Competitor Analysis Agent", role: "Phase 2", live: false },
  { id: "content", name: "Content Strategist Agent", role: "Phase 2", live: false },
  { id: "writer", name: "SEO Writer Agent", role: "Phase 2", live: false },
  { id: "onpage", name: "On-Page SEO Agent", role: "Phase 2", live: false },
  { id: "technical", name: "Technical SEO Agent", role: "Phase 2", live: false },
  { id: "auditor", name: "SEO Auditor / QA Agent", role: "Phase 2", live: false },
  { id: "editor", name: "Final Editor / Reporting Agent", role: "Phase 2", live: false },
];

const rosterList = document.getElementById("roster-list");
const taskForm = document.getElementById("task-form");
const taskInput = document.getElementById("task-input");
const startBtn = document.getElementById("start-btn");
const formError = document.getElementById("form-error");
const resultBody = document.getElementById("result-body");
const workflowSteps = document.getElementById("workflow-steps");

// ---- Render the static roster once ----------------------------------------
function renderRoster() {
  rosterList.innerHTML = AGENTS.map((agent) => `
    <li class="roster-row" data-agent="${agent.id}">
      <div class="roster-name">
        <strong>${agent.name}</strong>
        <span>${agent.role}</span>
      </div>
      <span class="status-dot" data-status="${agent.live ? "idle" : "placeholder"}"></span>
    </li>
  `).join("");
}

function setAgentStatus(agentId, status) {
  const row = rosterList.querySelector(`[data-agent="${agentId}"] .status-dot`);
  if (row) row.dataset.status = status;
}

function setWorkflowStep(stepId, state) {
  const step = workflowSteps.querySelector(`[data-step="${stepId}"]`);
  if (!step) return;
  step.classList.remove("is-active", "is-done");
  if (state) step.classList.add(state);
}

function resetVisualState() {
  AGENTS.forEach((a) => setAgentStatus(a.id, a.live ? "idle" : "placeholder"));
  ["user", "head", "plan", "specialists", "result"].forEach((s) => setWorkflowStep(s, null));
  formError.textContent = "";
}

// ---- Small delay helper, purely for a legible visual sequence -------------
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- Loading state on the button -------------------------------------------
function setLoading(isLoading) {
  startBtn.classList.toggle("is-loading", isLoading);
  startBtn.disabled = isLoading;
}

// ---- Render the final result panel -----------------------------------------
function renderResult({ plan, headSummary }) {
  const planHtml = Array.isArray(plan) && plan.length
    ? `
      <h3>Head Agent's plan</h3>
      <ul class="plan-list">
        ${plan.map((step) => `
          <li class="plan-item">
            <span class="plan-agent">${escapeHtml(step.agent || "Unassigned")}</span>
            <span>${escapeHtml(step.task || "")}</span>
          </li>
        `).join("")}
      </ul>
    `
    : "";

  const summaryHtml = headSummary
    ? `<h3>Head Agent's summary</h3><p>${escapeHtml(headSummary).replace(/\n+/g, "</p><p>")}</p>`
    : "";

  resultBody.innerHTML = planHtml + summaryHtml || `<p class="result-empty">The Head Agent returned no content.</p>`;
}

function renderError(message) {
  resultBody.innerHTML = `<div class="result-error">${escapeHtml(message)}</div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---- Main submit flow --------------------------------------------------
async function handleSubmit(event) {
  event.preventDefault();
  const task = taskInput.value.trim();
  if (!task) return;

  resetVisualState();
  setLoading(true);
  setWorkflowStep("user", "is-done");
  setWorkflowStep("head", "is-active");
  setAgentStatus("head", "active");
  resultBody.innerHTML = `<p class="result-empty">Head Agent is reading the task…</p>`;

  try {
    const response = await fetch("/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task }),
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The server sent back something that wasn't valid JSON.");
    }

    if (!response.ok) {
      throw new Error(data?.error || `Request failed with status ${response.status}.`);
    }

    setWorkflowStep("head", "is-done");
    setWorkflowStep("plan", "is-active");
    await wait(350);
    setWorkflowStep("plan", "is-done");
    setAgentStatus("head", "done");

    // Placeholder specialists: a quick visual pass so the workflow reads
    // top-to-bottom, even though no specialist agent runs yet in Phase 1.
    setWorkflowStep("specialists", "is-active");
    await wait(400);
    setWorkflowStep("specialists", "is-done");

    setWorkflowStep("result", "is-done");
    renderResult(data);
  } catch (err) {
    setWorkflowStep("head", null);
    setAgentStatus("head", "idle");
    formError.textContent = err.message || "Something went wrong. Please try again.";
    renderError(err.message || "Something went wrong talking to the Head Agent. Please try again.");
  } finally {
    setLoading(false);
  }
}

renderRoster();
taskForm.addEventListener("submit", handleSubmit);
