import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  htmlToText,
  detectLanguage,
  countNicheHits,
  countSpamHits,
  isParkedPage,
  classifyNiche,
  detectTopicChange,
} from "../../src/evaluation/content-analysis.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "wayback");

function loadText(name: string): string {
  return htmlToText(readFileSync(join(FIXTURES, name), "utf8"));
}

describe("htmlToText", () => {
  it("strips script/style blocks and tags, and lowercases the result", () => {
    const text = loadText("auto-ru.html");
    expect(text).not.toContain("<");
    expect(text).not.toContain("var x = 1");
    expect(text).not.toContain("color: red");
    expect(text).toContain("автозапчасти");
  });
});

describe("detectLanguage", () => {
  it("detects Russian by ru-specific letters", () => {
    expect(detectLanguage(loadText("auto-ru.html"))).toBe("ru");
  });

  it("detects Ukrainian by uk-specific letters", () => {
    expect(detectLanguage(loadText("energy-ua.html"))).toBe("uk");
  });

  it("detects English for a Latin-only page", () => {
    expect(detectLanguage(loadText("news-en.html"))).toBe("en");
  });

  it("returns unknown for empty text", () => {
    expect(detectLanguage("")).toBe("unknown");
  });
});

describe("countNicheHits / classifyNiche on saved snapshot fixtures", () => {
  it("classifies an auto-parts page as niche=auto", () => {
    const hits = countNicheHits(loadText("auto-ru.html"));
    const { niche, confidence } = classifyNiche([hits], "com.ua");
    expect(niche).toBe("auto");
    expect(confidence).toBeGreaterThan(0);
  });

  it("classifies an energy/utilities page as niche=energy", () => {
    const hits = countNicheHits(loadText("energy-ua.html"));
    const { niche } = classifyNiche([hits], "ua");
    expect(niche).toBe("energy");
  });

  it("classifies a news page as niche=news", () => {
    const hits = countNicheHits(loadText("news-en.html"));
    const { niche } = classifyNiche([hits], "com");
    expect(niche).toBe("news");
  });

  it("classifies a US deals/coupon page as niche=deals_us", () => {
    const hits = countNicheHits(loadText("deals-us.html"));
    const { niche } = classifyNiche([hits], "com");
    expect(niche).toBe("deals_us");
  });

  it("falls back to none with zero confidence when nothing matches and there is no zone prior", () => {
    const hits = countNicheHits(loadText("parked.html"));
    const { niche, confidence } = classifyNiche([hits], "io");
    expect(niche).toBe("none");
    expect(confidence).toBe(0);
  });

  it("falls back to other (not the nearest of the 4 niches) when the winning niche's signal is weak", () => {
    // A single, ambiguous hit split across two niches: neither reaches the min hit count or
    // confidence needed to trust a specific classification.
    const weakHits = { auto: 1, energy: 0, news: 1, deals_us: 0 };
    const { niche } = classifyNiche([weakHits], "com");
    expect(niche).toBe("other");
  });

  it("caps confidence well below certainty when the guess comes from the zone prior alone (no sampled pages at all)", () => {
    // Zero samples (e.g. no_history): any niche hint comes purely from ZONE_NICHE_PRIOR, not content.
    const { niche, confidence } = classifyNiche([], "com");
    expect(niche).toBe("deals_us");
    expect(confidence).toBeLessThanOrEqual(0.3);
    expect(confidence).toBeLessThan(1);
  });
});

describe("countSpamHits / isParkedPage", () => {
  it("flags casino/pharma keywords on a spam page", () => {
    expect(countSpamHits(loadText("casino-spam.html"))).toBeGreaterThan(0);
  });

  it("does not flag a clean niche page as spam", () => {
    expect(countSpamHits(loadText("auto-ru.html"))).toBe(0);
  });

  it("detects a GoDaddy-style parked page by its boilerplate", () => {
    expect(isParkedPage(loadText("parked.html"))).toBe(true);
  });

  it("does not flag a real content page as parked", () => {
    expect(isParkedPage(loadText("news-en.html"))).toBe(false);
  });
});

describe("detectTopicChange", () => {
  it("flags a change when the niche switches and stays switched for 2+ consecutive samples", () => {
    const autoHits = countNicheHits(loadText("auto-ru.html"));
    const newsHits = countNicheHits(loadText("news-en.html"));
    expect(detectTopicChange([autoHits, autoHits, newsHits, newsHits])).toBe(true);
  });

  it("does not flag a change when every sample has the same dominant niche", () => {
    const autoHits = countNicheHits(loadText("auto-ru.html"));
    expect(detectTopicChange([autoHits, autoHits])).toBe(false);
  });

  it("ignores samples with no niche signal (e.g. a parked page) when deciding", () => {
    const autoHits = countNicheHits(loadText("auto-ru.html"));
    const parkedHits = countNicheHits(loadText("parked.html"));
    expect(detectTopicChange([autoHits, parkedHits, autoHits])).toBe(false);
  });

  it("does not flag a single noisy sample surrounded by the dominant niche (e.g. a long-running news site)", () => {
    // Regression for FACT-316: a 28-year, 235-snapshot news site (interfax.com.ua) flagged
    // topic_change purely because one of several sampled snapshots happened to classify
    // differently (layout/keyword noise), not because the site actually changed topic.
    const newsHits = countNicheHits(loadText("news-en.html"));
    const autoHits = countNicheHits(loadText("auto-ru.html"));
    expect(detectTopicChange([newsHits, newsHits, autoHits, newsHits])).toBe(false);
  });

  it("requires the new niche to be a confident match, not just any different best-match, to count towards a run", () => {
    const newsHits = countNicheHits(loadText("news-en.html"));
    const ambiguousHits = { auto: 1, energy: 1, news: 1, deals_us: 0 };
    expect(detectTopicChange([newsHits, ambiguousHits, ambiguousHits, newsHits])).toBe(false);
  });
});
