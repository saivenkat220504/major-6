import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  Mail,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  UserCheck,
  UserPlus,
  Clock,
  Lock,
  Trash2,
  Users,
  X,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface Guardian {
  id: string;
  guardianEmail: string;
  guardianName: string;
  guardianVerified: boolean;
  configured?: boolean;
  verifiedAt: string | null;
}

type FlowStep = 'add_info' | 'email_config' | 'otp_verify';

export default function PersonalGuardianPage() {
  // Guardian list
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [isFetchingStatus, setIsFetchingStatus] = useState(true);

  // Add-guardian flow state
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [flowStep, setFlowStep] = useState<FlowStep>('add_info');
  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpAppPassword, setSmtpAppPassword] = useState('');
  const [otp, setOtp] = useState('');

  // Configured state for current guardian
  const [isConfigSaved, setIsConfigSaved] = useState(false);

  // Loading states
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Timers
  const [expiresIn, setExpiresIn] = useState(300);
  const [resendCooldown, setResendCooldown] = useState(60);

  // Remove loading
  const [removingId, setRemovingId] = useState<string | null>(null);

  const token = localStorage.getItem('token');

  /* ─── Fetch guardian list on mount ───────────────────────────────── */
  useEffect(() => {
    fetchGuardianStatus();
  }, []);

  /* ─── OTP expiry countdown ─────────────────────────────────────── */
  useEffect(() => {
    if (flowStep !== 'otp_verify' || !showAddFlow || expiresIn <= 0) return;
    const interval = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setErrorMsg('OTP has expired. Please click Resend OTP to request a new code.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [flowStep, showAddFlow, expiresIn]);

  /* ─── Resend cooldown countdown ────────────────────────────────── */
  useEffect(() => {
    if (flowStep !== 'otp_verify' || !showAddFlow || resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [flowStep, showAddFlow, resendCooldown]);

  const fetchGuardianStatus = async () => {
    try {
      setIsFetchingStatus(true);
      const res = await fetch('/api/guardian/status', {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });
      const data = await res.json();

      if (data.success) {
        setGuardians(data.guardians || []);

        // Resume pending OTP if available
        if (data.pendingOtp) {
          setGuardianEmail(data.pendingOtp.email);
          setExpiresIn(data.pendingOtp.expiresInSeconds);
          setResendCooldown(data.pendingOtp.resendCooldownSeconds);
          setFlowStep('otp_verify');
          setShowAddFlow(true);
        }
      }
    } catch (err) {
      console.error('Error fetching guardian status:', err);
    } finally {
      setIsFetchingStatus(false);
    }
  };

  /* ─── STEP 1: Continue to Email Config Setup ───────────────────── */
  const handleStep1Continue = () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanName = guardianName.trim();
    const cleanEmail = guardianEmail.trim().toLowerCase();

    if (!cleanName) {
      setErrorMsg('Please enter your guardian\'s name.');
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('Please enter a valid Gmail address for your guardian.');
      return;
    }

    setSmtpUser(cleanEmail);
    setFlowStep('email_config');
  };

  /* ─── STEP 2: Save Guardian Email Configuration ─────────────────── */
  const handleSaveConfig = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanGuardianEmail = guardianEmail.trim().toLowerCase();
    const cleanSmtpUser = smtpUser.trim().toLowerCase();
    const cleanPassword = smtpAppPassword.trim().replace(/\s+/g, '');

    if (!cleanSmtpUser || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanSmtpUser)) {
      setErrorMsg('Please enter a valid Gmail address.');
      return;
    }

    if (!cleanPassword || cleanPassword.length < 8) {
      setErrorMsg('Please enter the 16-character Gmail App Password generated by your guardian.');
      return;
    }

    setIsSavingConfig(true);
    try {
      const res = await fetch('/api/guardian/email-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          guardianEmail: cleanGuardianEmail,
          smtpUser: cleanSmtpUser,
          smtpAppPassword: cleanPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Failed to save guardian email configuration.');
        return;
      }

      setIsConfigSaved(true);
      setSuccessMsg('Guardian email configuration saved successfully! You can now send the verification OTP.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving configuration.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  /* ─── STEP 2/3: Send OTP ────────────────────────────────────────── */
  const handleSendOtp = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanEmail = guardianEmail.trim().toLowerCase();

    setIsSendingOtp(true);
    try {
      const res = await fetch('/api/guardian/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.requiresConfig) {
          setErrorMsg('Please click "Save Guardian Email Configuration" before sending the OTP.');
        } else {
          setErrorMsg(data.message || 'Failed to send OTP email.');
        }
        return;
      }

      setFlowStep('otp_verify');
      setExpiresIn(300);
      setResendCooldown(60);
      setSuccessMsg('OTP sent! Ask your guardian to check their Gmail inbox for the 6-digit code.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error sending OTP.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  /* ─── STEP 3: Verify OTP ───────────────────────────────────────── */
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      setErrorMsg('Please enter the full 6-digit code.');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await fetch('/api/guardian/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          email: guardianEmail.trim().toLowerCase(),
          otp: cleanOtp,
          guardianName: guardianName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Verification failed.');
        return;
      }

      setSuccessMsg('Guardian verified and linked successfully!');

      if (data.guardian) {
        setGuardians((prev) => {
          const filtered = prev.filter((g) => g.id !== data.guardian.id);
          return [{ ...data.guardian, configured: true }, ...filtered];
        });
      }

      // Reset form
      setTimeout(() => {
        resetForm();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification error.');
    } finally {
      setIsVerifying(false);
    }
  };

  /* ─── Remove Guardian ──────────────────────────────────────────────── */
  const handleRemoveGuardian = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this guardian?')) return;
    try {
      setRemovingId(id);
      const res = await fetch(`/api/guardian/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Failed to remove guardian.');
        return;
      }

      setGuardians((prev) => prev.filter((g) => g.id !== id));
    } catch (err) {
      alert('Error removing guardian.');
    } finally {
      setRemovingId(null);
    }
  };

  const resetForm = () => {
    setShowAddFlow(false);
    setFlowStep('add_info');
    setGuardianName('');
    setGuardianEmail('');
    setSmtpUser('');
    setSmtpAppPassword('');
    setOtp('');
    setIsConfigSaved(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <main className="max-w-4xl mx-auto px-4 pt-2">
        {/* Banner Section */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-3xl p-6 md:p-8 text-white shadow-xl shadow-indigo-500/10 mb-8 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-xs font-medium mb-3 border border-white/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                Trusted Safety Monitoring
              </div>

              <h1 className="text-2xl md:text-3xl font-bold mb-2">Family Guardian System</h1>
              <p className="text-blue-100 text-sm md:text-base leading-relaxed">
                Nominate trusted guardians (parents, partners, emergency contacts). Guardians configure their Gmail App Password to securely receive live flight telemetry, security screening updates, and emergency SOS alerts.
              </p>
            </div>

            {!showAddFlow && (
              <button
                onClick={() => { setShowAddFlow(true); setFlowStep('add_info'); }}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-blue-600 font-semibold rounded-2xl shadow-lg hover:bg-blue-50 transition-all text-sm shrink-0 active:scale-95"
              >
                <UserPlus className="w-4 h-4" />
                Add New Guardian
              </button>
            )}
          </div>
        </div>

        {/* ─── ADD GUARDIAN MULTI-STEP FLOW ───────────────────────────────── */}
        {showAddFlow && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800/90 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-700/80 shadow-lg mb-8"
          >
            {/* Header & Step Indicator */}
            <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-500" />
                  {flowStep === 'add_info' && 'Step 1: Add Guardian Contact'}
                  {flowStep === 'email_config' && 'Step 2: Set Up Guardian Email Verification'}
                  {flowStep === 'otp_verify' && 'Step 3: Verify 6-Digit OTP Code'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {flowStep === 'add_info' && 'Enter your guardian\'s name and Gmail address.'}
                  {flowStep === 'email_config' && 'Provide guardian\'s Gmail App Password for SMTP dispatch.'}
                  {flowStep === 'otp_verify' && 'Enter the 6-digit code sent to your guardian\'s Gmail.'}
                </p>
              </div>

              <button
                onClick={resetForm}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Global Error/Success Messages */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-start gap-3 text-rose-700 dark:text-rose-300 text-sm"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
                  <span>{errorMsg}</span>
                </motion.div>
              )}

              {successMsg && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-start gap-3 text-emerald-700 dark:text-emerald-300 text-sm"
                >
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
                  <span>{successMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── STEP 1: Guardian Name & Email ── */}
            {flowStep === 'add_info' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                    Guardian Full Name
                  </label>
                  <input
                    type="text"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="e.g. John Doe (Parent / Contact)"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                    Guardian Gmail Address
                  </label>
                  <input
                    type="email"
                    value={guardianEmail}
                    onChange={(e) => setGuardianEmail(e.target.value)}
                    placeholder="guardian@gmail.com"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors text-sm"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={resetForm}
                    className="px-5 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStep1Continue}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-blue-500/20"
                  >
                    Continue to Email Setup
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Guardian Email Setup (Instructions + Credentials) ── */}
            {flowStep === 'email_config' && (
              <div className="space-y-6">
                {/* Warning / Instructions Card */}
                <div className="p-5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-2xl">
                  <h3 className="text-amber-900 dark:text-amber-200 font-bold text-sm flex items-center gap-2 mb-2">
                    <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    What your guardian must do in Google Account:
                  </h3>
                  <ol className="list-decimal list-inside text-xs text-amber-800 dark:text-amber-300 space-y-1.5 leading-relaxed">
                    <li>Open <strong>myaccount.google.com</strong> and navigate to <strong>Security</strong>.</li>
                    <li>Ensure <strong>2-Step Verification</strong> is enabled.</li>
                    <li>Search for <strong>App Passwords</strong> and generate a 16-character password for "Mail".</li>
                    <li>Share the Gmail address and the 16-character App Password with you.</li>
                  </ol>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      Gmail Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                      <input
                        type="email"
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                        placeholder="guardian@gmail.com"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      Gmail App Password (16 Characters)
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                      <input
                        type="password"
                        value={smtpAppPassword}
                        onChange={(e) => setSmtpAppPassword(e.target.value)}
                        placeholder="xxxx xxxx xxxx xxxx"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <button
                    onClick={() => setFlowStep('add_info')}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
                  >
                    ← Back to Guardian Details
                  </button>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      onClick={handleSaveConfig}
                      disabled={isSavingConfig}
                      className="flex-1 sm:flex-none px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-semibold rounded-xl text-sm transition-all"
                    >
                      {isSavingConfig ? 'Saving...' : '1. Save Configuration'}
                    </button>

                    <button
                      onClick={handleSendOtp}
                      disabled={isSendingOtp}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-blue-500/20"
                    >
                      {isSendingOtp ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          2. Send OTP
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 3: Enter & Verify OTP ── */}
            {flowStep === 'otp_verify' && (
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl text-xs text-blue-800 dark:text-blue-200">
                  Enter the 6-digit OTP code sent to <strong>{guardianEmail}</strong>.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors text-center text-xl font-mono tracking-widest"
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Code expires in: <strong className="font-mono text-slate-800 dark:text-slate-200">{formatTimer(expiresIn)}</strong></span>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={resendCooldown > 0 || isSendingOtp}
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline disabled:opacity-50"
                  >
                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend OTP'}
                  </button>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setFlowStep('email_config')}
                    className="px-5 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Back
                  </button>

                  <button
                    type="submit"
                    disabled={isVerifying || otp.length !== 6}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {isVerifying ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Verify & Add Guardian
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        )}

        {/* ─── GUARDIAN LIST SCREEN ──────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-700/80 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                Nominated Guardians ({guardians.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage guardians configured to receive automated navigation & emergency alerts.
              </p>
            </div>
          </div>

          {isFetchingStatus ? (
            <div className="py-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading guardian status...
            </div>
          ) : guardians.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No guardians added yet.</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Click "Add New Guardian" to nominate a family member or emergency contact.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {guardians.map((g) => (
                <div
                  key={g.id}
                  className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-sm shrink-0">
                      {(g.guardianName || g.guardianEmail).charAt(0).toUpperCase()}
                    </div>

                    <div>
                      <h4 className="font-semibold text-sm">{g.guardianName || 'Family Guardian'}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{g.guardianEmail}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {/* Configured Badge */}
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        g.configured
                          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {g.configured ? 'Configured' : 'Not Configured'}
                    </span>

                    {/* Verified Badge */}
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        g.guardianVerified
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                      }`}
                    >
                      {g.guardianVerified ? 'Verified' : 'Pending Verification'}
                    </span>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleRemoveGuardian(g.id)}
                      disabled={removingId === g.id}
                      className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors ml-2"
                      title="Remove guardian"
                    >
                      {removingId === g.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
