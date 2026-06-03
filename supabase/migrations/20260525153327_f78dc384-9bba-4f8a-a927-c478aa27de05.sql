
DROP POLICY IF EXISTS "bookings guest insert" ON public.bookings;
CREATE POLICY "bookings guest insert" ON public.bookings
  FOR INSERT
  WITH CHECK (
    user_id IS NULL
    AND guest_name IS NOT NULL
    AND guest_email IS NOT NULL
    AND auth.uid() IS NULL
  );
