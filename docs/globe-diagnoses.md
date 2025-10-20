Globe Rivers – Diagnostics (2025‑10‑18)

Summary
- Goal: Determine why arcs (“rivers”) aren’t rendering.
- Outcome: Backend data and policies allow client reads; DB has 21 nodes and 18 resolvable links. The most likely remaining causes are (a) client fetch returning 0 due to environment/session in the browser (not server), or (b) arcs array transformed to empty at runtime. Next step is to log client‑side counts.

Checks Performed
1) Row Level Security (RLS) / Policies (server)
- Profiles has broad policies; Users has anon SELECT policy present.

  Query:
  select schemaname, tablename, policyname, cmd, roles
  from pg_policies
  where schemaname='public' and tablename in ('users','profiles')
  order by tablename, policyname;

  Result (abridged):
  - public.profiles: INSERT/SELECT/UPDATE/ALL policies for public
  - public.users: policyname "public read nodes", cmd SELECT, roles {anon}

  Conclusion: anon SELECT from public.users is permitted (server‑side).

2) Data presence: nodes and links (server)
- Nodes count:

  select count(*) as nodes from public.users; → 21

- Links count (referred_by resolves to an existing referral_id):

  select count(*) links
  from public.users u
  where u.referred_by is not null
    and exists (select 1 from public.users p where p.referral_id = u.referred_by);
  → 18

  Conclusion: There is sufficient data to render arcs (18 links) if the client receives it.

3) Client render props (static inspection)
- Arcs mode only is enabled with valid props: arcsData, arcColor, arcAltitude, arcStroke, arcDash*.
- Altitudes: land 0.04/0.06 (hover), arcs ≥ 0.07 (no z‑fight), nodes ≈ 0.201+.
  → Not an altitude/occlusion issue by design.

4) Likely remaining causes (client runtime)
- Client Supabase env/anon session: If envs are missing or client initialization fails, fetchGlobeData may return 0 without error → no arcs.
- RLS client condition mismatch: Although server shows anon SELECT policy, a different role/session in the browser could still yield 0 rows (e.g., misconfigured anon key, wrong project URL).
- Transformation to empty: buildSsotEdges only trims when arcsData is empty; with 18 links, ssotEdges should be > 0 unless arcsData was empty at runtime.

Impact Assessment
- If client receives 0 rows: nodes and arcs won’t render (but we are seeing nodes, which suggests client does receive rows).
- If links are present but arcsData is not assembled: mis‑match between ids (source/target) and nodes array would produce 0 arcs; server counts show 18 resolvable edges, so the mapping logic should succeed unless client fetch returns a different subset.

Recommended Next Verification (no code behavior change)
- In browser console (at /), evaluate after the globe loads:
  - window.__dbgNodes = (window.__dbgNodes || 0);
  - Log counts inside the existing fetch effect (temporary): nodes.length, links.length, arcs,length, ssotEdges.length.
  - Alternatively, add a one‑time endpoint /api/debug/globe returning counts only, then fetch it from the browser to compare with server counts above.

Conclusion
- Server confirms: policies allow anon read, and data exists (21 nodes, 18 links). Issue is likely at the client side: either fetchGlobeData returns 0 (env/session) or the runtime transformation yields empty arrays. Next, collect client runtime counts to pinpoint which stage loses data.







