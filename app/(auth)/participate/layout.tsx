import { ReactNode } from "react";
import { resolveInviterServer } from "@/server/referral/resolveInviter";
import { cookies } from "next/headers";

export default async function ParticipateLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const code = jar?.get('river_ref_h')?.value || null;
  const r = await resolveInviterServer({ code });
  const inviter = (r && r.inviterUserId) ? { id: r.inviterUserId, firstName: r.firstName || null } : null;
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


