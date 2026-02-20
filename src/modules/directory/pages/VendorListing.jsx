import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { vendorService } from "@/modules/directory/services/vendorService";
import Card from "@/shared/components/Card";
import { Button } from "@/components/ui/button";
import { MapPin, Star, ShieldCheck, Search } from "lucide-react";

const VendorListing = () => {
  const navigate = useNavigate();

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ Filters
  const [q, setQ] = useState(""); // search products/services/company
  const [cityText, setCityText] = useState(""); // city text input
  const [selectedState, setSelectedState] = useState("ALL");
  const [selectedCity, setSelectedCity] = useState("ALL");

  // ✅ Trigger "Search" button
  const [applyTick, setApplyTick] = useState(0);

  const FETCH_LIMIT = 500;

  useEffect(() => {
    const fetchVendors = async () => {
      setLoading(true);
      try {
        // NOTE: If Supabase RLS policy filters is_active=true, then inactive vendors won't come at all.
        const data = await vendorService.getFeaturedVendors({
          limit: FETCH_LIMIT,
          onlyActive: false,
        });

        setVendors(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Failed to fetch vendors:", e);
        setVendors([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVendors();
  }, []);

  // ✅ Unique state list from vendors
  const stateOptions = useMemo(() => {
    const set = new Set();
    vendors.forEach((v) => {
      if (v?.state) set.add(String(v.state).trim());
    });
    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [vendors]);

  // ✅ Unique city list depends on selected state
  const cityOptions = useMemo(() => {
    const set = new Set();
    vendors.forEach((v) => {
      if (!v?.city) return;
      if (selectedState !== "ALL" && String(v.state || "").trim() !== selectedState) return;
      set.add(String(v.city).trim());
    });
    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [vendors, selectedState]);

  // ✅ Auto reset city dropdown when state changes
  useEffect(() => {
    setSelectedCity("ALL");
  }, [selectedState]);

  // ✅ filtering logic (applies when applyTick changes OR when vendors change)
  const filteredVendors = useMemo(() => {
    // only apply after user clicks Search (applyTick)
    // but we also want initial list => if applyTick=0, show all vendors
    if (applyTick === 0) return vendors;

    const query = q.trim().toLowerCase();
    const cityQ = cityText.trim().toLowerCase();

    return vendors.filter((v) => {
      const company = String(v?.name || v?.company_name || "").toLowerCase();
      const city = String(v?.city || "").toLowerCase();
      const state = String(v?.state || "").toLowerCase();
      const primary = String(v?.primary_business_type || "").toLowerCase();
      const secondary = String(v?.secondary_business || "").toLowerCase();

      // dropdown filters
      if (selectedState !== "ALL" && String(v?.state || "").trim() !== selectedState) return false;
      if (selectedCity !== "ALL" && String(v?.city || "").trim() !== selectedCity) return false;

      // city text input
      if (cityQ && !city.includes(cityQ)) return false;

      // main search input
      if (query) {
        const match =
          company.includes(query) ||
          primary.includes(query) ||
          secondary.includes(query) ||
          city.includes(query) ||
          state.includes(query);
        if (!match) return false;
      }

      return true;
    });
  }, [vendors, q, cityText, selectedState, selectedCity, applyTick]);

  const VendorImage = ({ src, name }) => {
    const [failed, setFailed] = useState(false);
    const letter = String(name || "S").trim().charAt(0).toUpperCase() || "S";

    if (!src || failed) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 text-3xl font-extrabold text-slate-300">
          {letter}
        </div>
      );
    }

    return (
      <img
        src={src}
        alt={name}
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
        loading="lazy"
      />
    );
  };

  const onSearch = () => {
    setApplyTick((x) => x + 1);
  };

  const onReset = () => {
    setQ("");
    setCityText("");
    setSelectedState("ALL");
    setSelectedCity("ALL");
    setApplyTick(0);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">All Vendors</h1>
            {!loading && (
              <p className="text-sm text-gray-500">
                Showing <span className="font-semibold">{filteredVendors.length}</span> vendors
              </p>
            )}
          </div>

          {!loading && (
            <button
              type="button"
              onClick={onReset}
              className="text-sm font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-4"
            >
              Reset filters
            </button>
          )}
        </div>

        {/* Filters Row */}
        <div className="mt-4 bg-white border rounded-xl shadow-sm p-3">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px_120px_140px_140px] gap-3 items-center">
            {/* Search */}
            <div className="flex items-center border rounded-lg px-3 h-11">
              <Search className="w-4 h-4 text-gray-400 mr-2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products or services..."
                className="w-full outline-none text-sm"
              />
            </div>

            {/* City text */}
            <div className="flex items-center border rounded-lg px-3 h-11">
              <MapPin className="w-4 h-4 text-gray-400 mr-2" />
              <input
                value={cityText}
                onChange={(e) => setCityText(e.target.value)}
                placeholder="Enter city name..."
                className="w-full outline-none text-sm"
              />
            </div>

            {/* Search button */}
            <Button className="h-11" onClick={onSearch}>
              Search
            </Button>

            {/* State dropdown */}
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="border rounded-lg px-3 h-11 bg-white text-sm"
            >
              {stateOptions.map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "All States" : s}
                </option>
              ))}
            </select>

            {/* City dropdown */}
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="border rounded-lg px-3 h-11 bg-white text-sm"
            >
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c === "ALL" ? "All Cities" : c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          <div className="col-span-full text-center text-gray-500 py-10">Loading vendors...</div>
        ) : filteredVendors.length === 0 ? (
          <div className="col-span-full text-center text-gray-500 py-10">
            No vendors found for current filters.
          </div>
        ) : (
          filteredVendors.map((vendor) => (
            <Card
              key={vendor.id}
              className="group hover:shadow-md transition-all cursor-pointer border border-slate-200"
              onClick={() => navigate(`/directory/vendor/${vendor.id}`)}
            >
              <Card.Content className="p-0">
                <div className="p-2">
                  <div className="relative h-20 rounded-lg bg-slate-50 overflow-hidden">
                    <VendorImage src={vendor.image} name={vendor.name} />

                    {vendor.verified && (
                      <span className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 text-emerald-700 shadow-sm">
                        <ShieldCheck className="w-3 h-3" /> Verified
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-3 pb-3 pt-0 flex flex-col gap-2 min-h-[104px]">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[13px] text-slate-900 line-clamp-1">
                      {vendor.name}
                    </h3>
                    {vendor.rating !== null && vendor.rating !== undefined && Number(vendor.rating) > 0 && (
                      <span className="inline-flex items-center bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                        <Star className="w-3 h-3 mr-1 fill-amber-600 text-amber-600" />
                        {Number(vendor.rating).toFixed(1)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center text-[11px] text-slate-500">
                    <MapPin className="w-3 h-3 mr-1" />
                    {vendor.city || "-"}
                    {vendor.state ? `, ${vendor.state}` : ""}
                  </div>

                  {(vendor.description || vendor.primary_business_type) && (
                    <p className="text-[11px] text-slate-500 line-clamp-1">
                      {vendor.description || vendor.primary_business_type}
                    </p>
                  )}

                  <Button
                    variant="outline"
                    className="w-full h-7 text-[11px] mt-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/directory/vendor/${vendor.id}`);
                    }}
                  >
                    View Profile
                  </Button>
                </div>
              </Card.Content>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default VendorListing;
