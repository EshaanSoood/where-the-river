import BelowMap from "@/components/BelowMap";
import { resolveInviterFromCookie, resolveInviterFromCode, type Inviter } from "@/server/referral/resolveInviter";
import FooterBar from "@/components/FooterBar";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LandingPage({ searchParams }: { searchParams?: { [key: string]: string | string[] | undefined } }) {
  const rawRef = (searchParams && typeof searchParams.ref === 'string') ? (searchParams.ref as string) : null;
  const inviter: Inviter = rawRef && rawRef.trim().length > 0
    ? await resolveInviterFromCode(rawRef)
    : await resolveInviterFromCookie();
  return (
    <div className="min-h-screen flex flex-col" style={{ paddingInline: "clamp(16px, 4vw, 32px)" }}>
      <main className="flex-1 min-h-0" style={{ ['--hdr' as unknown as string]: '40px' }}>
        <BelowMap initialInviter={inviter} />
      </main>
      <FooterBar />
    </div>
  );
}


