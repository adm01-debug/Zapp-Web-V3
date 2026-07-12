-- RPC: get_csat_stats
-- Returns aggregated CSAT statistics (average, total, rating distribution) for
-- surveys created on or after a given start date. Server-side aggregation avoids
-- materialising all survey rows client-side, which would produce wrong numbers
-- when the count exceeds PostgREST's max_rows limit.

CREATE OR REPLACE FUNCTION get_csat_stats(start_date timestamptz)
RETURNS TABLE (
  average      numeric,
  total        bigint,
  rating_1     bigint,
  rating_2     bigint,
  rating_3     bigint,
  rating_4     bigint,
  rating_5     bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    ROUND(AVG(rating)::numeric, 2)                         AS average,
    COUNT(*)::bigint                                        AS total,
    COUNT(*) FILTER (WHERE rating = 1)::bigint             AS rating_1,
    COUNT(*) FILTER (WHERE rating = 2)::bigint             AS rating_2,
    COUNT(*) FILTER (WHERE rating = 3)::bigint             AS rating_3,
    COUNT(*) FILTER (WHERE rating = 4)::bigint             AS rating_4,
    COUNT(*) FILTER (WHERE rating = 5)::bigint             AS rating_5
  FROM csat_surveys
  WHERE created_at >= start_date;
$$;
