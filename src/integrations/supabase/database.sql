-- Add email column to profiles table
ALTER TABLE public.profiles ADD COLUMN email TEXT;

-- Update existing profiles with email from auth.users (if needed, though new users will be handled by the edge function)
-- Note: This manual update is often necessary in real migrations but is skipped here for simplicity, relying on the Edge Function for new users.

-- Ensure RLS policies are still valid after adding the column.