import { describe, expect, it } from "vitest";
import { computeScore, detectFlags } from "../../src/evaluation/score.js";

describe("computeScore", () => {
  it("scores a domain with no Wayback history and no backlinks at (close to) zero", () => {
    const { score, breakdown } = computeScore({
      ageYears: null,
      snapshotCount: 0,
      yearsCovered: 0,
      spamSampleRatio: 0,
      parkedLatest: false,
      topicChange: false,
      backlinksEstimate: null,
      label: "example",
      publicSuffix: "com",
    });
    expect(breakdown.age).toBe(0);
    expect(breakdown.history).toBe(0);
    expect(breakdown.backlinks).toBe(0);
    expect(breakdown.cleanliness).toBe(25);
    expect(score).toBeGreaterThan(0); // domain_shape + zone still contribute
    expect(score).toBeLessThan(40);
  });

  it("rewards an old, deeply-archived, clean, short domain with a high score", () => {
    const { score, breakdown } = computeScore({
      ageYears: 15,
      snapshotCount: 200,
      yearsCovered: 10,
      spamSampleRatio: 0,
      parkedLatest: false,
      topicChange: false,
      backlinksEstimate: 500,
      label: "shop",
      publicSuffix: "com",
    });
    expect(breakdown.age).toBe(20); // capped at 10y*2
    expect(breakdown.history).toBe(20); // capped
    expect(breakdown.cleanliness).toBe(25);
    expect(score).toBeGreaterThan(80);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("penalizes cleanliness for spammy samples, a parked latest snapshot and a topic change", () => {
    const { breakdown } = computeScore({
      ageYears: 5,
      snapshotCount: 20,
      yearsCovered: 5,
      spamSampleRatio: 1,
      parkedLatest: true,
      topicChange: true,
      backlinksEstimate: 10,
      label: "example",
      publicSuffix: "com",
    });
    // 25 - (1*20) - 5 - 5 = -5 -> clamped to 0
    expect(breakdown.cleanliness).toBe(0);
  });

  it("never returns a score outside 0..100", () => {
    const { score } = computeScore({
      ageYears: 100,
      snapshotCount: 100000,
      yearsCovered: 100,
      spamSampleRatio: 0,
      parkedLatest: false,
      topicChange: false,
      backlinksEstimate: 1_000_000,
      label: "a",
      publicSuffix: "com",
    });
    expect(score).toBeLessThanOrEqual(100);
  });

  it("gives longer labels with digits and hyphens a lower domain_shape score than a short clean one", () => {
    const short = computeScore({
      ageYears: null, snapshotCount: 0, yearsCovered: 0, spamSampleRatio: 0,
      parkedLatest: false, topicChange: false, backlinksEstimate: null,
      label: "shop", publicSuffix: null,
    });
    const long = computeScore({
      ageYears: null, snapshotCount: 0, yearsCovered: 0, spamSampleRatio: 0,
      parkedLatest: false, topicChange: false, backlinksEstimate: null,
      label: "my-cool-shop-2024", publicSuffix: null,
    });
    expect(short.breakdown.domain_shape).toBeGreaterThan(long.breakdown.domain_shape);
  });
});

describe("detectFlags", () => {
  it("sets no_history when there are zero snapshots", () => {
    const flags = detectFlags({ snapshotCount: 0, spamSampleRatio: 0, parkedLatest: false, topicChange: false });
    expect(flags).toEqual({ spam: false, topic_change: false, parked: false, no_history: true });
  });

  it("sets spam/parked/topic_change independently from no_history", () => {
    const flags = detectFlags({ snapshotCount: 10, spamSampleRatio: 0.5, parkedLatest: true, topicChange: true });
    expect(flags).toEqual({ spam: true, topic_change: true, parked: true, no_history: false });
  });
});
