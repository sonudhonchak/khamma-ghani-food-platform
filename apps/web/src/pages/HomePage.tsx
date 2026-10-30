import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bike,
  ChefHat,
  Clock3,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  UtensilsCrossed,
} from "lucide-react";

/** Step 55.3: Customer homepage preview. Uses the existing public API and routes. */
const API_BASE = "https://khamma-ghani-api.vercel.app";

interface Restaurant {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  cuisine?: string | null;
  coverImage?: string | null;
  logo?: string | null;
  address?: string | null;
  city?: string | null;
  rating?: string | number | null;
  deliveryTime?: number | null;
  deliveryFee?: string | number | null;
  minimumOrder?: string | number | null;
  status: string;
  isAcceptingOrders: boolean;
  isBusy: boolean;
}

interface FoodImage {
  id?: string;
  url: string;
  altText?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
}

interface Food {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  images?: FoodImage[];
  price: string | number;
  discountedPrice?: string | number | null;
  availability: boolean;
  foodType?: "VEG" | "NON_VEG" | "EGG";
  rating?: string | number | null;
  preparationTime?: number | null;
}

interface MenuCategory {
  id: string;
  name: string;
  foods: Food[];
}

interface RestaurantMenu {
  id: string;
  name: string;
  categories: MenuCategory[];
}

interface FeaturedDish {
  food: Food;
  restaurant: Restaurant;
}

const quickSearches = [
  { name: "Rajasthani", emoji: "🫓" },
  { name: "Thali", emoji: "🥘" },
  { name: "Biryani", emoji: "🍚" },
  { name: "Pizza", emoji: "🍕" },
  { name: "South Indian", emoji: "🥞" },
  { name: "Sweets", emoji: "🍮" },
];

function formatRupees(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "Price on menu";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function validImage(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function getFoodPhotos(food: Food): string[] {
  const photos = [...(food.images ?? [])]
    .filter((item) => validImage(item?.url))
    .sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((item) => item.url);
  if (validImage(food.image)) photos.unshift(food.image);
  return [...new Set(photos)];
}

function FoodPhotoGallery({ food }: { food: Food }) {
  const photos = useMemo(() => getFoodPhotos(food), [food]);
  const [selected, setSelected] = useState(0);
  const [broken, setBroken] = useState(false);
  const photo = photos[Math.min(selected, Math.max(0, photos.length - 1))];

  return (
    <div>
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 via-orange-100 to-rose-50">
        {photo && !broken ? (
          <img
            src={photo}
            alt={`${food.name} - photo ${selected + 1}`}
            className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-orange-500">
            <UtensilsCrossed size={38} strokeWidth={1.5} />
            <span className="text-xs font-semibold">Photo coming soon</span>
          </div>
        )}
        {photos.length > 1 && (
          <span className="absolute right-3 top-3 rounded-full bg-slate-950/75 px-2.5 py-1 text-[11px] font-bold text-white">
            {selected + 1} / {photos.length} photos
          </span>
        )}
      </div>
      {photos.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label={`More photos of ${food.name}`}>
          {photos.slice(0, 5).map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => { setSelected(index); setBroken(false); }}
              aria-label={`View photo ${index + 1} of ${food.name}`}
              aria-pressed={selected === index}
              className={`h-11 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${selected === index ? "border-orange-600" : "border-transparent hover:border-orange-300"}`}
            >
              <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RestaurantTile({ restaurant }: { restaurant: Restaurant }) {
  const accepting = restaurant.isAcceptingOrders && !restaurant.isBusy;
  const rating = Number(restaurant.rating);
  return (
    <Link
      to={`/restaurants/${encodeURIComponent(restaurant.id)}`}
      className="group block overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
    >
      <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-orange-100 via-amber-50 to-rose-100 sm:h-48">
        {validImage(restaurant.coverImage) ? (
          <img src={restaurant.coverImage} alt={restaurant.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <UtensilsCrossed size={48} strokeWidth={1.4} className="text-orange-400" />
        )}
        <span className={`absolute bottom-3 left-3 rounded-full px-3 py-1 text-xs font-extrabold shadow-sm ${accepting ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
          {accepting ? "Accepting orders" : "Currently unavailable"}
        </span>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black text-slate-900">{restaurant.name}</h3>
            <p className="mt-1 truncate text-sm text-slate-500">{restaurant.cuisine || "Local food"}</p>
          </div>
          {Number.isFinite(rating) && rating > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-xs font-bold text-green-800">
              <Star size={12} fill="currentColor" /> {rating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-slate-500">
          {restaurant.city && <span className="inline-flex items-center gap-1"><MapPin size={14} />{restaurant.city}</span>}
          {restaurant.deliveryTime != null && <span className="inline-flex items-center gap-1"><Clock3 size={14} />{restaurant.deliveryTime} min estimated</span>}
          {restaurant.deliveryFee != null && <span>Delivery {formatRupees(restaurant.deliveryFee)}</span>}
        </div>
        <div className="flex items-center justify-between border-t border-orange-100 pt-3 text-sm font-extrabold text-orange-600">
          <span>Explore menu</span><ArrowRight size={17} />
        </div>
      </div>
    </Link>
  );
}

function DishTile({ item }: { item: FeaturedDish }) {
  const { food, restaurant } = item;
  const original = Number(food.price);
  const promotional = food.discountedPrice == null ? NaN : Number(food.discountedPrice);
  const price = Number.isFinite(promotional) && promotional >= 0 && promotional < original ? promotional : original;
  return (
    <article className="rounded-3xl border border-orange-100 bg-white p-3 shadow-sm transition hover:shadow-md">
      <FoodPhotoGallery food={food} />
      <div className="px-2 pb-2 pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-orange-600">{restaurant.name}</p>
        <div className="mt-2 flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-base font-black leading-6 text-slate-900">{food.name}</h3>
          {food.foodType && (
            <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${food.foodType === "VEG" ? "bg-green-50 text-green-800" : food.foodType === "EGG" ? "bg-yellow-50 text-yellow-800" : "bg-red-50 text-red-700"}`}>
              {food.foodType === "NON_VEG" ? "NON-VEG" : food.foodType}
            </span>
          )}
        </div>
        {food.description && <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-500">{food.description}</p>}
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <strong className="text-lg font-black text-slate-900">{formatRupees(price)}</strong>
            {price < original && <span className="text-xs text-slate-400 line-through">{formatRupees(original)}</span>}
          </div>
          <Link to={`/restaurants/${encodeURIComponent(restaurant.id)}`} className="rounded-xl bg-orange-600 px-3 py-2 text-xs font-bold text-white hover:bg-orange-700">
            View menu
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [featured, setFeatured] = useState<FeaturedDish[]>([]);
  const [loading, setLoading] = useState(true);
  const [foodsLoading, setFoodsLoading] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setFoodsLoading(false);
      setError("");
      setFeatured([]);
      try {
        const response = await fetch(`${API_BASE}/api/v1/restaurants`, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Restaurants could not be loaded (${response.status}).`);
        const json: { data?: Restaurant[] } = await response.json();
        if (!Array.isArray(json.data)) throw new Error("Unexpected restaurant response.");
        const activeRestaurants = json.data.filter((r) => r.status === "ACTIVE");
        if (!active) return;
        setRestaurants(activeRestaurants);
        setLoading(false);
        setFoodsLoading(true);

        // Only a few public menus are loaded so the homepage stays lightweight.
        const menus = await Promise.allSettled(
          activeRestaurants.slice(0, 4).map(async (restaurant) => {
            const res = await fetch(`${API_BASE}/api/v1/restaurants/${encodeURIComponent(restaurant.id)}`, {
              headers: { Accept: "application/json" }, signal: controller.signal,
            });
            if (!res.ok) throw new Error("Menu unavailable");
            const result: { data?: RestaurantMenu } = await res.json();
            return { restaurant, menu: result.data };
          }),
        );
        if (!active) return;
        const dishes: FeaturedDish[] = [];
        for (const menuResult of menus) {
          if (menuResult.status !== "fulfilled" || !menuResult.value.menu?.categories) continue;
          const { restaurant, menu } = menuResult.value;
          for (const category of menu.categories) {
            for (const food of category.foods ?? []) {
              if (food.availability) dishes.push({ restaurant, food });
            }
          }
        }
        // Real dish details and images, never fabricated menu items.
        setFeatured(dishes.slice(0, 8));
      } catch (err) {
        if (active && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unable to load restaurants.");
          setLoading(false);
        }
      } finally {
        if (active) setFoodsLoading(false);
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [refresh]);

  const availableCount = restaurants.filter((restaurant) => restaurant.isAcceptingOrders && !restaurant.isBusy).length;
  const heroRestaurant = restaurants.find((restaurant) => validImage(restaurant.coverImage));

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = search.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/restaurants");
  }

  return (
    <main className="min-h-[65vh] bg-[#fffaf4] pb-10 text-slate-900">
      <section className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:pt-10">
        <div className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#e84d0d] via-[#f97316] to-[#ffae3d] shadow-xl shadow-orange-100">
          <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
          <div className="absolute -bottom-32 left-1/4 h-64 w-64 rounded-full bg-amber-200/20 blur-3xl" aria-hidden="true" />
          <div className="relative grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-[1.25fr_0.75fr] lg:p-14">
            <div className="max-w-2xl text-white">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur">
                <Sparkles size={14} /> Khamma Ghani · Padharo Sa
              </div>
              <h1 className="mt-5 text-4xl font-black leading-[1.07] tracking-tight sm:text-5xl lg:text-6xl">
                Delicious food, <span className="text-amber-100">delivered with care.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-orange-50 sm:text-lg">
                Explore local restaurants, discover real menus and order your favourite dishes with easy Cash on Delivery.
              </p>
              <form onSubmit={handleSearch} className="mt-7 flex w-full max-w-xl items-center gap-2 rounded-2xl bg-white p-2 shadow-xl">
                <Search size={21} className="ml-2 shrink-0 text-slate-400" />
                <input
                  aria-label="Search restaurants or cuisines"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search restaurants or cuisines..."
                  className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm text-slate-900 outline-none sm:px-2"
                />
                <button type="submit" className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">Search</button>
              </form>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-orange-50">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck size={16} /> Secure customer login</span>
                <span className="inline-flex items-center gap-1.5"><Bike size={16} /> Delivery tracking</span>
                <span className="inline-flex items-center gap-1.5"><ChefHat size={16} /> Restaurant-prepared food</span>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="mx-auto aspect-square max-w-[340px] overflow-hidden rounded-[2.5rem] border-[10px] border-white/20 bg-white/15 shadow-2xl backdrop-blur">
                {heroRestaurant?.coverImage ? (
                  <img src={heroRestaurant.coverImage} alt={`${heroRestaurant.name} restaurant`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-5 text-white">
                    <span className="text-8xl" role="img" aria-label="Fresh meal">🥘</span>
                    <span className="text-lg font-black">Fresh flavours. Local love.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-orange-100 bg-white px-5 py-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">Restaurant choices</p><p className="mt-1 text-xl font-black">{loading ? "…" : restaurants.length} <span className="text-sm font-medium text-slate-500">listed</span></p></div>
          <div className="rounded-2xl border border-orange-100 bg-white px-5 py-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">Accepting orders</p><p className="mt-1 text-xl font-black">{loading ? "…" : availableCount} <span className="text-sm font-medium text-slate-500">currently listed as available</span></p></div>
          <Link to="/orders" className="flex items-center justify-between rounded-2xl border border-orange-100 bg-white px-5 py-4 shadow-sm hover:border-orange-300"><div><p className="text-xs font-semibold text-slate-500">Already ordered?</p><p className="mt-1 text-base font-black">Track your order</p></div><ArrowRight className="text-orange-600" /></Link>
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Explore</p><h2 className="mt-1 text-2xl font-black sm:text-3xl">What are you craving?</h2><p className="mt-2 text-sm text-slate-500">Discover restaurants by cuisine and speciality.</p></div><Link to="/restaurants" className="hidden items-center gap-1 text-sm font-bold text-orange-600 sm:inline-flex">All restaurants <ArrowRight size={16} /></Link></div>
        <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {quickSearches.map((category) => (
            <Link key={category.name} to={`/search?q=${encodeURIComponent(category.name)}`} className="group rounded-2xl border border-orange-100 bg-white px-2 py-5 text-center shadow-sm transition hover:-translate-y-1 hover:border-orange-300 hover:shadow-md">
              <span className="block text-3xl transition-transform group-hover:scale-110" role="img" aria-label={category.name}>{category.emoji}</span>
              <span className="mt-3 block text-xs font-bold text-slate-800 sm:text-sm">{category.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Freshly listed</p><h2 className="mt-1 text-2xl font-black sm:text-3xl">Explore local restaurants</h2><p className="mt-2 text-sm text-slate-500">See their real menus, delivery details and availability.</p></div><Link to="/restaurants" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-orange-600">View all <ArrowRight size={16} /></Link></div>
        {loading ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">{[1, 2, 3].map((key) => <div key={key} className="h-72 animate-pulse rounded-3xl bg-orange-100" />)}</div>
        ) : error ? (
          <div role="alert" className="mt-6 rounded-2xl border border-red-100 bg-white p-6"><p className="font-bold text-red-700">{error}</p><button type="button" onClick={() => setRefresh((n) => n + 1)} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Try again</button></div>
        ) : restaurants.length ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{restaurants.slice(0, 6).map((restaurant) => <RestaurantTile key={restaurant.id} restaurant={restaurant} />)}</div>
        ) : (
          <div className="mt-6 rounded-2xl border border-orange-100 bg-white p-8 text-center text-sm text-slate-600">No active restaurants are listed yet.</div>
        )}
      </section>

      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">From real restaurant menus</p><h2 className="mt-1 text-2xl font-black sm:text-3xl">Dishes to discover</h2><p className="mt-2 text-sm text-slate-500">Browse actual food listings. Some dishes include several photos.</p></div></div>
        {foodsLoading ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">{[1, 2, 3, 4].map((key) => <div key={key} className="h-80 animate-pulse rounded-3xl bg-orange-100" />)}</div>
        ) : featured.length ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{featured.map((item) => <DishTile key={`${item.restaurant.id}-${item.food.id}`} item={item} />)}</div>
        ) : (
          <div className="mt-6 rounded-2xl border border-orange-100 bg-white p-8 text-center"><UtensilsCrossed size={30} className="mx-auto text-orange-500" /><h3 className="mt-3 font-black">Food photos will appear here</h3><p className="mt-2 text-sm text-slate-500">Dishes are displayed when active restaurants publish available menu items. Additional photos are shown whenever they are provided by the restaurant.</p><Link to="/restaurants" className="mt-4 inline-flex rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white">Explore menus</Link></div>
        )}
      </section>

      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-5 rounded-3xl bg-slate-950 p-7 text-white sm:flex-row sm:items-center sm:p-10">
          <div><p className="text-xs font-black uppercase tracking-widest text-orange-300">Padharo Sa</p><h2 className="mt-2 text-2xl font-black">Your next meal is just a few taps away.</h2><p className="mt-2 text-sm text-slate-300">Choose your restaurant, add food to your cart and complete checkout securely.</p></div>
          <Link to="/restaurants" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600">Order food <ArrowRight size={17} /></Link>
        </div>
      </section>
    </main>
  );
}
