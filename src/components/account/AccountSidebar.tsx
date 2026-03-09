"use client";

import { GoogleDriveSyncButton } from "@/components/auth/GoogleDriveSyncButton";
import { FriendsPanel } from "@/components/social/FriendsPanel";

export function AccountSidebar() {
  return (
    <aside className="h-full max-h-[calc(100dvh-var(--ui-toolbar-height)-0.75rem)] overflow-y-auto rounded-md border border-theme surface p-3 shadow-lg">
      <h2 className="font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: "var(--ff-sans-condensed)" }}>
        Account
      </h2>

      <div className="mt-3">
        <p className="text-xs uppercase text-muted">Google Sync</p>
        <div className="mt-1">
          <GoogleDriveSyncButton variant="panel" />
        </div>
      </div>

      <FriendsPanel />
    </aside>
  );
}

