"use client";

type Props = { referralUrl: string; message: string; userFullName: string; onCopy: (ok: boolean) => void };

declare global {
  interface Window {
    RIVER_REFERRAL_URL?: string;
    currentUser?: { fullName?: string };
  }
}

function enc(s: string): string { return encodeURIComponent(s); }

export default function ShareTiles({ referralUrl, message, userFullName, onCopy }: Props) {
  // Fallbacks per spec
  let ru = referralUrl;
  if (typeof window !== 'undefined' && window.RIVER_REFERRAL_URL) ru = window.RIVER_REFERRAL_URL;
  const fullName = userFullName || (typeof window !== 'undefined' && window.currentUser?.fullName) || '';

  const messageBase = (message && message.trim().length > 0)
    ? message
    : 'Hey!\n\nI found this band called The Sonic Alchemists led by Eshaan Sood a guitar player from India. They just released an album and made a whole game for it. I’ve been listening to Dream River and I think you’ll enjoy it too.';
  const shareCopy = `${messageBase}\n\nJoin the game with this link: ${ru}`;

  const tiles = [
    { key: 'wa', id: 'btn-whatsapp', label: 'Share via WhatsApp', src: '/logos/WhatsappLogo.png', onClick: () => {
      const wa = `https://wa.me/?text=${enc(shareCopy)}`;
      window.open(wa, '_blank', 'noopener');
    }},
    { key: 'email', id: 'btn-email', label: 'Share via Email', src: '/logos/email.png', onClick: () => {
      const subject = 'Dream River — want to try this music game with me?';
      const body = (fullName ? `Hi ${fullName},\n\n` : '') + shareCopy;
      const mailto = `mailto:?subject=${enc(subject)}&body=${enc(body)}`;
      window.location.href = mailto;
    }},
    { key: 'sms', id: 'btn-messages', label: 'Share via Messages', src: '/logos/messages.png', onClick: () => {
      const body = enc(shareCopy);
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const smsUrl = isIOS ? `sms:&body=${body}` : `sms:?body=${body}`;
      window.location.href = smsUrl;
    }},
    { key: 'webshare', id: 'btn-webshare', label: 'Share with Web Share', src: '/logos/share.png', onClick: async () => {
      const nav = (typeof window !== 'undefined')
        ? (window.navigator as Navigator & { share?: (data: ShareData) => Promise<void>; clipboard?: Clipboard })
        : undefined;
      if (nav?.share) {
        try {
          await nav.share({ title: 'Dream River', text: shareCopy, url: ru });
        } catch { /* user cancelled */ }
      } else if (nav?.clipboard) {
        try {
          await nav.clipboard.writeText(shareCopy);
          onCopy(true);
        } catch {
          const subject = 'Dream River — want to try this music game with me?';
          const mailto = `mailto:?subject=${enc(subject)}&body=${enc(shareCopy)}`;
          window.location.href = mailto;
        }
      } else {
        const subject = 'Dream River — want to try this music game with me?';
        const mailto = `mailto:?subject=${enc(subject)}&body=${enc(shareCopy)}`;
        window.location.href = mailto;
      }
    }},
  ];

  return (
    <>
      {tiles.map((t, idx) => (
        <button
          key={t.key}
          id={t.id}
          type="button"
          className="flex-1 min-h-12 rounded-md border flex items-center justify-center font-seasons btn"
          style={{ background: 'var(--teal)', borderColor: 'rgba(0,0,0,0.1)', animation: 'none', animationDelay: `${idx * 60}ms` }}
          aria-label={t.label}
          onClick={t.onClick}
        >
          <img src={t.src} alt="" className="h-6 w-6" />
        </button>
      ))}
      <style jsx>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes fadeScaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
          #share-tiles-wrap > button { animation: fadeScaleIn 200ms ease-out both; }
        }
      `}</style>
    </>
  );
}


