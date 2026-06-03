
-- bookings: allow guest bookings
ALTER TABLE public.bookings ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_name TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_email TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_phone TEXT;

-- Require either user_id or guest contact
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_requestor_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_requestor_check
  CHECK (user_id IS NOT NULL OR (guest_name IS NOT NULL AND guest_email IS NOT NULL));

-- Drop old insert policy and replace
DROP POLICY IF EXISTS "bookings insert own" ON public.bookings;

-- Allow anonymous guests to insert (must have guest info, no user_id)
CREATE POLICY "bookings guest insert" ON public.bookings
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND guest_name IS NOT NULL AND guest_email IS NOT NULL);

-- Allow authenticated teacher/admin to insert as themselves; students cannot
CREATE POLICY "bookings teacher/admin insert" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'))
  );

-- rooms: allow anon read for public booking page
DROP POLICY IF EXISTS "rooms read all auth" ON public.rooms;
CREATE POLICY "rooms read all" ON public.rooms
  FOR SELECT TO anon, authenticated
  USING (true);
