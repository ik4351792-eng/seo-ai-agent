// ---------------------------------------------------------------------------
// SEO AI Agent — Phase 2 frontend
// Talks only to our own /api/* routes.
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

// ---------------------------------------------------------------------------
// Render roster
// ---------------------------------------------------------------------------

function renderRoster() {
  rosterList.innerHTML = AGENTS.map((agent) => `
    <li class="roster-row" data-agent="${agent.id}">
      <div class="roster-name">
        <strong>${agent.name}</strong>
        <span>${agent.role}</span>
      </div>
      <span
        class="status-dot"
        data-status="${agent.live ? "idle" : "placeholder"}"
      ></span>
    </li>
  `).join("");
}

// ---------------------------------------------------------------------------
// Agent status
// ---------------------------------------------------------------------------

function setAgentStatus(agentId, status) {
  const row = rosterList.querySelector(
    `[data-agent="${agentId}"] .status-dot`
  );

  if (row) {
    row.dataset.status = status;
  }
}

// ---------------------------------------------------------------------------
// Workflow status
// ---------------------------------------------------------------------------

function setWorkflowStep(stepId, state) {
  const step = workflowSteps.querySelector(
    `[data-step="${stepId}"]`
  );

  if (!step) return;

  step.classList.remove("is-active", "is-done");

  if (state) {
    step.classList.add(state);
  }
}

// ---------------------------------------------------------------------------
// Reset UI
// ---------------------------------------------------------------------------

function resetVisualState() {
  AGENTS.forEach((agent) => {
    setAgentStatus(
      agent.id,
      agent.live ? "idle" : "placeholder"
    );
  });

  [
    "user",
    "head",
    "plan",
    "specialists",
    "result",
  ].forEach((step) => {
    setWorkflowStep(step, null);
  });

  formError.textContent = "";
}

// ---------------------------------------------------------------------------
// Small delay for visual workflow
// ---------------------------------------------------------------------------

const wait = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function setLoading(isLoading) {
  startBtn.classList.toggle(
    "is-loading",
    isLoading
  );

  startBtn.disabled = isLoading;
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Render final result
// ---------------------------------------------------------------------------

function renderResult({
  plan,
  headSummary,
  specialistResults,
  finalReport,
}) {
  // -------------------------
  // Head plan
  // -------------------------

  const planHtml =
    Array.isArray(plan) && plan.length
      ? `
        <section class="result-section">
          <h3>Head Agent's plan</h3>

          <ul class="plan-list">
            ${plan.map((step) => `
              <li class="plan-item">
                <span class="plan-agent">
                  ${escapeHtml(step.agent || "Unassigned")}
                </span>

                <span>
                  ${escapeHtml(step.task || "")}
                </span>
              </li>
            `).join("")}
          </ul>
        </section>
      `
      : "";

  // -------------------------
  // Head summary
  // -------------------------

  const summaryHtml =
    headSummary
      ? `
        <section class="result-section">
          <h3>Head Agent's summary</h3>

          <p>
            ${escapeHtml(headSummary)
              .replace(/\n+/g, "</p><p>")}
          </p>
        </section>
      `
      : "";

  // -------------------------
  // Specialist results
  // -------------------------

  const specialistHtml =
    Array.isArray(specialistResults) &&
    specialistResults.length
      ? `
        <section class="result-section">
          <h3>Specialist Agent Results</h3>

          <div class="specialist-results">
            ${specialistResults.map((item) => `
              <div class="specialist-result">
                <strong>
                  ${escapeHtml(item.agent || "Specialist Agent")}
                </strong>

                ${
                  item.task
                    ? `
                      <div class="specialist-task">
                        ${escapeHtml(item.task)}
                      </div>
                    `
                    : ""
                }

                <p>
                  ${escapeHtml(item.result || "")
                    .replace(/\n+/g, "<br><br>")}
                </p>
              </div>
            `).join("")}
          </div>
        </section>
      `
      : "";

  // -------------------------
  // Final report
  // -------------------------

  const finalHtml =
    finalReport
      ? `
        <section class="result-section">
          <h3>Final SEO Report</h3>

          <div class="final-report">
            ${escapeHtml(finalReport)
              .replace(/\n+/g, "<br><br>")}
          </div>
        </section>
      `
      : "";

  const output =
    planHtml +
    summaryHtml +
    specialistHtml +
    finalHtml;

  resultBody.innerHTML =
    output ||
    `
      <p class="result-empty">
        The SEO Agent returned no content.
      </p>
    `;
}

// ---------------------------------------------------------------------------
// Render error
// ---------------------------------------------------------------------------

function renderError(message) {
  resultBody.innerHTML = `
    <div class="result-error">
      ${escapeHtml(message)}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Main submit flow
// ---------------------------------------------------------------------------

async function handleSubmit(event) {
  event.preventDefault();

  const task = taskInput.value.trim();

  if (!task) {
    return;
  }

  resetVisualState();

  setLoading(true);

  // User step
  setWorkflowStep("user", "is-done");

  // Head Agent starts
  setWorkflowStep("head", "is-active");
  setAgentStatus("head", "active");

  resultBody.innerHTML = `
    <p class="result-empty">
      Head Agent is reading the task…
    </p>
  `;

  try {
    // ---------------------------------------------------------
    // Call backend
    // ---------------------------------------------------------

    const response = await fetch("/api/task", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        task,
      }),
    });

    // ---------------------------------------------------------
    // Parse response
    // ---------------------------------------------------------

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        "The server sent back something that wasn't valid JSON."
      );
    }

    // ---------------------------------------------------------
    // Handle API error
    // ---------------------------------------------------------

    if (!response.ok) {
      throw new Error(
        data?.error ||
        `Request failed with status ${response.status}.`
      );
    }

    // ---------------------------------------------------------
    // Head Agent complete
    // ---------------------------------------------------------

    setWorkflowStep("head", "is-done");

    setWorkflowStep("plan", "is-active");

    await wait(350);

    setWorkflowStep("plan", "is-done");

    setAgentStatus("head", "done");

    // ---------------------------------------------------------
    // Specialist Agents
    // ---------------------------------------------------------

    setWorkflowStep(
      "specialists",
      "is-active"
    );

    const results =
      Array.isArray(data.specialistResults)
        ? data.specialistResults
        : [];

    // Animate each specialist that actually ran
    for (const item of results) {
      const agent = AGENTS.find(
        (a) => a.name === item.agent
      );

      if (agent) {
        setAgentStatus(
          agent.id,
          "active"
        );

        await wait(150);

        setAgentStatus(
          agent.id,
          "done"
        );
      }
    }

    setWorkflowStep(
      "specialists",
      "is-done"
    );

    // ---------------------------------------------------------
    // Final result
    // ---------------------------------------------------------

    setWorkflowStep(
      "result",
      "is-done"
    );

    renderResult(data);

  } catch (err) {
    // ---------------------------------------------------------
    // Error handling
    // ---------------------------------------------------------

    setWorkflowStep("head", null);
    setWorkflowStep("specialists", null);

    setAgentStatus(
      "head",
      "idle"
    );

    formError.textContent =
      err.message ||
      "Something went wrong. Please try again.";

    renderError(
      err.message ||
      "Something went wrong talking to the SEO Agent. Please try again."
    );

  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

renderRoster();

taskForm.addEventListener(
  "submit",
  handleSubmit
);
