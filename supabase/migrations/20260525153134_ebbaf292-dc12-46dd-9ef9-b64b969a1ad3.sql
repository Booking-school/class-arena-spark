
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT (room_id, purpose, starts_at, ends_at, guest_name, guest_email, guest_phone, notes) ON public.bookings TO anon;
GRANT SELECT ON public.rooms TO anon;
