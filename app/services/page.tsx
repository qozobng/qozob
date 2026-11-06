"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText, ShieldCheck, Radio, CheckCircle2, ChevronRight,
  Sparkles, Clock, HelpCircle, ArrowRight, PhoneCall,
  Loader2, Check, AlertCircle, MapPin, Award, Zap, Fuel
} from 'lucide-react';

import { createClient } from '@/utils/supabase/client';
import posthog from 'posthog-js';
import { Wordmark } from '@/components/Wordmark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PhoneField } from '@/components/PhoneField';
import { NIGERIAN_STATES, joinPhone, normaliseState } from '@/lib/nigeria';
import { lgasOf } from '@/lib/nigeriaLgas';
import { splitPhone } from '@/lib/profile';
import { loadRegions, countryCodeFromName, type Region } from '@/lib/regions';
import { ServiceCategory, type UserVehicle } from '@/types/services';
import { submitServiceRequest, fetchUserVehicles } from '@/lib/services';
import { VehicleFields, EMPTY_VEHICLE, normaliseVehicle, type VehicleValue } from '@/components/forms/VehicleFields';
import { LocationFields } from '@/components/forms/LocationFields';
import { formatPlate, VEHICLE_TIERS, inferVehicleTier, vehicleTierLabel, type VehicleTier } from '@/lib/vehicles';
import { loadServiceCatalog, effectivePrice, hasStatePrice, hasTierPrices, FALLBACK_CATALOG, type CatalogItem } from '@/lib/servicePricing';
import { formatMoney } from '@/lib/currency';
import { cx, ui } from '@/lib/ui';
import { SITE } from '@/lib/site';

export default function ServicesPage() {
  const supabase = createClient();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'papers' | 'tracker' | 'fleet'>('papers');
  const [vehicleUsage, setVehicleUsage] = useState<'private' | 'commercial'>('private');
  const [tierOverride, setTierOverride] = useState<VehicleTier | ''>('');
  const [vehicleValue, setVehicleValue] = useState<number>(8000000);
  const [customPlateText, setCustomPlateText] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([
    'insurance_3rd_party',
    'vehicle_license',
    'proof_of_ownership',
    'roadworthiness'
  ]);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [phoneCode, setPhoneCode] = useState('+234');
  const [phoneNum, setPhoneNum] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState('Lagos');
  const [lga, setLga] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [vehicle, setVehicle] = useState<VehicleValue>(EMPTY_VEHICLE);
  const [garage, setGarage] = useState<UserVehicle[]>([]);
  const [garagePick, setGaragePick] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [trackerNotes, setTrackerNotes] = useState('');

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  // Auto services run in Nigeria only (for now): signed-in people from other countries see "coming soon"
  const [regions, setRegions] = useState<Record<string, Region>>({});
  useEffect(() => { loadRegions(supabase).then(setRegions); }, [supabase]);
  const userCountry = user ? countryCodeFromName(user.user_metadata?.country, regions) : null;
  const outsideNigeria = !!userCountry && userCountry !== 'NG';
  const userCountryName = userCountry ? (regions[userCountry]?.name || userCountry) : '';

  // Check auth user to pre-fill (and honour ?tab= and ?vehicle= links from My Garage)
  useEffect(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlTab = params?.get('tab');
    if (urlTab === 'tracker' || urlTab === 'fleet' || urlTab === 'papers') setActiveTab(urlTab);
    const urlVehicle = params?.get('vehicle') || '';

    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
        if (data.user.email) setEmail(data.user.email);
        const meta = data.user.user_metadata || {};
        const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || meta.full_name;
        if (name) setFullName(String(name));
        const storedPhone = meta.full_phone || meta.phone;
        if (storedPhone) {
          const { code, national } = splitPhone(storedPhone);
          setPhoneCode(code);
          setPhoneNum(national);
        }
        // Profile state/LGA as the starting location (still changeable)
        const st = normaliseState(meta.state);
        if (st) {
          setState(st);
          if (meta.lga && lgasOf(st).includes(String(meta.lga))) setLga(String(meta.lga));
        }
        // Cars saved in My Garage can be picked instead of re-entering them
        fetchUserVehicles(supabase, data.user.id).then(list => {
          setGarage(list);
          if (urlVehicle) {
            const g = list.find(x => x.id === urlVehicle);
            if (g) {
              setGaragePick(g.id);
              setVehicle(normaliseVehicle({ type: (g.vehicle_type || '') as VehicleValue['type'], make: g.vehicle_make || '', model: g.vehicle_model || '', year: g.vehicle_year || '', colour: g.color || '' }));
              setTierOverride((g.vehicle_tier as VehicleTier) || '');
              setPlateNumber(g.plate_number || '');
              if (g.vehicle_usage === 'private' || g.vehicle_usage === 'commercial') setVehicleUsage(g.vehicle_usage);
            }
          }
        });
      }
    });
  }, [supabase]);

  const effectiveTier: VehicleTier = tierOverride || inferVehicleTier(vehicle.type, vehicle.make, vehicle.model);

  const pickGarageVehicle = (id: string) => {
    setGaragePick(id);
    const g = garage.find(x => x.id === id);
    if (!g) return;
    setVehicle(normaliseVehicle({ type: (g.vehicle_type || '') as VehicleValue['type'], make: g.vehicle_make || '', model: g.vehicle_model || '', year: g.vehicle_year || '', colour: g.color || '' }));
    setTierOverride((g.vehicle_tier as VehicleTier) || '');
    setPlateNumber(g.plate_number || '');
    if (g.vehicle_usage === 'private' || g.vehicle_usage === 'commercial') setVehicleUsage(g.vehicle_usage);
  };

  // Live price list (set by admins in Admin → Auto services → Prices); the built-in list is used until it loads
  const [catalog, setCatalog] = useState<CatalogItem[]>(FALLBACK_CATALOG);
  const [catalogLive, setCatalogLive] = useState(false);
  useEffect(() => {
    loadServiceCatalog(supabase).then(({ items, live }) => { setCatalog(items); setCatalogLive(live); });
  }, [supabase]);

  const paperItems = useMemo(() => catalog.filter(i => i.category !== 'gps_tracker' && i.category !== 'fleet_solution'), [catalog]);
  const trackerItem = useMemo(
    () => catalog.find(i => i.id === 'gps_tracker_4g') ?? catalog.find(i => i.category === 'gps_tracker') ?? null,
    [catalog],
  );
  const chosenPapers = useMemo(() => paperItems.filter(i => selectedItems.includes(i.id)), [paperItems, selectedItems]);
  const money = (n: number) => formatMoney(n, 'NGN');

  // Calculation for Papers & Insurance (prices for the chosen state + engine/body tier + comprehensive vehicle value)
  const calculatedTotal = useMemo(() => {
    if (activeTab === 'tracker') {
      return trackerItem ? effectivePrice(trackerItem, vehicleUsage, state, effectiveTier, vehicleValue) : 0;
    }
    return chosenPapers.reduce(
      (sum, item) => sum + effectivePrice(item, vehicleUsage, state, effectiveTier, vehicleValue),
      0,
    );
  }, [chosenPapers, trackerItem, vehicleUsage, activeTab, state, effectiveTier, vehicleValue]);
  const trackerHasCommercialPrice = !!trackerItem
    && effectivePrice(trackerItem, 'commercial', state, effectiveTier) !== effectivePrice(trackerItem, 'private', state, effectiveTier);

  const toggleItem = (id: string) => {
    setSelectedItems(prev => {
      const has = prev.includes(id);
      if (has) return prev.filter(x => x !== id);
      // Selecting Comprehensive Insurance unchecks Third-Party Insurance (and vice-versa) so customers don't double-pay
      if (id === 'comprehensive_insurance') {
        return [...prev.filter(x => x !== 'insurance_3rd_party'), id];
      }
      if (id === 'insurance_3rd_party') {
        return [...prev.filter(x => x !== 'comprehensive_insurance'), id];
      }
      return [...prev, id];
    });
  };

  const handleSelectPackage = (
    pack:
      | 'complete_renewal'
      | 'new_registration'
      | 'insurance_only'
      | 'comprehensive'
      | 'custom_plate'
      | 'haulage_dispatch'
      | 'driver_permits',
  ) => {
    if (pack === 'complete_renewal') {
      setSelectedItems(['insurance_3rd_party', 'vehicle_license', 'proof_of_ownership', 'roadworthiness']);
    } else if (pack === 'new_registration') {
      setSelectedItems(['new_plate_number', 'insurance_3rd_party', 'cmris_police']);
    } else if (pack === 'insurance_only') {
      setSelectedItems(['insurance_3rd_party']);
    } else if (pack === 'comprehensive') {
      setSelectedItems(['comprehensive_insurance', 'vehicle_license', 'proof_of_ownership', 'roadworthiness']);
    } else if (pack === 'custom_plate') {
      setSelectedItems(['custom_plate_number', 'proof_of_ownership']);
    } else if (pack === 'haulage_dispatch') {
      setVehicleUsage('commercial');
      setSelectedItems(['hackney_permit', 'heavy_duty_haulage_permit', 'roadworthiness']);
    } else if (pack === 'driver_permits') {
      setSelectedItems(['drivers_license_renewal', 'learners_permit']);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (outsideNigeria) return;   // button is disabled too; services are Nigeria-only for now
    setErrorMessage(null);

    const fullPhone = joinPhone(phoneCode, phoneNum);
    if (!fullPhone || fullPhone.length < 10) {
      setErrorMessage('Please enter a valid telephone number.');
      return;
    }

    if (!fullName.trim() || !email.trim()) {
      setErrorMessage('Please provide your full name and email address.');
      return;
    }

    const code = voucherCode.trim().toUpperCase();
    if (code && !user) {
      setErrorMessage('Reward vouchers are linked to the winner\'s account. Please sign in to use your voucher, or clear the voucher field to continue as a guest.');
      return;
    }

    setIsSubmitting(true);

    if (code) {
      const { data: check, error: checkErr } = await supabase.rpc('check_voucher', { p_code: code });
      // If the check function is not installed yet, let the services team verify the code manually.
      const missingFn = checkErr && /function|schema cache/i.test(checkErr.message);
      if (checkErr && !missingFn) {
        setIsSubmitting(false);
        setErrorMessage(checkErr.message);
        return;
      }
      if (check && (check as { valid?: boolean }).valid === false) {
        setIsSubmitting(false);
        setErrorMessage((check as { message?: string }).message || 'This voucher code is not valid.');
        return;
      }
    }

    const category: ServiceCategory = activeTab === 'tracker' ? 'gps_tracker' : 'papers_renewal';
    const lineItems = activeTab === 'tracker'
      ? (trackerItem ? [trackerItem] : [])
      : chosenPapers;
    const serviceName = activeTab === 'tracker' 
      ? '4G Live GPS Tracker & Anti-Theft Installation' 
      : chosenPapers.length > 0 
        ? chosenPapers.map(i => i.title).join(' + ')
        : 'Vehicle Paper Services';

    const { data, error } = await submitServiceRequest(supabase, {
      user_id: user?.id || null,
      service_category: category,
      service_name: serviceName,
      full_name: fullName,
      phone: fullPhone,
      email: email,
      state: state,
      lga: lga || null,
      delivery_address: deliveryAddress || null,
      vehicle_make: vehicle.make.trim() || null,
      vehicle_model: vehicle.model.trim() || null,
      vehicle_year: vehicle.year || null,
      plate_number: plateNumber || null,
      chassis_number: chassisNumber || null,
      details: {
        vehicle_usage: vehicleUsage,
        vehicle_tier: effectiveTier,
        vehicle_type: vehicle.type || null,
        vehicle_colour: vehicle.colour || null,
        vehicle_value_ngn: selectedItems.includes('comprehensive_insurance') ? vehicleValue : null,
        custom_plate_inscription: selectedItems.includes('custom_plate_number') ? customPlateText.trim() || null : null,
        selected_item_ids: lineItems.map(i => i.id),
        line_items: lineItems.map(i => ({
          id: i.id,
          title: i.title,
          price: effectivePrice(i, vehicleUsage, state, effectiveTier, vehicleValue),
        })),
        priced_for_state: state,
        price_list: catalogLive ? 'live' : 'built-in',
        calculated_estimate: calculatedTotal,
        tracker_notes: trackerNotes || null,
      },
      estimated_price: calculatedTotal,
      voucher_code: voucherCode || null,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error);
    } else {
      posthog.capture('service_request_submitted', {
        service_category: category,
        vehicle_usage: vehicleUsage,
        selected_item_count: lineItems.length,
        signed_in: !!user,
        voucher_applied: !!code,
      });
      setSubmittedRequest(data);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-fg flex flex-col">
      {/* Top Header */}
      <header className="bg-brand-grad text-on-brand sticky top-0 z-50 shadow-[0_1px_0_var(--brand-line)]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="rounded-md" aria-label="Qozob Home">
            <Wordmark tone="brand" size="md" />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle tone="brand" />
            {user ? (
              <Link
                href="/user-dashboard?tab=garage"
                className="text-xs sm:text-sm font-semibold text-on-brand hover:text-brand-accent transition-colors flex items-center gap-1.5"
              >
                <span>My Garage</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-xs sm:text-sm font-semibold text-on-brand hover:text-brand-accent transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="bg-brand-2 text-on-brand py-10 px-4 border-b border-brand-line">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-accent/15 text-brand-accent text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Fast • Statutory • Doorstep Delivery</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-on-brand">
            Vehicle Papers & 4G Security, <br className="hidden sm:inline" />
            <span className="text-brand-accent">Sorted in Minutes.</span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-on-brand-muted max-w-2xl mx-auto">
            Say goodbye to touts, VIO stress, and fake certificates. Get genuine NIID-verified insurance, license renewals, and doorstep anti-theft GPS tracker installations directly on Qozob.
          </p>

          {/* Service Switcher Tabs */}
          <div className="mt-8 flex justify-center">
            <div className="inline-flex p-1.5 rounded-2xl bg-brand-1 border border-brand-line shadow-lg max-w-full overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('papers')}
                className={cx(
                  'px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap',
                  activeTab === 'papers'
                    ? 'bg-accent-solid text-on-accent shadow-md scale-100'
                    : 'text-on-brand-muted hover:text-on-brand hover:bg-white/5'
                )}
              >
                <FileText className="w-4 h-4" />
                <span>Vehicle Papers & Insurance</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('tracker')}
                className={cx(
                  'px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap',
                  activeTab === 'tracker'
                    ? 'bg-accent-solid text-on-accent shadow-md scale-100'
                    : 'text-on-brand-muted hover:text-on-brand hover:bg-white/5'
                )}
              >
                <Radio className="w-4 h-4" />
                <span>4G GPS Tracker & Security</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('fleet')}
                className={cx(
                  'px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap',
                  activeTab === 'fleet'
                    ? 'bg-accent-solid text-on-accent shadow-md scale-100'
                    : 'text-on-brand-muted hover:text-on-brand hover:bg-white/5'
                )}
              >
                <Fuel className="w-4 h-4" />
                <span>Fuel Logbook & Fleet</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full px-4 py-8 flex-1">
        {outsideNigeria && !submittedRequest && (
          <div className="mb-6 rounded-2xl border border-line bg-surface-2 p-4 sm:p-5 flex items-start gap-3 animate-in fade-in duration-300">
            <span aria-hidden className="text-2xl leading-none">🌍</span>
            <div className="text-sm">
              <p className="font-semibold text-fg">Auto services are coming soon to {userCountryName}</p>
              <p className="text-fg-muted mt-0.5">Vehicle papers, insurance and trackers are only available in Nigeria for now. You can still explore the services; requests open when we launch in your country.</p>
            </div>
          </div>
        )}
        {submittedRequest ? (
          /* ================= SUCCESS MODAL / RECEIPT ================= */
          <div className="max-w-xl mx-auto bg-surface rounded-3xl p-6 sm:p-8 border border-line shadow-2xl text-center animate-in zoom-in-95 duration-200">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 mb-4" aria-hidden>
              <CheckCircle2 className="w-8 h-8" />
            </span>
            <h2 className="text-2xl font-black text-fg">Request Received!</h2>
            <p className="text-sm text-fg-muted mt-2">
              Your service request reference is <span className="font-mono font-bold text-fg">#{submittedRequest.id.slice(0, 8).toUpperCase()}</span>.
            </p>
            <div className="mt-6 rounded-2xl bg-surface-2 p-4 text-left border border-line space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-fg-muted">Service:</span>
                <span className="font-semibold text-fg text-right max-w-[240px] truncate">{submittedRequest.service_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-muted">Customer:</span>
                <span className="font-semibold text-fg">{submittedRequest.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-muted">Phone:</span>
                <span className="font-semibold text-fg">{submittedRequest.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-muted">Estimated Price:</span>
                <span className="font-bold text-accent">{money(Number(submittedRequest.estimated_price || 0))}</span>
              </div>
              {submittedRequest.voucher_code && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span>Voucher (applied on confirmation):</span>
                  <span>{submittedRequest.voucher_code}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-fg-subtle mt-4">
              Our auto-services desk has received your details and will call or WhatsApp you during working hours to confirm your vehicle details, the final price and how to pay.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              {(() => {
                const ref = submittedRequest.id.slice(0, 8).toUpperCase();
                const msg = `Hello Qozob, I just submitted service request #${ref} for ${submittedRequest.service_name}.`;
                const href = SITE.whatsapp
                  ? `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(msg)}`
                  : `mailto:${SITE.contactEmail}?subject=${encodeURIComponent(`Service request #${ref}`)}&body=${encodeURIComponent(msg)}`;
                return (
                  <a
                    href={href}
                    target={SITE.whatsapp ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    className={cx(ui.btn, ui.btnPrimary, 'flex-1 py-3 text-sm')}
                  >
                    <PhoneCall className="w-4 h-4 mr-2" /> {SITE.whatsapp ? 'Message on WhatsApp' : 'Email our team'}
                  </a>
                );
              })()}
              <button
                type="button"
                onClick={() => {
                  setSubmittedRequest(null);
                  router.push('/');
                }}
                className={cx(ui.btn, 'flex-1 py-3 text-sm border border-line')}
              >
                Back to Map
              </button>
            </div>
          </div>
        ) : activeTab === 'fleet' ? (
          /* ================= TAB 3: FLEET & FUEL LOGBOOK ================= */
          <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
            <div className="bg-surface rounded-3xl p-6 sm:p-10 border border-line shadow-sm">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="flex-1 space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                    <Fuel className="w-3.5 h-3.5" /> Digital Logbook & Fraud Detection
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-fg">
                    Stop Losing Money to Generator & Vehicle Fuel Leakage.
                  </h2>
                  <p className="text-sm text-fg-muted leading-relaxed">
                    Post-subsidy fuel is too expensive to manage on loose paper slips. Qozob&apos;s digital fuel logbook lets drivers and facility operators log every fill-up with receipts, tracking average cost per litre, mileage economy, and fuel consumption anomalies.
                  </p>
                  <ul className="space-y-2 text-xs sm:text-sm text-fg-muted font-medium pt-2">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Log vehicle mileage or generator run hours per tank fill.</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Compare your purchase price against the LGA average automatically.</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Export monthly fuel expense reports for tax and business accounting.</span>
                    </li>
                  </ul>

                  <div className="pt-4 flex flex-wrap gap-4">
                    <Link
                      href={user ? "/user-dashboard?tab=fuellog" : "/signup?next=/user-dashboard?tab=fuellog"}
                      className={cx(ui.btn, ui.btnPrimary, 'px-6 py-3 text-sm font-bold shadow-lg')}
                    >
                      <span>Start Logging Fuel Purchases</span>
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </div>
                </div>

                <div className="w-full md:w-72 bg-surface-2 p-5 rounded-2xl border border-line space-y-4">
                  <div className="text-center p-3 bg-brand text-on-brand rounded-xl">
                    <p className="text-xs font-semibold text-on-brand-muted">Monthly Average</p>
                    <p className="text-2xl font-extrabold text-brand-accent mt-0.5">₦895 / L</p>
                    <p className="text-[11px] text-on-brand-muted mt-1">Lagos Mainland</p>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between p-2 rounded-lg bg-surface border border-line">
                      <span className="text-fg-muted">Vehicles Managed</span>
                      <span className="font-bold text-fg">Unlimited</span>
                    </div>
                    <div className="flex justify-between p-2 rounded-lg bg-surface border border-line">
                      <span className="text-fg-muted">Generator Logs</span>
                      <span className="font-bold text-fg">Supported</span>
                    </div>
                    <div className="flex justify-between p-2 rounded-lg bg-surface border border-line">
                      <span className="text-fg-muted">Anomaly Flags</span>
                      <span className="font-bold text-emerald-500">Active</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ================= TABS 1 & 2: PAPERS OR TRACKER ================= */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-300">
            {/* Left Column: Product Selection & Pricing */}
            <div className="lg:col-span-7 space-y-6">
              {activeTab === 'papers' ? (
                <>
                  {/* Package Quick Selectors */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectPackage('complete_renewal')}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface-2 hover:bg-surface-3 border border-line transition-colors"
                    >
                      ⚡ Complete Renewal Pack
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPackage('insurance_only')}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface-2 hover:bg-surface-3 border border-line transition-colors"
                    >
                      🛡️ Third-Party Insurance Only
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPackage('comprehensive')}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface-2 hover:bg-surface-3 border border-line transition-colors"
                    >
                      💎 Comprehensive Insurance Calculator
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPackage('new_registration')}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface-2 hover:bg-surface-3 border border-line transition-colors"
                    >
                      🚗 New Plate Registration
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPackage('custom_plate')}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface-2 hover:bg-surface-3 border border-line transition-colors"
                    >
                      👑 Custom / Fancy Plate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPackage('haulage_dispatch')}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface-2 hover:bg-surface-3 border border-line transition-colors"
                    >
                      🚛 Haulage &amp; Dispatch Permits
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPackage('driver_permits')}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface-2 hover:bg-surface-3 border border-line transition-colors"
                    >
                      🪪 Learner’s &amp; Driver’s License
                    </button>
                  </div>

                  {/* Engine-Capacity / Body-Type Pricing Tier & Private vs Commercial Toggle */}
                  <div className="bg-surface rounded-2xl p-4 border border-line space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-fg-muted uppercase tracking-wider block">Vehicle Usage &amp; Engine / Body Tier</span>
                        <span className="text-sm font-semibold text-fg">
                          {vehicleUsage === 'private' ? 'Private Vehicle' : 'Commercial / Fleet / Dispatch'} · {vehicleTierLabel(effectiveTier, true)}
                        </span>
                      </div>
                      <div className="flex p-1 rounded-xl bg-surface-2 border border-line">
                        <button
                          type="button"
                          onClick={() => setVehicleUsage('private')}
                          className={cx(
                            'px-3 py-1 rounded-lg text-xs font-bold transition-colors',
                            vehicleUsage === 'private' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
                          )}
                        >
                          Private
                        </button>
                        <button
                          type="button"
                          onClick={() => setVehicleUsage('commercial')}
                          className={cx(
                            'px-3 py-1 rounded-lg text-xs font-bold transition-colors',
                            vehicleUsage === 'commercial' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
                          )}
                        >
                          Commercial
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className={ui.label} htmlFor="srv-tier">
                        Engine Capacity / Vehicle Body Type (auto-syncs when you pick your car)
                      </label>
                      <select
                        id="srv-tier"
                        value={effectiveTier}
                        onChange={e => setTierOverride(e.target.value as VehicleTier)}
                        className={ui.select}
                      >
                        {VEHICLE_TIERS.map(t => (
                          <option key={t.key} value={t.key}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Interactive Comprehensive Auto Insurance Calculator */}
                  {selectedItems.includes('comprehensive_insurance') && (() => {
                    const compItem = paperItems.find(i => i.id === 'comprehensive_insurance');
                    const baseRate = compItem?.rate_percent ?? 3.5;
                    const rate = vehicleUsage === 'commercial' ? baseRate + 1.0 : baseRate;
                    const premium = compItem ? effectivePrice(compItem, vehicleUsage, state, effectiveTier, vehicleValue) : 0;
                    return (
                      <div className="bg-surface rounded-2xl p-4 sm:p-5 border-2 border-primary/40 shadow-sm space-y-3 animate-in fade-in duration-200">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-bold">
                              💎 Comprehensive Auto Insurance Calculator
                            </span>
                            <h3 className="text-sm font-bold text-fg mt-1">Enter Your Estimated Vehicle Value (₦)</h3>
                            <p className="text-xs text-fg-muted">
                              Calculated at <strong>{rate}%</strong> ({vehicleUsage}) · Covers accidental collision, vehicle theft, fire, flood extension &amp; up to ₦3M third-party property damage.
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[10px] font-semibold uppercase text-fg-subtle block">Annual Premium</span>
                            <span className="text-xl font-black text-accent tabular">{money(premium)}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                          <div>
                            <label className={ui.label} htmlFor="srv-car-val">Vehicle Market Value (₦)</label>
                            <input
                              id="srv-car-val"
                              type="number"
                              min={500000}
                              step={100000}
                              value={vehicleValue || ''}
                              onChange={e => setVehicleValue(Math.max(0, Number(e.target.value) || 0))}
                              className={cx(ui.input, 'font-bold tabular')}
                              placeholder="e.g. 8000000"
                            />
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-2 sm:pt-5">
                            {[3000000, 5000000, 8000000, 12000000, 20000000, 35000000].map(v => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setVehicleValue(v)}
                                className={cx(
                                  'px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors tabular',
                                  vehicleValue === v
                                    ? 'bg-primary text-on-primary border-primary'
                                    : 'bg-surface-2 text-fg-muted border-line hover:text-fg'
                                )}
                              >
                                ₦{(v / 1000000).toFixed(0)}M
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Interactive Customised / Fancy Plate Inscription Preview */}
                  {selectedItems.includes('custom_plate_number') && (
                    <div className="bg-surface rounded-2xl p-4 sm:p-5 border-2 border-accent/40 shadow-sm space-y-3 animate-in fade-in duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-0.5 text-[11px] font-bold">
                            👑 JTB / FRSC Customised Plate Configurator
                          </span>
                          <h3 className="text-sm font-bold text-fg mt-1">Desired Fancy Plate Inscription</h3>
                          <p className="text-xs text-fg-muted">Up to 8 letters/numbers (e.g. ODOGWU-1, KING-01, CEO-LAG).</p>
                        </div>
                        <div className="rounded-xl border-2 border-emerald-700 bg-white text-emerald-900 px-4 py-2 text-center shadow-inner shrink-0">
                          <span className="block text-[9px] font-extrabold uppercase tracking-widest text-emerald-700">
                            {state.toUpperCase()} · FEDERAL REPUBLIC OF NIGERIA
                          </span>
                          <span className="block font-mono text-lg font-black tracking-widest text-blue-900">
                            {customPlateText.trim() || 'ODOGWU-1'}
                          </span>
                        </div>
                      </div>
                      <input
                        type="text"
                        maxLength={8}
                        placeholder="Type desired plate text (max 8 chars, e.g. ODOGWU-1)"
                        value={customPlateText}
                        onChange={e => setCustomPlateText(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8))}
                        className={cx(ui.input, 'font-mono uppercase tracking-wider')}
                        aria-label="Desired custom plate text"
                      />
                    </div>
                  )}

                  {/* Checklist of Services */}
                  <div className="space-y-3">
                    {paperItems.map(item => {
                      const isSelected = selectedItems.includes(item.id);
                      const price = effectivePrice(item, vehicleUsage, state, effectiveTier, vehicleValue);
                      const local = hasStatePrice(item, state);
                      const tiered = hasTierPrices(item, state);

                      return (
                        <div
                          key={item.id}
                          onClick={() => toggleItem(item.id)}
                          className={cx(
                            'p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-4 select-none',
                            isSelected 
                              ? 'bg-surface border-primary ring-2 ring-primary/20 shadow-sm' 
                              : 'bg-surface/60 border-line hover:border-line-strong hover:bg-surface'
                          )}
                        >
                          <div className={cx(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                            isSelected ? 'bg-primary border-primary text-on-primary' : 'border-line bg-surface'
                          )}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="text-sm font-bold text-fg">{item.title}</h3>
                              <span className="text-right">
                                <span className="block text-sm font-extrabold text-accent tabular">
                                  {price > 0 ? money(price) : 'Commercial Only'}
                                </span>
                                <span className="block text-[10px] font-semibold text-fg-subtle">
                                  {item.rate_percent
                                    ? `${vehicleUsage === 'commercial' ? item.rate_percent + 1 : item.rate_percent}% of value`
                                    : [local ? `${state} rate` : null, tiered ? vehicleTierLabel(effectiveTier, true) : null].filter(Boolean).join(' · ')}
                                </span>
                              </span>
                            </div>
                            {item.description && <p className="text-xs text-fg-muted mt-1 leading-relaxed">{item.description}</p>}
                            {item.turnaround && (
                              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-fg-subtle">
                                <Clock className="w-3 h-3" /> Turnaround: {item.turnaround}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                /* TRACKER SPOTLIGHT */
                <div className="bg-surface rounded-3xl p-6 sm:p-8 border border-line shadow-sm space-y-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-brand-accent shadow-md">
                      <Radio className="w-6 h-6 animate-pulse" />
                    </span>
                    <div>
                      <h2 className="text-xl font-black text-fg">4G Live GPS Tracker & Engine Immobilizer</h2>
                      <p className="text-xs text-fg-muted">Complete Vehicle Security Pack for Nigerian Roads</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-xl bg-surface-2 border border-line">
                      <p className="text-xs font-bold text-fg">🛰️ Live Tracking</p>
                      <p className="text-[11px] text-fg-muted mt-0.5">Real-time smartphone map with exact location, street name and speed.</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-surface-2 border border-line">
                      <p className="text-xs font-bold text-fg">🛑 Remote Engine Cutoff</p>
                      <p className="text-[11px] text-fg-muted mt-0.5">Shut down the fuel pump remotely from your phone in event of theft.</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-surface-2 border border-line">
                      <p className="text-xs font-bold text-fg">📡 1-Year Data SIM Included</p>
                      <p className="text-[11px] text-fg-muted mt-0.5">Pre-activated 4G data roaming across MTN, Airtel & Glo for 365 days.</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-surface-2 border border-line">
                      <p className="text-xs font-bold text-fg">🛠️ Doorstep Installation</p>
                      <p className="text-[11px] text-fg-muted mt-0.5">Certified auto-electrician visits your home or office in Lagos, Abuja & major cities.</p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-brand p-5 text-on-brand flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-on-brand-muted">
                        All-Inclusive Package Price{trackerItem && hasStatePrice(trackerItem, state) ? ` · ${state}` : ''}
                      </p>
                      <p className="text-3xl font-black text-brand-accent tabular">
                        {trackerItem ? money(effectivePrice(trackerItem, vehicleUsage, state)) : 'Price on request'}
                      </p>
                      <p className="text-xs text-on-brand-muted">Zero hidden fees. Hardware + SIM + Installation included.</p>
                    </div>
                    <div className="flex flex-col items-center sm:items-end gap-2 text-xs text-on-brand-muted">
                      <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                        ✔ 1-Year Warranty
                      </span>
                      {trackerHasCommercialPrice && (
                        <div className="flex p-1 rounded-xl bg-white/10" role="group" aria-label="Vehicle category">
                          {(['private', 'commercial'] as const).map(u => (
                            <button
                              key={u}
                              type="button"
                              onClick={() => setVehicleUsage(u)}
                              aria-pressed={vehicleUsage === u}
                              className={cx(
                                'px-3 py-1 rounded-lg text-xs font-bold capitalize transition-colors',
                                vehicleUsage === u ? 'bg-brand-accent text-brand' : 'text-on-brand-muted hover:text-on-brand'
                              )}
                            >
                              {u}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Order / Request Form */}
            <div className="lg:col-span-5 sticky top-24">
              <div className="bg-surface rounded-3xl p-6 sm:p-7 border border-line shadow-lg">
                <div className="flex items-center justify-between border-b border-line pb-4 mb-5">
                  <div>
                    <h3 className="font-extrabold text-base text-fg">Order Summary</h3>
                    <p className="text-xs text-fg-muted">
                      {activeTab === 'tracker' ? '1 Device + Full Installation' : `${chosenPapers.length} service${chosenPapers.length === 1 ? '' : 's'} selected`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-fg-muted block">Estimated Total</span>
                    <span className="text-2xl font-black text-accent tabular">
                      {money(calculatedTotal)}
                    </span>
                    <span className="text-[10px] text-fg-subtle block">Prices for {state}</span>
                  </div>
                </div>

                {errorMessage && (
                  <div className="mb-4 p-3 rounded-xl bg-danger-soft text-danger text-xs font-medium flex items-center gap-2 border border-danger-line">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Contact Info */}
                  <div>
                    <label className={ui.label} htmlFor="srv-name">Full Name *</label>
                    <input
                      id="srv-name"
                      type="text"
                      required
                      placeholder="e.g. Babatunde Adeleke"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className={ui.input}
                    />
                  </div>

                  <div>
                    <label className={ui.label} htmlFor="srv-phone">WhatsApp / Phone Number *</label>
                    <PhoneField
                      id="srv-phone"
                      code={phoneCode}
                      onCodeChange={setPhoneCode}
                      value={phoneNum}
                      onChange={setPhoneNum}
                      required
                      placeholder="803 123 4567"
                    />
                  </div>

                  <div>
                    <label className={ui.label} htmlFor="srv-email">Email Address *</label>
                    <input
                      id="srv-email"
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className={ui.input}
                    />
                  </div>

                  {/* Vehicle Details (pick-lists; a saved garage car fills them in) */}
                  {garage.length > 0 && (
                    <div>
                      <label className={ui.label} htmlFor="srv-garage">Use a vehicle from My Garage</label>
                      <select id="srv-garage" value={garagePick} onChange={e => pickGarageVehicle(e.target.value)} className={ui.select}>
                        <option value="">Enter a different vehicle</option>
                        {garage.map(g => (
                          <option key={g.id} value={g.id}>
                            {g.plate_number} · {[g.vehicle_make, g.vehicle_model, g.vehicle_year].filter(Boolean).join(' ') || 'Vehicle'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <VehicleFields
                    idPrefix="srv"
                    value={vehicle}
                    onChange={v => { setVehicle(v); setGaragePick(''); setTierOverride(''); }}
                    fields={['make', 'model', 'year']}
                    className="sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem] lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem]"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={ui.label} htmlFor="srv-plate">Plate Number</label>
                      <input
                        id="srv-plate"
                        type="text"
                        placeholder="e.g. APP-123-XY"
                        value={plateNumber}
                        onChange={e => { setPlateNumber(formatPlate(e.target.value)); setGaragePick(''); }}
                        className={cx(ui.input, 'font-mono uppercase')}
                      />
                    </div>
                    <div>
                      <label className={ui.label} htmlFor="srv-chassis">
                        Chassis / VIN {selectedItems.includes('new_plate_number') && activeTab !== 'tracker' ? '(needed for new plates)' : '(optional)'}
                      </label>
                      <input
                        id="srv-chassis"
                        type="text"
                        maxLength={17}
                        placeholder="17 characters"
                        value={chassisNumber}
                        onChange={e => setChassisNumber(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17))}
                        className={cx(ui.input, 'font-mono uppercase')}
                        aria-describedby="srv-chassis-hint"
                      />
                      {chassisNumber && chassisNumber.length !== 17 && (
                        <p id="srv-chassis-hint" className={ui.hint}>{chassisNumber.length}/17 characters (letters I, O and Q are never used in a VIN)</p>
                      )}
                    </div>
                  </div>

                  {activeTab === 'tracker' && (
                    <div>
                      <label className={ui.label} htmlFor="srv-notes">Anything we should know? (optional)</label>
                      <textarea
                        id="srv-notes"
                        rows={2}
                        maxLength={500}
                        placeholder="e.g. preferred installation day, number of vehicles"
                        value={trackerNotes}
                        onChange={e => setTrackerNotes(e.target.value)}
                        className={cx(ui.input, 'h-auto py-2 resize-none')}
                      />
                    </div>
                  )}

                  {/* Delivery: State → LGA (LGA list follows the state; prices follow the state too) */}
                  <LocationFields
                    idPrefix="srv"
                    value={{ country: 'Nigeria', state, lga }}
                    onChange={v => { setState(v.state || state); setLga(v.lga); }}
                    required={{ state: true }}
                    labels={{ state: 'State', lga: 'LGA' }}
                  />

                  <div>
                    <label className={ui.label} htmlFor="srv-addr">
                      {activeTab === 'tracker' ? 'Installation Address' : 'Doorstep Delivery Address'}
                    </label>
                    <input
                      id="srv-addr"
                      type="text"
                      placeholder="Street, Estate or Landmark"
                      value={deliveryAddress}
                      onChange={e => setDeliveryAddress(e.target.value)}
                      className={ui.input}
                    />
                  </div>

                  {/* Reward Voucher Code */}
                  <div className="pt-1">
                    <label className={ui.label} htmlFor="srv-voucher">
                      Qozob Reward Voucher Code (Optional)
                    </label>
                    <input
                      id="srv-voucher"
                      type="text"
                      placeholder="e.g. QZ-VCH-A1B2C3D4"
                      value={voucherCode}
                      onChange={e => setVoucherCode(e.target.value.toUpperCase())}
                      className={ui.input}
                    />
                    <p className="text-[11px] text-fg-subtle mt-1">
                      Monthly Rewards winners who chose a service voucher can paste their code here (sign-in required). It is applied when our team confirms your request.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || outsideNigeria || (activeTab === 'papers' && chosenPapers.length === 0) || (activeTab === 'tracker' && !trackerItem)}
                    className={cx(
                      ui.btn, ui.btnLg, ui.btnPrimary,
                      'w-full mt-4 font-extrabold text-sm shadow-xl'
                    )}
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Submitting Request…
                      </span>
                    ) : outsideNigeria ? (
                      <span>Coming soon to {userCountryName}</span>
                    ) : (
                      <span>Submit Request & Get Quote</span>
                    )}
                  </button>

                  <p className="text-[11px] text-center text-fg-muted mt-2">
                    🔒 Zero spam. You only pay after our verified agent confirms vehicle papers.
                  </p>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ================= SEO GUIDE & FREQUENTLY ASKED QUESTIONS ================= */}
        <section aria-labelledby="seo-guide-heading" className="mt-16 pt-12 border-t border-line space-y-10">
          <div className="max-w-3xl">
            <p className={ui.eyebrow}>Complete Nigerian Vehicle Compliance &amp; Security Hub</p>
            <h2 id="seo-guide-heading" className="text-2xl sm:text-3xl font-extrabold text-fg mt-1">
              Why Drivers &amp; Fleet Managers Renew Vehicle Papers on Qozob
            </h2>
            <p className="text-sm text-fg-muted mt-2 leading-relaxed">
              Whether you drive a private saloon car in Lagos, an SUV in Abuja, a commercial bus in Port Harcourt, or manage heavy-duty haulage trucks and dispatch motorcycles nationwide, Qozob calculates accurate statutory rates by engine capacity and state—with digital copies stored in your personal Document Vault.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <article className="bg-surface rounded-2xl p-5 border border-line space-y-2">
              <h3 className="text-sm font-bold text-fg">1. Engine-Capacity &amp; Body-Type Tiered Pricing</h3>
              <p className="text-xs text-fg-muted leading-relaxed">
                Vehicle License, Roadworthiness (LACVIS), and Proof of Ownership (POC) fees are automatically matched to your car’s statutory engine band (Saloon ≤1.8L, Saloon 2.0L+, SUV/Pickup, Coaster Bus, Heavy-Duty Truck, or Dispatch Motorcycle) so you never overpay.
              </p>
            </article>
            <article className="bg-surface rounded-2xl p-5 border border-line space-y-2">
              <h3 className="text-sm font-bold text-fg">2. NIID Third-Party &amp; Comprehensive Insurance</h3>
              <p className="text-xs text-fg-muted leading-relaxed">
                Get instant NAICOM-regulated Third-Party Motor Insurance verified on the Nigerian Insurance Industry Database (NIID / askniid.org), or use our live Comprehensive Auto Insurance Calculator for full collision, theft, fire, and flood protection.
              </p>
            </article>
            <article className="bg-surface rounded-2xl p-5 border border-line space-y-2">
              <h3 className="text-sm font-bold text-fg">3. Digital Document Vault &amp; Email Expiry Alerts</h3>
              <p className="text-xs text-fg-muted leading-relaxed">
                Save your vehicles in My Garage to receive automated 30, 14, and 7-day email reminders before VIO, FRSC, or Police stops catch you off guard—plus 24/7 access to your certificates in the Digital Document Vault.
              </p>
            </article>
          </div>

          <div className="bg-surface rounded-3xl p-6 sm:p-8 border border-line space-y-4">
            <h3 className="text-lg font-extrabold text-fg">Frequently Asked Questions (Vehicle Papers, Permits &amp; Trackers in Nigeria)</h3>
            <div className="divide-y divide-line text-sm">
              <details className="py-3 group">
                <summary className="font-bold text-fg cursor-pointer list-none flex items-center justify-between">
                  <span>How are Vehicle License and Roadworthiness prices calculated on Qozob?</span>
                  <ChevronRight className="w-4 h-4 text-fg-muted transition-transform group-open:rotate-90" />
                </summary>
                <p className="text-xs text-fg-muted mt-2 leading-relaxed">
                  Statutory licensing authorities in Lagos, Abuja (FCT), Ogun, Rivers, and across Nigeria price renewals by vehicle category and engine capacity. When you choose your vehicle make and model on Qozob, our system automatically selects the matching tier (e.g. Saloon ≤1.8L vs Saloon 2.0L+ vs SUV/Pickup vs Bus vs Heavy-Duty Truck) and applies your state’s official rate.
                </p>
              </details>
              <details className="py-3 group">
                <summary className="font-bold text-fg cursor-pointer list-none flex items-center justify-between">
                  <span>What is the Annual Proof of Ownership Certificate (POC) renewal?</span>
                  <ChevronRight className="w-4 h-4 text-fg-muted transition-transform group-open:rotate-90" />
                </summary>
                <p className="text-xs text-fg-muted mt-2 leading-relaxed">
                  Mandated by the Joint Tax Board (JTB) and state motor registries, the annual Proof of Ownership Certificate (POC) verifies legal title of a motor vehicle on the national database and is renewed alongside your annual Vehicle License.
                </p>
              </details>
              <details className="py-3 group">
                <summary className="font-bold text-fg cursor-pointer list-none flex items-center justify-between">
                  <span>Can I order Customised / Fancy Number Plates, Learner’s Permits, or Haulage Permits?</span>
                  <ChevronRight className="w-4 h-4 text-fg-muted transition-transform group-open:rotate-90" />
                </summary>
                <p className="text-xs text-fg-muted mt-2 leading-relaxed">
                  Yes. Qozob processes official JTB/FRSC Customised (Fancy) Number Plates, lost/damaged number plate replacements, FRSC 3-month Learner’s Permits, Nigerian Driver’s License renewals, Police CMRIS &amp; Tinted Glass Permits, Commercial Hackney/Haulage permits for trucks and buses, and Dispatch Rider Cards for delivery motorcycles.
                </p>
              </details>
              <details className="py-3 group">
                <summary className="font-bold text-fg cursor-pointer list-none flex items-center justify-between">
                  <span>How do automated expiry reminders and the Digital Document Vault work?</span>
                  <ChevronRight className="w-4 h-4 text-fg-muted transition-transform group-open:rotate-90" />
                </summary>
                <p className="text-xs text-fg-muted mt-2 leading-relaxed">
                  Once you add your vehicle in My Garage, Qozob monitors your Insurance, Vehicle License, Roadworthiness, POC, and Hackney Permit expiry dates and emails you 30, 14, and 7 days before expiration with a 1-click renewal link. All renewed certificates and uploaded scans are kept in your encrypted Digital Document Vault for instant inspection.
                </p>
              </details>
            </div>
          </div>
        </section>
      </main>

      {/* Global Footer */}
      <footer className="bg-brand-grad text-on-brand-muted py-8 text-xs border-t border-brand-line mt-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>© {new Date().getFullYear()} Qozob Auto-Care Services. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-on-brand">Fuel Map</Link>
            <Link href="/rewards" className="hover:text-on-brand">Rewards</Link>
            <Link href="/privacy" className="hover:text-on-brand">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-on-brand">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

