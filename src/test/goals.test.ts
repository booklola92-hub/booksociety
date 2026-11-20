import { describe, expect, it } from "vitest";

import {
  booksForMilestone,
  countGoalProgress,
  previewGoalChange,
  reachedMilestones,
} from "@/lib/goals";

const finished = (dates: string[]) => dates.map((d) => ({ finished_at: `${d}T12:00:00+00:00` }));
const now = new Date("2026-06-01T12:00:00");

describe("reading goals", () => {
  it("counts only books finished on or after the goal start date", () => {
    const books = [...finished(["2025-12-31", "2026-01-01", "2026-03-10"]), { finished_at: null }];
    expect(countGoalProgress(books, "2026-01-01")).toBe(2);
  });

  it("reaches milestones at 25%, 50%, 75% and completion", () => {
    expect(reachedMilestones(1, 8)).toEqual([]);
    expect(reachedMilestones(2, 8)).toEqual([25]);
    expect(reachedMilestones(4, 8)).toEqual([25, 50]);
    expect(reachedMilestones(6, 8)).toEqual([25, 50, 75]);
    expect(reachedMilestones(8, 8)).toEqual([25, 50, 75, 100]);
    expect(booksForMilestone(25, 10)).toBe(3);
  });

  it("keeps recorded progress when the target and deadline are adjusted", () => {
    const goal = { target_books: 8, start_date: "2026-01-01", deadline: "2026-12-31" };
    const books = finished(["2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"]);
    const preview = previewGoalChange(goal, { target_books: 20, deadline: "2026-09-30" }, books, now);
    expect(preview.before.done).toBe(4);
    expect(preview.preservedBooks).toBe(4);
    expect(preview.after.deadline).toBe("2026-09-30");
    expect(preview.lost).toEqual([25, 50]);
  });

  it("shows milestones gained when the target is lowered", () => {
    const goal = { target_books: 12, start_date: "2026-01-01", deadline: "2026-12-31" };
    const books = finished(["2026-02-01", "2026-03-01", "2026-04-01"]);
    const preview = previewGoalChange(goal, { target_books: 4, deadline: "2026-12-31" }, books, now);
    expect(preview.before.milestones).toEqual([25]);
    expect(preview.gained).toEqual([50, 75]);
  });
});
