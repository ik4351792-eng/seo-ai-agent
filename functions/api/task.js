import { crawlWebsite } from "../lib/crawler.js";
import { callLLM } from "../lib/callLLM.js";

const SPECIALISTS = [
  {
    id: "keyword",
    name: "Keyword Research Agent",
    role: "Keyword research and search-intent analysis",
  },
  {
    id: "competitor",
    name: "Competitor Analysis Agent",
    role: "Competitor and SERP analysis",
  },
  {
    id: "content",
    name: "Content Strategist",
    role: "Content planning and topical strategy",
  },
  {
    id: "writer",
    name: "SEO Writer Agent",
    role: "SEO content creation",
  },
  {
    id: "onpage",
    name: "On-Page SEO Agent",
    role: "On-page SEO analysis",
  },
  {
    id: "technical",
    name: "Technical SEO Agent",
    role: "Technical SEO analysis",
  },
  {
    id: "qa",
    name: "SEO Auditor / QA Agent",
    role: "SEO quality assurance and validation",
  },
  {
    id: "final",
    name: "Final Editor / Reporting Agent",
    role: "Evidence-based final reporting",
  },
];

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const website =
      String(body?.website || "").trim();

    const task =
      String(body?.task || "").trim();

    if (!website) {
      return json(
        {
          ok: false,
          error: "Website URL is required.",
        },
        400
      );
    }

    if (!task) {
      return json(
        {
          ok: false,
          error: "SEO task is required.",
        },
        400
      );
    }

    /*
     * STEP 1
     * Create the Head Agent plan.
     */
    const headPlan = await runHeadAgent(
      website,
      task,
      context.env
    );

    /*
     * STEP 2
     * Real website crawl.
     */
    let crawlData;

    try {
      crawlData = await crawlWebsite(
        website,
        {
          maxPages:
            Number(body?.maxPages) || 30,
        }
      );
    } catch (error) {
      return json(
        {
          ok: false,
          stage: "crawler",
          error:
            error?.message ||
            "Website crawl failed.",
        },
        502
      );
    }

    /*
     * STEP 3
     * Run the specialists that can already
     * work from real crawl evidence.
     */
    const technical =
      await runTechnicalAgent(
        website,
        task,
        crawlData,
        context.env
      );

    const onPage =
      await runOnPageAgent(
        website,
        task,
        crawlData,
        context.env
      );

    const qa =
      await runQAAgent(
        website,
        task,
        crawlData,
        technical,
        onPage,
        context.env
      );

    /*
     * STEP 4
     * Evidence Gate.
     *
     * Only findings backed by actual
     * crawl evidence are passed forward.
     */
    const verifiedFindings =
      evidenceGate({
        crawlData,
        technical,
        onPage,
        qa,
      });

    /*
     * STEP 5
     * Final report.
     */
    const finalReport =
      await runFinalAgent(
        website,
        task,
        headPlan,
        crawlData,
        verifiedFindings,
        context.env
      );

    return json({
      ok: true,

      website,

      task,

      headPlan,

      crawl: {
        pagesCrawled:
          crawlData.crawl.pagesCrawled,

        maxPages:
          crawlData.crawl.maxPages,

        collectedAt:
          crawlData.crawl.collectedAt,

        robots:
          crawlData.robots,

        sitemap:
          crawlData.sitemap,
      },

      verifiedFindings,

      specialists: {
        technical,
        onPage,
        qa,
      },

      finalReport,

      agents: SPECIALISTS.map(
        (agent) => ({
          ...agent,
          status:
            ["technical", "onpage", "qa"].includes(
              agent.id
            )
              ? "done"
              : "planned",
        })
      ),
    });
  } catch (error) {
    console.error(
      "Task error:",
      error
    );

    return json(
      {
        ok: false,
        error:
          error?.message ||
          "Unexpected server error.",
      },
      500
    );
  }
}


/*
|--------------------------------------------------------------------------
| HEAD AGENT
|--------------------------------------------------------------------------
*/

async function runHeadAgent(
  website,
  task,
  env
) {
  const prompt = `
You are the Head SEO Agent.

Website:
${website}

User task:
${task}

Create a concise execution plan.

Available specialist agents:
${SPECIALISTS.map(
  (agent) =>
    `- ${agent.name}: ${agent.role}`
).join("\n")}

Important rules:

1. Do not claim that a website has been crawled.
2. Do not invent SEO metrics.
3. Do not invent search volume.
4. Do not invent ranking positions.
5. Do not invent competitor data.
6. The current phase has REAL website crawling available.
7. Technical, On-Page and QA analysis will receive live crawl evidence.
8. Keyword/SERP/competitor data is NOT yet connected to a live external data provider.
9. Clearly separate available data from unavailable data.

Return:
- execution plan
- agents required
- data required
- unavailable data
`;

  return callLLM(
    env,
    prompt
  );
}


/*
|--------------------------------------------------------------------------
| TECHNICAL SEO AGENT
|--------------------------------------------------------------------------
*/

async function runTechnicalAgent(
  website,
  task,
  crawlData,
  env
) {
  const prompt = `
You are a Technical SEO Specialist.

Website:
${website}

User task:
${task}

You are given REAL crawl evidence below.

CRAWL DATA:
${JSON.stringify(
  crawlData,
  null,
  2
)}

Rules:

- Only make site-specific claims supported by the crawl data.
- Never invent page counts.
- Never invent broken links.
- Never invent redirects.
- Never invent missing metadata.
- Never invent status codes.
- If the crawler did not verify something, say "Not verified".
- Do not treat recommendations as existing problems.
- Distinguish observed issues from recommendations.

Analyze:

1. HTTP status issues
2. Redirects
3. Canonical signals
4. Robots/noindex
5. robots.txt
6. Sitemap
7. Crawlability
8. H1 issues
9. Duplicate/missing titles
10. Missing meta descriptions
11. Internal linking
12. Broken internal links detected by crawl
13. Image alt coverage
14. Structured data presence
15. Response-time observations
16. Other technical observations supported by evidence

For every finding provide:

- issue
- affected URL(s)
- evidence
- severity
- recommendation
`;

  return callLLM(
    env,
    prompt
  );
}


/*
|--------------------------------------------------------------------------
| ON-PAGE SEO AGENT
|--------------------------------------------------------------------------
*/

async function runOnPageAgent(
  website,
  task,
  crawlData,
  env
) {
  const prompt = `
You are an On-Page SEO Specialist.

Website:
${website}

User task:
${task}

REAL CRAWL EVIDENCE:
${JSON.stringify(
  crawlData,
  null,
  2
)}

Only use information contained in the crawl data for site-specific claims.

Do not invent:

- keyword rankings
- search volume
- CTR
- traffic
- competitors
- page performance scores
- conversion data

Analyze the actual crawled pages for:

- title presence
- title consistency
- meta descriptions
- H1 usage
- heading structure
- internal links
- images and alt text
- canonical signals
- noindex
- structured data
- content length observations

For each finding provide:

- issue
- URL
- actual evidence
- severity
- recommendation
`;

  return callLLM(
    env,
    prompt
  );
}


/*
|--------------------------------------------------------------------------
| QA AGENT
|--------------------------------------------------------------------------
*/

async function runQAAgent(
  website,
  task,
  crawlData,
  technical,
  onPage,
  env
) {
  const prompt = `
You are an SEO QA and Auditor Agent.

Website:
${website}

Task:
${task}

REAL CRAWL:
${JSON.stringify(
  crawlData,
  null,
  2
)}

TECHNICAL AGENT:
${JSON.stringify(
  technical,
  null,
  2
)}

ON-PAGE AGENT:
${JSON.stringify(
  onPage,
  null,
  2
)}

Your job is to validate findings.

Rules:

1. A finding must be supported by crawl evidence.
2. Do not accept unsupported numerical claims.
3. Do not create new site-specific facts.
4. If evidence is missing, mark the finding as unverified.
5. Do not convert generic SEO advice into a website issue.
6. Prefer exact URLs and observed values.

Return:

- verified issues
- unverified claims
- evidence gaps
- priority recommendations
`;

  return callLLM(
    env,
    prompt
  );
}


/*
|--------------------------------------------------------------------------
| EVIDENCE GATE
|--------------------------------------------------------------------------
*/

function evidenceGate({
  crawlData,
  technical,
  onPage,
  qa,
}) {
  const pages =
    crawlData?.pages || [];

  const pageUrls =
    new Set(
      pages.map(
        (page) => page.url
      )
    );

  const verified = [];

  /*
   * Deterministic crawler findings.
   * These do not depend on LLM claims.
   */

  for (const page of pages) {
    if (page.status >= 400) {
      verified.push({
        type: "http_status",
        issue:
          "Page returned an error HTTP status.",
        url: page.url,
        evidence: {
          status: page.status,
        },
        source: "live website crawl",
        confidence: "high",
      });
    }

    if (
      page.redirectCount > 0
    ) {
      verified.push({
        type: "redirect",
        issue:
          "Page redirects before reaching the final URL.",
        url: page.url,
        evidence: {
          redirectCount:
            page.redirectCount,
          redirects:
            page.redirects,
          finalUrl:
            page.finalUrl,
        },
        source: "live website crawl",
        confidence: "high",
      });
    }

    if (
      page.contentType?.includes(
        "text/html"
      )
    ) {
      if (!page.title) {
        verified.push({
          type: "missing_title",
          issue:
            "HTML page has no detected title.",
          url: page.url,
          evidence: {
            title: null,
          },
          source: "live website crawl",
          confidence: "high",
        });
      }

      if (
        page.h1Count === 0
      ) {
        verified.push({
          type: "missing_h1",
          issue:
            "HTML page has no detected H1.",
          url: page.url,
          evidence: {
            h1Count:
              page.h1Count,
          },
          source: "live website crawl",
          confidence: "high",
        });
      }

      if (
        page.imagesWithoutAlt > 0
      ) {
        verified.push({
          type: "image_alt",
          issue:
            "Images without an alt attribute were detected.",
          url: page.url,
          evidence: {
            imageCount:
              page.imageCount,
            imagesWithoutAlt:
              page.imagesWithoutAlt,
          },
          source: "live website crawl",
          confidence: "high",
        });
      }

      if (
        page.noindex
      ) {
        verified.push({
          type: "noindex",
          issue:
            "The page contains a noindex robots directive.",
          url: page.url,
          evidence: {
            robotsMeta:
              page.robotsMeta,
          },
          source: "live website crawl",
          confidence: "high",
        });
      }

      if (
        page.wordCount === 0
      ) {
        verified.push({
          type: "empty_content",
          issue:
            "No visible text content was detected by the crawler.",
          url: page.url,
          evidence: {
            wordCount:
              page.wordCount,
          },
          source: "live website crawl",
          confidence: "medium",
        });
      }
    }
  }

  /*
   * Broken internal links that were actually
   * observed during this crawl.
   */
  for (
    const link of
    crawlData?.brokenInternalLinks ||
    []
  ) {
    verified.push({
      type: "broken_internal_link",
      issue:
        "An internal link points to a crawled URL returning an error status.",
      url: link.to,
      evidence: {
        from: link.from,
        to: link.to,
        status: link.status,
      },
      source: "live website crawl",
      confidence: "high",
    });
  }

  /*
   * robots.txt
   */
  if (
    crawlData?.robots &&
    !crawlData.robots.found
  ) {
    verified.push({
      type: "robots",
      issue:
        "robots.txt was not successfully retrieved.",
      url:
        crawlData.robots.url,
      evidence: {
        status:
          crawlData.robots.status,
      },
      source: "live website crawl",
      confidence: "high",
    });
  }

  /*
   * sitemap
   */
  if (
    crawlData?.sitemap &&
    !crawlData.sitemap.found
  ) {
    verified.push({
      type: "sitemap",
      issue:
        "No sitemap was successfully retrieved from the tested sitemap locations.",
      evidence: {
        tested:
          [
            `${crawlData.crawl.origin}/sitemap.xml`,
            `${crawlData.crawl.origin}/sitemap_index.xml`,
          ],
        ],
      source: "live website crawl",
      confidence: "medium",
    });
  }

  /*
   * Important:
   *
   * LLM output is NOT automatically accepted.
   * We only attach it as analyst commentary.
   *
   * This prevents hallucinated counts from
   * becoming verified technical findings.
   */
  return {
    verifiedFindings: verified,

    analystOutputs: {
      technical,
      onPage,
      qa,
    },

    evidencePolicy: {
      rule:
        "Only deterministic crawl-backed findings are marked verified.",
      pageUrls:
        pageUrls.size,
    },
  };
}


/*
|--------------------------------------------------------------------------
| FINAL AGENT
|--------------------------------------------------------------------------
*/

async function runFinalAgent(
  website,
  task,
  headPlan,
  crawlData,
  verifiedFindings,
  env
) {
  const prompt = `
You are the Final SEO Reporting Agent.

Website:
${website}

Task:
${task}

HEAD PLAN:
${JSON.stringify(
  headPlan,
  null,
  2
)}

CRAWL SUMMARY:
${JSON.stringify(
  {
    crawl:
      crawlData.crawl,
    robots:
      crawlData.robots,
    sitemap:
      crawlData.sitemap,
  },
  null,
  2
)}

VERIFIED FINDINGS:
${JSON.stringify(
  verifiedFindings,
  null,
  2
)}

Rules:

- Only call a site-specific issue "verified" if it appears in VERIFIED FINDINGS.
- Do not invent numbers.
- Do not invent search volume.
- Do not invent traffic.
- Do not invent rankings.
- Do not invent competitors.
- Do not invent PageSpeed scores.
- Do not claim Google Search Console data exists.
- Do not claim SERP data exists.
- Clearly label unavailable data.
- Prioritize verified findings.
- Recommendations may be general SEO recommendations, but do not present them as observed website problems.

Return a concise professional SEO report with:

1. Executive summary
2. Crawl coverage
3. Verified technical findings
4. Verified on-page findings
5. Priority fixes
6. Data not currently available
7. Recommended next phase
`;

  return callLLM(
    env,
    prompt
  );
}


/*
|--------------------------------------------------------------------------
| JSON RESPONSE
|--------------------------------------------------------------------------
*/

function json(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store",
      },
    }
  );
}
