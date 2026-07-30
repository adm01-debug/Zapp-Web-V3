-- 1. Business Hours Awareness for SLA
CREATE OR REPLACE FUNCTION public.fn_add_business_minutes(
    p_start TIMESTAMP WITH TIME ZONE,
    p_minutes INT,
    p_instance_name TEXT
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current TIMESTAMP WITH TIME ZONE := p_start;
    v_remaining_min INT := p_minutes;
    v_config JSONB;
    v_day_idx INT;
    v_day_name TEXT;
    v_open TIME;
    v_close TIME;
    v_day_config JSONB;
    v_day_end TIMESTAMP WITH TIME ZONE;
    v_available_min INT;
BEGIN
    -- Get instance business hours config
    SELECT config->'business_hours' INTO v_config 
    FROM public.instance_registry 
    WHERE instance_name = p_instance_name;

    -- Fallback if no config or not enabled
    IF v_config IS NULL THEN
        RETURN p_start + (p_minutes * interval '1 minute');
    END IF;

    WHILE v_remaining_min > 0 LOOP
        v_day_idx := EXTRACT(DOW FROM v_current);
        v_day_name := CASE v_day_idx 
            WHEN 0 THEN 'sunday' WHEN 1 THEN 'monday' WHEN 2 THEN 'tuesday' 
            WHEN 3 THEN 'wednesday' WHEN 4 THEN 'thursday' WHEN 5 THEN 'friday' 
            WHEN 6 THEN 'saturday' 
        END;

        v_day_config := v_config->v_day_name;

        -- If closed this day, skip to next day start
        IF v_day_config IS NULL OR NOT (v_day_config->>'enabled')::boolean THEN
            v_current := (v_current + interval '1 day')::date + (v_config->>'default_open')::time;
            CONTINUE;
        END IF;

        v_open := (v_day_config->>'open')::time;
        v_close := (v_day_config->>'close')::time;

        -- Adjust if current time is before opening
        IF v_current::time < v_open THEN
            v_current := v_current::date + v_open;
        END IF;

        -- If current time is after closing, move to next day
        IF v_current::time >= v_close THEN
            v_current := (v_current + interval '1 day')::date + (v_config->>'default_open')::time;
            CONTINUE;
        END IF;

        -- Calculate time available today
        v_day_end := v_current::date + v_close;
        v_available_min := EXTRACT(EPOCH FROM (v_day_end - v_current)) / 60;

        IF v_available_min >= v_remaining_min THEN
            v_current := v_current + (v_remaining_min * interval '1 minute');
            v_remaining_min := 0;
        ELSE
            v_remaining_min := v_remaining_min - v_available_min;
            v_current := (v_current + interval '1 day')::date + (v_config->>'default_open')::time;
        END IF;
    END LOOP;

    RETURN v_current;
END;
$$;

-- 2. Update SLA Trigger to use Business Minutes
CREATE OR REPLACE FUNCTION public.trg_transfer_auto_sla()
RETURNS TRIGGER AS $$
DECLARE
    v_minutes INT;
BEGIN
    v_minutes := CASE 
        WHEN NEW.priority = 4 THEN 120 -- 2h
        WHEN NEW.priority = 3 THEN 240 -- 4h
        WHEN NEW.priority = 2 THEN 480 -- 8h
        ELSE 1440 -- 24h
    END;

    NEW.expires_at := public.fn_add_business_minutes(now(), v_minutes, NEW.target_instance);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Operator-Specific Unread Logic
CREATE OR REPLACE VIEW public.v_operator_unread_summary AS
SELECT 
    m.user_id,
    m.instance_name,
    count(t.id) as unread_transfers,
    count(t.id) FILTER (WHERE t.priority = 4) as unread_urgent
FROM public.instance_members m
JOIN public.conversation_transfers t ON m.instance_name = t.target_instance
LEFT JOIN public.conversation_reads r ON (t.id = r.conversation_id AND m.user_id = r.user_id)
WHERE t.status = 'pending'
  AND (r.read_at IS NULL OR r.read_at < t.updated_at)
GROUP BY m.user_id, m.instance_name;

-- 4. Function to mark as read
CREATE OR REPLACE FUNCTION public.fn_mark_transfer_as_read(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.conversation_reads (conversation_id, user_id, read_at)
    VALUES (p_transfer_id, auth.uid(), now())
    ON CONFLICT (conversation_id, user_id) 
    DO UPDATE SET read_at = now();
END;
$$;

-- 5. Refined RLS for Comments (Consistency check)
DROP POLICY IF EXISTS "Agents can view and create comments for their transfers" ON public.transfer_comments;
CREATE POLICY "Access comments by instance membership"
ON public.transfer_comments FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_transfers t
        JOIN public.instance_members m ON (t.source_instance = m.instance_name OR t.target_instance = m.instance_name)
        WHERE t.id = transfer_comments.transfer_id AND m.user_id = auth.uid()
    )
);
