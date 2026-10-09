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
import { Wordmark } from '@/components/Wordmark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PhoneField } from '@/components/PhoneField';
import { NIGERIAN_STATES, joinPhone } from '@/lib/nigeria';
import { AUTO_SERVICE_CATALOG, ServiceCategory } from '@/types/services';
import { submitServiceRequest } from '@/lib/services';
import { cx, ui } from '@/lib/ui';

export default function ServicesPage() {
  const supabase = createClient();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'papers' | 'tracker' | 'fleet'>('papers');
  const [vehicleUsage, setVehicleUsage] = useState<'private' | 'commercial'>('private');
  const [selectedItems, setSelectedItems] = useState<string[]>([
    'insurance_3rd_party',
    'vehicle_license',
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
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [trackerNotes, setTrackerNotes] = useState('');

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);

  // Check auth user to pre-fill
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
        if (data.user.email) setEmail(data.user.email);
        if (data.user.user_metadata?.full_name) setFullName(data.user.user_metadata.full_name);
        if (data.user.user_metadata?.phone) {
          const raw = String(data.user.user_metadata.phone);
          if (raw.startsWith('+234')) {
            setPhoneCode('+234');
            setPhoneNum(raw.replace('+234', ''));
          } else {
            setPhoneNum(raw);
          }
        }
      }
    });
  }, [supabase]);

  // Calculation for Papers & Insurance
  const calculatedTotal = useMemo(() => {
    if (activeTab === 'tracker') {
      return 55000;
    }
    let total = 0;
    for (const itemId of selectedItems) {
      const found = AUTO_SERVICE_CATALOG.find(i => i.id === itemId);
      if (found) {
        if (vehicleUsage === 'commercial' && found.commercialPrice !== undefined) {
          total += found.commercialPrice;
        } else {
          total += found.privatePrice;
        }
      }
    }
    return total;
  }, [selectedItems, vehicleUsage, activeTab]);

  const toggleItem = (id: string) => {
    setSelectedItems(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectPackage = (pack: 'complete_renewal' | 'new_registration' | 'insurance_only') => {
    if (pack === 'complete_renewal') {
      setSelectedItems(['insurance_3rd_party', 'vehicle_license', 'roadworthiness']);
    } else if (pack === 'new_registration') {
      setSelectedItems(['new_plate_number', 'insurance_3rd_party']);
    } else if (pack === 'insurance_only') {
      setSelectedItems(['insurance_3rd_party']);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    setIsSubmitting(true);

    const category: ServiceCategory = activeTab === 'tracker' ? 'gps_tracker' : 'papers_renewal';
    const serviceName = activeTab === 'tracker' 
      ? '4G Live GPS Tracker & Anti-Theft Installation' 
      : selectedItems.length > 0 
        ? selectedItems.map(id => AUTO_SERVICE_CATALOG.find(i => i.id === id)?.title).filter(Boolean).join(' + ')
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
      vehicle_make: vehicleMake || null,
      vehicle_model: vehicleModel || null,
      vehicle_year: vehicleYear || null,
      plate_number: plateNumber || null,
      chassis_number: chassisNumber || null,
      details: {
        vehicle_usage: vehicleUsage,
        selected_item_ids: selectedItems,
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
                <span className="font-bold text-accent">₦{Number(submittedRequest.estimated_price || 0).toLocaleString()}</span>
              </div>
              {submittedRequest.voucher_code && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span>Voucher Applied:</span>
                  <span>{submittedRequest.voucher_code}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-fg-subtle mt-4">
              Our auto-services desk has received your details and will call / WhatsApp you within 15–30 minutes to confirm vehicle details and arrange processing.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <a
                href={`https://wa.me/2348000000000?text=${encodeURIComponent(`Hello Qozob Concierge, I just submitted service request #${submittedRequest.id.slice(0, 8).toUpperCase()} for ${submittedRequest.service_name}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cx(ui.btn, ui.btnPrimary, 'flex-1 py-3 text-sm')}
              >
                <PhoneCall className="w-4 h-4 mr-2" /> Message on WhatsApp
              </a>
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
                    Post-subsidy fuel is too expensive to manage on loose paper slips. Qozob's digital fuel logbook lets drivers and facility operators log every fill-up with receipts, tracking average cost per litre, mileage economy, and fuel consumption anomalies.
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
                      onClick={() => handleSelectPackage('new_registration')}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface-2 hover:bg-surface-3 border border-line transition-colors"
                    >
                      🚗 New Plate Registration
                    </button>
                  </div>

                  {/* Private vs Commercial Toggle */}
                  <div className="bg-surface rounded-2xl p-4 border border-line flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-fg-muted uppercase tracking-wider block">Vehicle Category</span>
                      <span className="text-sm font-semibold text-fg">
                        {vehicleUsage === 'private' ? 'Private Saloon / SUV' : 'Commercial Bus / Transport / Logistics'}
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

                  {/* Checklist of Services */}
                  <div className="space-y-3">
                    {AUTO_SERVICE_CATALOG.filter(item => item.category !== 'gps_tracker').map(item => {
                      const isSelected = selectedItems.includes(item.id);
                      const price = vehicleUsage === 'commercial' && item.commercialPrice !== undefined 
                        ? item.commercialPrice 
                        : item.privatePrice;

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
                              <span className="text-sm font-extrabold text-accent">
                                {price > 0 ? `₦${price.toLocaleString()}` : 'Free Addon'}
                              </span>
                            </div>
                            <p className="text-xs text-fg-muted mt-1 leading-relaxed">{item.description}</p>
                            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-fg-subtle">
                              <Clock className="w-3 h-3" /> Turnaround: {item.turnaroundDays}
                            </span>
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
                      <p className="text-xs font-medium text-on-brand-muted">All-Inclusive Package Price</p>
                      <p className="text-3xl font-black text-brand-accent">₦55,000</p>
                      <p className="text-xs text-on-brand-muted">Zero hidden fees. Hardware + SIM + Installation included.</p>
                    </div>
                    <div className="text-right text-xs text-on-brand-muted">
                      <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                        ✔ 1-Year Warranty
                      </span>
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
                      {activeTab === 'tracker' ? '1 Device + Full Installation' : `${selectedItems.length} services selected`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-fg-muted block">Estimated Total</span>
                    <span className="text-2xl font-black text-accent tabular">
                      ₦{calculatedTotal.toLocaleString()}
                    </span>
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

                  {/* Vehicle Details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={ui.label} htmlFor="srv-make">Make & Model</label>
                      <input
                        id="srv-make"
                        type="text"
                        placeholder="e.g. Toyota Corolla"
                        value={vehicleMake}
                        onChange={e => setVehicleMake(e.target.value)}
                        className={ui.input}
                      />
                    </div>
                    <div>
                      <label className={ui.label} htmlFor="srv-plate">Plate Number</label>
                      <input
                        id="srv-plate"
                        type="text"
                        placeholder="e.g. APP-123-XY"
                        value={plateNumber}
                        onChange={e => setPlateNumber(e.target.value.toUpperCase())}
                        className={ui.input}
                      />
                    </div>
                  </div>

                  {/* Delivery / State */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={ui.label} htmlFor="srv-state">State *</label>
                      <select
                        id="srv-state"
                        value={state}
                        onChange={e => setState(e.target.value)}
                        className={ui.select}
                      >
                        {NIGERIAN_STATES.map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={ui.label} htmlFor="srv-lga">LGA / Area</label>
                      <input
                        id="srv-lga"
                        type="text"
                        placeholder="e.g. Ikeja, Lekki"
                        value={lga}
                        onChange={e => setLga(e.target.value)}
                        className={ui.input}
                      />
                    </div>
                  </div>

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
                      Monthly price-update winners with ₦15,000 vouchers can paste their code here.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || (activeTab === 'papers' && selectedItems.length === 0)}
                    className={cx(
                      ui.btn, ui.btnLg, ui.btnPrimary,
                      'w-full mt-4 font-extrabold text-sm shadow-xl'
                    )}
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Submitting Request…
                      </span>
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
