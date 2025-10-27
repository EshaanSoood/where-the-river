"use client";

import openParticipateOverlay from "@/components/participate/openParticipate";

export default async function ReferralLanding({ params }: { params: Promise<{ referral: string }> }) {
  const p = await params;
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl text-center space-y-4">
        <h1 className="text-3xl font-bold">You were invited</h1>
        <p className="text-muted-foreground">
          Referral ID: <span className="font-mono">{p.referral}</span>
        </p>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md bg-foreground text-background px-4 py-2"
          onClick={() => openParticipateOverlay()}
          aria-label="Participate"
        >
          Participate
        </button>
      </div>
    </main>
  );
}


