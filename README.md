# SEO AI Agent — Phase 1A

A real-data SEO analysis system built on Cloudflare Pages Functions and Workers AI.

The current architecture is:

Browser
↓
/api/task
↓
Head Agent
↓
Real Website Crawler
↓
Evidence Dataset
↓
Technical SEO Agent
↓
On-Page SEO Agent
↓
QA / Evidence Gate
↓
Final SEO Report

---

## Current Phase

Phase 1A introduces a real website crawler.

The crawler fetches actual pages from the submitted website and collects SEO-related evidence.

It can currently inspect:

- HTTP status
- redirects
- final URLs
- response time
- response content type
- page size
- title
- title length
- meta description
- meta description length
- canonical
- robots meta
- noindex
- viewport
- charset
- H1-H6
- internal links
- external links
- images
- missing image alt attributes
- JSON-LD structured data
- word count
- robots.txt
- sitemap.xml
- broken internal links detected during the crawl

---

## Project Structure

```text
seo-ai-agent/
│
├── index.html
├── style.css
├── app.js
├── worker.js
├── wrangler.jsonc
├── README.md
│
└── functions/
    │
    ├── api/
    │   └── task.js
    │
    └── lib/
        ├── callLLM.js
        └── crawler.js
