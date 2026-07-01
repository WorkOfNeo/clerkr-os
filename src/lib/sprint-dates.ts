// Two-week sprint convention: testing days are
//   1) the first Thursday on/after startDate,
//   2) the following Wednesday (week 2),
//   3) the following Friday (week 2).
// Dates are stored as-is per sprint and can be edited; this helper just
// computes sensible defaults from a startDate.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SprintDates {
  endDate: Date;
  testingDay1: Date;
  testingDay2: Date;
  testingDay3: Date;
}

export function computeSprintDates(startDate: Date): SprintDates {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  // First Thursday >= start. JS day-of-week: 0=Sun, 4=Thu.
  const daysToThu = (4 - start.getDay() + 7) % 7;
  const testingDay1 = new Date(start.getTime() + daysToThu * DAY_MS);
  const testingDay2 = new Date(testingDay1.getTime() + 6 * DAY_MS); // next Wed
  const testingDay3 = new Date(testingDay1.getTime() + 8 * DAY_MS); // next Fri

  // Two-week sprint = 14 calendar days = end on day +13.
  const endDate = new Date(start.getTime() + 13 * DAY_MS);

  return { endDate, testingDay1, testingDay2, testingDay3 };
}

export function defaultPlanningDate(startDate: Date): Date {
  // Planning typically happens the Monday before the sprint starts.
  const d = new Date(startDate);
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - 3 * DAY_MS);
}
