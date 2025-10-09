type Props = { params: { referral: string } };

export default function ReferralLanding({ params }: Props) {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl text-center space-y-4">
        <h1 className="text-3xl font-bold">You were invited</h1>
        <p className="text-muted-foreground">
          Referral ID: <span className="font-mono">{params.referral}</span>
        </p>
        <a
          className="inline-flex items-center justify-center rounded-md bg-foreground text-background px-4 py-2"
          href="/participate"
        >
          Participate
        </a>
      </div>
    </main>
  );
}


