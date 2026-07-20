import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Leaf, Users, BarChart3, MapPin, ShieldCheck, Lock, Mail } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, Input } from "../components/ui";
import { LogoMark } from "../components/Logo";
import ApkDownload from "../components/ApkDownload";
import LeafField from "../components/LeafField";
import LoginCrest, { LeafDrift } from "../components/LoginCrest";
import KeeperGate from "../components/KeeperGate";
import { api } from "../lib/api";

const FEATURES = [
  { icon: Users, text: "Workforce, attendance & payroll" },
  { icon: Leaf, text: "Agronomy & crop traceability" },
  { icon: BarChart3, text: "Real-time analytics & reports" },
  { icon: MapPin, text: "GPS field monitoring & geofencing" },
];

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuperAdmin, setShowSuperAdmin] = useState(false);
  const [superAdminUsername, setSuperAdminUsername] = useState("");
  const [superAdminPassword, setSuperAdminPassword] = useState("");
  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1); // 1: email, 2: otp, 3: new password
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetOtpHint, setResetOtpHint] = useState(""); // OTP shown on-screen when email isn't configured

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(username, password, { blockSuperAdmin: true });
      navigate("/");
    } catch (err) {
      if (!err.response) {
        setError("Cannot connect to server. Please check your internet connection and try again.");
      } else if (err.response?.status === 401) {
        setError(err.response?.data?.detail || "Invalid username or password.");
      } else {
        setError(err.response?.data?.detail || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSuperAdminSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(superAdminUsername, superAdminPassword, { superAdminOnly: true });
      navigate("/");
    } catch (err) {
      if (!err.response) {
        setError("Cannot connect to server. Please check your internet connection and try again.");
      } else if (err.response?.status === 401) {
        setError(err.response?.data?.detail || "Invalid username or password.");
      } else {
        setError(err.response?.data?.detail || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Forgot password handlers
  const handleForgotPasswordSendOtp = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/forgot-password/", { email: resetEmail });
      // When email delivery isn't configured, the backend returns the OTP so we
      // can show it on screen; otherwise it was emailed and no otp is returned.
      setResetOtpHint(res?.data?.email_sent === false && res?.data?.otp ? res.data.otp : "");
      setForgotPasswordStep(2);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (resetOtp.length < 6) return;
    setError("");
    // OTP will be verified by backend during final password reset
    setForgotPasswordStep(3);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (resetNewPassword !== resetConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (resetNewPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/reset-password/", {
        email: resetEmail,
        otp: resetOtp,
        new_password: resetNewPassword,
      });
      // Success - go back to login
      setShowForgotPassword(false);
      setForgotPasswordStep(1);
      setResetEmail("");
      setResetOtp("");
      setResetNewPassword("");
      setResetConfirmPassword("");
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to reset password. Please check your OTP and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-12 text-white lg:flex">
        <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-24 -left-10 h-80 w-80 rounded-full bg-white/5" />
        {/* A grove along the base of the brand panel — the product is a farm,
            so the empty space becomes horizon rather than decoration. */}
        <svg
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full"
          viewBox="0 0 600 160"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 160 L0 118 Q40 96 70 116 Q96 82 126 112 Q158 88 186 118 Q214 96 244 116
               Q276 84 308 114 Q338 94 366 118 Q398 90 428 114 Q456 96 486 118
               Q518 92 548 114 Q574 100 600 116 L600 160 Z"
            fill="#052e16"
            fillOpacity="0.35"
          />
          <path
            d="M0 160 L0 138 Q46 122 88 138 Q130 118 172 138 Q216 122 258 140
               Q302 120 344 138 Q388 124 430 140 Q474 120 516 138 Q558 126 600 140 L600 160 Z"
            fill="#052e16"
            fillOpacity="0.55"
          />
        </svg>
        <div className="relative flex items-center gap-3">
          <LogoMark size={44} />
          <span className="text-2xl font-extrabold tracking-tight">FarmERP Pro</span>
        </div>
        <div className="relative">
          <h1 className="text-4xl font-bold leading-tight">
            Run every farm <br /> from one platform.
          </h1>
          <p className="mt-3 max-w-md text-brand-100/80">
            Digitize workforce, agronomy, inventory, finance and reporting across all your farms —
            online and in the field.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-brand-50">
                <span className="rounded-lg bg-white/10 p-2">
                  <f.icon size={18} />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-brand-200/70">
          <ShieldCheck size={16} /> Secure role-based access · Audit trail · Offline-first
        </p>
      </div>

      {/* Right form */}
      <div className="relative flex w-full items-center justify-center bg-gradient-to-b from-brand-50/40 via-gray-50 to-gray-50 p-6 lg:w-1/2">
        {/* Leaves drifting behind the cards — ties the sign-in panel to the
            brand panel's grove without competing with the form. */}
        <LeafDrift />
        <div className="relative w-full max-w-md">
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <LogoMark size={52} />
            <h1 className="mt-3 text-2xl font-bold text-gray-800">FarmERP Pro</h1>
          </div>

          {/* Forgot Password Flow */}
          {showForgotPassword ? (
            <div className="rounded-2xl border-2 border-blue-500 bg-white p-8 shadow-soft">
              <div className="mb-4 flex items-center gap-2">
                <Mail size={20} className="text-blue-600" />
                <h2 className="text-xl font-bold text-gray-800">Reset Super Admin Password</h2>
              </div>
              <p className="mb-6 text-sm text-gray-500">
                {forgotPasswordStep === 1 && "Enter your email to receive an OTP."}
                {forgotPasswordStep === 2 && "Enter the OTP sent to your email."}
                {forgotPasswordStep === 3 && "Set your new password."}
              </p>

              {forgotPasswordStep === 1 && (
                <form onSubmit={handleForgotPasswordSendOtp} className="space-y-4">
                  {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
                  <Input
                    label="Email Address"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                  <div className="flex gap-3">
                    <Button type="submit" className="flex-1" disabled={loading}>
                      {loading ? "Sending…" : "Send OTP"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setShowForgotPassword(false);
                        setForgotPasswordStep(1);
                        setError("");
                      }}
                    >
                      Back
                    </Button>
                  </div>
                </form>
              )}

              {forgotPasswordStep === 2 && (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
                  {resetOtpHint ? (
                    <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
                      <p className="mb-1">Email delivery isn't set up, so here is your OTP:</p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xl font-bold tracking-widest text-amber-900">{resetOtpHint}</span>
                        <button
                          type="button"
                          onClick={() => setResetOtp(resetOtpHint)}
                          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                          Use code
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">OTP sent to: <span className="font-medium">{resetEmail}</span></p>
                  )}
                  <Input
                    label="OTP Code"
                    type="text"
                    value={resetOtp}
                    onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter 6-digit OTP"
                    maxLength={6}
                    required
                    className="text-center text-lg font-mono tracking-widest"
                  />
                  <div className="flex gap-3">
                    <Button type="submit" className="flex-1" disabled={loading || resetOtp.length < 6}>
                      {loading ? "Verifying…" : "Next"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setForgotPasswordStep(1)}
                    >
                      Back
                    </Button>
                  </div>
                </form>
              )}

              {forgotPasswordStep === 3 && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
                  <Input
                    label="New Password"
                    type="password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                  />
                  <Input
                    label="Confirm New Password"
                    type="password"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                  />
                  <div className="flex gap-3">
                    <Button type="submit" className="flex-1" disabled={loading || resetNewPassword.length < 6}>
                      {loading ? "Resetting…" : "Reset Password"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setForgotPasswordStep(2)}
                    >
                      Back
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <>
              {/* Super Admin Section */}
              {!showSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setShowSuperAdmin(true)}
                  className="group mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white px-4 py-3 text-sm font-semibold text-amber-800 transition hover:border-amber-300 hover:from-amber-100"
                >
                  <Lock size={15} className="text-amber-600 transition group-hover:scale-110" />
                  Super Administrator Login
                </button>
              )}

              {showSuperAdmin ? (
                <div className="relative overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-lift">
                  {/* Heartwood: the owner's door. Gold rather than the app's green
                      so it reads as a different threshold, and matching the MAIN
                      badge on Super Admin Accounts. */}
                  {/* The Keeper's Gate — a scene, not a badge. */}
                  <div className="relative overflow-hidden bg-gradient-to-b from-[#1c1408] via-amber-950 to-amber-900 px-6 pt-5">
                    <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-amber-500/20 blur-3xl" />
                    <div className="pointer-events-none absolute -right-16 -top-10 h-52 w-52 rounded-full bg-lime-500/10 blur-3xl" />
                    <div className="relative mx-auto max-w-[16rem]">
                      <KeeperGate />
                    </div>
                    <div className="relative pb-6 text-center">
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.28em] text-amber-300/80">
                        Restricted
                      </p>
                      <h2 className="mt-1.5 text-xl font-bold tracking-tight text-amber-50">
                        Super Administrator
                      </h2>
                      <p className="mt-1 text-xs text-amber-200/60">
                        The keeper of the grove — full administrative access.
                      </p>
                    </div>
                    {/* gold hairline where the gate meets the form */}
                    <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
                  </div>

                  <form onSubmit={handleSuperAdminSubmit} className="space-y-4 px-8 pb-6 pt-1">
                    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

                    <LeafField
                      label="Super Admin Username"
                      value={superAdminUsername}
                      onChange={(e) => setSuperAdminUsername(e.target.value)}
                      placeholder="Enter super admin username"
                      required
                    />

                    <LeafField
                      label="Password"
                      type="password"
                      value={superAdminPassword}
                      onChange={(e) => setSuperAdminPassword(e.target.value)}
                      placeholder="Enter password"
                      required
                    />

                    {/* Forgot password link */}
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="w-full text-left text-sm text-amber-700 hover:underline"
                    >
                      Forgot your password?
                    </button>

                    <div className="flex gap-3 pt-1">
                      <Button
                        type="submit"
                        className="flex-1 bg-gradient-to-r from-amber-600 to-amber-700 py-2.5 shadow-soft hover:from-amber-700 hover:to-amber-800"
                        disabled={loading}
                      >
                        <Lock size={15} className={loading ? "animate-pulse" : ""} />
                        {loading ? "Signing in…" : "Enter"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setShowSuperAdmin(false);
                          setError("");
                        }}
                      >
                        Back
                      </Button>
                    </div>
                  </form>

                  {/* Super admin accounts are no longer self-served here — the
                      main super administrator creates them from inside the app
                      (Administration → Create Super Admin). */}
                  <p className="mx-8 mb-8 border-t border-amber-100 pt-4 text-xs leading-relaxed text-gray-400">
                    Need a super admin account? Ask the main super administrator to create
                    one for you.
                  </p>
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-lift">
                  <div className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-brand-50/50 to-white px-8 pt-7">
                    <div className="pointer-events-none absolute -left-14 -top-16 h-48 w-48 rounded-full bg-brand-200/25 blur-2xl" />
                    <div className="pointer-events-none absolute -right-16 -top-8 h-44 w-44 rounded-full bg-emerald-300/20 blur-2xl" />
                    <div className="relative flex flex-col items-center">
                      <LoginCrest size={84} />
                      <h2 className="mt-2 text-xl font-bold tracking-tight text-brand-900">
                        Welcome back
                      </h2>
                      <p className="mb-5 mt-1 text-center text-xs text-gray-500">
                        Your field is waiting — sign in to continue.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4 px-8 pb-8 pt-1">
                    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

                    <LeafField
                      label="Username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      required
                    />

                    <LeafField
                      label="Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                    />

                    <div className="flex gap-3 pt-1">
                      <Button
                        type="submit"
                        className="flex-1 bg-gradient-to-r from-brand-600 to-brand-700 py-2.5 shadow-soft hover:from-brand-700 hover:to-brand-800"
                        disabled={loading}
                      >
                        <Leaf size={16} className={loading ? "animate-pulse" : ""} />
                        {loading ? "Signing in…" : "Sign In"}
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <ApkDownload />
    </div>
  );
}
