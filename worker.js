import { onRequest } from "./functions/api/task.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API request → Pages Function style handler
    if (url.pathname === "/api/task") {
      return onRequest({
        request,
        env,
        waitUntil: ctx.waitUntil.bind(ctx),
      });
    }

    // Everything else → static website
    return env.ASSETS.fetch(request);
  },
};
