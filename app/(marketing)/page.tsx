import BelowMap from "@/components/BelowMap";
import { resolveInviterFromCookie, type Inviter } from "@/server/referral/resolveInviter";
import FooterBar from "@/components/FooterBar";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LandingPage() {
  const inviter: Inviter = await resolveInviterFromCookie();
  return (
    <div className="min-h-screen flex flex-col" style={{ paddingInline: "clamp(16px, 4vw, 32px)" }}>
      <main className="flex-1 min-h-0" style={{ ['--hdr' as unknown as string]: '40px' }}>
        <BelowMap initialInviter={inviter} />
      </main>
      <FooterBar />
    </div>
  );
}


