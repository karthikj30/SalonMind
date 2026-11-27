export type Staff = {
  id: string; name: string; role: string; skill_level: number; skills: string[];
  employment_type: "employee" | "booth_renter"; booth_rent_pct: number; base_salary: number;
  commission_slabs: { upto: number | null; pct: number }[]; product_commission_pct: number;
  hourly_cost: number; work_start: string; work_end: string; active: boolean; phone?: string | null;
  gender?: string | null; pf_enabled?: boolean; esi_enabled?: boolean;
};
export type Room = { id: string; name: string; type: string; equipment: string[] };
export type Service = {
  id: string; tenant_id: string; name: string; category: string; description?: string | null;
  duration_min: number; base_price: number; min_skill_level: number; required_equipment: string[]; active: boolean;
};
export type Booking = {
  id: string; client_id: string | null; service_id: string | null; staff_id: string | null; room_id: string | null;
  start_at: string; end_at: string; status: string; price: number; base_price: number; source?: string;
  deposit_required?: number; deposit_paid?: number; created_at?: string; rating?: number | null;
};
export type TenantSettings = {
  surge_cap_pct: number; flash_discount_cap_pct: number; reorder_buffer_days: number;
  nudge_threshold: number; deposit_threshold: number; deposit_pct: number;
  retention_grace_days: number; gst_rate: number; default_language: string;
  loyalty_points_per_100: number; loyalty_max_redeem_pct: number; referral_bonus_points: number;
  agents_disabled: string[];
};
export const DEFAULT_SETTINGS: TenantSettings = {
  surge_cap_pct: 25, flash_discount_cap_pct: 20, reorder_buffer_days: 3, nudge_threshold: 0.3,
  deposit_threshold: 0.55, deposit_pct: 25, retention_grace_days: 7, gst_rate: 5, default_language: "en",
  loyalty_points_per_100: 1, loyalty_max_redeem_pct: 50, referral_bonus_points: 200,
  agents_disabled: [],
};
export type TimeOff = { staff_id: string; start_at: string; end_at: string };
