export const USE_REFERRAL_HELPERS: boolean = (process.env.USE_REFERRAL_HELPERS ?? 'true').toLowerCase() !== 'false';
export const ALLOW_ENSURE_ON_READ: boolean = (process.env.ALLOW_ENSURE_ON_READ ?? 'false').toLowerCase() === 'true';
export const REFERRALS_DISABLE_AWARDS: boolean = (process.env.REFERRALS_DISABLE_AWARDS ?? 'false').toLowerCase() === 'true';


