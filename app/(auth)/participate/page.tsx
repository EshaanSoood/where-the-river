import ParticipateClient from "./ParticipateClient";

export default function ParticipatePage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const raw = typeof searchParams?.ref === 'string' ? searchParams?.ref : Array.isArray(searchParams?.ref) ? searchParams?.ref?.[0] : undefined;
  const normalized = (raw || '').replace(/\D+/g, '');
  const serverRefCode = normalized.length > 0 ? normalized : null;
  return <ParticipateClient serverRefCode={serverRefCode} />;
}

