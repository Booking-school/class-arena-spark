## ทำไมเปิดไม่ได้

หน้า preview เปิดได้ แต่ `class-arena-spark.lovable.app` (เว็บ published) ขึ้น "เกิดข้อผิดพลาด" เพราะ JS bundle ที่ deploy อยู่ตอนนี้ throw error:

```
Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
```

### สาเหตุ

- ตอน build เวอร์ชัน production ที่ publish ไป **bundle ไม่มีค่า** `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` ฝังเข้าไป (Vite replace ตอน build time)
- รอบที่แล้วผมแก้ `vite.config.ts` ให้มี fallback อ่านจาก `process.env.SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` ด้วย — **preview ใช้ build ใหม่นี้แล้ว จึงเปิดได้**
- แต่ **เว็บ published ยังเป็น bundle เก่า** ที่ build ก่อนแก้ ตัว frontend change ไม่ deploy เองอัตโนมัติ ต้องกด Update ใน Publish dialog

## แผนแก้

1. **กดปุ่ม Publish → Update** เพื่อ re-build + re-deploy ตัว frontend ด้วย `vite.config.ts` ฉบับใหม่ที่มี env fallback
2. หลัง update เสร็จ เปิด `https://class-arena-spark.lovable.app/` ใหม่ คาดว่าจะหายเอง

ถ้าหลัง republish แล้วยัง error เหมือนเดิม แปลว่าตอน build บน Lovable Cloud ไม่มี `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` ใน env ของ builder ด้วย ผมจะต้องทำ step ที่ 3:

3. (สำรอง) ฉีดค่า Supabase URL + publishable key ลง `vite.config.ts` แบบ hardcode ใน `define` (publishable key เป็น public key ฝังในโค้ดได้ตามมาตรฐาน Supabase) เพื่อรับประกันว่า bundle ที่ build จะมีค่าฝังอยู่เสมอ ไม่ขึ้นกับ env ของ builder

## หมายเหตุ

- ไม่ต้องแก้โค้ดเพิ่มในขั้นที่ 1–2 — แค่กด Update
- หากต้องทำขั้นที่ 3 ผมจะแก้เฉพาะ `vite.config.ts` เท่านั้น ไม่แตะ `src/integrations/supabase/client.ts` (ไฟล์ auto-generated)
