import { callLLM } from "../lib/callLLM.js";

const MAX_TASK_LENGTH = 2000;

const HEAD_AGENT_SYSTEM_PROMPT = `
You are the SEO Head / Manager Agent, leading a team of eight SEO specialists:
Keyword Research Agent, Competitor Analysis Agent, Content Strategist Agent,
SEO Writer Agent, On-Page SEO Agent, Technical SEO Agent, SEO Auditor/QA Agent,
and Final Editor/Reporting Agent.

Those specialists are not wired up yet, so for now YOU must:
1. Read the user's task.
2. Break it into a short list of concrete subtasks, each assigned to the
   specialist agent who would own it (use their exact names above).
3. Write a brief, genuinely useful summary yourself, as a stand-in, so the
   user gets real value even before specialists are connected.

Respond with ONLY valid JSON, no markdown fences, no commentary, in this
exact shape:

{
  "plan": [
    { "agent": "Keyword Research Agent", "task": "short description" }
  ],
  "headSummary": "a few short paragraphs, plain text, no markdown headers"
}
`.trim();

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;

  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const task = typeof body?.task === "string" ? body.task.trim() : "";

  if (!task) {
    return jsonError("Please include a non-empty 'task' string.", 400);
  }

  if (task.length > MAX_TASK_LENGTH) {
    return jsonError(
      `Task is too long (max ${MAX_TASK_LENGTH} characters).`,
      400
    );
  }

  let rawResponse;

  try {
    rawResponse = await callLLM(
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

  const parsed = safeParsePlan(rawResponse);

  return new Response(JSON.stringify(parsed), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
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
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*|```$/g, "");

  try {
    const data = JSON.parse(cleaned);

    return {
      plan: Array.isArray(data.plan) ? data.plan : [],
      headSummary:
        typeof data.headSummary === "string"
          ? data.headSummary
          : "",
    };
  } catch {
    return {
      plan: [],
      headSummary: rawText.trim(),
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
