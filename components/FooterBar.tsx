"use client";

import { useEffect } from 'react';

const marqueeText = "Website and experience built by Eshaan Sood & Virat Tiwari. The Sonic Alchemists are Eshaan Sood on Guitar, Annie Orzen on Piano, Ivan Demarjian on Saxophone, Sam Schaeffer on Drums and Brendan Nie on Bass.";

const privacyContent = (
  <>
    <h2>Privacy Policy</h2>
    <p><strong>Last updated:</strong> November 1, 2025</p>
    <p>This Privacy Policy explains how dreamriver.eshaansood.in collects, uses, and shares information when you visit <strong>https://dreamriver.in</strong> or use our services.</p>
    <p>By using our site, you agree to the practices described here.</p>
    <h3>1) What we collect</h3>
    <p><strong>Information you provide</strong></p>
    <ul>
      <li><strong>Account &amp; sign-in:</strong> Your email address (for magic links / OTP and account communications).</li>
      <li><strong>Messages you send us:</strong> Any info you include when you contact us.</li>
    </ul>
    <p><strong>Information collected automatically</strong></p>
    <ul>
      <li><strong>Basic usage data:</strong> IP address, device and browser type, pages viewed, and timestamps (from our hosting and security logs).</li>
      <li><strong>Cookies &amp; similar tech:</strong> Small files to keep you signed in and protect your account.</li>
    </ul>
    <p>We do <strong>not</strong> intentionally collect sensitive personal information.</p>
    <h3>2) How we use your information</h3>
    <ul>
      <li><strong>Authentication &amp; security:</strong> To create your account, send magic links, and protect the site from abuse.</li>
      <li><strong>Service delivery:</strong> To operate, maintain, and improve the site and its features.</li>
      <li><strong>Communications:</strong> To send transactional emails (e.g., sign-in links, important account notices).</li>
      <li><strong>Legal &amp; safety:</strong> To comply with law and enforce our terms.</li>
    </ul>
    <p>We do <strong>not</strong> sell your personal information.</p>
    <h3>3) Legal bases (EEA/UK visitors)</h3>
    <p>If applicable, we rely on:</p>
    <ul>
      <li><strong>Contract necessity:</strong> To provide the service you request (e.g., account access).</li>
      <li><strong>Legitimate interests:</strong> To secure and improve our site.</li>
      <li><strong>Consent:</strong> Where required (e.g., non-essential cookies).</li>
    </ul>
    <p>You can withdraw consent at any time where consent is the basis.</p>
    <h3>4) Sharing your information</h3>
    <p>We share data with trusted service providers who help us run the site. They only use your info to perform services for us.</p>
    <p>Typical providers we use:</p>
    <ul>
      <li><strong>Hosting/Infrastructure:</strong> Vercel (site hosting and logs).</li>
      <li><strong>Authentication/Database:</strong> Supabase (account, magic links, database).</li>
      <li><strong>Email delivery:</strong> Postmark (transactional emails).</li>
    </ul>
    <p>We may also share information if required by law, to protect rights and safety, or in connection with a merger or similar event.</p>
    <h3>5) International transfers</h3>
    <p>Our providers may process data in countries other than yours. Where required, we use appropriate safeguards (e.g., standard contractual clauses).</p>
    <h3>6) Data retention</h3>
    <ul>
      <li><strong>Account data (email):</strong> Kept until you delete your account or request deletion.</li>
      <li><strong>Server/security logs:</strong> Typically retained for ~90 days (or the provider’s standard retention) to secure and operate the service.</li>
      <li><strong>Emails/metadata:</strong> Retained as necessary for delivery, troubleshooting, and legal obligations.</li>
    </ul>
    <p>We’ll keep data longer if required by law or to resolve disputes.</p>
    <h3>7) Security</h3>
    <p>We use reasonable technical and organizational measures, including TLS encryption in transit, access controls, and least-privilege practices. No method is 100% secure, but we work to protect your information.</p>
    <h3>8) Your rights</h3>
    <p>Depending on your location, you may have rights to:</p>
    <ul>
      <li>Access, correct, or delete your personal information.</li>
      <li>Object to or restrict certain processing.</li>
      <li>Withdraw consent (where processing is based on consent).</li>
      <li>Data portability.</li>
    </ul>
    <p>To exercise rights, contact us at <strong>eshaan@eshaansood.in</strong>. We may need to verify your identity. You can also unsubscribe from non-essential emails via any email footer (for transactional OTP emails, unsubscribing may affect your ability to sign in).</p>
    <p><strong>California (CCPA/CPRA):</strong> We do not “sell” or “share” personal information as defined by law. You can still contact us at <strong>eshaan@eshaansood.in</strong> for access or deletion requests.</p>
    <h3>9) Cookies</h3>
    <p>We use cookies and similar technologies to:</p>
    <ul>
      <li>Keep you signed in and secure your session.</li>
      <li>Remember basic preferences.</li>
    </ul>
    <p>You can control cookies through your browser settings. Blocking essential cookies may break sign-in.</p>
    <h3>10) Children’s privacy</h3>
    <p>Our site is not directed to children under 13 (or the minimum age in your region). We do not knowingly collect personal information from children. If you believe a child has provided information, contact us and we’ll delete it.</p>
    <h3>11) Changes to this policy</h3>
    <p>We may update this policy from time to time. We’ll post the new date at the top. If changes are material, we’ll take reasonable steps to notify you.</p>
    <h3>12) Contact us</h3>
    <p>Questions or requests? Email <strong>eshaan@eshaansood.in</strong>.</p>
  </>
);

function PrivacyDetails({ contentId }: { contentId: string }) {
  return (
    <details className="footer-privacy">
      <summary>Privacy Policy</summary>
      <div className="privacy-copy" id={contentId}>
        {privacyContent}
      </div>
    </details>
  );
}

export default function FooterBar() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        document.querySelectorAll<HTMLDetailsElement>('.footer-privacy').forEach((details) => {
          if (details.open) {
            details.open = false;
          }
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const socialLinks = (
    <>
      <a href="https://www.instagram.com/thejumpymonkey" aria-label="Instagram" className="footer-btn" target="_blank" rel="noopener noreferrer">
        <img src="/logos/instagram-.png" alt="" className="footer-icon" width={20} height={20} />
      </a>
      <a href="mailto:eshaan@eshaansood.in" aria-label="Email" className="footer-btn">
        <img src="/logos/email.png" alt="" className="footer-icon" width={20} height={20} />
      </a>
      <a href="https://www.youtube.com/@eshaansoood" aria-label="YouTube" className="footer-btn" target="_blank" rel="noopener noreferrer">
        <img src="/Streaming/pngs/youtube.png" alt="" className="footer-icon" width={20} height={20} />
      </a>
      <a href="https://music.apple.com/us/album/the-sonic-alchemists-i-dream-river/1837469371" aria-label="Apple Music" className="footer-btn" target="_blank" rel="noopener noreferrer">
        <img src="/Streaming/pngs/applemusic.png" alt="" className="footer-icon" width={20} height={20} />
      </a>
      <a href="https://open.spotify.com/album/1Tjrceud212g5KUcZ37Y1U?si=V4_K_uW5T0y-zd7sw481rQ&nd=1&dlsi=5c3cba22ef9f467e" aria-label="Spotify" className="footer-btn" target="_blank" rel="noopener noreferrer">
        <img src="/Streaming/pngs/spotify.png" alt="" className="footer-icon" width={20} height={20} />
      </a>
    </>
  );

  return (
    <footer aria-label="Site footer" className="lg:sticky bottom-0 z-30">
      <div
        className="w-full footer-shell"
      >
        <div className="footer-top" style={{ paddingInline: '8px' }}>
          <div className="flex items-center gap-2 socials-cluster">
            {socialLinks}
          </div>
          <div className="footer-marquee-container" role="marquee" aria-live="polite">
            <div className="sr-only" aria-hidden="false">{marqueeText}</div>
            <div className="footer-marquee" aria-hidden="true">
              <span>{marqueeText}</span>
              <span aria-hidden="true">{marqueeText}</span>
            </div>
          </div>
        </div>
        <div className="h-px" style={{ background: '#0b0d1a', opacity: 0.6 }} />
      </div>
      <div className="footer-meta" aria-label="Site information links">
        <div className="footer-meta-row">
          <PrivacyDetails contentId="privacy-policy" />
          <a className="footer-link" href="https://www.eshaansood.in" target="_blank" rel="noopener noreferrer">
            Go Home
          </a>
        </div>
      </div>
      <style jsx>{`
        .footer-btn {
          width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;
          border-radius: 6px; background: rgba(11,13,26,0.75);
        }
        .footer-shell {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 40px;
          justify-content: center;
          background: var(--card-frost);
          backdrop-filter: var(--card-blur);
          -webkit-backdrop-filter: var(--card-blur);
          border-top-left-radius: 24px;
          border-top-right-radius: 24px;
          border: var(--card-border);
          border-bottom: none;
        }
        .footer-icon { display: none; }
        .footer-icon {
          width: 20px;
          height: 20px;
          object-fit: contain;
          filter: invert(1);
        }
        .footer-top {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .footer-marquee-container {
          flex: 0 1 720px;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
          min-width: 0;
          background: #2F6A75;
          border-radius: 18px;
          padding: 10px 24px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.15);
          text-align: center;
          width: min(100%, 720px);
          margin: 0 auto;
        }
        .footer-marquee {
          display: inline-flex;
          gap: 24px;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 500;
          color: rgba(255,255,255,0.85);
          font-family: "Helvetica", "Arial", sans-serif;
          animation: marquee-scroll 25s linear infinite;
          will-change: transform;
        }
        .footer-marquee span {
          display: inline-block;
        }
        @keyframes marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .footer-mobile-marquee {
          display: block;
          width: 100%;
          padding: 8px 16px 0;
          overflow: hidden;
        }
        .footer-top .socials-cluster {
          width: auto;
          display: inline-flex;
        }
        @media (min-width: 1024px) {
          .footer-mobile-marquee { display: none; }
          .footer-shell { min-height: 40px; }
          .footer-top {
            flex-direction: row;
            justify-content: space-between;
            gap: 24px;
          }
          .footer-marquee-container {
            justify-content: center;
          }
        }
        .footer-meta {
          margin-top: 12px;
          padding: 0 16px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          text-align: center;
          font-size: 11px;
          line-height: 1.5;
          color: rgba(255,255,255,0.75);
          font-family: "Helvetica", "Arial", sans-serif;
        }
        .footer-meta-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 14px;
          width: 100%;
        }
        .footer-meta .footer-link,
        .footer-meta summary {
          color: rgba(255,255,255,0.9);
          text-decoration: underline;
          cursor: pointer;
        }
        .footer-meta summary {
          list-style: none;
        }
        .footer-meta summary::-webkit-details-marker {
          display: none;
        }
        .footer-privacy {
          max-width: 920px;
          text-align: center;
        }
        .privacy-copy {
          margin: 8px auto 0;
          text-align: left;
          background: rgba(11,13,26,0.55);
          border-radius: 12px;
          padding: 16px 18px;
          max-height: 260px;
          overflow-y: auto;
          width: min(100%, 920px);
        }
        .privacy-copy h2 {
          margin-top: 0;
          font-size: 16px;
          font-weight: 600;
        }
        .privacy-copy h3 {
          margin-top: 16px;
          font-size: 13px;
          font-weight: 600;
        }
        .privacy-copy p {
          margin: 6px 0;
        }
        .privacy-copy ul {
          padding-left: 18px;
          margin: 6px 0 12px;
        }
        .footer-link {
          font-weight: 500;
        }
      `}</style>
    </footer>
  );
}

