"use client";

type Props = {
  isLoggedIn?: boolean;
  hasProfile?: boolean;
  onOpenDashboard?: () => void;
  isOpen?: boolean;
  controlsId?: string;
};

export default function DesktopSidebar({ isLoggedIn, hasProfile, onOpenDashboard, isOpen, controlsId }: Props) {
  return (
    <aside className="hidden lg:flex lg:flex-col gap-6 w-[340px] p-4">
      <section className="rounded-lg border p-4 bg-background/70 backdrop-blur">
        <div className="space-y-3">
          <div className="font-medium">Float your paper boat</div>
          <button
            type="button"
            className="px-3 py-2 rounded-md text-sm inline-block btn"
            onClick={onOpenDashboard}
            aria-label="Dashboard"
            aria-controls={controlsId}
            aria-expanded={isOpen ? true : false}
          >
            {isLoggedIn && hasProfile ? "Open Dashboard" : "Participate / Log in"}
          </button>
        </div>
      </section>
      <section className="rounded-lg border p-4 bg-background/70 backdrop-blur">
        <div className="font-semibold mb-2">Leaderboard</div>
        <ol className="text-sm space-y-1">
          <li>🥇 Leader 1</li>
          <li>🥈 Leader 2</li>
          <li>🥉 Leader 3</li>
          <li>4. …</li>
          <li>5. …</li>
        </ol>
      </section>
    </aside>
  );
}

