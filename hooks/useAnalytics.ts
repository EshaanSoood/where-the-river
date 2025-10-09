"use client";

import { usePlausible } from "next-plausible";

export function useAnalytics() {
  const plausible = usePlausible();
  return {
    trackStickyImpression: () => plausible("sticky_impression"),
    trackParticipateClick: () => plausible("cta_participate_click"),
    trackShareClick: () => plausible("cta_share_click"),
    trackLearnMore: () => plausible("learn_more_click"),
    trackMapHighlight: () => plausible("map_highlight_river"),
    trackLeaderboardOpen: () => plausible("leaderboard_open"),
    trackDashboardOpen: () => plausible("dashboard_open"),
    trackShareCopy: () => plausible("share_copy"),
    trackShareSms: () => plausible("share_sms"),
    trackShareEmail: () => plausible("share_email"),
    trackShareWhatsApp: () => plausible("share_whatsapp"),
    trackShareInstagramDm: () => plausible("share_instagram_dm"),
  } as const;
}

