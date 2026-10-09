
import { useEffect, useMemo, useState } from "react";
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
  MapPin,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Utensils,
} from "lucide-react";

const API_BASE = "https://khamma-ghani-api.vercel.app";

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

const categories = [
  { label: "Biryani", icon: "🍛" },
  { label: "Pizza", icon: "🍕" },
  { label: "Thali", icon: "🥘" },
  { label: "North Indian", icon: "🫓" },
  { label: "South Indian", icon: "🥞" },
  { label: "Sweets", icon: "🍮" },
];

function Shell({ children }: { children: React.ReactNode }) {
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
                0
              </span>
            </Link>

            <Link
              to="/login"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              Login
            </Link>
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

        <p className="mt-3 text-xs text-slate-400">
          Ordering will be enabled after cart integration.
        </p>
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

      <Route
        path="/cart"
        element={
          <SimplePage
            title="Cart foundation"
            text="The cart will be connected to server-validated prices, quantities, add-ons, coupons and totals."
          />
        }
      />

      <Route
        path="/login"
        element={
          <SimplePage
            title="Secure login"
            text="Authentication and role-based access control will be connected to our existing backend."
          />
        }
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

