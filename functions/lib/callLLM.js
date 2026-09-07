export async function callLLM(
  env,
  systemPrompt,
  userPrompt
) {
  const provider = env.LLM_PROVIDER || "workers-ai";

  switch (provider) {
    case "workers-ai":
      return callWorkersAI(
        env,
        systemPrompt,
        userPrompt
      );

    default:
      throw new Error(
        `Unknown LLM_PROVIDER: "${provider}"`
      );
  }
}

async function callWorkersAI(
  env,
  systemPrompt,
  userPrompt
) {
  if (!env.AI) {
    throw new Error(
      "Workers AI binding not found."
    );
  }

  const model =
    env.LLM_MODEL ||
    "@cf/zai-org/glm-4.7-flash";

  const result = await env.AI.run(model, {
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    chat_template_kwargs: {
      enable_thinking: false,
    },
  });

  // GLM-4.7-Flash chat response
  const text =
    result?.choices?.[0]?.message?.content ??
    result?.response ??
    "";

  if (typeof text !== "string" || !text.trim()) {
    throw new Error(
      "The model returned an empty response."
    );
  }

  return text.trim();
}
