import BelowMap from "@/components/BelowMap";
import { resolveInviterServer } from "@/server/referral/resolveInviter";
import { cookies } from "next/headers";
import FooterBar from "@/components/FooterBar";

export default async function LandingPage() {
  // Pull inviter via profiles-first resolver for SSR visibility using referral cookie if present
  const jar = await cookies();
  const code = jar?.get('river_ref_h')?.value || null;
  const r = await resolveInviterServer({ code });
  const inviter = (r && r.inviterUserId) ? { id: r.inviterUserId, fullName: r.fullName || null, firstName: r.firstName || null } : null;
  return (
    <div className="min-h-screen flex flex-col" style={{ paddingInline: "clamp(16px, 4vw, 32px)" }}>
      <main className="flex-1 min-h-0" style={{ ['--hdr' as unknown as string]: '40px' }}>
        <BelowMap initialInviter={inviter} />
      </main>
      <FooterBar />
    </div>
  );
}


