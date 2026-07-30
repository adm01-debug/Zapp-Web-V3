-- Add online_status to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS online_status TEXT DEFAULT 'offline' CHECK (online_status IN ('online', 'offline', 'busy'));

-- Re-grant permissions
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
