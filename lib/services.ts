import { SupabaseClient } from '@supabase/supabase-js';
import { ServiceRequest, UserVehicle, FuelLog, ServiceCategory, ServiceStatus } from '@/types/services';

export async function submitServiceRequest(
  supabase: SupabaseClient,
  payload: Omit<ServiceRequest, 'id' | 'status' | 'payment_status' | 'created_at' | 'updated_at'>
): Promise<{ data: ServiceRequest | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('service_requests')
      .insert({
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
        status: 'pending',
        payment_status: payload.voucher_code ? 'voucher_used' : 'unpaid'
      })
      .select('*')
      .single();

    if (error) {
      return { data: null, error: error.message };
    }
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error submitting service request' };
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
    if (payload.id) {
      const { data, error } = await supabase
        .from('user_vehicles')
        .update({
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
        })
        .eq('id', payload.id)
        .eq('user_id', payload.user_id)
        .select('*')
        .single();

      if (error) return { data: null, error: error.message };
      return { data, error: null };
    } else {
      const { data, error } = await supabase
        .from('user_vehicles')
        .insert({
          user_id: payload.user_id,
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
        })
        .select('*')
        .single();

      if (error) return { data: null, error: error.message };
      return { data, error: null };
    }
  } catch (err: any) {
    return { data: null, error: err.message || 'Error saving vehicle' };
  }
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
  } catch (err: any) {
    return { data: null, error: err.message || 'Error saving fuel log' };
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
