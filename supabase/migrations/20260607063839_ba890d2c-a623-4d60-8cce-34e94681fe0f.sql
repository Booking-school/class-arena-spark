
-- rooms: room_admin can insert/update/delete
CREATE POLICY "rooms room_admin insert" ON public.rooms
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'room_admin'::app_role));

CREATE POLICY "rooms room_admin update" ON public.rooms
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'room_admin'::app_role));

CREATE POLICY "rooms room_admin delete" ON public.rooms
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'room_admin'::app_role));

-- bookings: room_admin can read/insert/update/delete all
CREATE POLICY "bookings room_admin read" ON public.bookings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'room_admin'::app_role));

CREATE POLICY "bookings room_admin insert" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'room_admin'::app_role));

CREATE POLICY "bookings room_admin update" ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'room_admin'::app_role));

CREATE POLICY "bookings room_admin delete" ON public.bookings
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'room_admin'::app_role));
