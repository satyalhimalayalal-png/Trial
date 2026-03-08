"use client";

import type {
  AccentColor,
  BulletStyle,
  ColumnsCount,
  Spacing,
  TextSize,
  ThemeMode,
  UserPreferences,
  WeekStartMode,
} from "@/types/domain";

interface PreferencesSidebarProps {
  preferences: UserPreferences;
  onPatch: (patch: Partial<UserPreferences>) => Promise<void>;
}

const ACCENT_OPTIONS: AccentColor[] = ["coral", "blue", "green", "amber", "rose"];
const COLUMN_OPTIONS: ColumnsCount[] = [3, 5, 7];
const TEXT_SIZE_OPTIONS: TextSize[] = ["sm", "md", "lg"];
const SPACING_OPTIONS: Spacing[] = ["compact", "cozy", "roomy"];
const BULLET_OPTIONS: BulletStyle[] = ["dot", "dash", "none"];
const WEEK_START_OPTIONS: WeekStartMode[] = ["MONDAY", "TODAY", "YESTERDAY"];
const THEME_OPTIONS: ThemeMode[] = ["light", "dark"];

function ButtonGroup<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={String(option)}
          type="button"
          onClick={() => onChange(option)}
          className={
            value === option
              ? "rounded border btn-accent bg-accent px-2 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-white"
              : "rounded border border-theme surface px-2 py-1 text-xs font-semibold uppercase tracking-[0.06em]"
          }
        >
          {String(option).toLowerCase()}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mt-2 flex items-center justify-between gap-2 text-xs">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`ios-switch ${checked ? "ios-switch-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="ios-switch-thumb" />
      </button>
    </label>
  );
}

export function PreferencesSidebar({ preferences, onPatch }: PreferencesSidebarProps) {
  return (
    <aside className="h-full overflow-y-auto rounded-md border border-theme surface p-3 shadow-lg">
      <h2 className="font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: "var(--ff-sans-condensed)" }}>
        Preferences
      </h2>

      <div className="mt-3">
        <p className="text-xs uppercase text-muted">Accent Color</p>
        <ButtonGroup value={preferences.accentColor} options={ACCENT_OPTIONS} onChange={(accentColor) => void onPatch({ accentColor })} />
      </div>

      <div className="mt-3">
        <p className="text-xs uppercase text-muted">Columns</p>
        <ButtonGroup value={preferences.columns} options={COLUMN_OPTIONS} onChange={(columns) => void onPatch({ columns })} />
      </div>

      <div className="mt-3">
        <p className="text-xs uppercase text-muted">Text Size</p>
        <ButtonGroup value={preferences.textSize} options={TEXT_SIZE_OPTIONS} onChange={(textSize) => void onPatch({ textSize })} />
      </div>

      <div className="mt-3">
        <p className="text-xs uppercase text-muted">Spacing</p>
        <ButtonGroup value={preferences.spacing} options={SPACING_OPTIONS} onChange={(spacing) => void onPatch({ spacing })} />
      </div>

      <div className="mt-3">
        <p className="text-xs uppercase text-muted">Bullet Style</p>
        <ButtonGroup value={preferences.bulletStyle} options={BULLET_OPTIONS} onChange={(bulletStyle) => void onPatch({ bulletStyle })} />
      </div>

      <div className="mt-3">
        <p className="text-xs uppercase text-muted">Start Week On</p>
        <ButtonGroup value={preferences.weekStartMode} options={WEEK_START_OPTIONS} onChange={(weekStartMode) => void onPatch({ weekStartMode })} />
      </div>

      <div className="mt-3">
        <p className="text-xs uppercase text-muted">Theme</p>
        <ButtonGroup value={preferences.theme} options={THEME_OPTIONS} onChange={(theme) => void onPatch({ theme })} />
      </div>

      <ToggleRow label="Show completed" checked={preferences.showCompleted} onChange={(showCompleted) => void onPatch({ showCompleted })} />
      <ToggleRow label="Show lines" checked={preferences.showLines} onChange={(showLines) => void onPatch({ showLines })} />
      <ToggleRow label="Celebrations" checked={preferences.celebrations} onChange={(celebrations) => void onPatch({ celebrations })} />
    </aside>
  );
}
