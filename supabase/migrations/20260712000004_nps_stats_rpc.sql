-- RPC: get_nps_stats
-- Returns aggregated NPS metrics for the entire nps_surveys table in a single
-- server-side pass, eliminating the O(N) full-table pagination that was
-- previously done client-side just to compute counts and averages.
-- The client now fetches only the 10 most recent surveys for display.

CREATE OR REPLACE FUNCTION get_nps_stats()
RETURNS TABLE (
  total_responses bigint,
  promoters       bigint,
  passives        bigint,
  detractors      bigint,
  nps_score       integer,
  avg_score       numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COUNT(*)                                                             AS total_responses,
    COUNT(*) FILTER (WHERE score >= 9)                                  AS promoters,
    COUNT(*) FILTER (WHERE score >= 7 AND score <= 8)                   AS passives,
    COUNT(*) FILTER (WHERE score <= 6)                                  AS detractors,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(
        (COUNT(*) FILTER (WHERE score >= 9)::numeric
          - COUNT(*) FILTER (WHERE score <= 6)::numeric)
        / COUNT(*)::numeric * 100
      )::integer
    END                                                                  AS nps_score,
    CASE
      WHEN COUNT(*) = 0 THEN 0::numeric
      ELSE ROUND(AVG(score)::numeric, 1)
    END                                                                  AS avg_score
  FROM nps_surveys;
$$;
