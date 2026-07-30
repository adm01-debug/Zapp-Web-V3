CREATE OR REPLACE FUNCTION public.fn_add_business_minutes(
    p_instance_name TEXT,
    p_start_time TIMESTAMP WITH TIME ZONE,
    p_minutes_to_add INT
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_current_time TIMESTAMP WITH TIME ZONE := p_start_time;
    v_minutes_remaining INT := p_minutes_to_add;
    v_day_start TIME;
    v_day_end TIME;
    v_day_of_week INT;
    v_minutes_available_today INT;
BEGIN
    -- Fallback safety for NULL/invalid inputs
    IF v_minutes_remaining <= 0 OR v_minutes_remaining IS NULL THEN
        RETURN p_start_time;
    END IF;

    WHILE v_minutes_remaining > 0 LOOP
        v_day_of_week := EXTRACT(DOW FROM v_current_time);
        
        SELECT start_time, end_time INTO v_day_start, v_day_end
        FROM public.business_hours
        WHERE instance_name = p_instance_name AND day_of_week = v_day_of_week AND is_enabled = true;

        -- IF closed today or current time is AFTER closing time, move to START of next day
        IF v_day_start IS NULL OR v_current_time::TIME >= v_day_end THEN
            v_current_time := ((v_current_time + INTERVAL '1 day')::DATE || ' 00:00:00')::TIMESTAMP WITH TIME ZONE;
            CONTINUE;
        END IF;

        -- IF current time is BEFORE opening time, move to OPENING time of today
        IF v_current_time::TIME < v_day_start THEN
            v_current_time := (v_current_time::DATE + v_day_start)::TIMESTAMP WITH TIME ZONE;
        END IF;

        -- Calculate how many minutes are left in the work day
        v_minutes_available_today := EXTRACT(EPOCH FROM (v_day_end - v_current_time::TIME)) / 60;
        
        IF v_minutes_remaining <= v_minutes_available_today THEN
            v_current_time := v_current_time + (v_minutes_remaining * INTERVAL '1 minute');
            v_minutes_remaining := 0;
        ELSE
            v_minutes_remaining := v_minutes_remaining - v_minutes_available_today;
            -- Move to the start of the next day to continue loop
            v_current_time := ((v_current_time + INTERVAL '1 day')::DATE || ' 00:00:00')::TIMESTAMP WITH TIME ZONE;
        END IF;
    END LOOP;

    RETURN v_current_time;
END;
$$;
