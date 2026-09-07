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
      "Workers AI binding not found. In the Cloudflare Pages dashboard, go to " +
      "Settings → Functions → AI bindings, and add a binding named 'AI'."
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

  const text = result?.response;

  if (!text) {
    throw new Error(
      "The model returned an empty response."
    );
  }

  return text;
}
