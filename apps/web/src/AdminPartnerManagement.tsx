
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  Bike,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
  Store,
  UserPlus,
} from "lucide-react";

type ApiFailure = {
  error?: {
    code?: string;
    message?: string;
  };
};

type PendingRestaurant = {
  id: string;
  name: string;
  slug: string;
  cuisine: string;
  city: string;
  address: string;
  status: string;
  ownerId: string;
  createdAt: string;
  isAcceptingOrders: boolean;
};

type OwnerForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

type RestaurantForm = {
  name: string;
  slug: string;
  description: string;
  cuisine: string;
  address: string;
  city: string;
  openingTime: string;
  closingTime: string;
  deliveryTime: string;
  deliveryFee: string;
  minimumOrder: string;
  logo: string;
  coverImage: string;
};

type RiderForm = OwnerForm & {
  vehicleType: string;
  vehicleNumber: string;
};

const API = "https://khamma-ghani-api.vercel.app";

const inputClass =
  "mt-1 block w-full rounded-xl border border-orange-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100";

const labelClass =
  "block text-sm font-semibold text-slate-700";

async function adminApi<T>(
  token: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(
      `${API}/api/v1/admin${path}`,
      {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.body !== undefined
            ? {
                "Content-Type": "application/json",
              }
            : {}),
        },
        ...(options.body !== undefined
          ? {
              body: JSON.stringify(options.body),
            }
          : {}),
        cache: "no-store",
      },
    );
  } catch {
    throw new Error(
      "Network error. A request may have reached the server; verify before retrying.",
    );
  }

  const result = (await response
    .json()
    .catch(() => ({}))) as {
    data?: T;
  } & ApiFailure;

  if (!response.ok) {
    if (
      response.status === 401 ||
      response.status === 403
    ) {
      throw new Error(
        "Administrator access denied. Please sign out and sign in again.",
      );
    }

    if (
      response.status === 404 &&
      path === "/restaurant-onboardings"
    ) {
      throw new Error(
        "Restaurant onboarding API is not deployed yet. Do not create an owner separately; deploy the matching admin backend route first.",
      );
    }

    throw new Error(
      result.error?.message ??
        `Request failed (${response.status}).`,
    );
  }

  if (result.data === undefined) {
    throw new Error(
      "The Admin API returned an unexpected response.",
    );
  }

  return result.data;
}

function Input({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  placeholder,
  minLength,
  maxLength,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <label className={labelClass}>
      {label}

      <input
        className={inputClass}
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        minLength={minLength}
        maxLength={maxLength}
        autoComplete={autoComplete}
        onChange={(event) =>
          onChange(event.target.value)
        }
      />
    </label>
  );
}

export default function AdminPartnerManagement({
  token,
  onRiderCreated,
}: {
  token: string;
  onRiderCreated: () => void;
}) {
  const [tab, setTab] = useState<
    "restaurants" | "riders"
  >("restaurants");

  const [owner, setOwner] = useState<OwnerForm>({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  const [restaurant, setRestaurant] =
    useState<RestaurantForm>({
      name: "",
      slug: "",
      description: "",
      cuisine: "",
      address: "",
      city: "",
      openingTime: "09:00",
      closingTime: "22:00",
      deliveryTime: "30",
      deliveryFee: "0",
      minimumOrder: "0",
      logo: "",
      coverImage: "",
    });

  const [rider, setRider] = useState<RiderForm>({
    name: "",
    email: "",
    phone: "",
    password: "",
    vehicleType: "Bike",
    vehicleNumber: "",
  });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const [pending, setPending] = useState<
    PendingRestaurant[]
  >([]);

  const [pendingLoading, setPendingLoading] =
    useState(false);

  const [pendingError, setPendingError] =
    useState("");

  const [approvingId, setApprovingId] =
    useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError("");

    try {
      const items = await adminApi<
        PendingRestaurant[]
      >(token, "/restaurants/pending");

      if (!Array.isArray(items)) {
        throw new Error(
          "Unexpected pending restaurant list.",
        );
      }

      setPending(items);
    } catch (error) {
      setPendingError(
        error instanceof Error
          ? error.message
          : "Unable to load pending restaurants.",
      );
    } finally {
      setPendingLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  function setOwnerField<
    K extends keyof OwnerForm
  >(key: K, value: OwnerForm[K]) {
    setOwner((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function setRestaurantField<
    K extends keyof RestaurantForm
  >(key: K, value: RestaurantForm[K]) {
    setRestaurant((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function setRiderField<
    K extends keyof RiderForm
  >(key: K, value: RiderForm[K]) {
    setRider((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function createRestaurant(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (saving) return;

    setFormError("");
    setSuccess("");

    if (
      !owner.email.trim() &&
      !owner.phone.trim()
    ) {
      setFormError(
        "Owner email or mobile number is required.",
      );
      return;
    }

    const slug = restaurant.slug
      .trim()
      .toLowerCase();

    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    ) {
      setFormError(
        "Use lowercase letters, numbers and hyphens for restaurant slug.",
      );
      return;
    }

    if (owner.password.length < 8) {
      setFormError(
        "Owner password must have at least 8 characters.",
      );
      return;
    }

    if (
      !window.confirm(
        `Create a real owner account and PENDING restaurant for ${restaurant.name.trim()}? This writes to the database.`,
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      const created = await adminApi<{
        restaurant: {
          id: string;
          name: string;
          status: string;
        };
        owner: {
          id: string;
          name: string;
        };
      }>(
        token,
        "/restaurant-onboardings",
        {
          method: "POST",
          body: {
            owner: {
              name: owner.name.trim(),
              ...(owner.email.trim()
                ? {
                    email: owner.email.trim(),
                  }
                : {}),
              ...(owner.phone.trim()
                ? {
                    phone: owner.phone.trim(),
                  }
                : {}),
              password: owner.password,
            },

            restaurant: {
              name: restaurant.name.trim(),
              slug,
              cuisine: restaurant.cuisine.trim(),
              address: restaurant.address.trim(),
              city: restaurant.city.trim(),
              openingTime:
                restaurant.openingTime,
              closingTime:
                restaurant.closingTime,
              deliveryTime: Number(
                restaurant.deliveryTime,
              ),
              deliveryFee: Number(
                restaurant.deliveryFee,
              ),
              minimumOrder: Number(
                restaurant.minimumOrder,
              ),

              ...(restaurant.description.trim()
                ? {
                    description:
                      restaurant.description.trim(),
                  }
                : {}),

              ...(restaurant.logo.trim()
                ? {
                    logo: restaurant.logo.trim(),
                  }
                : {}),

              ...(restaurant.coverImage.trim()
                ? {
                    coverImage:
                      restaurant.coverImage.trim(),
                  }
                : {}),
            },
          },
        },
      );

      setSuccess(
        `${created.restaurant.name} created with status ${created.restaurant.status}. Owner ${created.owner.name} can use the Restaurant Portal after onboarding; review approvals below.`,
      );

      setOwner({
        name: "",
        email: "",
        phone: "",
        password: "",
      });

      setRestaurant((prev) => ({
        ...prev,
        name: "",
        slug: "",
        description: "",
        address: "",
        logo: "",
        coverImage: "",
      }));

      void loadPending();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to onboard restaurant.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createRider(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (saving) return;

    setFormError("");
    setSuccess("");

    if (rider.password.length < 8) {
      setFormError(
        "Rider password must have at least 8 characters.",
      );
      return;
    }

    if (
      !window.confirm(
        `Create a real delivery rider account for ${rider.name.trim()}? This writes to the database.`,
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      const created = await adminApi<{
        name: string;
        status: string;
      }>(token, "/delivery-partners", {
        method: "POST",
        body: {
          name: rider.name.trim(),
          email: rider.email.trim(),
          password: rider.password,

          ...(rider.phone.trim()
            ? {
                phone: rider.phone.trim(),
              }
            : {}),

          ...(rider.vehicleType.trim()
            ? {
                vehicleType:
                  rider.vehicleType.trim(),
              }
            : {}),

          ...(rider.vehicleNumber.trim()
            ? {
                vehicleNumber:
                  rider.vehicleNumber.trim(),
              }
            : {}),
        },
      });

      setSuccess(
        `Rider ${created.name} created. The new rider starts unavailable until explicitly enabled.`,
      );

      setRider({
        name: "",
        email: "",
        phone: "",
        password: "",
        vehicleType: "Bike",
        vehicleNumber: "",
      });

      onRiderCreated();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to create rider.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function approveRestaurant(
    item: PendingRestaurant,
  ) {
    if (approvingId) return;

    if (
      !window.confirm(
        `Approve ${item.name}? Confirm its ownership, FSSAI details, food safety and business readiness first.`,
      )
    ) {
      return;
    }

    setApprovingId(item.id);
    setPendingError("");
    setSuccess("");

    try {
      await adminApi(
        token,
        `/restaurants/${encodeURIComponent(
          item.id,
        )}/approve`,
        {
          method: "PATCH",
        },
      );

      setSuccess(
        `${item.name} approved. Verify its menu and whether it is accepting orders before launch.`,
      );

      await loadPending();
    } catch (error) {
      setPendingError(
        error instanceof Error
          ? error.message
          : "Unable to approve restaurant.",
      );
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <section
      className="space-y-6"
      aria-label="Partner onboarding"
    >
      <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-orange-600">
              <UserPlus size={22} />
              <span className="text-xs font-black uppercase tracking-widest">
                Partner management
              </span>
            </div>

            <h2 className="mt-2 text-2xl font-black">
              Onboard restaurants & riders
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Create accounts with admin authorization.
              Existing delivery assignment and COD tools
              remain below.
            </p>
          </div>

          <span className="rounded-full bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
            <ShieldCheck
              size={14}
              className="mr-1 inline"
            />
            Admin only
          </span>
        </div>

        <div
          className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-orange-50 p-1.5"
          role="tablist"
          aria-label="Partner type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "restaurants"}
            onClick={() => {
              setTab("restaurants");
              setFormError("");
              setSuccess("");
            }}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold ${
              tab === "restaurants"
                ? "bg-white text-orange-700 shadow"
                : "text-slate-600"
            }`}
          >
            <Store size={17} />
            Restaurants
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === "riders"}
            onClick={() => {
              setTab("riders");
              setFormError("");
              setSuccess("");
            }}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold ${
              tab === "riders"
                ? "bg-white text-orange-700 shadow"
                : "text-slate-600"
            }`}
          >
            <Bike size={17} />
            Delivery riders
          </button>
        </div>

        {success && (
          <p
            role="status"
            className="mt-5 flex items-start gap-2 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800"
          >
            <CheckCircle2 size={18} />
            {success}
          </p>
        )}

        {formError && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700"
          >
            {formError} If the network failed,
            confirm whether an account was
            created before retrying.
          </p>
        )}

        {tab === "restaurants" ? (
          <form
            onSubmit={(event) =>
              void createRestaurant(event)
            }
            className="mt-6 space-y-6"
          >
            <fieldset
              disabled={saving}
              className="space-y-4"
            >
              <legend className="mb-3 text-lg font-black">
                Restaurant Owner
              </legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Owner full name"
                  required
                  value={owner.name}
                  onChange={(v) =>
                    setOwnerField("name", v)
                  }
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />

                <Input
                  label="Owner email (optional if mobile provided)"
                  type="email"
                  value={owner.email}
                  onChange={(v) =>
                    setOwnerField("email", v)
                  }
                  autoComplete="email"
                />

                <Input
                  label="Owner 10-digit mobile (optional if email provided)"
                  value={owner.phone}
                  onChange={(v) =>
                    setOwnerField("phone", v)
                  }
                  placeholder="9876543210"
                />

                <Input
                  label="Owner password (min. 8 characters)"
                  required
                  type="password"
                  minLength={8}
                  maxLength={128}
                  value={owner.password}
                  onChange={(v) =>
                    setOwnerField("password", v)
                  }
                  autoComplete="new-password"
                />
              </div>

              <p className="text-xs text-slate-500">
                Use the owner's own contact details and consent.
                Never email or display passwords in the dashboard.
              </p>
            </fieldset>

            <fieldset
              disabled={saving}
              className="space-y-4 border-t border-orange-100 pt-5"
            >
              <legend className="mb-3 text-lg font-black">
                Restaurant details
              </legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Restaurant name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={restaurant.name}
                  onChange={(v) => {
                    const previous =
                      restaurant.name
                        .toLowerCase()
                        .trim()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, "");

                    setRestaurant((prev) => ({
                      ...prev,
                      name: v,
                      slug:
                        prev.slug === previous
                          ? v
                              .toLowerCase()
                              .trim()
                              .replace(/[^a-z0-9]+/g, "-")
                              .replace(/^-|-$/g, "")
                          : prev.slug,
                    }));
                  }}
                  placeholder="SHREE BALAJI RESTAURENT"
                />

                <Input
                  label="Unique slug"
                  required
                  value={restaurant.slug}
                  onChange={(v) =>
                    setRestaurantField("slug", v)
                  }
                  placeholder="shree-balaji-restaurant-nachana"
                />

                <Input
                  label="Cuisine"
                  required
                  value={restaurant.cuisine}
                  onChange={(v) =>
                    setRestaurantField("cuisine", v)
                  }
                  placeholder="Rajasthani, North Indian"
                />

                <Input
                  label="Town / city"
                  required
                  value={restaurant.city}
                  onChange={(v) =>
                    setRestaurantField("city", v)
                  }
                  placeholder="Nachana"
                />

                <Input
                  label="Street address / village details"
                  required
                  value={restaurant.address}
                  onChange={(v) =>
                    setRestaurantField("address", v)
                  }
                />

                <Input
                  label="Description (optional)"
                  value={restaurant.description}
                  onChange={(v) =>
                    setRestaurantField(
                      "description",
                      v,
                    )
                  }
                  maxLength={1000}
                />

                <Input
                  label="Opening time"
                  required
                  type="time"
                  value={restaurant.openingTime}
                  onChange={(v) =>
                    setRestaurantField(
                      "openingTime",
                      v,
                    )
                  }
                />

                <Input
                  label="Closing time"
                  required
                  type="time"
                  value={restaurant.closingTime}
                  onChange={(v) =>
                    setRestaurantField(
                      "closingTime",
                      v,
                    )
                  }
                />

                <Input
                  label="Delivery time (minutes)"
                  required
                  type="number"
                  value={restaurant.deliveryTime}
                  onChange={(v) =>
                    setRestaurantField(
                      "deliveryTime",
                      v,
                    )
                  }
                />

                <Input
                  label="Delivery fee (₹)"
                  required
                  type="number"
                  value={restaurant.deliveryFee}
                  onChange={(v) =>
                    setRestaurantField(
                      "deliveryFee",
                      v,
                    )
                  }
                />

                <Input
                  label="Minimum order (₹)"
                  required
                  type="number"
                  value={restaurant.minimumOrder}
                  onChange={(v) =>
                    setRestaurantField(
                      "minimumOrder",
                      v,
                    )
                  }
                />

                <Input
                  label="Logo URL (optional)"
                  type="url"
                  value={restaurant.logo}
                  onChange={(v) =>
                    setRestaurantField("logo", v)
                  }
                />

                <Input
                  label="Cover photo URL (optional)"
                  type="url"
                  value={restaurant.coverImage}
                  onChange={(v) =>
                    setRestaurantField(
                      "coverImage",
                      v,
                    )
                  }
                />
              </div>
            </fieldset>

            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              New restaurants begin PENDING.
              Administrator approval, menu review,
              food safety checks, and service-area
              verification are required before launch.
              The combined onboarding API must be
              deployed before this form will work.
            </p>

            <button
              disabled={saving}
              className="w-full rounded-xl bg-orange-600 px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {saving
                ? "Creating restaurant..."
                : "Create restaurant & owner"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(event) =>
              void createRider(event)
            }
            className="mt-6 space-y-5"
          >
            <h3 className="text-lg font-black">
              Create Delivery Rider
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Rider name"
                required
                minLength={2}
                maxLength={100}
                value={rider.name}
                onChange={(v) =>
                  setRiderField("name", v)
                }
                autoComplete="name"
              />

              <Input
                label="Rider email"
                required
                type="email"
                value={rider.email}
                onChange={(v) =>
                  setRiderField("email", v)
                }
                autoComplete="email"
              />

              <Input
                label="10-digit mobile (optional)"
                value={rider.phone}
                onChange={(v) =>
                  setRiderField("phone", v)
                }
              />

              <Input
                label="Password (min. 8 characters)"
                required
                minLength={8}
                maxLength={128}
                type="password"
                value={rider.password}
                onChange={(v) =>
                  setRiderField("password", v)
                }
                autoComplete="new-password"
              />

              <Input
                label="Vehicle type"
                value={rider.vehicleType}
                onChange={(v) =>
                  setRiderField("vehicleType", v)
                }
                placeholder="Bike, scooter or bicycle"
              />

              <Input
                label="Vehicle registration (optional)"
                value={rider.vehicleNumber}
                onChange={(v) =>
                  setRiderField(
                    "vehicleNumber",
                    v,
                  )
                }
              />
            </div>

            <p className="text-xs text-slate-500">
              New riders are unavailable by default.
              Enable availability only after checking
              rider identity and readiness.
            </p>

            <button
              disabled={saving}
              className="w-full rounded-xl bg-orange-600 px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {saving
                ? "Creating rider..."
                : "Add delivery rider"}
            </button>
          </form>
        )}
      </div>

      <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck
                className="text-orange-600"
                size={20}
              />

              <h2 className="text-xl font-black">
                Pending restaurant approvals
              </h2>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              Review ownership, documentation
              and menu before approving.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadPending()}
            disabled={pendingLoading}
            aria-label="Refresh pending restaurants"
            className="rounded-xl border border-orange-200 p-3 text-orange-700 disabled:opacity-50"
          >
            <RefreshCw size={17} />
          </button>
        </div>

        {pendingLoading && (
          <p
            className="mt-4 text-sm"
            aria-busy="true"
          >
            Loading applications...
          </p>
        )}

        {pendingError && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700"
          >
            {pendingError}
          </p>
        )}

        {!pendingLoading &&
          !pendingError &&
          pending.length === 0 && (
            <p className="mt-5 text-sm text-slate-500">
              No pending restaurants.
            </p>
          )}

        <div className="mt-5 space-y-3">
          {pending.map((item) => (
            <article
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 p-4"
            >
              <div>
                <h3 className="font-bold">
                  {item.name}
                </h3>

                <p className="mt-1 text-xs text-slate-600">
                  {item.address}, {item.city}
                  {" · "}
                  {item.cuisine}
                </p>

                <p className="mt-1 text-xs text-amber-800">
                  PENDING · Owner {item.ownerId}
                </p>
              </div>

              <button
                type="button"
                disabled={!!approvingId}
                onClick={() =>
                  void approveRestaurant(item)
                }
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {approvingId === item.id
                  ? "Approving..."
                  : "Approve"}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
