export type ID = string;
export type ISODate = string; // yyyy-MM-dd
export type ISODateTime = string;
export type ContainerType = "DAY" | "LIST";

export interface Task {
  id: ID;
  title: string;
  completed: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  containerType: ContainerType;
  containerId: string; // day key or list id
  order: number;
  seriesId?: ID;
  occurrenceDateKey?: ISODate;
}

export type SystemListKey =
  | "INBOX"
  | "THIS_WEEK"
  | "NEXT_WEEK"
  | "THIS_MONTH"
  | "NEXT_MONTH"
  | "THIS_YEAR"
  | "LONG_TERM";

export interface PlannerList {
  id: ID;
  name: string;
  kind: "SYSTEM" | "CUSTOM";
  systemKey?: SystemListKey;
  order: number;
  archived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ContainerRef {
  containerType: ContainerType;
  containerId: string;
}

export type AccentColor = "coral" | "blue" | "green" | "amber" | "rose";
export type ColumnsCount = 3 | 5 | 7;
export type TextSize = "sm" | "md" | "lg";
export type Spacing = "compact" | "cozy" | "roomy";
export type BulletStyle = "dot" | "dash" | "none";
export type WeekStartMode = "MONDAY" | "TODAY" | "YESTERDAY";
export type ThemeMode = "light" | "dark";

export interface UserPreferences {
  id: "prefs";
  accentColor: AccentColor;
  columns: ColumnsCount;
  textSize: TextSize;
  spacing: Spacing;
  showCompleted: boolean;
  bulletStyle: BulletStyle;
  weekStartMode: WeekStartMode;
  showLines: boolean;
  theme: ThemeMode;
  celebrations: boolean;
  updatedAt: ISODateTime;
}

export type RecurrenceFreq = "day" | "week" | "month";

export interface RecurrenceRule {
  every: number;
  freq: RecurrenceFreq;
  weekdays?: number[]; // 0=Sun..6=Sat
  startDate: ISODate;
}

export interface RecurrenceSeries {
  id: ID;
  taskTitle: string;
  active: boolean;
  rule: RecurrenceRule;
  excludedDateKeys?: ISODate[];
  containerType: ContainerType;
  containerId: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface FocusSession {
  id: ID;
  taskId?: ID;
  startAt: ISODateTime;
  endAt?: ISODateTime;
  durationSec: number;
  dayKey: ISODate;
  weekKey: ISODate;
  timezone: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SyncTombstone {
  id: ID;
  entityType: "task";
  entityId: ID;
  deletedAt: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
