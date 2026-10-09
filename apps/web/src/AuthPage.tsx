
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = "https://khamma-ghani-api.vercel.app";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
};

type AuthResponse = {
  data?: {
    user: Customer;
    token: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

export default function AuthPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isRegister = mode === "register";

  function switchMode() {
    setMode(isRegister ? "login" : "register");
    setError("");
    setSuccess("");
    setPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const trimmedIdentifier = identifier.trim();

      if (!trimmedIdentifier) {
        throw new Error("Enter your email address or mobile number.");
      }

      const endpoint = isRegister ? "register" : "login";

      const payload = isRegister
        ? {
            name: name.trim(),
            ...(trimmedIdentifier.includes("@")
              ? { email: trimmedIdentifier }
              : { phone: trimmedIdentifier }),
            password,
          }
        : {
            identifier: trimmedIdentifier,
            password,
          };

      const response = await fetch(
        `${API_BASE}/api/v1/auth/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const result = (await response.json()) as AuthResponse;

      if (!response.ok) {
        throw new Error(
          result.error?.message ??
            `Authentication failed (${response.status}).`
        );
      }

      if (!result.data?.token || !result.data.user) {
        throw new Error("Unexpected authentication response.");
      }

      if (
        result.data.user.role !== "CUSTOMER" ||
        result.data.user.status !== "ACTIVE"
      ) {
        // This storefront currently supports customer accounts only.
        // Revoke the newly issued session instead of storing it.
        try {
          await fetch(`${API_BASE}/api/v1/auth/logout`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${result.data.token}`,
            },
          });
        } catch {
          // A failed revocation does not authorize storefront access.
        }

        throw new Error(
          "Please sign in with a customer account."
        );
      }

      // Temporary session storage for this frontend integration.
      // The session ends when this browser tab/session closes.
      sessionStorage.setItem(
        "khamma_customer_token",
        result.data.token
      );

      sessionStorage.setItem(
        "khamma_customer_user",
        JSON.stringify(result.data.user)
      );

      setSuccess("Authentication successful.");

      navigate("/restaurants", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to authenticate. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fffaf4] px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-md">
        <Link
          to="/"
          className="text-sm font-bold text-orange-600"
        >
          ← Back to Khamma Ghani
        </Link>

        <div className="mt-8 rounded-3xl border border-orange-100 bg-white p-6 shadow-xl sm:p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
            Khamma Ghani · Padharo Sa
          </p>

          <h1 className="mt-3 text-3xl font-black">
            {isRegister ? "Create account" : "Welcome back"}
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {isRegister
              ? "Register to order from your favourite restaurants."
              : "Sign in to continue ordering delicious food."}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            {isRegister && (
              <div>
                <label
                  htmlFor="customer-name"
                  className="mb-2 block text-sm font-bold"
                >
                  Full name
                </label>

                <input
                  id="customer-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Enter your full name"
                  className="w-full rounded-xl border border-orange-100 px-4 py-3 outline-none focus:border-orange-500"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="customer-identifier"
                className="mb-2 block text-sm font-bold"
              >
                Email or mobile number
              </label>

              <input
                id="customer-identifier"
                type="text"
                required
                autoComplete={isRegister ? "username" : "username"}
                value={identifier}
                onChange={(event) =>
                  setIdentifier(event.target.value)
                }
                placeholder="Email or 10-digit mobile number"
                className="w-full rounded-xl border border-orange-100 px-4 py-3 outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label
                htmlFor="customer-password"
                className="mb-2 block text-sm font-bold"
              >
                Password
              </label>

              <input
                id="customer-password"
                type="password"
                required
                minLength={isRegister ? 8 : 1}
                maxLength={isRegister ? 128 : undefined}
                autoComplete={
                  isRegister ? "new-password" : "current-password"
                }
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="Enter your password"
                className="w-full rounded-xl border border-orange-100 px-4 py-3 outline-none focus:border-orange-500"
              />

              {isRegister && (
                <p className="mt-2 text-xs text-slate-500">
                  Use at least 8 characters.
                </p>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            {success && (
              <p
                role="status"
                className="rounded-xl bg-green-50 p-3 text-sm text-green-700"
              >
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-orange-600 px-5 py-3 font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Please wait..."
                : isRegister
                  ? "Create account"
                  : "Login"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-600">
            {isRegister
              ? "Already have an account?"
              : "New to Khamma Ghani?"}{" "}
            <button
              type="button"
              onClick={switchMode}
              className="font-bold text-orange-600"
            >
              {isRegister ? "Login" : "Create account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
