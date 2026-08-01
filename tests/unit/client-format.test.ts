import { describe, expect, it } from "vitest";
import {
  answerCountLabel,
  avatarFor,
  formatYearBadge,
  relativeTime,
} from "../../client/src/lib/format.js";

/**
 * Coverage for the client's display formatting (T19).
 *
 * These run in the ROOT suite deliberately. Until T19 the client sat outside every gate,
 * so nothing checked S1–S4 at all. `client/src/lib/*` is import-free and DOM-free
 * precisely so this file can import it under the root tsconfig (ES2022, NodeNext) — if a
 * future change makes these modules reach for `document`, this suite stops compiling,
 * which is the intended alarm.
 */

describe("relativeTime", () => {
  const now = Date.parse("2026-08-02T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("test_reads_as_just_now_under_a_minute", () => {
    expect(relativeTime(ago(30_000), now)).toBe("just now");
  });

  it("test_minute_and_hour_boundaries_do_not_overlap", () => {
    expect(relativeTime(ago(59 * 60_000), now)).toBe("59m ago");
    expect(relativeTime(ago(60 * 60_000), now)).toBe("1h ago");
    expect(relativeTime(ago(23 * 3_600_000), now)).toBe("23h ago");
  });

  it("test_one_day_reads_as_yesterday_not_1d_ago", () => {
    // The designs use the word, not the number, at exactly one day.
    expect(relativeTime(ago(24 * 3_600_000), now)).toBe("yesterday");
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe("2d ago");
    expect(relativeTime(ago(6 * 86_400_000), now)).toBe("6d ago");
  });

  it("test_beyond_a_week_falls_back_to_an_absolute_date", () => {
    expect(relativeTime(ago(30 * 86_400_000), now)).not.toMatch(/ago/);
  });

  it("test_clock_skew_into_the_future_never_renders_a_negative_age", () => {
    // A phone a few seconds ahead of the server must not produce "-1m ago".
    expect(relativeTime(new Date(now + 5_000).toISOString(), now)).toBe("just now");
  });

  it("test_a_null_or_unparseable_timestamp_renders_as_empty_not_NaN", () => {
    // publishedAt is null for every held item, and S5/S7 render it directly.
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});

describe("formatYearBadge", () => {
  it("test_R2_year_badge_renders_as_batch_flair_not_a_raw_year", () => {
    // identity.service.ts stores String(parsed.year); every design chip reads "'26 batch".
    expect(formatYearBadge("2026")).toBe("'26 batch");
    expect(formatYearBadge("2024")).toBe("'24 batch");
  });

  it("test_a_non_year_badge_passes_through_untouched", () => {
    // A future campus rule could produce a different badge shape; mangling it would be
    // worse than showing it raw.
    expect(formatYearBadge("alumni")).toBe("alumni");
    expect(formatYearBadge("")).toBe("");
  });
});

describe("avatarFor", () => {
  it("test_R2_avatar_is_stable_for_a_given_pseudonym", () => {
    // Persistence is the whole point of a pseudonym: the same author must look the same
    // on every card, in every session.
    const first = avatarFor("quiet-otter-4821");
    expect(avatarFor("quiet-otter-4821")).toBe(first);
    expect(avatarFor("quiet-otter-4821")).toBe(first);
  });

  it("test_avatar_is_drawn_from_the_designers_palette_for_real_pseudonym_shapes", () => {
    const palette = ["🐦", "🦅", "🐈", "🌿", "🦉"];
    // Real pseudonyms are adjective-noun-NNNN (server/.../pseudonym.ts), not the
    // CamelCase names the design mocks assumed.
    for (const name of ["quiet-otter-4821", "vivid-zephyr-1007", "plucky-cobalt-9930", ""]) {
      expect(palette).toContain(avatarFor(name));
    }
  });
});

describe("answerCountLabel", () => {
  it("test_answer_count_is_singular_at_one", () => {
    expect(answerCountLabel(0)).toBe("0 answers");
    expect(answerCountLabel(1)).toBe("1 answer");
    expect(answerCountLabel(4)).toBe("4 answers");
  });
});
