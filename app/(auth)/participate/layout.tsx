import { ReactNode } from "react";
import { resolveInviterFromCookie, type Inviter } from "@/server/referral/resolveInviter";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ParticipateLayout({ children }: { children: ReactNode }) {
  const inviter: Inviter = await resolveInviterFromCookie();
  return (
    <div>
      {/* SSR inviter banner: visible, one line, announced politely by SRs */}
      {(inviter?.firstName || inviter?.fullName || inviter?.code) ? (
        <div role="status" aria-live="polite" className="w-full flex items-center justify-center py-2">
          {inviter.firstName || inviter.fullName ? (
            <p className="text-sm"><strong>{inviter.firstName || inviter.fullName}</strong> sent their boat to your shore.</p>
          ) : (
            <p className="text-sm">Someone invited you{inviter.code ? ` (code ${inviter.code})` : ''}.</p>
          )}
        </div>
      ) : null}
      {children}
    </div>
  );
}


