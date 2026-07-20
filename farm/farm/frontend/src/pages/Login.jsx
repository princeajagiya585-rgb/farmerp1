import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Leaf, Users, BarChart3, MapPin, ShieldCheck, Lock, Mail } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, Input } from "../components/ui";
import { LogoMark } from "../components/Logo";
import ApkDownload from "../components/ApkDownload";
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
      <div className="flex w-full items-center justify-center bg-gray-50 p-6 lg:w-1/2">
        <div className="w-full max-w-md">
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
                  className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-semibold text-purple-700 hover:bg-purple-100"
                >
                  <Lock size={16} />
                  Super Administrator Login
                </button>
              )}

              {showSuperAdmin ? (
                <div className="rounded-2xl border-2 border-purple-500 bg-white p-8 shadow-soft">
                  <div className="mb-4 flex items-center gap-2">
                    <Lock size={20} className="text-purple-600" />
                    <h2 className="text-xl font-bold text-gray-800">Super Administrator Login</h2>
                  </div>
                  <p className="mb-6 text-sm text-gray-500">
                    Access all administrative features.
                  </p>

                  <form onSubmit={handleSuperAdminSubmit} className="space-y-4">
                    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

                    <Input
                      label="Super Admin Username"
                      value={superAdminUsername}
                      onChange={(e) => setSuperAdminUsername(e.target.value)}
                      placeholder="Enter super admin username"
                      required
                    />

                    <Input
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
                      className="w-full text-left text-sm text-brand-600 hover:underline"
                    >
                      Forgot your password?
                    </button>

                    <div className="flex gap-3">
                      <Button type="submit" className="flex-1" disabled={loading}>
                        {loading ? "Signing in…" : "Sign In"}
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
                  <p className="mt-6 border-t border-gray-100 pt-5 text-xs leading-relaxed text-gray-400">
                    Need a super admin account? Ask the main super administrator to create
                    one for you.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-soft">
                  <h2 className="text-xl font-bold text-gray-800">Welcome back</h2>
                  <p className="mb-6 text-sm text-gray-500">Sign in to your account to continue.</p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

                    <Input
                      label="Username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      required
                    />

                    <Input
                      label="Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                    />

                    <div className="flex gap-3">
                      <Button type="submit" className="flex-1" disabled={loading}>
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
