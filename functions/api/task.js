import { callLLM } from "../lib/callLLM.js";

const MAX_TASK_LENGTH = 2000;

const SPECIALIST_AGENTS = [
  "Keyword Research Agent",
  "Competitor Analysis Agent",
  "Content Strategist Agent",
  "SEO Writer Agent",
  "On-Page SEO Agent",
  "Technical SEO Agent",
  "SEO Auditor/QA Agent",
];

const HEAD_AGENT_SYSTEM_PROMPT = `
You are the SEO Head / Manager Agent, leading a team of eight SEO specialists:
Keyword Research Agent, Competitor Analysis Agent, Content Strategist Agent,
SEO Writer Agent, On-Page SEO Agent, Technical SEO Agent, SEO Auditor/QA Agent,
and Final Editor/Reporting Agent.

Read the user's task and create a practical execution plan.

Assign subtasks only to the specialist agents that are actually relevant.
Use their exact names.

Respond with ONLY valid JSON:

{
  "plan": [
    { "agent": "Keyword Research Agent", "task": "short concrete task" }
  ],
  "headSummary": "brief useful summary of the overall approach"
}
`.trim();

const SPECIALIST_PROMPTS = {
  "Keyword Research Agent": `
You are the Keyword Research Agent.
Analyze the user's SEO task and identify useful target keywords,
search intent, keyword opportunities, and relevant long-tail variations.
Be practical and concise. Do not invent search-volume numbers.
`,

  "Competitor Analysis Agent": `
You are the Competitor Analysis Agent.
Analyze the user's SEO task from a competitor perspective.
Identify what should be researched, competitor opportunities, content gaps,
and strategic weaknesses to investigate.
Do not invent specific competitor data when none was provided.
`,

  "Content Strategist Agent": `
You are the Content Strategist Agent.
Create a practical content strategy for the user's SEO task.
Cover content pillars, topics, search intent, prioritization,
and recommended content structure.
`,

  "SEO Writer Agent": `
You are the SEO Writer Agent.
Based on the user's task, produce useful SEO-focused copy, outlines,
or writing recommendations as appropriate.
Keep the output directly actionable.
`,

  "On-Page SEO Agent": `
You are the On-Page SEO Agent.
Recommend improvements for title tags, meta descriptions, headings,
internal links, content structure, keyword placement, and related
on-page SEO elements relevant to the user's task.
`,

  "Technical SEO Agent": `
You are the Technical SEO Agent.
Identify technical SEO areas that should be checked for the user's task,
including crawlability, indexing, performance, mobile usability,
structured data, URLs, and site architecture where relevant.
Do not claim an issue exists unless evidence is provided.
`,

  "SEO Auditor/QA Agent": `
You are the SEO Auditor / QA Agent.
Review the requested SEO work for quality, completeness,
search intent alignment, technical correctness, and best practices.
Identify risks or missing items.
`,
};

const FINAL_EDITOR_PROMPT = `
You are the Final Editor / Reporting Agent.

You receive the original user request plus reports from the SEO specialists.

Combine the useful findings into one clear final SEO report.
Do not invent facts that are not supported by the supplied information.

Return:
1. Executive summary
2. Key findings
3. Recommended actions
4. Priority order
5. Final SEO checklist

Use plain text with readable sections.
`.trim();

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;

  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const task =
    typeof body?.task === "string"
      ? body.task.trim()
      : "";

  if (!task) {
    return jsonError(
      "Please include a non-empty 'task' string.",
      400
    );
  }

  if (task.length > MAX_TASK_LENGTH) {
    return jsonError(
      `Task is too long (max ${MAX_TASK_LENGTH} characters).`,
      400
    );
  }

  // ---------------------------------------------------------
  // 1. HEAD AGENT
  // ---------------------------------------------------------

  let rawHeadResponse;

  try {
    rawHeadResponse = await callLLM(
      env,
      HEAD_AGENT_SYSTEM_PROMPT,
      task
    );
  } catch (err) {
    return jsonError(
      `The Head Agent could not complete this task: ${err.message}`,
      502
    );
  }

  const head = safeParsePlan(rawHeadResponse);

  // ---------------------------------------------------------
  // 2. SPECIALIST AGENTS
  // ---------------------------------------------------------

  const specialistResults = [];

  for (const step of head.plan) {
    const agent = step?.agent;
    const specialistTask = step?.task;

    if (
      !SPECIALIST_AGENTS.includes(agent) ||
      typeof specialistTask !== "string" ||
      !specialistTask.trim()
    ) {
      continue;
    }

    const systemPrompt =
      SPECIALIST_PROMPTS[agent];

    if (!systemPrompt) continue;

    try {
      const result = await callLLM(
        env,
        systemPrompt,
        `Original user task:
${task}

Your assigned subtask:
${specialistTask}`
      );

      specialistResults.push({
        agent,
        task: specialistTask,
        result,
      });
    } catch (err) {
      specialistResults.push({
        agent,
        task: specialistTask,
        result: `Agent failed: ${err.message}`,
      });
    }
  }

  // ---------------------------------------------------------
  // 3. FINAL EDITOR
  // ---------------------------------------------------------

  let finalReport = "";

  if (specialistResults.length > 0) {
    const specialistContext = specialistResults
      .map(
        (item) => `
AGENT: ${item.agent}
ASSIGNED TASK: ${item.task}
RESULT:
${item.result}
`
      )
      .join("\n--------------------\n");

    try {
      finalReport = await callLLM(
        env,
        FINAL_EDITOR_PROMPT,
        `Original user task:
${task}

Head Agent summary:
${head.headSummary}

Specialist reports:
${specialistContext}`
      );
    } catch (err) {
      finalReport = `Final Editor could not complete the report: ${err.message}`;
    }
  }

  return new Response(
    JSON.stringify({
      plan: head.plan,
      headSummary: head.headSummary,
      specialistResults,
      finalReport,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return jsonError(
      "This endpoint only accepts POST requests.",
      405
    );
  }

  return onRequestPost(context);
}

function safeParsePlan(rawText) {
  const cleaned = String(rawText || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const data = JSON.parse(cleaned);

    return {
      plan: Array.isArray(data.plan)
        ? data.plan
        : [],
      headSummary:
        typeof data.headSummary === "string"
          ? data.headSummary
          : "",
    };
  } catch {
    return {
      plan: [],
      headSummary: cleaned,
    };
  }
}

function jsonError(message, status) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}
