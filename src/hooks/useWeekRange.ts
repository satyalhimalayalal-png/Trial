"use client";

import { useMemo } from "react";
import { addDays, startOfDay, startOfWeek } from "date-fns";
import type { ColumnsCount, WeekStartMode } from "@/types/domain";
import { toDayKey } from "@/lib/domain/dates";

function getCenteredStartDate(anchorDate: Date, columns: ColumnsCount, mode: WeekStartMode): Date {
  let center = startOfDay(anchorDate);

  if (mode === "YESTERDAY") {
    center = addDays(center, -1);
  }

  if (columns === 7) {
    return startOfWeek(center, { weekStartsOn: 0 });
  }

  const half = Math.floor(columns / 2);
  return addDays(center, -half);
}

export function useWeekRange(anchorDate: Date, columns: ColumnsCount, mode: WeekStartMode) {
  return useMemo(() => {
    const startDate = getCenteredStartDate(anchorDate, columns, mode);
    const dates = Array.from({ length: columns }, (_, i) => addDays(startDate, i));

    return {
      startDate,
      dates,
      dayKeys: dates.map(toDayKey),
    };
  }, [anchorDate, columns, mode]);
}
