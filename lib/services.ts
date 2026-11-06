import { SupabaseClient } from '@supabase/supabase-js';
import { ServiceRequest, UserVehicle, FuelLog, VehicleDocument, DocumentType } from '@/types/services';

export async function submitServiceRequest(
  supabase: SupabaseClient,
  payload: Omit<ServiceRequest, 'id' | 'status' | 'payment_status' | 'created_at' | 'updated_at'>
): Promise<{ data: ServiceRequest | null; error: string | null }> {
  try {
    // The id is generated here so guests (who cannot read rows back under RLS) still get a reference.
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    const row = {
      id,
      user_id: payload.user_id || null,
      service_category: payload.service_category,
      service_name: payload.service_name,
      full_name: payload.full_name.trim(),
      phone: payload.phone.trim(),
      email: payload.email.trim().toLowerCase(),
      state: payload.state || null,
      lga: payload.lga || null,
      delivery_address: payload.delivery_address || null,
      vehicle_make: payload.vehicle_make || null,
      vehicle_model: payload.vehicle_model || null,
      vehicle_year: payload.vehicle_year || null,
      plate_number: payload.plate_number ? payload.plate_number.toUpperCase().trim() : null,
      chassis_number: payload.chassis_number ? payload.chassis_number.toUpperCase().trim() : null,
      details: payload.details || {},
      estimated_price: payload.estimated_price || null,
      voucher_code: payload.voucher_code ? payload.voucher_code.trim().toUpperCase() : null,
      // New requests are always pending/unpaid (enforced by RLS). A voucher is applied by
      // the services team when they confirm the request (Admin -> Auto services -> Redeem).
      status: 'pending' as const,
      payment_status: 'unpaid' as const,
    };

    const { error } = await supabase.from('service_requests').insert(row);
    if (error) {
      return { data: null, error: error.message };
    }
    const now = new Date().toISOString();
    return {
      data: { ...row, quoted_price: null, paid_price: null, admin_notes: null, assigned_to: null, created_at: now, updated_at: now } as unknown as ServiceRequest,
      error: null,
    };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error submitting service request' };
  }
}

export async function fetchUserVehicles(
  supabase: SupabaseClient,
  userId: string
): Promise<UserVehicle[]> {
  try {
    const { data, error } = await supabase
      .from('user_vehicles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching user vehicles:', error.message);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}

export async function saveUserVehicle(
  supabase: SupabaseClient,
  payload: Partial<UserVehicle> & { user_id: string; plate_number: string }
): Promise<{ data: UserVehicle | null; error: string | null }> {
  try {
    const cleanPlate = payload.plate_number.toUpperCase().replace(/\s+/g, '').trim();
    const fields: Record<string, unknown> = {
      plate_number: cleanPlate,
      vehicle_make: payload.vehicle_make || null,
      vehicle_model: payload.vehicle_model || null,
      vehicle_year: payload.vehicle_year || null,
      color: payload.color || null,
      insurance_type: payload.insurance_type || 'third_party',
      insurance_expiry: payload.insurance_expiry || null,
      license_expiry: payload.license_expiry || null,
      roadworthiness_expiry: payload.roadworthiness_expiry || null,
      has_tracker: Boolean(payload.has_tracker),
      notes: payload.notes || null,
    };
    // Added in 20261107: only sent when given, and dropped if that update isn't installed yet
    if (payload.vehicle_type !== undefined) fields.vehicle_type = payload.vehicle_type || null;
    if (payload.vehicle_tier !== undefined) fields.vehicle_tier = payload.vehicle_tier || null;
    if (payload.vehicle_usage !== undefined) fields.vehicle_usage = payload.vehicle_usage || 'private';
    if (payload.poc_expiry !== undefined) fields.poc_expiry = payload.poc_expiry || null;
    if (payload.hackney_expiry !== undefined) fields.hackney_expiry = payload.hackney_expiry || null;
    if (payload.reminder_enabled !== undefined) fields.reminder_enabled = Boolean(payload.reminder_enabled);

    const run = (f: Record<string, unknown>) => (payload.id
      ? supabase.from('user_vehicles').update(f).eq('id', payload.id).eq('user_id', payload.user_id).select('*').single()
      : supabase.from('user_vehicles').insert({ user_id: payload.user_id, ...f }).select('*').single());

    let { data, error } = await run(fields);
    if (error && /(vehicle_type|vehicle_tier|vehicle_usage|poc_expiry|hackney_expiry|reminder_enabled)/.test(error.message) && /column|schema cache/i.test(error.message)) {
      const {
        vehicle_type: _t,
        vehicle_tier: _tr,
        vehicle_usage: _u,
        poc_expiry: _p,
        hackney_expiry: _h,
        reminder_enabled: _r,
        ...older
      } = fields;
      void _t; void _tr; void _u; void _p; void _h; void _r;
      ({ data, error } = await run(older));
    }
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Error saving vehicle' };
  }
}

export async function toggleVehicleReminder(
  supabase: SupabaseClient,
  vehicleId: string,
  userId: string,
  enabled: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('user_vehicles')
    .update({ reminder_enabled: enabled })
    .eq('id', vehicleId)
    .eq('user_id', userId);
  return { error: error ? error.message : null };
}

export async function deleteUserVehicle(
  supabase: SupabaseClient,
  vehicleId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('user_vehicles')
    .delete()
    .eq('id', vehicleId)
    .eq('user_id', userId);

  return !error;
}

// =========================================================================
// DIGITAL DOCUMENT VAULT
// =========================================================================
export async function fetchVehicleDocuments(
  supabase: SupabaseClient,
  userId: string,
  vehicleId?: string
): Promise<VehicleDocument[]> {
  try {
    let q = supabase
      .from('vehicle_documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (vehicleId) q = q.eq('vehicle_id', vehicleId);
    const { data, error } = await q;
    if (error) return [];
    return (data || []) as VehicleDocument[];
  } catch {
    return [];
  }
}

export async function saveVehicleDocument(
  supabase: SupabaseClient,
  payload: {
    vehicle_id?: string | null;
    service_request_id?: string | null;
    doc_type: DocumentType;
    title: string;
    file_url: string;
    reference_number?: string | null;
    issued_date?: string | null;
    expiry_date?: string | null;
  }
): Promise<{ id: string | null; expiry_synced: boolean; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('save_vehicle_document', { p: payload });
    if (error) return { id: null, expiry_synced: false, error: error.message };
    const res = (data || {}) as { id?: string; expiry_synced?: boolean };
    return { id: res.id || null, expiry_synced: Boolean(res.expiry_synced), error: null };
  } catch (err: unknown) {
    return { id: null, expiry_synced: false, error: err instanceof Error ? err.message : 'Error saving document' };
  }
}

export async function deleteVehicleDocument(
  supabase: SupabaseClient,
  docId: string
): Promise<boolean> {
  const { error } = await supabase.from('vehicle_documents').delete().eq('id', docId);
  return !error;
}

export async function fetchUserFuelLogs(
  supabase: SupabaseClient,
  userId: string
): Promise<FuelLog[]> {
  try {
    const { data, error } = await supabase
      .from('fuel_logs')
      .select('*')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching fuel logs:', error.message);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}

export async function saveFuelLog(
  supabase: SupabaseClient,
  payload: Omit<FuelLog, 'id' | 'created_at'>
): Promise<{ data: FuelLog | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('fuel_logs')
      .insert({
        user_id: payload.user_id,
        vehicle_id: payload.vehicle_id || null,
        log_type: payload.log_type,
        label: payload.label || null,
        fuel_type: payload.fuel_type,
        station_id: payload.station_id || null,
        station_name: payload.station_name || null,
        price_per_litre: Number(payload.price_per_litre),
        litres_bought: Number(payload.litres_bought),
        total_amount: Number(payload.total_amount),
        odometer_km: payload.odometer_km ? Number(payload.odometer_km) : null,
        engine_hours: payload.engine_hours ? Number(payload.engine_hours) : null,
        receipt_url: payload.receipt_url || null,
        notes: payload.notes || null,
        logged_at: payload.logged_at || new Date().toISOString().split('T')[0]
      })
      .select('*')
      .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Error saving fuel log' };
  }
}

export async function deleteFuelLog(
  supabase: SupabaseClient,
  logId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('fuel_logs')
    .delete()
    .eq('id', logId)
    .eq('user_id', userId);

  return !error;
}
