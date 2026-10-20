#!/usr/bin/env python3
"""AIMPACT Naver Blog research queue builder.

Free, dependency-free, evidence-first. It discovers items from official RSS feeds
and produces a review queue; it does NOT claim to perform AI fact-checking or
publish to Naver. Unverified claims are never marked verified.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

FEEDS = [
    {"name": "World Health Organization", "url": "https://www.who.int/rss-feeds/news-english.xml", "domains": ["who.int"], "areas": ["health", "aging", "childcare"]},
    {"name": "U.S. Food and Drug Administration", "url": "https://www.fda.gov/AboutFDA/ContactFDA/StayInformed/RSSFeeds/Drugs/rss.xml", "domains": ["fda.gov"], "areas": ["health", "skin-care", "beauty"]},
    {"name": "U.S. Securities and Exchange Commission", "url": "https://www.sec.gov/news/pressreleases.rss", "domains": ["sec.gov"], "areas": ["stocks", "global-markets", "finance"]},
    {"name": "U.S. National Institutes of Health", "url": "https://nih.at/news.rss", "domains": ["nih.gov"], "areas": ["health", "aging", "childcare", "research"]},
]
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 AIMPACT-ResearchQueue/1.0 (AIMPACT-off@gmail.com)"
MAX_PER_FEED = 12


def clean(value: str | None) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def child_text(node: ET.Element, names: set[str]) -> str:
    for child in node.iter():
        if child is node:
            continue
        if local_name(child.tag) in names and (child.text or "").strip():
            return clean(child.text)
    return ""


def parse_feed(xml_text: str, source: dict[str, Any]) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_text)
    items: list[dict[str, Any]] = []
    for node in root.iter():
        if local_name(node.tag) not in {"item", "entry"}:
            continue
        title = child_text(node, {"title"})
        link = ""
        for child in node.iter():
            if local_name(child.tag) == "link":
                link = (child.attrib.get("href") or child.text or "").strip()
                if link:
                    break
        summary = child_text(node, {"description", "summary", "encoded", "content"})
        published_raw = child_text(node, {"pubdate", "published", "updated", "date"})
        published = published_raw
        if published_raw:
            try:
                published = parsedate_to_datetime(published_raw).isoformat()
            except (TypeError, ValueError, OverflowError):
                try:
                    published = dt.datetime.fromisoformat(published_raw.replace("Z", "+00:00")).isoformat()
                except ValueError:
                    pass
        if not title or not link.startswith("https://"):
            continue
        items.append({
            "source_name": source["name"],
            "source_feed": source["url"],
            "title": title,
            "url": link,
            "summary": summary[:1800],
            "published_at": published,
            "allowed_domains": source["domains"],
            "topic_areas": source["areas"],
            "evidence_status": "SOURCE_FOUND_CLAIMS_NOT_YET_VERIFIED",
        })
        if len(items) >= MAX_PER_FEED:
            break
    return items


def fetch_feed(source: dict[str, Any], timeout: int = 18) -> tuple[list[dict[str, Any]], str | None]:
    request = urllib.request.Request(source["url"], headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                return [], f"HTTP_{response.status}"
            raw = response.read(2_500_000)
        items = parse_feed(raw.decode("utf-8", errors="replace"), source)
        if not items:
            return [], "NO_PARSEABLE_ITEMS_OR_NONFEED_RESPONSE"
        return items, None
    except (urllib.error.URLError, TimeoutError, OSError, ET.ParseError) as exc:
        reason = getattr(exc, "reason", None)
        return [], f"{type(exc).__name__}: {reason or str(exc)[:180]}"


def build_markdown(items: list[dict[str, Any]], feed_status: list[dict[str, Any]], generated_at: str) -> str:
    lines = [
        "# AIMPACT Naver Blog — Research and Review Queue",
        "",
        f"- Generated (UTC): {generated_at}",
        "- Status: RESEARCH_QUEUE_ONLY — not an article fact-check, not approved, not published",
        "- Publishing: manual review required; this workflow does not log into or publish to Naver Blog",
        "- Policy: no unsupported health/beauty/finance claims; no invented data or experience",
        "",
        "## Feed health",
        "",
        "| Source | Status | Items | Detail |",
        "|---|---|---:|---|",
    ]
    for f in feed_status:
        detail = (f.get("error") or "Fetched successfully").replace("|", "\\|")
        lines.append(f"| {f['name']} | {f['status']} | {f['items']} | {detail} |")
    lines.extend(["", "## Candidate items", ""])
    if not items:
        lines.extend(["No items were retrieved. Do not create content from this run.", ""])
    for i, item in enumerate(items, 1):
        lines.extend([
            f"### {i}. {item['title']}",
            "",
            f"- Original source: [{item['source_name']}]({item['url']})",
            f"- Published: {item['published_at'] or 'Not supplied by feed'}",
            f"- Potential topic areas: {', '.join(item['topic_areas'])}",
            f"- Evidence status: **{item['evidence_status']}**",
            f"- Source summary: {item['summary'] or 'No summary supplied; open the source before writing.'}",
            "",
            "**Required human/editorial checks before drafting:** open the original URL; confirm publication date and currentness; map each factual claim to source text; find additional primary sources for material claims; add local/Korean context only when independently sourced; assess health/financial risk; verify image rights; review title and CTA.",
            "",
        ])
    lines.extend([
        "## Publication gate",
        "",
        "- [ ] Original source opened and relevant claims captured",
        "- [ ] Claims and dates cross-checked against primary sources",
        "- [ ] Conflicts/uncertainty explicitly labeled",
        "- [ ] Korean audience context checked",
        "- [ ] Original article written; no copied source text beyond permitted quotation",
        "- [ ] Image provenance and usage rights checked",
        "- [ ] Medical/financial safety review completed where relevant",
        "- [ ] Human approval recorded",
        "- [ ] Naver post published and live URL/title/body verified (only then mark PASS)",
        "",
    ])
    return "\n".join(lines)


def self_test() -> None:
    fixture = """<?xml version="1.0"?><rss><channel><item><title>Sample official update</title><link>https://www.example.gov/update</link><description>Test summary &amp; detail</description><pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>"""
    result = parse_feed(fixture, {"name": "Test Agency", "url": "https://www.example.gov/rss", "domains": ["example.gov"], "areas": ["test"]})
    assert len(result) == 1
    assert result[0]["title"] == "Sample official update"
    assert result[0]["summary"] == "Test summary & detail"
    assert result[0]["evidence_status"] == "SOURCE_FOUND_CLAIMS_NOT_YET_VERIFIED"
    rendered = build_markdown(result, [{"name": "Test Agency", "status": "PASS", "items": 1}], "2026-10-20T00:00:00Z")
    assert "not an article fact-check" in rendered
    assert "Publication gate" in rendered
    print("NAVER_BLOG_PIPELINE_SELF_TEST=PASS")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--output-dir", default="artifacts/naver-blog")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0

    now = dt.datetime.now(dt.timezone.utc)
    generated_at = now.isoformat()
    sources = FEEDS
    if os.getenv("AIMPACT_RSS_FEEDS"):
        urls = [u.strip() for u in os.environ["AIMPACT_RSS_FEEDS"].split(",") if u.strip()]
        sources = [{"name": url.split("/")[2], "url": url, "domains": [url.split("/")[2]], "areas": ["general"]} for url in urls]

    all_items: list[dict[str, Any]] = []
    statuses = []
    for source in sources:
        items, error = fetch_feed(source)
        statuses.append({
            "name": source["name"],
            "status": "PASS" if items and not error else ("PARTIAL" if items else "FAIL"),
            "items": len(items),
            "error": error or "",
            "url": source["url"],
        })
        all_items.extend(items)

    seen = set()
    unique = []
    for item in all_items:
        if item["url"] not in seen:
            seen.add(item["url"])
            unique.append(item)
    unique.sort(key=lambda x: x.get("published_at") or "", reverse=True)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    payload = {"generated_at": generated_at, "pipeline_status": "PASS" if unique else "FAIL", "mode": "research_queue_only", "feed_status": statuses, "items": unique}
    (out_dir / f"research-queue-{stamp}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out_dir / f"research-queue-{stamp}.md").write_text(build_markdown(unique, statuses, generated_at), encoding="utf-8")
    summary = {"pipeline_status": payload["pipeline_status"], "items": len(unique), "feeds_passed": sum(1 for x in statuses if x["status"] == "PASS"), "feeds_failed": sum(1 for x in statuses if x["status"] == "FAIL"), "output_dir": str(out_dir)}
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if unique else 1


if __name__ == "__main__":
    sys.exit(main())
