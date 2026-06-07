import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/admin/rooms")({ component: AdminRooms });

type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];

type RoomForm = {
  name: string;
  location: string;
  capacity: number;
  description: string;
  room_type: string;
  building: string;
  floor: number;
  amenities: string;
  image_url: string;
};
const emptyForm: RoomForm = {
  name: "",
  location: "",
  capacity: 10,
  description: "",
  room_type: "classroom",
  building: "",
  floor: 1,
  amenities: "",
  image_url: "",
};

function AdminRooms() {
  const { hasRole, loading } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RoomForm>(emptyForm);

  const { data } = useQuery({
    queryKey: ["admin-rooms"],
    queryFn: async () => (await supabase.from("rooms").select("*").order("name")).data ?? [],
    enabled: hasRole("admin") || hasRole("room_admin"),
  });

  function buildPayload() {
    return {
      name: form.name,
      location: form.location || null,
      capacity: form.capacity,
      description: form.description || null,
      room_type: form.room_type,
      building: form.building || null,
      floor: form.floor || null,
      amenities: form.amenities
        ? form.amenities
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      image_url: form.image_url || null,
    };
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error(tr("ใส่ชื่อห้อง"));
      const payload = buildPayload();
      if (editingId) {
        const { error } = await supabase.from("rooms").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rooms").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? tr("บันทึกการแก้ไขแล้ว") : tr("เพิ่มห้องแล้ว"));
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["admin-rooms"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rooms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("ลบแล้ว"));
      qc.invalidateQueries({ queryKey: ["admin-rooms"] });
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(r: RoomRow) {
    setEditingId(r.id);
    setForm({
      name: r.name ?? "",
      location: r.location ?? "",
      capacity: r.capacity ?? 10,
      description: r.description ?? "",
      room_type: r.room_type ?? "classroom",
      building: r.building ?? "",
      floor: r.floor ?? 1,
      amenities: Array.isArray(r.amenities) ? r.amenities.join(", ") : "",
      image_url: r.image_url ?? "",
    });
    setOpen(true);
  }

  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" />;

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10 space-y-6">
      <header className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-4xl">{tr("จัดการห้อง")}</h1>
          <p className="text-muted-foreground mt-1">{tr("เพิ่ม / แก้ไข / ลบ ห้องประชุม")}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-1" />
          {tr("เพิ่มห้อง")}
        </Button>
      </header>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setEditingId(null);
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? tr("แก้ไขห้องประชุม") : tr("เพิ่มห้องประชุม")}</DialogTitle>
            <DialogDescription>
              {tr("กรอกรายละเอียดห้อง ความจุ และสิ่งอำนวยความสะดวกให้ครบถ้วน")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="room-name">{tr("ชื่อห้อง")}</Label>
              <Input
                id="room-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="room-type">{tr("ประเภท")}</Label>
                <select
                  id="room-type"
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.room_type}
                  onChange={(e) => setForm({ ...form, room_type: e.target.value })}
                >
                  <option value="classroom">{tr("ห้องเรียน")}</option>
                  <option value="meeting_room">{tr("ห้องประชุม")}</option>
                  <option value="lab">{tr("ห้องปฏิบัติการ")}</option>
                  <option value="auditorium">{tr("ห้องประชุมใหญ่")}</option>
                </select>
              </div>
              <div>
                <Label htmlFor="room-capacity">{tr("ความจุ")}</Label>
                <Input
                  id="room-capacity"
                  type="number"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: +e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="room-building">{tr("อาคาร")}</Label>
                <Input
                  id="room-building"
                  value={form.building}
                  onChange={(e) => setForm({ ...form, building: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="room-floor">{tr("ชั้น")}</Label>
                <Input
                  id="room-floor"
                  type="number"
                  value={form.floor}
                  onChange={(e) => setForm({ ...form, floor: +e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="room-location">{tr("ตำแหน่ง")}</Label>
              <Input
                id="room-location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="room-amenities">{tr("สิ่งอำนวยความสะดวก (คั่นด้วย ,)")}</Label>
              <Input
                id="room-amenities"
                placeholder={tr("โปรเจคเตอร์, ไวท์บอร์ด, แอร์")}
                value={form.amenities}
                onChange={(e) => setForm({ ...form, amenities: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="room-image-url">{tr("URL รูปห้อง")}</Label>
              <Input
                id="room-image-url"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="room-description">{tr("รายละเอียด")}</Label>
              <Textarea
                id="room-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {tr("บันทึก")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 sm:grid-cols-2">
        {data?.map((r) => (
          <Card key={r.id} className="overflow-hidden">
            {r.image_url && (
              <img src={r.image_url} alt={r.name} className="w-full h-32 object-cover" />
            )}
            <CardContent className="pt-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {r.name} <span className="text-xs text-muted-foreground">({r.room_type})</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {[r.building && `อาคาร ${r.building}`, r.floor && `ชั้น ${r.floor}`, r.location]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
                <p className="text-sm text-muted-foreground">ความจุ {r.capacity} ที่นั่ง</p>
                {r.amenities?.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">🛠 {r.amenities.join(", ")}</p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="sm" onClick={() => openEdit(r)} title={tr("แก้ไข")}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(tr("ลบห้องนี้?"))) remove.mutate(r.id);
                  }}
                  title={tr("ลบ")}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
