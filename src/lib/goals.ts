import { differenceInCalendarDays, format, parseISO } from "date-fns";

export const MILESTONES = [25, 50, 75, 100] as const;
export type Milestone = (typeof MILESTONES)[number];

export interface GoalLike {
  target_books: number;
  start_date: string; // yyyy-MM-dd
  deadline: string; // yyyy-MM-dd
}

export interface FinishedBook {
  finished_at: string | null;
}

/** Books finished on or after the goal's start date count toward it (never capped by the deadline). */
export function countGoalProgress(books: FinishedBook[], startDate: string): number {
  return books.filter((b) => b.finished_at && b.finished_at.slice(0, 10) >= startDate).length;
}

export function goalPercent(done: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.floor((done * 100) / target));
}

export function reachedMilestones(done: number, target: number): Milestone[] {
  if (target <= 0) return [];
  return MILESTONES.filter((m) => done * 100 >= target * m);
}

export function booksForMilestone(milestone: Milestone, target: number): number {
  return Math.ceil((target * milestone) / 100);
}

export function todayISO(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

export function daysLeft(deadline: string, now: Date = new Date()): number {
  return differenceInCalendarDays(parseISO(deadline), parseISO(todayISO(now)));
}

/** Books per week still needed to hit the target by the deadline; null when nothing left or deadline passed. */
export function weeklyPace(remaining: number, days: number): number | null {
  if (remaining <= 0 || days <= 0) return null;
  return remaining / (days / 7);
}

export interface GoalSnapshot {
  target: number;
  deadline: string;
  done: number;
  percent: number;
  milestones: Milestone[];
  remaining: number;
  daysLeft: number;
  pace: number | null;
}

export function snapshotGoal(goal: GoalLike, books: FinishedBook[], now: Date = new Date()): GoalSnapshot {
  const done = countGoalProgress(books, goal.start_date);
  const remaining = Math.max(0, goal.target_books - done);
  const days = daysLeft(goal.deadline, now);
  return {
    target: goal.target_books,
    deadline: goal.deadline,
    done,
    percent: goalPercent(done, goal.target_books),
    milestones: reachedMilestones(done, goal.target_books),
    remaining,
    daysLeft: days,
    pace: weeklyPace(remaining, days),
  };
}

export interface GoalChangePreview {
  before: GoalSnapshot;
  after: GoalSnapshot;
  preservedBooks: number;
  gained: Milestone[];
  lost: Milestone[];
}

/** Adjusting a goal keeps its start date, so every finished book already counted stays counted. */
export function previewGoalChange(
  current: GoalLike,
  changes: { target_books: number; deadline: string },
  books: FinishedBook[],
  now: Date = new Date(),
): GoalChangePreview {
  const before = snapshotGoal(current, books, now);
  const after = snapshotGoal({ ...current, ...changes }, books, now);
  return {
    before,
    after,
    preservedBooks: after.done,
    gained: after.milestones.filter((m) => !before.milestones.includes(m)),
    lost: before.milestones.filter((m) => !after.milestones.includes(m)),
  };
}

export const MILESTONE_LABEL: Record<Milestone, string> = {
  25: "25%",
  50: "50%",
  75: "75%",
  100: "Concluída",
};
