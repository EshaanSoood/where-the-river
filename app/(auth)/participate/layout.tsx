import { ReactNode } from "react";
import { getServerInviter } from "@/lib/server/inviter";

export default async function ParticipateLayout({ children }: { children: ReactNode }) {
  const { inviter } = await getServerInviter();
  return (
    <div>
      {/* SSR inviter banner: visible, one line, announced politely by SRs */}
      {inviter && inviter.firstName ? (
        <div role="status" aria-live="polite" className="w-full flex items-center justify-center py-2">
          <p className="text-sm">
            <strong>{inviter.firstName}</strong> sent their boat to your shore.
          </p>
        </div>
      ) : null}
      {children}
    </div>
  );
}


