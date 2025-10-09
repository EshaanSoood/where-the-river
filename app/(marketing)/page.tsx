"use client";
import MapCanvas from "@/components/MapCanvas";
import DesktopSidebar from "@/components/DesktopSidebar";
import MobileSticky from "@/components/MobileSticky";
import BelowMap from "@/components/BelowMap";
import DashboardSheet from "@/components/DashboardSheet";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";

export default function LandingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      const loggedIn = !!data.session;
      setIsLoggedIn(loggedIn);
      if (loggedIn) {
        const email = data.session?.user?.email;
        if (email) {
          const res = await fetch("/api/users/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
          const j = await res.json();
          setHasProfile(!!j?.user);
        }
      } else {
        setHasProfile(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, session) => {
      const loggedIn = !!session;
      setIsLoggedIn(loggedIn);
      if (loggedIn) {
        const email = session?.user?.email;
        if (email) {
          const res = await fetch("/api/users/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
          const j = await res.json();
          setHasProfile(!!j?.user);
        }
      } else {
        setHasProfile(false);
      }
    });
    return () => {
      sub?.subscription.unsubscribe();
    };
  }, []);
  const [open, setOpen] = useState(false);
  return (
    <main className="min-h-screen">
      <div className="relative min-h-[80vh] lg:min-h-screen">
        <div className="absolute inset-0">
          <MapCanvas />
        </div>
        <div className="relative z-10 flex items-stretch lg:items-start">
          <DesktopSidebar isLoggedIn={isLoggedIn} hasProfile={hasProfile} onOpenDashboard={() => setOpen(true)} isOpen={open} controlsId="dashboard-sheet" />
          <div className="flex-1 min-h-[80vh]" />
        </div>
        <MobileSticky isLoggedIn={isLoggedIn} onOpenDashboard={() => setOpen(true)} isOpen={open} controlsId="dashboard-sheet" />
        <DashboardSheet open={open} onClose={() => setOpen(false)} />
      </div>
      <BelowMap />
    </main>
  );
}


