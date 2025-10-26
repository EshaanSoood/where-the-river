import BelowMap from "@/components/BelowMap";
import { getServerInviter } from "@/lib/server/inviter";
import FooterBar from "@/components/FooterBar";

export default async function LandingPage() {
  const { inviter } = await getServerInviter();
  return (
    <div className="min-h-screen flex flex-col" style={{ paddingInline: "clamp(16px, 4vw, 32px)" }}>
      <main className="flex-1 min-h-0" style={{ ['--hdr' as unknown as string]: '40px' }}>
        <BelowMap initialInviter={inviter} />
      </main>
      <FooterBar />
    </div>
  );
}


