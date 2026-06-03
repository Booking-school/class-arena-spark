import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Check, X, Lock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookingsCalendar } from "@/components/bookings-calendar";
import type { Database } from "@/integrations/supabase/types";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/bookings")({ component: BookingsPage });

type RoomRow = Pick<
  Database["public"]["Tables"]["rooms"]["Row"],
  "id" | "name" | "location" | "capacity" | "description"
>;
type BookingWithRoom = Database["public"]["Tables"]["bookings"]["Row"] & {
  rooms?: { name: string; location: string | null } | null;
};

function BookingsPage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    room_id: "",
    purpose: "",
    starts_at: "",
    ends_at: "",
    notes: "",
  });

  const canBook = hasRole("teacher") || hasRole("admin");
  const isAdmin = hasRole("admin");

  const { data: rooms } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () =>
      (await supabase.from("rooms").select("*").eq("is_active", true).order("name")).data ?? [],
  });

  const { data: bookings, refetch } = useQuery({
    queryKey: ["bookings", user?.id, isAdmin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, rooms(name, location)")
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.room_id || !form.purpose || !form.starts_at || !form.ends_at)
        throw new Error(tr("กรอกข้อมูลให้ครบ"));
      const startsAt = new Date(form.starts_at);
      const endsAt = new Date(form.ends_at);
      if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()))
        throw new Error(tr("วันที่/เวลาไม่ถูกต้อง"));
      if (startsAt < new Date()) throw new Error(tr("ห้ามจองย้อนหลัง"));
      if (endsAt <= startsAt) throw new Error(tr("เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม"));
      if (endsAt.getTime() - startsAt.getTime() < 15 * 60 * 1000)
        throw new Error(tr("ระยะเวลาขั้นต่ำ 15 นาที"));
      const { error } = await supabase.from("bookings").insert({
        room_id: form.room_id,
        user_id: user!.id,
        purpose: form.purpose.trim().slice(0, 200),
        starts_at: form.starts_at,
        ends_at: form.ends_at,
        notes: form.notes ? form.notes.slice(0, 1000) : null,
      });
      if (error) {
        if (error.message?.includes("bookings_no_overlap") || error.code === "23P01") {
          throw new Error(tr("⛔ ช่วงเวลานี้ห้องถูกจองไปแล้ว กรุณาเลือกเวลาอื่น"));
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success(tr("ส่งคำขอจองแล้ว รอแอดมินอนุมัติ"));
      setOpen(false);
      setForm({ room_id: "", purpose: "", starts_at: "", ends_at: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: "approved" | "rejected" | "pending" | "cancelled";
      reason?: string;
    }) => {
      const payload: {
        status: typeof status;
        approver_id?: string;
        approved_at?: string;
        rejection_reason?: string | null;
      } = { status };
      if (status === "approved") {
        payload.approver_id = user!.id;
        payload.approved_at = new Date().toISOString();
      }
      if (status === "rejected") {
        payload.approver_id = user!.id;
        payload.rejection_reason = reason ?? null;
      }
      const { error } = await supabase.from("bookings").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("อัปเดตสถานะแล้ว"));
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const roomList = (rooms ?? []) as RoomRow[];
  const bookingList = (bookings ?? []) as BookingWithRoom[];

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl">{tr("ห้องประชุม")}</h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? tr("จัดการคำขอจองทั้งหมด")
              : canBook
                ? tr("จองห้องและตรวจสอบสถานะ")
                : tr("ดูรายการห้อง (นักเรียนไม่สามารถจองได้)")}
          </p>
        </div>
        {canBook ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-1" />
                {tr("จองห้อง")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{tr("จองห้องประชุม")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{tr("ห้อง")}</Label>
                  <Select
                    value={form.room_id}
                    onValueChange={(v) => setForm({ ...form, room_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tr("เลือกห้อง")} />
                    </SelectTrigger>
                    <SelectContent>
                      {roomList.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} ({r.capacity} ที่นั่ง)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{tr("วัตถุประสงค์")}</Label>
                  <Input
                    value={form.purpose}
                    onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{tr("เริ่ม")}</Label>
                    <Input
                      type="datetime-local"
                      value={form.starts_at}
                      onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{tr("สิ้นสุด")}</Label>
                    <Input
                      type="datetime-local"
                      value={form.ends_at}
                      onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>{tr("หมายเหตุ")}</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {tr("ส่งคำขอ")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <div className="text-sm text-muted-foreground flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30">
            <Lock className="size-4" /> นักเรียนไม่สามารถจองห้องประชุมได้
          </div>
        )}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roomList.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="font-display text-lg">{r.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>{r.location}</p>
              <p className="mt-1">ความจุ {r.capacity} คน</p>
              {r.description && (
                <p className="mt-2 whitespace-pre-wrap leading-relaxed">{r.description}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <section>
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">{tr("รายการ")}</TabsTrigger>
            <TabsTrigger value="calendar">{tr("ปฏิทิน")}</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="space-y-2 mt-3">
            {bookingList.length === 0 && (
              <p className="text-muted-foreground text-sm">{tr("ยังไม่มีรายการ")}</p>
            )}
            {bookingList.map((b) => (
              <Card key={b.id}>
                <CardContent className="pt-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{b.rooms?.name}</span>
                      <StatusBadge status={b.status} />
                      {!b.user_id && <Badge variant="outline">{tr("ผู้จองทั่วไป")}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{b.purpose}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(b.starts_at).toLocaleString("th-TH")} –{" "}
                      {new Date(b.ends_at).toLocaleString("th-TH")}
                    </p>
                    {isAdmin && b.guest_name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ผู้จอง: <span className="font-medium text-foreground">{b.guest_name}</span>{" "}
                        · {b.guest_email}
                        {b.guest_phone && ` · ${b.guest_phone}`}
                      </p>
                    )}
                    {b.status === "rejected" && b.rejection_reason && (
                      <p className="text-xs text-red-700 mt-1">เหตุผล: {b.rejection_reason}</p>
                    )}
                  </div>
                  {isAdmin && b.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus.mutate({ id: b.id, status: "approved" })}
                      >
                        <Check className="size-4" />
                        {tr("อนุมัติ")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectFor(b.id);
                          setRejectReason("");
                        }}
                      >
                        <X className="size-4" />
                        {tr("ปฏิเสธ")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="calendar" className="mt-3">
            <BookingsCalendar bookings={bookingList} rooms={roomList} />
          </TabsContent>
        </Tabs>
      </section>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("เหตุผลในการปฏิเสธ")}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={tr("ระบุเหตุผล (จะส่งแจ้งเตือนให้ผู้จอง)")}
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectFor(null)}>
              {tr("ยกเลิก")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectFor) {
                  setStatus.mutate({
                    id: rejectFor,
                    status: "rejected",
                    reason: rejectReason.trim() || undefined,
                  });
                  setRejectFor(null);
                }
              }}
            >
              {tr("ยืนยันปฏิเสธ")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-900",
    approved: "bg-green-100 text-green-900",
    rejected: "bg-red-100 text-red-900",
    cancelled: "bg-gray-200 text-gray-800",
  };
  const label: Record<string, string> = {
    pending: tr("รออนุมัติ"),
    approved: tr("อนุมัติแล้ว"),
    rejected: tr("ปฏิเสธ"),
    cancelled: tr("ยกเลิก"),
  };
  return <Badge className={map[status]}>{label[status] ?? status}</Badge>;
}
