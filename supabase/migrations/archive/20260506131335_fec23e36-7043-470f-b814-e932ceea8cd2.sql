-- Drop the recursive policy
DROP POLICY IF EXISTS "Users can view members of their own instances" ON public.instance_members;

-- Create a non-recursive base policy: Users can always see their own row
CREATE POLICY "Users can view their own membership" 
ON public.instance_members 
FOR SELECT 
USING (user_id = auth.uid());

-- Create a policy for viewing other members of the same instance
-- We use a subquery that bypasses RLS or just a simpler join if possible.
-- In Supabase/Postgres, we can use a helper function that is SECURITY DEFINER to check membership.
CREATE OR REPLACE FUNCTION public.fn_is_instance_member(p_instance_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.instance_members 
        WHERE instance_name = p_instance_name 
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE POLICY "Members can view others in same instance" 
ON public.instance_members 
FOR SELECT 
USING (public.fn_is_instance_member(instance_name));
