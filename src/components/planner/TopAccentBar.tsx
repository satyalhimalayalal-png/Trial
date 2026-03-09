"use client";

import Link from "next/link";

type TopMode = "planner" | "focus" | "today" | "analytics";

interface TopAccentBarProps {
  mode: TopMode;
  rangeLabel?: string;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  onTogglePrefs: () => void;
  onToggleAccount: () => void;
  prefsOpen?: boolean;
  accountOpen?: boolean;
}

function IconShell({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return <span className={`ui-app-btn ${active ? "is-active" : ""}`}>{children}</span>;
}

function IconPlanner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="2" />
      <path d="m13 7 4 4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20V4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 20h16" stroke="currentColor" strokeWidth="2" />
      <rect x="7" y="12" width="3" height="6" fill="currentColor" />
      <rect x="12" y="9" width="3" height="9" fill="currentColor" />
      <rect x="17" y="6" width="3" height="12" fill="currentColor" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 1v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 17v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m4.22 4.22 4.24 4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m15.54 15.54 4.24 4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M1 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m4.22 19.78 4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m15.54 8.46 4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 20c1.8-3.7 5-5.5 8-5.5s6.2 1.8 8 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconButton({
  icon,
  title,
  onClick,
  href,
  active,
}: {
  icon: React.ReactNode;
  title: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
}) {
  if (href) {
    return (
      <Link href={href} aria-label={title} title={title}>
        <IconShell active={active}>{icon}</IconShell>
      </Link>
    );
  }

  return (
    <button type="button" aria-label={title} title={title} onClick={onClick}>
      <IconShell active={active}>{icon}</IconShell>
    </button>
  );
}

export function TopAccentBar({
  mode,
  rangeLabel,
  searchQuery,
  onSearchChange,
  onTogglePrefs,
  onToggleAccount,
  prefsOpen = false,
  accountOpen = false,
}: TopAccentBarProps) {
  const showSearch = mode === "planner" && Boolean(onSearchChange);

  return (
    <div className="app-header-shell">
      <div className="app-header-grid">
        <div className="min-w-0 justify-self-start">
          <div className="header-left-cluster">
            {showSearch ? (
              <input
                value={searchQuery ?? ""}
                onChange={(event) => onSearchChange?.(event.target.value)}
                placeholder="Search tasks"
                className="ui-app-search max-w-[15rem] flex-1"
                aria-label="Search tasks"
              />
            ) : rangeLabel ? (
              <span className="block truncate text-[0.6111111111rem] font-bold uppercase tracking-[0.08em] text-muted">
                {rangeLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div className="justify-self-center">
          <Link href="/" className="app-logo-wordmark inline-flex items-center justify-center">
            CHEQLIST
          </Link>
        </div>

        <div className="flex items-center justify-self-end gap-[0.2222222222rem]">
          <IconButton href="/" title="Planner" active={mode === "planner"} icon={<IconPlanner />} />
          <IconButton href="/focus" title="Focus" active={mode === "focus" || mode === "today"} icon={<IconClock />} />
          <IconButton href="/analytics" title="Analytics" active={mode === "analytics"} icon={<IconChart />} />
          <IconButton title="Account" onClick={onToggleAccount} icon={<IconUser />} active={accountOpen} />
          <IconButton title="Settings" onClick={onTogglePrefs} icon={<IconSettings />} active={prefsOpen} />
        </div>
      </div>
    </div>
  );
}
