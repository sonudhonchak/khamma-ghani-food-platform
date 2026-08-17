import { Link, Route, Routes } from "react-router-dom";
import {
  ArrowRight,
  Bike,
  ChevronRight,
  Clock3,
  MapPin,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Utensils
} from "lucide-react";

const categories = [
  { label: "Biryani", icon: "🍛" },
  { label: "Pizza", icon: "🍕" },
  { label: "Thali", icon: "🥘" },
  { label: "North Indian", icon: "🫓" },
  { label: "South Indian", icon: "🥞" },
  { label: "Sweets", icon: "🍮" }
];

const restaurants = [
  { name: "Marwar Rasoi", cuisine: "Rajasthani • North Indian", rating: "4.7", time: "25–30 min", price: "₹₹" },
  { name: "Thar Tadka", cuisine: "Biryani • Mughlai", rating: "4.5", time: "30–35 min", price: "₹₹" },
  { name: "Padharo Kitchen", cuisine: "Thali • Indian", rating: "4.8", time: "20–25 min", price: "₹₹" }
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fffaf4] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-orange-100/80 bg-[#fffaf4]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="shrink-0">
            <div className="text-xl font-black tracking-tight text-orange-600">Khamma Ghani</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">Padharo Sa</div>
          </Link>

          <button className="hidden items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-orange-50 sm:flex">
            <MapPin size={17} className="text-orange-600" />
            <span className="max-w-40 truncate text-sm font-semibold">Choose your location</span>
            <ChevronRight size={15} className="text-slate-400" />
          </button>

          <div className="ml-auto flex items-center gap-2">
            <Link to="/search" className="rounded-xl p-2.5 hover:bg-orange-50" aria-label="Search">
              <Search size={20} />
            </Link>
            <Link to="/cart" className="relative rounded-xl p-2.5 hover:bg-orange-50" aria-label="Cart">
              <ShoppingBag size={20} />
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[9px] font-bold text-white">0</span>
            </Link>
            <Link to="/login" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
              Login
            </Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="mt-16 border-t border-orange-100 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4 sm:px-6 lg:px-8">
          <div>
            <div className="text-lg font-black text-orange-600">Khamma Ghani</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">A modern local food-delivery platform built for real customers and real restaurants.</p>
          </div>
          <div>
            <h3 className="font-bold">Platform</h3>
            <p className="mt-3 text-sm text-slate-500">Restaurants</p>
            <p className="mt-2 text-sm text-slate-500">Offers</p>
            <p className="mt-2 text-sm text-slate-500">Track order</p>
          </div>
          <div>
            <h3 className="font-bold">Partners</h3>
            <p className="mt-3 text-sm text-slate-500">Restaurant partners</p>
            <p className="mt-2 text-sm text-slate-500">Delivery partners</p>
          </div>
          <div>
            <h3 className="font-bold">Trust</h3>
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-500"><ShieldCheck size={16} /> Secure architecture</div>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-500"><Bike size={16} /> Local delivery</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Home() {
  return (
    <Shell>
      <main>
        <section className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-14">
          <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-orange-500 via-orange-600 to-amber-500 p-6 text-white shadow-2xl shadow-orange-200 sm:p-10 lg:p-14">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur">
                <Utensils size={14} /> Fresh food. Local taste.
              </div>
              <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Padharo Sa, your next meal is waiting.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-orange-50 sm:text-lg">
                Discover trusted restaurants, order your favourites and follow every step of your delivery.
              </p>

              <div className="mt-7 flex max-w-xl items-center gap-2 rounded-2xl bg-white p-2 shadow-xl">
                <Search className="ml-2 shrink-0 text-slate-400" size={21} />
                <input
                  className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-slate-900 outline-none"
                  placeholder="Search for biryani, pizza, thali..."
                />
                <Link to="/search" className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Search</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Explore</p>
              <h2 className="mt-1 text-2xl font-black">What are you craving?</h2>
            </div>
            <Link to="/search" className="hidden items-center gap-1 text-sm font-bold text-orange-600 sm:flex">View all <ArrowRight size={16} /></Link>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {categories.map((category) => (
              <Link key={category.label} to="/search" className="group rounded-2xl border border-orange-100 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="text-3xl">{category.icon}</div>
                <div className="mt-2 text-xs font-bold sm:text-sm">{category.label}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Near you</p>
              <h2 className="mt-1 text-2xl font-black">Popular restaurants</h2>
            </div>
            <Link to="/restaurants" className="hidden items-center gap-1 text-sm font-bold text-orange-600 sm:flex">See all <ArrowRight size={16} /></Link>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((restaurant) => (
              <Link key={restaurant.name} to="/restaurants" className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                <div className="h-36 bg-gradient-to-br from-orange-100 via-amber-50 to-orange-200 p-5">
                  <div className="flex h-full items-end justify-between">
                    <div className="rounded-xl bg-white/80 px-3 py-2 text-xs font-black backdrop-blur">{restaurant.price}</div>
                    <div className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">{restaurant.time}</div>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-black">{restaurant.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{restaurant.cuisine}</p>
                  <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-500">
                    <span className="inline-flex items-center gap-1 text-emerald-700"><Star size={14} fill="currentColor" /> {restaurant.rating}</span>
                    <span className="inline-flex items-center gap-1"><Clock3 size={14} /> {restaurant.time}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </Shell>
  );
}

function SimplePage({ title, text }: { title: string; text: string }) {
  return (
    <Shell>
      <main className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-600"><Store /></div>
        <h1 className="mt-6 text-4xl font-black">{title}</h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-500">{text}</p>
        <Link to="/" className="mt-7 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">Back home</Link>
      </main>
    </Shell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/restaurants" element={<SimplePage title="Restaurant discovery" text="The real restaurant listing, location-aware search, filters and sorting are part of the next customer-experience stage." />} />
      <Route path="/search" element={<SimplePage title="Search foundation" text="Search will connect to the backend and cover restaurants, food items, cuisines and categories." />} />
      <Route path="/cart" element={<SimplePage title="Cart foundation" text="The cart will be connected to server-validated prices, quantities, add-ons, coupons and totals." />} />
      <Route path="/login" element={<SimplePage title="Secure login" text="Authentication and role-based access control are being built as a real backend feature, not simulated in the browser." />} />
    </Routes>
  );
}
