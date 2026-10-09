
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  Bike,
  ChevronRight,
  Clock3,
  LogOut,
  MapPin,
  Search,
  ShieldCheck,
  ShoppingBag,
  Minus,
  Plus,
  Trash2,
  Store,
  UserRound,
  Utensils,
} from "lucide-react";

const API_BASE = "https://khamma-ghani-api.vercel.app";
const TOKEN_KEY = "khamma_customer_token";
const USER_KEY = "khamma_customer_user";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  profileImage?: string | null;
};

type Session = {
  token: string;
  user: Customer;
};

type ApiError = {
  error?: {
    code?: string;
    message?: string;
  };
};

type AuthResponse = ApiError & {
  data?: {
    token: string;
    user: Customer;
  };
};

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  coverImage: string | null;
  cuisine: string;
  address: string;
  city: string;
  rating: string;
  deliveryTime: number;
  deliveryFee: string;
  minimumOrder: string;
  status: string;
  openingTime: string;
  closingTime: string;
  isAcceptingOrders: boolean;
  isBusy: boolean;
};

type FoodImage = {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
};

type FoodChoice = {
  id: string;
  name: string;
  price: string;
};

type FoodOption = {
  id: string;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  choices: FoodChoice[];
};

type FoodItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  discountedPrice: string | null;
  image: string | null;
  foodType: "VEG" | "NON_VEG" | "EGG";
  availability: boolean;
  preparationTime: number;
  rating: string;
  images: FoodImage[];
  options: FoodOption[];
};

type MenuCategory = {
  id: string;
  name: string;
  image: string | null;
  sortOrder: number;
  foods: FoodItem[];
};

type RestaurantMenu = {
  id: string;
  name: string;
  slug: string;
  status: string;
  categories: MenuCategory[];
};

type CartFood = { id?: string; name?: string; image?: string | null; price?: string | number };
type CartItem = {
  id: string;
  foodItemId: string;
  quantity: number;
  unitPrice?: string | number;
  totalPrice?: string | number;
  foodItem?: CartFood;
  food?: CartFood;
};
type CartData = {
  items: CartItem[];
  itemCount: number;
  subtotal: string | number;
  deliveryFee: string | number;
  total: string | number;
};
type CartResponse = ApiError & { data?: CartData };

const CART_CHANGE_EVENT = "khamma-cart-change";
function money(value: string | number | undefined) {
  const amount = Number(value ?? 0);
  return `₹${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`;
}

async function cartRequest(path: string, method = "GET", body?: object): Promise<CartData | null> {
  const session = readSession();
  if (!session) throw new Error("Please log in to use your cart.");
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1/cart${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Cannot connect to the cart service. Please try again.");
  }
  const result = (await response.json().catch(() => ({}))) as CartResponse;
  if (!response.ok) {
    if (response.status === 401) throw new Error("Your session has expired. Please log in again.");
    if (response.status === 409) throw new Error(result.error?.message ?? "Your cart contains food from another restaurant. Clear it before adding food from this restaurant.");
    throw new Error(result.error?.message ?? `Cart request failed (${response.status}).`);
  }
  return result.data ?? null;
}

function notifyCartChanged() {
  window.dispatchEvent(new Event(CART_CHANGE_EVENT));
}

function useCartData() {
  const session = useCustomerSession();
  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener(CART_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CART_CHANGE_EVENT, refresh);
  }, []);
  useEffect(() => {
    let active = true;
    if (!session) {
      setCart(null);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    void cartRequest("").then((data) => {
      if (active) setCart(data);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : "Unable to load cart.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session?.token, version]);
  return { cart, loading, error, refresh: notifyCartChanged };
}

const categories = [
  { label: "Biryani", icon: "🍛" },
  { label: "Pizza", icon: "🍕" },
  { label: "Thali", icon: "🥘" },
  { label: "North Indian", icon: "🫓" },
  { label: "South Indian", icon: "🥞" },
  { label: "Sweets", icon: "🍮" },
];

function readSession(): Session | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const rawUser = sessionStorage.getItem(USER_KEY);

    if (!token || !rawUser) return null;

    const user = JSON.parse(rawUser) as Customer;

    if (
      !user ||
      typeof user.id !== "string" ||
      typeof user.name !== "string" ||
      user.role !== "CUSTOMER" ||
      user.status !== "ACTIVE"
    ) {
      return null;
    }

    return { token, user };
  } catch {
    return null;
  }
}

function saveSession(session: Session) {
  sessionStorage.setItem(TOKEN_KEY, session.token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(session.user));
  window.dispatchEvent(new Event("khamma-auth-change"));
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("khamma-auth-change"));
}

function useCustomerSession() {
  const [session, setSession] = useState<Session | null>(readSession);

  useEffect(() => {
    const update = () => setSession(readSession());

    window.addEventListener("khamma-auth-change", update);

    return () => {
      window.removeEventListener("khamma-auth-change", update);
    };
  }, []);

  return session;
}

async function logoutCustomer() {
  const session = readSession();

  // Clear the local session immediately, even if the network fails.
  clearSession();

  if (!session) return;

  try {
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
        Accept: "application/json",
      },
    });
  } catch {
    // Server revocation may fail if offline.
  }
}

function Shell({ children }: { children: ReactNode }) {
  const session = useCustomerSession();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const { cart } = useCartData();

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await logoutCustomer();
      navigate("/", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fffaf4] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-orange-100/80 bg-[#fffaf4]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="shrink-0">
            <div className="text-xl font-black tracking-tight text-orange-600">
              Khamma Ghani
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
              Padharo Sa
            </div>
          </Link>

          <Link
            to="/restaurants"
            className="hidden items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-orange-50 sm:flex"
          >
            <MapPin size={17} className="text-orange-600" />
            <span className="text-sm font-semibold">
              Explore restaurants
            </span>
            <ChevronRight size={15} />
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/search"
              className="rounded-xl p-2.5 hover:bg-orange-50"
              aria-label="Search"
            >
              <Search size={20} />
            </Link>

            <Link
              to="/cart"
              className="relative rounded-xl p-2.5 hover:bg-orange-50"
              aria-label="Cart"
            >
              <ShoppingBag size={20} />
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[9px] font-bold text-white">
                {cart?.itemCount ?? 0}
              </span>
            </Link>
            {session && <Link to="/orders" className="rounded-xl px-2 py-2 text-xs font-bold text-orange-700 hover:bg-orange-50 sm:text-sm">My orders</Link>}

            {session ? (
              <div className="flex items-center gap-2">
                <span
                  className="hidden max-w-32 items-center gap-1 truncate text-sm font-bold text-slate-700 sm:inline-flex"
                  title={session.user.name}
                >
                  <UserRound size={16} />
                  {session.user.name}
                </span>

                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={loggingOut}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">
                    {loggingOut ? "..." : "Logout"}
                  </span>
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {children}

      <footer className="mt-16 border-t border-orange-100 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          <div>
            <div className="text-lg font-black text-orange-600">
              Khamma Ghani
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              A modern local food-delivery platform built for
              real customers and real restaurants.
            </p>
          </div>

          <div>
            <h3 className="font-bold">Platform</h3>
            <Link
              to="/restaurants"
              className="mt-3 block text-sm text-slate-500"
            >
              Restaurants
            </Link>
            <Link
              to="/search"
              className="mt-2 block text-sm text-slate-500"
            >
              Search
            </Link>
          </div>

          <div>
            <h3 className="font-bold">Partners</h3>
            <p className="mt-3 text-sm text-slate-500">
              Restaurant partners
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Delivery partners
            </p>
          </div>

          <div>
            <h3 className="font-bold">Trust</h3>
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              <ShieldCheck size={16} />
              Secure architecture
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
              <Bike size={16} />
              Local delivery
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function useRestaurants() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${API_BASE}/api/v1/restaurants`,
          {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            `Unable to load restaurants (${response.status}).`
          );
        }

        const result: { data: Restaurant[] } =
          await response.json();

        if (!Array.isArray(result.data)) {
          throw new Error("Unexpected restaurant response.");
        }

        if (!controller.signal.aborted) {
          setRestaurants(
            result.data.filter(
              (restaurant) => restaurant.status === "ACTIVE"
            )
          );
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load restaurants."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [retry]);

  return {
    restaurants,
    loading,
    error,
    retry: () => setRetry((value) => value + 1),
  };
}

function RestaurantCard({
  restaurant,
}: {
  restaurant: Restaurant;
}) {
  const canOrder =
    restaurant.isAcceptingOrders && !restaurant.isBusy;

  return (
    <article className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <Link
        to={`/restaurants/${restaurant.id}`}
        className="block"
      >
        <div className="relative h-40 overflow-hidden bg-gradient-to-br from-orange-100 via-amber-50 to-orange-200">
          {restaurant.coverImage ? (
            <img
              src={restaurant.coverImage}
              alt={restaurant.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Utensils
                size={52}
                className="text-orange-400"
              />
            </div>
          )}

          <span className="absolute bottom-3 left-3 rounded-xl bg-white/95 px-3 py-2 text-xs font-bold">
            {restaurant.city}
          </span>

          <span className="absolute bottom-3 right-3 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
            {restaurant.deliveryTime} min
          </span>
        </div>
      </Link>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-black">
            {restaurant.name}
          </h3>

          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
              canOrder
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {canOrder
              ? "Accepting orders"
              : restaurant.isBusy
                ? "Busy"
                : "Not accepting orders"}
          </span>
        </div>

        <p className="mt-2 text-sm text-slate-500">
          {restaurant.cuisine}
        </p>

        <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
          <MapPin size={14} />
          {restaurant.address}
        </p>

        <div className="mt-4 flex flex-wrap gap-3 border-t border-orange-100 pt-4 text-xs font-semibold text-slate-600">
          <span>Delivery ₹{restaurant.deliveryFee}</span>
          <span>Min. order ₹{restaurant.minimumOrder}</span>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Hours: {restaurant.openingTime}–
          {restaurant.closingTime}
        </p>

        <Link
          to={`/restaurants/${restaurant.id}`}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700"
        >
          View menu
          <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}

function RestaurantResults({
  restaurants,
  loading,
  error,
  retry,
}: {
  restaurants: Restaurant[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  if (loading) {
    return (
      <div
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
      >
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-80 animate-pulse rounded-3xl bg-orange-100"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-3xl border border-red-100 bg-white p-8 text-center"
      >
        <h3 className="font-bold text-red-700">
          Restaurants couldn't be loaded
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          {error}
        </p>
        <button
          onClick={retry}
          className="mt-4 rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (restaurants.length === 0) {
    return (
      <div className="rounded-3xl border border-orange-100 bg-white p-10 text-center">
        <Store
          size={36}
          className="mx-auto text-orange-500"
        />
        <h3 className="mt-4 text-lg font-bold">
          No restaurants found
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Try another restaurant name or cuisine.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {restaurants.map((restaurant) => (
        <RestaurantCard
          key={restaurant.id}
          restaurant={restaurant}
        />
      ))}
    </div>
  );
}

function Home() {
  const {
    restaurants,
    loading,
    error,
    retry,
  } = useRestaurants();

  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  return (
    <Shell>
      <main>
        <section className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-14">
          <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-orange-500 via-orange-600 to-amber-500 p-6 text-white shadow-2xl shadow-orange-200 sm:p-10 lg:p-14">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur">
                <Utensils size={14} />
                Fresh food. Local taste.
              </div>

              <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Padharo Sa, your next meal is waiting.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-7 text-orange-50 sm:text-lg">
                Discover trusted restaurants, order your
                favourites and follow every step of your
                delivery.
              </p>

              <form
                className="mt-7 flex max-w-xl items-center gap-2 rounded-2xl bg-white p-2 shadow-xl"
                onSubmit={(event) => {
                  event.preventDefault();
                  navigate(
                    `/search?q=${encodeURIComponent(search)}`
                  );
                }}
              >
                <Search
                  className="ml-2 shrink-0 text-slate-400"
                  size={21}
                />

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-slate-900 outline-none"
                  placeholder="Search restaurants or cuisines..."
                  aria-label="Search restaurants"
                />

                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
                >
                  Search
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">
                Explore
              </p>
              <h2 className="mt-1 text-2xl font-black">
                What are you craving?
              </h2>
            </div>

            <Link
              to="/search"
              className="hidden items-center gap-1 text-sm font-bold text-orange-600 sm:flex"
            >
              View all
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {categories.map((category) => (
              <Link
                key={category.label}
                to={`/search?q=${encodeURIComponent(
                  category.label
                )}`}
                className="rounded-2xl border border-orange-100 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="text-3xl">
                  {category.icon}
                </div>
                <div className="mt-2 text-xs font-bold sm:text-sm">
                  {category.label}
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">
                Near you
              </p>
              <h2 className="mt-1 text-2xl font-black">
                Popular restaurants
              </h2>
            </div>

            <Link
              to="/restaurants"
              className="hidden items-center gap-1 text-sm font-bold text-orange-600 sm:flex"
            >
              See all
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="mt-5">
            <RestaurantResults
              restaurants={restaurants}
              loading={loading}
              error={error}
              retry={retry}
            />
          </div>
        </section>
      </main>
    </Shell>
  );
}

function RestaurantsPage({
  searchMode = false,
}: {
  searchMode?: boolean;
}) {
  const {
    restaurants,
    loading,
    error,
    retry,
  } = useRestaurants();

  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) return restaurants;

    return restaurants.filter((restaurant) =>
      [
        restaurant.name,
        restaurant.cuisine,
        restaurant.city,
        restaurant.description ?? "",
      ].some((value) =>
        value.toLowerCase().includes(term)
      )
    );
  }, [restaurants, query]);

  return (
    <Shell>
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">
          Khamma Ghani
        </p>

        <h1 className="mt-2 text-3xl font-black sm:text-4xl">
          {searchMode
            ? "Search restaurants"
            : "Explore restaurants"}
        </h1>

        <p className="mt-3 text-sm text-slate-500">
          Discover restaurants and cuisines available on
          our platform.
        </p>

        <div className="mt-7 flex items-center gap-3 rounded-2xl border border-orange-100 bg-white px-4 py-3">
          <Search
            size={20}
            className="text-orange-500"
          />

          <input
            value={query}
            onChange={(event) => {
              const value = event.target.value;

              setParams(
                value ? { q: value } : {},
                { replace: true }
              );
            }}
            className="w-full bg-transparent text-sm outline-none"
            placeholder="Search by restaurant or cuisine"
            aria-label="Search restaurants"
          />
        </div>

        <div className="mt-8">
          {!loading && !error && (
            <p className="mb-4 text-sm font-semibold text-slate-500">
              {filtered.length} restaurant
              {filtered.length === 1 ? "" : "s"} found
            </p>
          )}

          <RestaurantResults
            restaurants={filtered}
            loading={loading}
            error={error}
            retry={retry}
          />
        </div>
      </main>
    </Shell>
  );
}

function FoodCard({ food }: { food: FoodItem }) {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [cartMessage, setCartMessage] = useState("");
  const [cartError, setCartError] = useState("");
  const hasOptions = (food.options?.length ?? 0) > 0;
  async function handleAdd() {
    if (adding) return;
    if (!readSession()) {
      navigate("/login");
      return;
    }
    if (hasOptions) {
      setCartError("Customisable dishes aren't supported in the cart yet. Please choose an item without options.");
      return;
    }
    setAdding(true);
    setCartError("");
    setCartMessage("");
    try {
      await cartRequest("/items", "POST", { foodItemId: food.id, quantity: 1 });
      notifyCartChanged();
      setCartMessage("Added to cart!");
    } catch (err) {
      setCartError(err instanceof Error ? err.message : "Unable to add item.");
    } finally {
      setAdding(false);
    }
  }
  const originalPrice = Number(food.price);
  const salePrice =
    food.discountedPrice === null
      ? originalPrice
      : Number(food.discountedPrice);

  const discounted = salePrice < originalPrice;

  const image =
    food.image ||
    food.images?.find((item) => item.isPrimary)?.url ||
    food.images?.[0]?.url ||
    null;

  const foodLabel =
    food.foodType === "VEG"
      ? "Veg"
      : food.foodType === "EGG"
        ? "Egg"
        : "Non-veg";

  return (
    <article className="flex gap-4 rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
      <div className="min-w-0 flex-1">
        <span
          className={`inline-block rounded-lg px-2 py-1 text-xs font-bold ${
            food.foodType === "VEG"
              ? "bg-green-100 text-green-700"
              : food.foodType === "EGG"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-red-100 text-red-700"
          }`}
        >
          {foodLabel}
        </span>

        <h3 className="mt-3 text-lg font-black">
          {food.name}
        </h3>

        {food.description && (
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {food.description}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-lg font-black">
            ₹{salePrice}
          </span>

          {discounted && (
            <span className="text-sm text-slate-400 line-through">
              ₹{originalPrice}
            </span>
          )}
        </div>

        <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
          <Clock3 size={14} />
          Preparation: {food.preparationTime} min
        </p>

        {food.options?.length > 0 && (
          <p className="mt-2 text-xs font-semibold text-orange-700">
            Customisation available
          </p>
        )}

        <button type="button" onClick={() => void handleAdd()}
          disabled={adding || !food.availability || hasOptions}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Plus size={16} /> {adding ? "Adding..." : hasOptions ? "Customisation coming soon" : !food.availability ? "Unavailable" : "Add to cart"}
        </button>
        {cartMessage && <p role="status" className="mt-2 text-xs font-semibold text-green-700">{cartMessage}</p>}
        {cartError && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{cartError}</p>}
      </div>

      <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-orange-50 sm:h-36 sm:w-36">
        {image ? (
          <img
            src={image}
            alt={food.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Utensils
            size={36}
            className="text-orange-400"
          />
        )}
      </div>
    </article>
  );
}

function RestaurantMenuPage() {
  const { restaurantId } =
    useParams<{ restaurantId: string }>();

  const [menu, setMenu] =
    useState<RestaurantMenu | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] =
    useState<string | null>(null);

  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMenu() {
      if (!restaurantId) {
        setError("Restaurant ID is missing.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setMenu(null);

      try {
        const response = await fetch(
          `${API_BASE}/api/v1/restaurants/${encodeURIComponent(
            restaurantId
          )}`,
          {
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "Restaurant menu not found."
              : `Unable to load menu (${response.status}).`
          );
        }

        const result: { data: RestaurantMenu } =
          await response.json();

        if (
          !result.data ||
          !Array.isArray(result.data.categories)
        ) {
          throw new Error("Unexpected menu response.");
        }

        if (!controller.signal.aborted) {
          setMenu(result.data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load restaurant menu."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadMenu();

    return () => controller.abort();
  }, [restaurantId, retry]);

  const totalFoods =
    menu?.categories.reduce(
      (total, category) =>
        total + category.foods.length,
      0
    ) ?? 0;

  return (
    <Shell>
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Link
          to="/restaurants"
          className="inline-flex items-center gap-2 text-sm font-bold text-orange-600"
        >
          ← All restaurants
        </Link>

        {loading ? (
          <div
            className="mt-8 space-y-4"
            aria-busy="true"
          >
            <div className="h-32 animate-pulse rounded-3xl bg-orange-100" />
            <div className="h-48 animate-pulse rounded-3xl bg-orange-100" />
          </div>
        ) : error ? (
          <div
            role="alert"
            className="mt-8 rounded-3xl border border-red-100 bg-white p-8 text-center"
          >
            <h1 className="text-xl font-bold text-red-700">
              Menu couldn't be loaded
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              {error}
            </p>

            <button
              onClick={() =>
                setRetry((value) => value + 1)
              }
              className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white"
            >
              Try again
            </button>
          </div>
        ) : menu ? (
          <>
            <section className="mt-6 rounded-3xl bg-gradient-to-br from-orange-500 to-amber-500 p-7 text-white sm:p-10">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-100">
                Restaurant menu
              </p>

              <h1 className="mt-2 text-3xl font-black sm:text-4xl">
                {menu.name}
              </h1>

              <p className="mt-3 text-sm text-orange-50">
                {totalFoods} available food item
                {totalFoods === 1 ? "" : "s"}
              </p>
            </section>

            {totalFoods === 0 ? (
              <div className="mt-8 rounded-3xl border border-orange-100 bg-white p-10 text-center">
                <Utensils
                  size={36}
                  className="mx-auto text-orange-500"
                />

                <h2 className="mt-4 text-xl font-bold">
                  No menu items available yet
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  Please check back later or explore another
                  restaurant.
                </p>
              </div>
            ) : (
              <div className="mt-8 space-y-10">
                {menu.categories
                  .filter(
                    (category) =>
                      category.foods.length > 0
                  )
                  .map((category) => (
                    <section key={category.id}>
                      <h2 className="mb-5 text-2xl font-black">
                        {category.name}
                      </h2>

                      <div className="grid gap-4 md:grid-cols-2">
                        {category.foods.map((food) => (
                          <FoodCard
                            key={food.id}
                            food={food}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
              </div>
            )}
          </>
        ) : null}
      </main>
    </Shell>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const session = useCustomerSession();

  const [mode, setMode] =
    useState<"login" | "register">("login");

  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isRegister = mode === "register";

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const value = identifier.trim();

      if (!value) {
        throw new Error(
          "Please enter your email or mobile number."
        );
      }

      if (isRegister && name.trim().length < 2) {
        throw new Error(
          "Please enter your full name."
        );
      }

      if (isRegister && password.length < 8) {
        throw new Error(
          "Password must contain at least 8 characters."
        );
      }

      const endpoint = isRegister ? "register" : "login";

      const payload = isRegister
        ? {
            name: name.trim(),
            ...(value.includes("@")
              ? { email: value }
              : { phone: value }),
            password,
          }
        : {
            identifier: value,
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

      const result =
        (await response.json()) as AuthResponse;

      if (!response.ok) {
        throw new Error(
          result.error?.message ??
            `Authentication failed (${response.status}).`
        );
      }

      const user = result.data?.user;
      const token = result.data?.token;

      if (!user || !token) {
        throw new Error(
          "The server returned an invalid authentication response."
        );
      }

      if (
        user.role !== "CUSTOMER" ||
        user.status !== "ACTIVE"
      ) {
        try {
          await fetch(
            `${API_BASE}/api/v1/auth/logout`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
        } catch {
          // Never save non-customer sessions.
        }

        throw new Error(
          "Please sign in with an active customer account."
        );
      }

      saveSession({ token, user });

      navigate("/restaurants", {
        replace: true,
      });
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

  if (session) {
    return (
      <Shell>
        <main className="mx-auto max-w-md px-4 py-16">
          <div className="rounded-3xl border border-orange-100 bg-white p-8 text-center shadow-sm">
            <UserRound
              size={42}
              className="mx-auto text-orange-600"
            />

            <h1 className="mt-4 text-2xl font-black">
              Welcome, {session.user.name}
            </h1>

            <p className="mt-3 text-sm text-slate-500">
              You're signed in to your customer account.
            </p>

            <Link
              to="/restaurants"
              className="mt-6 inline-flex rounded-xl bg-orange-600 px-5 py-3 font-bold text-white"
            >
              Explore restaurants
            </Link>
          </div>
        </main>
      </Shell>
    );
  }

  return (
    <Shell>
      <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
        <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-xl shadow-orange-100/40 sm:p-8">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
            <UserRound size={28} />
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">
            Khamma Ghani · Padharo Sa
          </p>

          <h1 className="mt-3 text-3xl font-black">
            {isRegister
              ? "Create your account"
              : "Welcome back"}
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-500">
            {isRegister
              ? "Register as a customer to enjoy delicious food from local restaurants."
              : "Sign in to continue your food ordering journey."}
          </p>

          <div className="mt-7 grid grid-cols-2 rounded-xl bg-orange-50 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setPassword("");
              }}
              className={`rounded-lg px-4 py-3 text-sm font-bold ${
                !isRegister
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError("");
                setPassword("");
              }}
              className={`rounded-lg px-4 py-3 text-sm font-bold ${
                isRegister
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Register
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-7 space-y-5"
          >
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
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  placeholder="Enter your full name"
                  className="w-full rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500"
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
                autoComplete="username"
                value={identifier}
                onChange={(event) =>
                  setIdentifier(event.target.value)
                }
                placeholder="Email or 10-digit mobile number"
                className="w-full rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500"
              />

              {isRegister && (
                <p className="mt-2 text-xs text-slate-500">
                  Use a valid email or Indian mobile number.
                </p>
              )}
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
                type={showPassword ? "text" : "password"}
                required
                minLength={isRegister ? 8 : 1}
                maxLength={isRegister ? 128 : undefined}
                autoComplete={
                  isRegister
                    ? "new-password"
                    : "current-password"
                }
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="Enter your password"
                className="w-full rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500"
              />

              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {isRegister
                    ? "Minimum 8 characters."
                    : "Enter your account password."}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((value) => !value)
                  }
                  className="text-xs font-bold text-orange-600"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Please wait..."
                : isRegister
                  ? "Create account"
                  : "Login"}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {isRegister
              ? "Already have an account?"
              : "New to Khamma Ghani?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(isRegister ? "login" : "register");
                setError("");
                setPassword("");
              }}
              className="font-bold text-orange-600"
            >
              {isRegister ? "Login" : "Create account"}
            </button>
          </p>

          <div className="mt-7 flex items-center justify-center gap-2 border-t border-orange-100 pt-5 text-xs text-slate-500">
            <ShieldCheck
              size={16}
              className="text-orange-600"
            />
            Authentication powered by Khamma Ghani API
          </div>
        </div>
      </main>
    </Shell>
  );
}

function CartPage() {
  const session = useCustomerSession();
  const { cart, loading, error, refresh } = useCartData();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  async function changeItem(item: CartItem, quantity: number) {
    if (busy) return;
    setBusy(item.id);
    setActionError("");
    try {
      if (quantity <= 0) await cartRequest(`/items/${encodeURIComponent(item.id)}`, "DELETE");
      else await cartRequest(`/items/${encodeURIComponent(item.id)}`, "PATCH", { quantity });
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update item.");
    } finally { setBusy(null); }
  }
  async function clearCart() {
    if (busy || !window.confirm("Remove all items from your cart?")) return;
    setBusy("all");
    setActionError("");
    try { await cartRequest("", "DELETE"); refresh(); }
    catch (err) { setActionError(err instanceof Error ? err.message : "Unable to clear cart."); }
    finally { setBusy(null); }
  }
  return <Shell>
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black">Your cart</h1>
      <p className="mt-2 text-sm text-slate-500">Prices and totals are calculated by our server.</p>
      {!session ? <div className="mt-8 rounded-3xl bg-white p-8 text-center shadow-sm">
        <p className="mb-5 text-slate-600">Please log in to view your cart.</p>
        <Link to="/login" className="rounded-xl bg-orange-600 px-5 py-3 font-bold text-white">Login</Link>
      </div> : loading ? <p className="mt-8" aria-busy="true">Loading your cart...</p>
      : error ? <div role="alert" className="mt-8 rounded-2xl bg-red-50 p-5 text-red-700">{error}<button onClick={refresh} className="ml-4 font-bold underline">Retry</button></div>
      : !cart || !cart.items?.length ? <div className="mt-8 rounded-3xl bg-white p-10 text-center shadow-sm">
        <ShoppingBag className="mx-auto text-orange-500" size={40}/>
        <p className="mt-4 font-bold">Your cart is empty</p>
        <Link to="/restaurants" className="mt-5 inline-flex rounded-xl bg-orange-600 px-5 py-3 font-bold text-white">Explore restaurants</Link>
      </div> : <div className="mt-7 space-y-5">
        {actionError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{actionError}</p>}
        <div className="space-y-3">
          {cart.items.map(item => {
            const food = item.foodItem ?? item.food;
            return <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-100 bg-white p-5">
              <div className="min-w-0 flex-1">
                <h2 className="font-bold">{food?.name ?? "Food item"}</h2>
                {item.unitPrice !== undefined && <p className="mt-1 text-sm text-slate-500">{money(item.unitPrice)} each</p>}
                {item.totalPrice !== undefined && <p className="mt-1 font-black text-orange-600">{money(item.totalPrice)}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button aria-label="Decrease quantity" disabled={!!busy} onClick={() => void changeItem(item, item.quantity - 1)} className="rounded-lg border p-2 disabled:opacity-40"><Minus size={17}/></button>
                <span className="min-w-6 text-center font-bold">{item.quantity}</span>
                <button aria-label="Increase quantity" disabled={!!busy || item.quantity >= 99} onClick={() => void changeItem(item, item.quantity + 1)} className="rounded-lg border p-2 disabled:opacity-40"><Plus size={17}/></button>
                <button aria-label="Remove item" disabled={!!busy} onClick={() => void changeItem(item, 0)} className="ml-2 rounded-lg p-2 text-red-600 disabled:opacity-40"><Trash2 size={18}/></button>
              </div>
            </article>;
          })}
        </div>
        <section className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-black">Order summary</h2>
          <div className="flex justify-between py-2 text-slate-600"><span>Subtotal</span><span>{money(cart.subtotal)}</span></div>
          <div className="flex justify-between py-2 text-slate-600"><span>Delivery fee</span><span>{money(cart.deliveryFee)}</span></div>
          <div className="mt-3 flex justify-between border-t pt-4 text-xl font-black"><span>Total</span><span>{money(cart.total)}</span></div>
          <Link to="/checkout" className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 font-bold text-white hover:bg-orange-700">Proceed to checkout <ArrowRight size={18}/></Link>
          <button disabled={!!busy} onClick={() => void clearCart()} className="mt-5 text-sm font-bold text-red-600 disabled:opacity-40">Clear cart</button>
        </section>
      </div>}
    </main>
  </Shell>;
}

type DeliveryAddress = {
  id: string;
  label: string;
  name: string;
  phone: string;
  addressLine: string;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

type OrderSummary = {
  id: string;
  orderNumber: string;
  orderStatus: string;
  paymentMethod: string;
  paymentStatus: string;
  total: string | number;
  subtotal?: string | number;
  deliveryFee?: string | number;
  createdAt: string;
  addressLineSnapshot?: string;
  addressCitySnapshot?: string;
  addressStateSnapshot?: string;
  addressPincodeSnapshot?: string;
  restaurant?: { id: string; name: string };
  items?: Array<{ id: string; nameSnapshot: string; quantity: number; priceSnapshot: string | number }>;
  statusHistory?: Array<{ id: string; status: string; note?: string | null; createdAt: string }>;
};

async function customerRequest<T>(path: string, method = "GET", body?: object): Promise<T> {
  const session = readSession();
  if (!session) throw new Error("Please log in to continue.");
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Cannot connect to the server. Please try again.");
  }
  const result = (await response.json().catch(() => ({}))) as ApiError & { data?: T };
  if (!response.ok) {
    if (response.status === 401) throw new Error("Your session has expired. Please log in again.");
    throw new Error(result.error?.message ?? `Request failed (${response.status}).`);
  }
  if (result.data === undefined) throw new Error("Unexpected server response.");
  return result.data;
}

const emptyAddress = {
  label: "Home", name: "", phone: "", addressLine: "", landmark: "",
  city: "", state: "Rajasthan", pincode: "", isDefault: true,
};

function CheckoutPage() {
  const session = useCustomerSession();
  const navigate = useNavigate();
  const { cart, loading: cartLoading, error: cartError, refresh } = useCartData();
  const [addresses, setAddresses] = useState<DeliveryAddress[]>([]);
  const [addressId, setAddressId] = useState("");
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [addressError, setAddressError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyAddress });
  const [saving, setSaving] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [notes, setNotes] = useState("");
  const [actionError, setActionError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!session) { setLoadingAddresses(false); return; }
    let active = true;
    setLoadingAddresses(true);
    setAddressError("");
    void customerRequest<DeliveryAddress[]>("/addresses")
      .then((list) => {
        if (!active) return;
        setAddresses(list);
        setAddressId((previous) =>
          list.some((a) => a.id === previous) ? previous : (list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? "")
        );
      })
      .catch((error: unknown) => { if (active) setAddressError(error instanceof Error ? error.message : "Unable to load addresses."); })
      .finally(() => { if (active) setLoadingAddresses(false); });
    return () => { active = false; };
  }, [session?.token, reload]);

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setActionError("");
    try {
      const address = await customerRequest<DeliveryAddress>("/addresses", "POST", {
        ...form, name: form.name.trim(), label: form.label.trim(),
        phone: form.phone.trim(), addressLine: form.addressLine.trim(),
        landmark: form.landmark.trim(), city: form.city.trim(),
        state: form.state.trim(), pincode: form.pincode.trim(),
      });
      setAddresses((previous) => [address, ...previous.map((item) => ({ ...item, isDefault: address.isDefault ? false : item.isDefault }))]);
      setAddressId(address.id);
      setForm({ ...emptyAddress });
      setShowForm(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to save address.");
    } finally { setSaving(false); }
  }

  async function placeOrder() {
    if (placing || !addressId || !cart?.items?.length) return;
    if (!window.confirm("Place this Cash on Delivery order? A real order will be created.")) return;
    setPlacing(true);
    setActionError("");
    try {
      // Recheck the cart immediately before submission; the server revalidates it again.
      const latestCart = await cartRequest("");
      if (!latestCart?.items?.length) throw new Error("Your cart is empty. Please add items first.");
      const result = await customerRequest<{ order: OrderSummary; message: string }>("/orders", "POST", {
        addressId, paymentMethod: "COD", ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (!result.order?.id) throw new Error("Order created, but confirmation details were missing. Check My Orders before trying again.");
      notifyCartChanged();
      navigate(`/orders/${encodeURIComponent(result.order.id)}`, { replace: true });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to place order. Please check My Orders before retrying.");
      refresh();
    } finally { setPlacing(false); }
  }

  return <Shell><main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <Link to="/cart" className="text-sm font-bold text-orange-600">← Back to cart</Link>
    <h1 className="mt-4 text-3xl font-black">Checkout</h1>
    <p className="mt-2 text-sm text-slate-500">Secure checkout · Cash on Delivery</p>
    {!session ? <div className="mt-8 rounded-3xl bg-white p-8"><p>Please log in to check out.</p><Link to="/login" className="mt-4 inline-flex rounded-xl bg-orange-600 px-5 py-3 font-bold text-white">Login</Link></div>
    : <div className="mt-7 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <section className="rounded-3xl border border-orange-100 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">Delivery address</h2><button type="button" onClick={() => setShowForm((v) => !v)} className="rounded-xl bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700">{showForm ? "Cancel" : "+ Add address"}</button></div>
          {loadingAddresses ? <p className="mt-4 text-sm">Loading addresses...</p> : addressError ? <div role="alert" className="mt-4 text-sm text-red-700">{addressError} <button onClick={() => setReload((n) => n + 1)} className="font-bold underline">Retry</button></div> : !addresses.length && !showForm ? <p className="mt-4 text-sm text-slate-600">Add a delivery address to continue.</p> : null}
          <div className="mt-4 space-y-3">{addresses.map((address) => <label key={address.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${addressId === address.id ? "border-orange-500 bg-orange-50" : "border-orange-100"}`}>
            <input type="radio" name="checkout-address" checked={addressId === address.id} onChange={() => setAddressId(address.id)} className="accent-orange-600" />
            <span className="min-w-0 text-sm"><span className="font-black">{address.label}</span>{address.isDefault && <span className="ml-2 text-xs font-semibold text-orange-700">Default</span>}<span className="mt-1 block">{address.name} · {address.phone}</span><span className="mt-1 block text-slate-500">{address.addressLine}{address.landmark ? `, ${address.landmark}` : ""}, {address.city}, {address.state} - {address.pincode}</span></span>
          </label>)}</div>
          {showForm && <form onSubmit={(event) => void saveAddress(event)} className="mt-5 grid gap-3 sm:grid-cols-2">
            {([ ["label", "Label (Home/Work)"], ["name", "Recipient name"], ["phone", "10-digit mobile number"], ["addressLine", "House number, street and area"], ["landmark", "Landmark (optional)"], ["city", "City"], ["state", "State"], ["pincode", "6-digit PIN code"] ] as const).map(([key, label]) => <label key={key} className={key === "addressLine" ? "sm:col-span-2" : ""}><span className="mb-1 block text-xs font-bold">{label}</span><input className="w-full rounded-xl border border-orange-200 px-3 py-3 text-sm outline-none focus:border-orange-500" value={form[key]} onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))} required={key !== "landmark"} minLength={key === "addressLine" ? 5 : key === "name" || key === "city" || key === "state" ? 2 : undefined} maxLength={key === "addressLine" ? 300 : key === "landmark" ? 150 : key === "label" ? 50 : 100} pattern={key === "phone" ? "[6-9][0-9]{9}" : key === "pincode" ? "[1-9][0-9]{5}" : undefined} inputMode={key === "phone" || key === "pincode" ? "numeric" : undefined} /></label>)}
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm((prev) => ({ ...prev, isDefault: event.target.checked }))}/> Make default address</label>
            <button disabled={saving} type="submit" className="rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50 sm:col-span-2">{saving ? "Saving..." : "Save address"}</button>
          </form>}
        </section>
        <section className="rounded-3xl border border-orange-100 bg-white p-6"><h2 className="text-xl font-black">Payment method</h2><div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">✓ Cash on Delivery (COD)</div><p className="mt-3 text-xs text-slate-500">Online payments are not available yet.</p></section>
        <section className="rounded-3xl border border-orange-100 bg-white p-6"><label htmlFor="checkout-notes" className="font-black">Delivery instructions (optional)</label><textarea id="checkout-notes" maxLength={500} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="For example: Call before delivery" className="mt-3 w-full rounded-xl border border-orange-200 p-3 text-sm outline-none focus:border-orange-500"/></section>
      </div>
      <section className="h-fit rounded-3xl border border-orange-100 bg-white p-6 lg:sticky lg:top-24"><h2 className="text-xl font-black">Order review</h2>
        {cartLoading ? <p className="mt-4 text-sm">Loading cart...</p> : cartError ? <p role="alert" className="mt-4 text-sm text-red-700">{cartError}</p> : !cart?.items?.length ? <div className="mt-4 text-sm">Your cart is empty. <Link to="/restaurants" className="font-bold text-orange-600">Browse restaurants</Link></div> : <>
          <div className="mt-4 space-y-3 border-b pb-4">{cart.items.map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><span>{item.foodItem?.name ?? item.food?.name ?? "Food item"} × {item.quantity}</span><span className="font-semibold">{item.totalPrice !== undefined ? money(item.totalPrice) : "—"}</span></div>)}</div>
          <div className="mt-4 flex justify-between text-sm"><span>Subtotal</span><span>{money(cart.subtotal)}</span></div><div className="mt-3 flex justify-between text-sm"><span>Delivery fee</span><span>{money(cart.deliveryFee)}</span></div><div className="mt-4 flex justify-between border-t pt-4 text-lg font-black"><span>Estimated total</span><span>{money(cart.total)}</span></div>
          <p className="mt-3 text-xs text-slate-500">Final total and restaurant minimum are validated by the server when you place the order.</p>
        </>}
        {actionError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
        <button type="button" onClick={() => void placeOrder()} disabled={placing || saving || cartLoading || !!cartError || loadingAddresses || !!addressError || !addressId || !cart?.items?.length} className="mt-5 w-full rounded-xl bg-orange-600 px-5 py-3.5 font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{placing ? "Placing order..." : "Place order · Cash on Delivery"}</button>
        <Link to="/orders" className="mt-4 block text-center text-sm font-bold text-orange-600">View my orders</Link>
      </section>
    </div>}
  </main></Shell>;
}

function OrdersPage() {
  const session = useCustomerSession();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!session) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError("");
    void customerRequest<OrderSummary[]>("/orders").then((list) => { if (active) setOrders(list); }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Unable to load orders."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session?.token, retry]);
  return <Shell><main className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><h1 className="text-3xl font-black">My orders</h1>
    {!session ? <p className="mt-6">Please <Link to="/login" className="font-bold text-orange-600">log in</Link> to see your orders.</p> : loading ? <p className="mt-6">Loading orders...</p> : error ? <p role="alert" className="mt-6 text-red-700">{error} <button onClick={() => setRetry((n) => n + 1)} className="font-bold underline">Retry</button></p> : !orders.length ? <div className="mt-6 rounded-3xl bg-white p-8"><p>No orders yet.</p><Link to="/restaurants" className="mt-4 inline-block font-bold text-orange-600">Explore restaurants</Link></div> : <div className="mt-6 space-y-4">{orders.map((order) => <Link to={`/orders/${encodeURIComponent(order.id)}`} key={order.id} className="block rounded-2xl border border-orange-100 bg-white p-5 hover:border-orange-400"><div className="flex flex-wrap items-center justify-between gap-3"><span className="font-black">{order.orderNumber}</span><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">{order.orderStatus}</span></div><p className="mt-2 text-sm text-slate-500">{order.restaurant?.name ?? "Restaurant"} · {new Date(order.createdAt).toLocaleString("en-IN")}</p><p className="mt-3 font-black">{money(order.total)}</p></Link>)}</div>}
  </main></Shell>;
}

function OrderDetailsPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const session = useCustomerSession();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!session || !orderId) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError("");
    void customerRequest<OrderSummary>(`/orders/${encodeURIComponent(orderId)}`).then((data) => { if (active) setOrder(data); }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Unable to load order."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session?.token, orderId, retry]);
  return <Shell><main className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><Link to="/orders" className="text-sm font-bold text-orange-600">← My orders</Link><h1 className="mt-4 text-3xl font-black">Order details</h1>
    {!session ? <p className="mt-6">Please <Link to="/login" className="font-bold text-orange-600">log in</Link> to view this order.</p> : loading ? <p className="mt-6">Loading order...</p> : error ? <p role="alert" className="mt-6 text-red-700">{error} <button onClick={() => setRetry((n) => n + 1)} className="font-bold underline">Retry</button></p> : order ? <div className="mt-6 space-y-5">
      <section className="rounded-3xl border border-green-100 bg-white p-6"><p className="text-xs font-bold uppercase tracking-widest text-green-700">Order recorded</p><h2 className="mt-2 text-2xl font-black">{order.orderNumber}</h2><p className="mt-2 text-sm text-slate-500">{new Date(order.createdAt).toLocaleString("en-IN")}</p><p className="mt-3 font-bold">Status: {order.orderStatus}</p><p className="mt-1 text-sm">Payment: {order.paymentMethod} · {order.paymentStatus}</p><p className="mt-3 text-2xl font-black text-orange-600">{money(order.total)}</p></section>
      <section className="rounded-3xl border border-orange-100 bg-white p-6"><h3 className="text-xl font-black">Items</h3><div className="mt-4 space-y-3">{order.items?.map((item) => <div key={item.id} className="flex justify-between gap-4 text-sm"><span>{item.nameSnapshot} × {item.quantity}</span><span className="font-bold">{money(Number(item.priceSnapshot) * item.quantity)}</span></div>)}</div>{order.addressLineSnapshot && <p className="mt-5 border-t pt-4 text-sm text-slate-600">Deliver to: {order.addressLineSnapshot}, {order.addressCitySnapshot}, {order.addressStateSnapshot} - {order.addressPincodeSnapshot}</p>}</section>
      <section className="rounded-3xl border border-orange-100 bg-white p-6"><h3 className="text-xl font-black">Status history</h3><div className="mt-4 space-y-3">{order.statusHistory?.map((event) => <div key={event.id} className="border-l-2 border-orange-400 pl-4"><p className="font-bold">{event.status}</p><p className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString("en-IN")}</p>{event.note && <p className="mt-1 text-sm text-slate-600">{event.note}</p>}</div>)}</div></section>
    </div> : null}
  </main></Shell>;
}

function SimplePage({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <Shell>
      <main className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
          <Store />
        </div>

        <h1 className="mt-6 text-4xl font-black">
          {title}
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-slate-500">
          {text}
        </p>

        <Link
          to="/"
          className="mt-7 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white"
        >
          Back home
        </Link>
      </main>
    </Shell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={<Home />}
      />

      <Route
        path="/restaurants"
        element={<RestaurantsPage />}
      />

      <Route
        path="/restaurants/:restaurantId"
        element={<RestaurantMenuPage />}
      />

      <Route
        path="/search"
        element={<RestaurantsPage searchMode />}
      />

      <Route path="/cart" element={<CartPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/:orderId" element={<OrderDetailsPage />} />

      <Route
        path="/login"
        element={<AuthPage />}
      />

      <Route
        path="*"
        element={
          <SimplePage
            title="Page not found"
            text="The page you requested does not exist."
          />
        }
      />
    </Routes>
  );
}
