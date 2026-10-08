"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, Lock, Mail, User, Building2, ArrowRight, CheckCircle2, AlertCircle, Eye, EyeOff, Check } from 'lucide-react';
import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { ui, cx } from '@/lib/ui';

const ROLE_OPTIONS = [
  {
    value: 'User' as const,
    icon: User,
    title: 'Driver',
    text: 'Find fair prices, report what you pay and rate stations.',
  },
  {
    value: 'Manager' as const,
    icon: Building2,
    title: 'Station owner',
    text: 'Claim your station, publish official prices and see insights.',
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-fg mb-3">{title}</legend>
      {children}
    </fieldset>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [role, setRole] = useState<'User' | 'Manager'>('User');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Form Fields
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneCode, setPhoneCode] = useState("+234");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("Nigeria");

  // Manager Only Fields
  const [companyName, setCompanyName] = useState("");
  const [cacFile, setCacFile] = useState<File | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    if (role === 'Manager' && (!companyName || !cacFile)) {
      setErrorMsg("Station owners must provide a registered company name and CAC certificate.");
      setLoading(false);
      return;
    }

    try {
      // 1. Create the Auth User
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: role,
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            full_phone: `${phoneCode}${phone}`,
            address: address,
            state: state,
            country: country,
            company_name: role === 'Manager' ? companyName : null,
          }
        }
      });

      if (authError) throw authError;

      // 2. If Manager, upload CAC securely using the newly created user's ID
      if (role === 'Manager' && cacFile && authData.user) {
        const fileExt = cacFile.name.split('.').pop();
        const fileName = `${authData.user.id}/cac_registration_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('cac_documents')
          .upload(fileName, cacFile);

        if (uploadError) {
          console.error("CAC Upload Warning:", uploadError);
          // We don't fail the whole signup if just the file fails, but we log it.
        } else {
          // The CAC bucket is private: save the file's path (admins open it through a short-lived signed link).
          // The Manager-access request is filed automatically the first time they sign in.
          await supabase.auth.updateUser({
            data: { cac_document_path: fileName }
          });
        }
      }

      setSuccessMsg("Account created. Taking you to sign in…");
      setTimeout(() => router.push('/login'), 2500);

    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      wide
      title="Create your account"
      subtitle="It takes about a minute. Station owners will need a CAC certificate for verification."
    >
      {errorMsg && (
        <div role="alert" className={cx(ui.alertError, 'mb-6')}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div role="status" className={cx(ui.alertSuccess, 'mb-6')}>
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSignup} className="space-y-8">

        {/* ROLE SELECTOR */}
        <fieldset>
          <legend className="text-sm font-semibold text-fg mb-3">I am signing up as</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup">
            {ROLE_OPTIONS.map(({ value, icon: Icon, title, text }) => {
              const active = role === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setRole(value)}
                  className={cx(
                    'relative flex items-start gap-3 text-left p-4 rounded-xl border transition-colors',
                    active
                      ? 'border-primary bg-surface ring-2 ring-accent-solid/40'
                      : 'border-line-strong bg-surface hover:bg-surface-2'
                  )}
                >
                  <span className={cx(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    active ? 'bg-primary text-on-primary' : 'bg-surface-3 text-fg-muted'
                  )}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="pr-6">
                    <span className="block text-sm font-semibold text-fg">{title}</span>
                    <span className="block text-sm text-fg-muted mt-0.5">{text}</span>
                  </span>
                  <span className={cx(
                    'absolute top-4 right-4 flex h-5 w-5 items-center justify-center rounded-full border',
                    active ? 'bg-primary border-primary text-on-primary' : 'border-line-strong'
                  )} aria-hidden>
                    {active && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* PERSONAL DETAILS */}
        <Section title="Your details">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="firstName" className={ui.label}>First name</label>
              <input id="firstName" type="text" autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={ui.input} placeholder="Chidi" />
            </div>
            <div>
              <label htmlFor="middleName" className={ui.label}>Middle name <span className="font-normal text-fg-subtle">(optional)</span></label>
              <input id="middleName" type="text" autoComplete="additional-name" value={middleName} onChange={(e) => setMiddleName(e.target.value)} className={ui.input} />
            </div>
            <div>
              <label htmlFor="lastName" className={ui.label}>Last name</label>
              <input id="lastName" type="text" autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={ui.input} placeholder="Okafor" />
            </div>
          </div>
        </Section>

        {/* CONTACT DETAILS */}
        <Section title="Contact">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className={ui.label}>Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" aria-hidden />
                <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={cx(ui.input, ui.inputWithIcon)} placeholder="you@example.com" />
              </div>
            </div>
            <div>
              <label htmlFor="phone" className={ui.label}>Phone number</label>
              <div className="flex gap-2">
                <select aria-label="Country code" value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} className={cx(ui.select, 'w-[118px] shrink-0')}>
                  <option value="+234">NG +234</option>
                  <option value="+1">US +1</option>
                  <option value="+44">UK +44</option>
                </select>
                <input id="phone" type="tel" autoComplete="tel-national" required value={phone} onChange={(e) => setPhone(e.target.value)} className={cx(ui.input, 'flex-1 min-w-0')} placeholder="801 234 5678" />
              </div>
            </div>
          </div>
        </Section>

        {/* LOCATION DETAILS */}
        <Section title="Location">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="country" className={ui.label}>Country</label>
              <input id="country" type="text" autoComplete="country-name" required value={country} onChange={(e) => setCountry(e.target.value)} className={ui.input} placeholder="Nigeria" />
            </div>
            <div>
              <label htmlFor="state" className={ui.label}>State</label>
              <input id="state" type="text" autoComplete="address-level1" required value={state} onChange={(e) => setState(e.target.value)} className={ui.input} placeholder="Lagos" />
            </div>
            <div>
              <label htmlFor="address" className={ui.label}>Address <span className="font-normal text-fg-subtle">(optional)</span></label>
              <input id="address" type="text" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} className={ui.input} />
            </div>
          </div>
        </Section>

        {/* MANAGER SPECIFIC DETAILS */}
        {role === 'Manager' && (
          <div className="rounded-xl border border-accent-line bg-accent-soft p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h3 className="text-sm font-semibold text-on-accent-soft flex items-center gap-2">
                <Building2 className="w-4 h-4" aria-hidden /> Business verification
              </h3>
              <p className="mt-1 text-sm text-on-accent-soft/90">
                We review every station owner before granting access. Your document is stored privately.
              </p>
            </div>
            <div>
              <label htmlFor="companyName" className={ui.label}>Registered company name</label>
              <input id="companyName" type="text" autoComplete="organization" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={ui.input} placeholder="e.g. Sunrise Energy Ltd." />
            </div>
            <div>
              <label htmlFor="cac" className={ui.label}>CAC certificate</label>
              <input id="cac" type="file" required accept=".pdf, image/jpeg, image/png" onChange={(e) => setCacFile(e.target.files ? e.target.files[0] : null)} className={ui.file} />
              <p className={ui.hint}>PDF, JPG or PNG.</p>
            </div>
          </div>
        )}

        {/* SECURITY */}
        <Section title="Password">
          <div>
            <label htmlFor="password" className="sr-only">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" aria-hidden />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cx(ui.input, ui.inputWithIcon, 'pr-11')}
                placeholder="Create a password"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </div>
            <p className={ui.hint}>At least 6 characters.</p>
          </div>
        </Section>

        <div className="space-y-3">
          <button type="submit" disabled={loading} className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'w-full')}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : 'Create account'}
          </button>
          <p className="text-center text-xs text-fg-subtle">
            By creating an account, you agree to our{' '}
            <Link href="/terms" className="font-medium text-fg-muted underline underline-offset-2 hover:text-fg">Terms</Link> and{' '}
            <Link href="/privacy" className="font-medium text-fg-muted underline underline-offset-2 hover:text-fg">Privacy Policy</Link>.
          </p>
        </div>
      </form>

      <p className="mt-8 text-center text-sm text-fg-muted">
        Already have an account?{' '}
        <Link href="/login" className={cx(ui.link, 'inline-flex items-center gap-1')}>
          Sign in <ArrowRight className="w-3.5 h-3.5" aria-hidden />
        </Link>
      </p>
    </AuthShell>
  );
}