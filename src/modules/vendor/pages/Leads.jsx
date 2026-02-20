import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { leadApi } from "@/modules/lead/services/leadApi";
import { vendorApi } from "@/modules/vendor/services/vendorApi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  MapPin,
  Calendar,
  Search,
  Phone,
  Mail,
  User,
  Lock,
  ShoppingCart,
  Filter,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { phoneUtils } from "@/shared/utils/phoneUtils";
import LeadStatsPanel from "@/modules/vendor/components/LeadStatsPanel";
import { supabase } from "@/lib/customSupabaseClient";
import { leadPaymentApi } from "@/modules/vendor/services/leadPaymentApi";

const CONTACTED_STORAGE_KEY = "itm_vendor_contacted_lead_ids";

/**
 * Bottom-right positioning tuning (My Leads tab, desktop only)
 * bottom distance increases => moves UP slightly
 * right distance increases => moves LEFT
 */
const STATS_BOTTOM = 18; // px
const STATS_RIGHT_EXTRA = 0; // px

// IMPORTANT: stats panel width (must match LeadStatsPanel max width)
const STATS_PANEL_W = 260; // px

const safeDate = (v) => {
  try {
    const d = v ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  } catch {
    return null;
  }
};

const parseLocation = (lead) => {
  const city = (lead?.city || "").toString().trim();
  const state = (lead?.state || lead?.state_name || "").toString().trim();
  if (city || state) return { city, state };

  const raw = (lead?.location || "").toString();
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { city: parts[0], state: parts.slice(1).join(", ") };
  if (parts.length === 1) return { city: parts[0], state: "" };
  return { city: "", state: "" };
};

const getLeadMeta = (lead) => {
  const title =
    lead?.title ||
    lead?.product_name ||
    lead?.service_name ||
    lead?.requirement_title ||
    "Untitled Lead";

  const { city, state } = parseLocation(lead);

  const location =
    (lead?.location || "").toString().trim() ||
    [city, state].filter(Boolean).join(", ") ||
    "India";

  const category =
    lead?.category ||
    lead?.category_name ||
    lead?.categoryTitle ||
    lead?.head_category ||
    "";

  const product =
    lead?.product ||
    lead?.product_name ||
    lead?.service_name ||
    lead?.service ||
    lead?.sub_category ||
    "";

  const createdAt =
    safeDate(lead?.created_at) ||
    safeDate(lead?.createdAt) ||
    safeDate(lead?.date) ||
    null;

  const priority = String(lead?.priority || lead?.lead_priority || lead?.urgency || "")
    .toLowerCase()
    .trim();

  const isRecommended =
    lead?.is_recommended === true ||
    lead?.recommended === true ||
    lead?.isRecommended === true ||
    priority === "high" ||
    priority === "urgent" ||
    priority === "recommended";

  return { title, location, city, state, category, product, createdAt, isRecommended };
};

const topNFromCountMap = (map, n = 8) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));

const anySelected = (obj) => Object.values(obj || {}).some(Boolean);
const selectedKeys = (obj) => Object.keys(obj || {}).filter((k) => obj[k]);

const readContactedIds = () => {
  try {
    const raw = localStorage.getItem(CONTACTED_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const writeContactedIds = (ids) => {
  try {
    localStorage.setItem(CONTACTED_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfWeekMonday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

const startOfYear = () => {
  const d = new Date();
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const Leads = () => {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("marketplace");
  const [marketplaceLeads, setMarketplaceLeads] = useState([]);
  const [myLeads, setMyLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [marketFilters, setMarketFilters] = useState({
    recommendedOnly: false,
    indiaOnly: true,
    cities: {},
    states: {},
    categories: {},
    products: {},
    sort: "recent",
  });

  const [myFilters, setMyFilters] = useState({
    fromDate: "",
    toDate: "",
    categories: {},
    locations: {},
    source: "all",
    sort: "recent_bought",
  });

  const [stats, setStats] = useState(null);
  const [purchasing, setPurchasing] = useState({});

  // Stats panel positioning (my_leads / desktop)
  const statsColRef = useRef(null);
  const statsCardRef = useRef(null);
  const leadsRequestRef = useRef(0);
  const inflightLeadsRef = useRef({ marketplace: null, my_leads: null });
  const [floatingStyle, setFloatingStyle] = useState(null);
  const [statsCardH, setStatsCardH] = useState(0);

  useEffect(() => {
    loadLeads();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const onContacted = (e) => {
      const leadId = e?.detail?.leadId;
      if (!leadId) return;

      const current = readContactedIds();
      if (current.includes(leadId)) return;

      const updated = [...current, leadId];
      writeContactedIds(updated);

      setStats((prev) => {
        if (!prev) return prev;
        return { ...prev, totalContacted: updated.length };
      });
    };

    window.addEventListener("itm:lead_contacted", onContacted);
    return () => window.removeEventListener("itm:lead_contacted", onContacted);
  }, []);

  // FIX: keep stats card bottom-right aligned with its column (no overlap)
  useEffect(() => {
    const update = () => {
      if (activeTab !== "my_leads") return;

      const col = statsColRef.current;
      const card = statsCardRef.current;
      if (!col || !card) return;

      const rect = col.getBoundingClientRect();
      const baseRight = window.innerWidth - rect.right;
      const rightPx = Math.max(12, baseRight + STATS_RIGHT_EXTRA);

      setFloatingStyle({
        position: "fixed",
        bottom: `${STATS_BOTTOM}px`,
        right: `${rightPx}px`,
        width: `${Math.round(rect.width)}px`,
        zIndex: 30,
        display: "flex",
        justifyContent: "flex-end",
        pointerEvents: "auto",
      });

      setStatsCardH(card.offsetHeight || 0);
    };

    const raf1 = requestAnimationFrame(update);
    const raf2 = requestAnimationFrame(update);

    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    let ro;
    if (statsCardRef.current && "ResizeObserver" in window) {
      ro = new ResizeObserver(() => update());
      ro.observe(statsCardRef.current);
    }

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      if (ro) ro.disconnect();
    };
  }, [activeTab, stats, loading]);

  const loadStats = async () => {
    try {
      try {
        await vendorApi.dashboard.getStats();
      } catch {
        // ignore
      }

      let vendorId = null;
      try {
        const me = await vendorApi.auth.me();
        vendorId = me?.id || null;
      } catch (e) {
        console.error("Failed to get vendor id for stats:", e);
      }

      const myLeads = await leadApi.marketplace.getMyLeads();
      const rows = myLeads || [];

      const todayStart = startOfToday();
      const weekStart = startOfWeekMonday();
      const yearStart = startOfYear();

      let purchasedCount = 0;
      let directCount = 0;
      const directLeadIds = new Set();

      let daily = 0;
      let weekly = 0;
      let yearly = 0;

      rows.forEach((row) => {
        const leadObj = row?.leads || row;
        const source = (row?.source || "").toString().toLowerCase();
        const isDirect = source === "direct";
        const isPurchased = source === "purchased" || !row?.source;

        if (isDirect) {
          directCount += 1;
          if (leadObj?.id) directLeadIds.add(String(leadObj.id));
        }
        if (isPurchased) purchasedCount += 1;

        const purchaseDate =
          row?.purchase_date ||
          row?.purchaseDate ||
          row?.purchased_at ||
          leadObj?.created_at ||
          leadObj?.createdAt;

        const d = safeDate(purchaseDate);
        if (!d) return;

        if (d >= todayStart) daily += 1;
        if (d >= weekStart) weekly += 1;
        if (d >= yearStart) yearly += 1;
      });

      let totalContacted = 0;
      try {
        if (vendorId) {
          const { data: contacts, error: contactErr } = await supabase
            .from("lead_contacts")
            .select("lead_id")
            .eq("vendor_id", vendorId);
          if (contactErr) throw contactErr;
          const contactedIds = new Set((contacts || []).map((c) => String(c.lead_id)).filter(Boolean));
          totalContacted = new Set([...contactedIds, ...directLeadIds]).size;
        } else {
          const contactedIds = readContactedIds().map((id) => String(id));
          totalContacted = new Set([...contactedIds, ...directLeadIds]).size;
        }
      } catch (err) {
        console.error("Failed to load contacted count:", err);
        const contactedIds = readContactedIds().map((id) => String(id));
        totalContacted = new Set([...contactedIds, ...directLeadIds]).size;
      }

      // fetch quota (limits + used)
      let quota = null;
      let planLimits = { daily_limit: 0, weekly_limit: 0, yearly_limit: 0 };
      try {
        const sub = await vendorApi.subscriptions.getCurrent();
        if (sub?.plan) {
          planLimits = {
            daily_limit: sub.plan.daily_limit || 0,
            weekly_limit: sub.plan.weekly_limit || 0,
            yearly_limit: sub.plan.yearly_limit || 0,
          };
        }
        quota = await vendorApi.leadQuota.get();
        if (!quota || !quota.plan_id) {
          if (sub?.plan_id) {
            await vendorApi.leadQuota.initialize(sub.plan_id);
            quota = await vendorApi.leadQuota.get();
          }
        }
      } catch (err) {
        console.error("Failed to load quota:", err);
      }

      const quotaDailyUsed = Number(quota?.daily_used);
      const quotaWeeklyUsed = Number(quota?.weekly_used);
      const quotaYearlyUsed = Number(quota?.yearly_used);

      setStats({
        direct: directCount,
        totalPurchased: purchasedCount,
        totalContacted,
        dailyUsed: Number.isFinite(quotaDailyUsed) ? Math.max(quotaDailyUsed, daily) : daily,
        dailyLimit: quota?.daily_limit ?? planLimits.daily_limit ?? 0,
        weeklyUsed: Number.isFinite(quotaWeeklyUsed) ? Math.max(quotaWeeklyUsed, weekly) : weekly,
        weeklyLimit: quota?.weekly_limit ?? planLimits.weekly_limit ?? 0,
        yearlyUsed: Number.isFinite(quotaYearlyUsed) ? Math.max(quotaYearlyUsed, yearly) : yearly,
        yearlyLimit: quota?.yearly_limit ?? planLimits.yearly_limit ?? 0,
      });
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  };

  const loadLeads = async (tab = activeTab) => {
    const safeTab = tab === "my_leads" ? "my_leads" : "marketplace";

    // Deduplicate same-tab concurrent fetches (helps in React StrictMode double effects).
    if (inflightLeadsRef.current[safeTab]) {
      return inflightLeadsRef.current[safeTab];
    }

    const requestId = ++leadsRequestRef.current;
    setLoading(true);

    let requestPromise;
    requestPromise = (async () => {
      try {
        if (safeTab === "my_leads") {
          const rows = await leadApi.marketplace.getMyLeads();
          if (requestId !== leadsRequestRef.current) return;
          setMyLeads(Array.isArray(rows) ? rows : []);
          return;
        }

        const available = await leadApi.marketplace.listAvailable();
        if (requestId !== leadsRequestRef.current) return;
        setMarketplaceLeads(Array.isArray(available) ? available : []);
      } catch (error) {
        console.error(error);
        if (requestId !== leadsRequestRef.current) return;
        // Keep already visible leads on transient failure; only show toast.
        toast({ title: "Failed to load leads", variant: "destructive" });
      } finally {
        if (inflightLeadsRef.current[safeTab] === requestPromise) {
          inflightLeadsRef.current[safeTab] = null;
        }
        if (requestId === leadsRequestRef.current) {
          setLoading(false);
        }
      }
    })();

    inflightLeadsRef.current[safeTab] = requestPromise;
    return requestPromise;
  };

  const handlePurchaseLead = async (leadId) => {
    setPurchasing((prev) => ({ ...prev, [leadId]: true }));
    try {
      const lead = marketplaceLeads.find((l) => l.id === leadId);
      if (!lead) throw new Error("Lead not found");

      await leadPaymentApi.purchaseLead(lead);

      toast({ title: "Lead purchased successfully!", description: "Buyer details unlocked." });

      setMarketplaceLeads((prev) => (prev || []).filter((l) => l?.id !== leadId));

      await loadStats();
    } catch (error) {
      toast({
        title: "Failed to purchase lead",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setPurchasing((prev) => ({ ...prev, [leadId]: false }));
    }
  };

  const normalizedMarketplaceLeads = useMemo(() => {
    return (marketplaceLeads || []).map((row) => {
      const leadObj = row?.leads || row;
      const purchaseDate = row?.purchase_date || row?.purchaseDate || row?.purchased_at || null;
      return { __raw: row, __lead: leadObj, __purchaseDate: purchaseDate };
    });
  }, [marketplaceLeads]);

  const normalizedMyLeads = useMemo(() => {
    return (myLeads || []).map((row) => {
      const leadObj = row?.leads || row;
      const purchaseDate = row?.purchase_date || row?.purchaseDate || row?.purchased_at || null;
      return { __raw: row, __lead: leadObj, __purchaseDate: purchaseDate };
    });
  }, [myLeads]);

  const marketFacets = useMemo(() => {
    const cityCount = new Map();
    const stateCount = new Map();
    const categoryCount = new Map();
    const productCount = new Map();

    normalizedMarketplaceLeads.forEach(({ __lead }) => {
      const m = getLeadMeta(__lead);
      if (m.city) cityCount.set(m.city, (cityCount.get(m.city) || 0) + 1);
      if (m.state) stateCount.set(m.state, (stateCount.get(m.state) || 0) + 1);
      if (m.category) categoryCount.set(m.category, (categoryCount.get(m.category) || 0) + 1);
      if (m.product) productCount.set(m.product, (productCount.get(m.product) || 0) + 1);
    });

    return {
      topCities: topNFromCountMap(cityCount, 6),
      topStates: topNFromCountMap(stateCount, 6),
      topCategories: topNFromCountMap(categoryCount, 6),
      topProducts: topNFromCountMap(productCount, 6),
    };
  }, [normalizedMarketplaceLeads]);

  const myFacets = useMemo(() => {
    const categoryCount = new Map();
    const locationCount = new Map();

    normalizedMyLeads.forEach(({ __lead }) => {
      const m = getLeadMeta(__lead);
      if (m.category) categoryCount.set(m.category, (categoryCount.get(m.category) || 0) + 1);
      if (m.location) locationCount.set(m.location, (locationCount.get(m.location) || 0) + 1);
    });

    return {
      topCategories: topNFromCountMap(categoryCount, 10),
      topLocations: topNFromCountMap(locationCount, 10),
    };
  }, [normalizedMyLeads]);

  const toggleKey = (setter, group, key) => {
    setter((prev) => ({
      ...prev,
      [group]: {
        ...(prev[group] || {}),
        [key]: !prev?.[group]?.[key],
      },
    }));
  };

  const clearMarketFilters = () => {
    setMarketFilters({
      recommendedOnly: false,
      indiaOnly: true,
      cities: {},
      states: {},
      categories: {},
      products: {},
      sort: "recent",
    });
    setSearchTerm("");
  };

  const clearMyFilters = () => {
    setMyFilters({
      fromDate: "",
      toDate: "",
      categories: {},
      locations: {},
      source: "all",
      sort: "recent_bought",
    });
  };

  const filteredMarketplaceLeads = useMemo(() => {
    const term = (searchTerm || "").toLowerCase().trim();

    const selectedCities = selectedKeys(marketFilters.cities);
    const selectedStates = selectedKeys(marketFilters.states);
    const selectedCategories = selectedKeys(marketFilters.categories);
    const selectedProducts = selectedKeys(marketFilters.products);

    const hasCityFilter = selectedCities.length > 0;
    const hasStateFilter = selectedStates.length > 0;
    const hasCategoryFilter = selectedCategories.length > 0;
    const hasProductFilter = selectedProducts.length > 0;

    let rows = normalizedMarketplaceLeads.filter(({ __lead }) => {
      const m = getLeadMeta(__lead);

      if (term) {
        const hay = [m.title, m.location, m.city, m.state, m.category, m.product]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }

      if (marketFilters.recommendedOnly && !m.isRecommended) return false;

      if (marketFilters.indiaOnly) {
        const countryRaw = String(
          __lead?.country ||
            __lead?.country_name ||
            __lead?.country_code ||
            __lead?.countryCode ||
            ""
        )
          .toLowerCase()
          .trim();

        if (countryRaw) {
          const isIndia =
            countryRaw === "india" ||
            countryRaw === "in" ||
            countryRaw === "ind" ||
            countryRaw.includes("india");
          if (!isIndia) return false;
        }
      }

      if (hasCityFilter && !selectedCities.includes(m.city)) return false;
      if (hasStateFilter && !selectedStates.includes(m.state)) return false;
      if (hasCategoryFilter && !selectedCategories.includes(m.category)) return false;
      if (hasProductFilter && !selectedProducts.includes(m.product)) return false;

      return true;
    });

    rows = rows.sort((a, b) => {
      const aMeta = getLeadMeta(a.__lead);
      const bMeta = getLeadMeta(b.__lead);

      const aT = aMeta.createdAt?.getTime?.() || 0;
      const bT = bMeta.createdAt?.getTime?.() || 0;

      if (marketFilters.sort === "relevant") {
        const ar = aMeta.isRecommended ? 1 : 0;
        const br = bMeta.isRecommended ? 1 : 0;
        if (br !== ar) return br - ar;
        return bT - aT;
      }

      return bT - aT;
    });

    return rows;
  }, [normalizedMarketplaceLeads, searchTerm, marketFilters]);

  const filteredMyLeads = useMemo(() => {
    const selectedCategories = selectedKeys(myFilters.categories);
    const selectedLocations = selectedKeys(myFilters.locations);

    const hasCategoryFilter = selectedCategories.length > 0;
    const hasLocationFilter = selectedLocations.length > 0;

    const from = myFilters.fromDate ? new Date(`${myFilters.fromDate}T00:00:00`) : null;
    const to = myFilters.toDate ? new Date(`${myFilters.toDate}T23:59:59`) : null;
    const sourceFilter = String(myFilters.source || "all").toLowerCase();

    let rows = normalizedMyLeads.filter(({ __raw, __lead, __purchaseDate }) => {
      const m = getLeadMeta(__lead);
      const pDate = safeDate(__purchaseDate);
      const rowSource = String(__raw?.source || __lead?.source || "").toLowerCase();

      if (sourceFilter === "purchased" && rowSource !== "purchased") return false;
      if (sourceFilter === "direct" && rowSource !== "direct") return false;

      if (from && (!pDate || pDate < from)) return false;
      if (to && (!pDate || pDate > to)) return false;

      if (hasCategoryFilter && !selectedCategories.includes(m.category)) return false;
      if (hasLocationFilter && !selectedLocations.includes(m.location)) return false;

      return true;
    });

    rows = rows.sort((a, b) => {
      const aP = safeDate(a.__purchaseDate)?.getTime?.() || 0;
      const bP = safeDate(b.__purchaseDate)?.getTime?.() || 0;
      return bP - aP;
    });

    return rows;
  }, [normalizedMyLeads, myFilters]);

  const marketAppliedCount =
    (marketFilters.recommendedOnly ? 1 : 0) +
    (anySelected(marketFilters.cities) ? 1 : 0) +
    (anySelected(marketFilters.states) ? 1 : 0) +
    (anySelected(marketFilters.categories) ? 1 : 0) +
    (anySelected(marketFilters.products) ? 1 : 0) +
    (marketFilters.sort !== "recent" ? 1 : 0) +
    (searchTerm?.trim() ? 1 : 0);

  const myAppliedCount =
    (myFilters.fromDate ? 1 : 0) +
    (myFilters.toDate ? 1 : 0) +
    (anySelected(myFilters.categories) ? 1 : 0) +
    (anySelected(myFilters.locations) ? 1 : 0);

  const handleViewDetails = (leadId) => {
    if (!leadId) return;
    navigate(`/vendor/leads/${leadId}`);
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buy Leads</h1>
          <p className="text-gray-500">Access verified buyer requirements</p>
        </div>

        {stats && (
          <div className="flex gap-6 text-sm">
            <div className="text-center">
              <p className="text-gray-500">Direct Leads</p>
              <p className="text-lg font-bold text-[#003D82]">{stats.direct || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500">Purchased</p>
              <p className="text-lg font-bold text-[#003D82]">{stats.totalPurchased || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500">Contacted</p>
              <p className="text-lg font-bold text-[#003D82]">{stats.totalContacted || 0}</p>
            </div>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          <TabsTrigger value="my_leads">My Leads</TabsTrigger>
        </TabsList>

        {/* FILTER BAR */}
        <Card className="mt-1 border bg-white">
          <CardContent className="p-2">
            {activeTab === "marketplace" ? (
              <div className="flex flex-col lg:flex-row gap-3 lg:items-start">
                <div className="relative w-full lg:max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search product / location..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="grid w-full grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  <div className="rounded-md border bg-gray-50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-sm text-gray-800">Location</div>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Filter className="h-3.5 w-3.5" />
                        {anySelected(marketFilters.cities) || anySelected(marketFilters.states) ? (
                          <span className="font-medium text-gray-800">
                            {selectedKeys(marketFilters.cities).length +
                              selectedKeys(marketFilters.states).length}{" "}
                            selected
                          </span>
                        ) : (
                          <span>All</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 mb-2">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={marketFilters.recommendedOnly}
                          onChange={() =>
                            setMarketFilters((p) => ({ ...p, recommendedOnly: !p.recommendedOnly }))
                          }
                        />
                        <span>Recommended</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={marketFilters.indiaOnly}
                          onChange={() =>
                            setMarketFilters((p) => ({ ...p, indiaOnly: !p.indiaOnly }))
                          }
                        />
                        <span>India</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {(marketFacets.topCities || []).map(({ label, count }) => (
                        <label key={label} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!marketFilters.cities[label]}
                            onChange={() => toggleKey(setMarketFilters, "cities", label)}
                          />
                          <span className="truncate">{label}</span>
                          <span className="ml-auto text-[11px] text-gray-500">{count}</span>
                        </label>
                      ))}
                    </div>

                    {!!marketFacets.topStates?.length && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-[11px] font-semibold text-gray-600 mb-2">
                          Nearby / States
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {(marketFacets.topStates || []).map(({ label, count }) => (
                            <label
                              key={label}
                              className="flex items-center gap-2 text-xs cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={!!marketFilters.states[label]}
                                onChange={() => toggleKey(setMarketFilters, "states", label)}
                              />
                              <span className="truncate">{label}</span>
                              <span className="ml-auto text-[11px] text-gray-500">{count}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border bg-gray-50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-sm text-gray-800">Categories / Product</div>
                      <div className="text-xs text-gray-600">
                        {anySelected(marketFilters.categories) || anySelected(marketFilters.products) ? (
                          <span className="font-medium text-gray-800">
                            {selectedKeys(marketFilters.categories).length +
                              selectedKeys(marketFilters.products).length}{" "}
                            selected
                          </span>
                        ) : (
                          <span>All</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {(marketFacets.topProducts || []).map(({ label, count }) => (
                        <label key={label} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!marketFilters.products[label]}
                            onChange={() => toggleKey(setMarketFilters, "products", label)}
                          />
                          <span className="truncate">{label}</span>
                          <span className="ml-auto text-[11px] text-gray-500">{count}</span>
                        </label>
                      ))}
                    </div>

                    {!!marketFacets.topCategories?.length && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-[11px] font-semibold text-gray-600 mb-2">
                          Categories
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {(marketFacets.topCategories || []).map(({ label, count }) => (
                            <label
                              key={label}
                              className="flex items-center gap-2 text-xs cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={!!marketFilters.categories[label]}
                                onChange={() => toggleKey(setMarketFilters, "categories", label)}
                              />
                              <span className="truncate">{label}</span>
                              <span className="ml-auto text-[11px] text-gray-500">{count}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border bg-gray-50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-sm text-gray-800">Sort</div>
                      {marketAppliedCount > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {marketAppliedCount} filter{marketAppliedCount > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="sort"
                          checked={marketFilters.sort === "relevant"}
                          onChange={() => setMarketFilters((p) => ({ ...p, sort: "relevant" }))}
                        />
                        <span>Relevant (Recommended first)</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="sort"
                          checked={marketFilters.sort === "recent"}
                          onChange={() => setMarketFilters((p) => ({ ...p, sort: "recent" }))}
                        />
                        <span>Recent</span>
                      </label>

                      <div className="pt-2 mt-2 border-t flex gap-2">
                        <Button variant="outline" className="w-full" onClick={clearMarketFilters}>
                          <X className="h-4 w-4 mr-2" />
                          Clear
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-2">
                <div className="rounded-md border bg-gray-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm text-gray-800">Source</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="source"
                        checked={myFilters.source === "all"}
                        onChange={() => setMyFilters((p) => ({ ...p, source: "all" }))}
                      />
                      <span>All</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="source"
                        checked={myFilters.source === "purchased"}
                        onChange={() => setMyFilters((p) => ({ ...p, source: "purchased" }))}
                      />
                      <span>Purchased</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="source"
                        checked={myFilters.source === "direct"}
                        onChange={() => setMyFilters((p) => ({ ...p, source: "direct" }))}
                      />
                      <span>Direct Leads</span>
                    </label>
                  </div>
                </div>

                <div className="rounded-md border bg-gray-50 p-3">
                  <div className="font-semibold text-sm text-gray-800 mb-2">Date wise</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] text-gray-600 mb-1">From</div>
                      <Input
                        type="date"
                        value={myFilters.fromDate}
                        onChange={(e) => setMyFilters((p) => ({ ...p, fromDate: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-600 mb-1">To</div>
                      <Input
                        type="date"
                        value={myFilters.toDate}
                        onChange={(e) => setMyFilters((p) => ({ ...p, toDate: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-md border bg-gray-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm text-gray-800">Category</div>
                    <div className="text-xs text-gray-600">
                      {anySelected(myFilters.categories)
                        ? `${selectedKeys(myFilters.categories).length} selected`
                        : "All"}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {(myFacets.topCategories || []).map(({ label, count }) => (
                      <label key={label} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!myFilters.categories[label]}
                          onChange={() => toggleKey(setMyFilters, "categories", label)}
                        />
                        <span className="truncate">{label}</span>
                        <span className="ml-auto text-[11px] text-gray-500">{count}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border bg-gray-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm text-gray-800">Location</div>
                    <div className="text-xs text-gray-600">
                      {anySelected(myFilters.locations)
                        ? `${selectedKeys(myFilters.locations).length} selected`
                        : "All"}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {(myFacets.topLocations || []).map(({ label, count }) => (
                      <label key={label} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!myFilters.locations[label]}
                          onChange={() => toggleKey(setMyFilters, "locations", label)}
                        />
                        <span className="truncate">{label}</span>
                        <span className="ml-auto text-[11px] text-gray-500">{count}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border bg-gray-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm text-gray-800">Recent Bought Leads</div>
                    {myAppliedCount > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {myAppliedCount} filter{myAppliedCount > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>

                  <div className="text-xs text-gray-600 mb-2">Sorted by latest purchase date</div>

                  <Button variant="outline" className="w-full" onClick={clearMyFilters}>
                    <X className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <TabsContent value="marketplace" className="mt-2 space-y-2">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : filteredMarketplaceLeads.length === 0 ? (
            <div className="p-8 text-center border rounded bg-white">No new leads available</div>
          ) : (
            filteredMarketplaceLeads.map(({ __lead }) => (
              <LeadCard
                key={__lead.id}
                lead={__lead}
                purchased={false}
                onBuy={handlePurchaseLead}
                isPurchasing={purchasing[__lead.id]}
                onView={handleViewDetails}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="my_leads" className="mt-2">
          {/*
            REAL FIX (No extra empty space):
            - Desktop layout = 2 columns only
              Left: 1fr
              Right: 260px (stats card width)
            - gap between = 4px
          */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-[7px] items-start">
            {/* LEFT */}
            <div className="min-w-0 space-y-1">
              {loading ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : filteredMyLeads.length === 0 ? (
                <div className="p-8 text-center border rounded bg-white">
                  You haven't purchased any leads yet.
                </div>
              ) : (
                filteredMyLeads.map(({ __raw, __lead, __purchaseDate }) => (
                  <LeadCard
                    key={__raw?.id || __lead?.id}
                    lead={__lead}
                    source={__raw?.source || "Purchased"}
                    purchaseDate={__purchaseDate}
                    onView={handleViewDetails}
                  />
                ))
              )}
            </div>

            {/* RIGHT */}
            <div
              ref={statsColRef}
              className="w-full lg:w-[260px]"
              style={{ width: undefined }}
            >
              {/* mobile */}
              <div className="lg:hidden">
                <LeadStatsPanel stats={stats} loading={loading} />
              </div>

              {/* reserve space so fixed panel doesn't jump */}
              <div className="hidden lg:block" style={{ height: statsCardH || undefined }} />

              {/* desktop fixed bottom-right */}
              <div className="hidden lg:block" style={floatingStyle || undefined}>
                <div ref={statsCardRef} style={{ width: `${STATS_PANEL_W}px` }}>
                  <LeadStatsPanel stats={stats} loading={loading} />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const LeadCard = ({
  lead,
  purchased,
  source,
  onBuy,
  isPurchasing,
  purchaseDate,
  onView,
}) => {
  const meta = getLeadMeta(lead);

  const displayTitle = meta.title;
  const displayLocation = meta.location;

  const isPurchased = purchased || (source || "").toString().toLowerCase() === "purchased";
  const isDirect = (source || "").toString().toLowerCase() === "direct";
  const leadPrice = (() => {
    const n = Number(lead?.price);
    return Number.isFinite(n) ? Math.max(0, n) : 50;
  })();

  const dateObj =
    safeDate(isPurchased || isDirect ? purchaseDate : lead?.created_at || lead?.createdAt) ||
    meta.createdAt;

  const displayDate = dateObj ? dateObj.toLocaleDateString() : "-";

  const maskPhone = (phone) => (phone ? phoneUtils.maskPhoneWithCode(phone) : "N/A");

  // Buyer details should ONLY be visible after purchase OR if it's a direct lead.
  // Marketplace may still send buyer fields in payload, but UI must keep them locked.
  const isBuyerUnlocked = isPurchased || isDirect;

  const buyerNameRaw =
    lead?.buyer_name ||
    lead?.buyerName ||
    lead?.client_name ||
    lead?.clientName ||
    lead?.name ||
    null;

  const buyerPhoneRaw = lead?.buyer_phone || lead?.buyerPhone || lead?.phone || null;
  const buyerEmailRaw = lead?.buyer_email || lead?.buyerEmail || lead?.email || null;

  const buyerName = isBuyerUnlocked ? buyerNameRaw : null;
  const buyerPhone = isBuyerUnlocked ? buyerPhoneRaw : null;
  const buyerEmail = isBuyerUnlocked ? buyerEmailRaw : null;
  const purchasedAtObj = isPurchased ? safeDate(purchaseDate) : null;
  const purchasedAtLabel = purchasedAtObj
    ? purchasedAtObj.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Card
      className="w-full hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onView?.(lead?.id)}
    >
      <CardContent className="p-2.5">
        {/*
          Compact 3-column layout (md+):
          1) Lead info
          2) Buyer (locked/unlocked)
          3) Actions
        */}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)_160px] md:items-start">
          {/* LEFT: Lead Info */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-lg text-[#003D82] truncate">{displayTitle}</h3>
                <div className="mt-1 flex flex-wrap gap-2">
                  {meta.product ? (
                    <Badge variant="outline" className="text-xs">
                      {meta.product}
                    </Badge>
                  ) : null}
                  {meta.category ? (
                    <Badge variant="outline" className="text-xs">
                      {meta.category}
                    </Badge>
                  ) : null}
                  {meta.isRecommended && !isPurchased && !isDirect ? (
                    <Badge className="text-xs bg-[#fff3c4] text-[#7a5b00] hover:bg-[#ffeaa0] border border-[#ffe08a]">
                      Recommended
                    </Badge>
                  ) : null}
                </div>
              </div>

              <Badge variant={isPurchased || isDirect ? "success" : "outline"}>
                {isDirect ? "Direct Lead" : isPurchased ? "Purchased" : "Fresh Lead"}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {displayLocation}
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" /> {displayDate}
              </div>
              {lead?.quantity ? (
                <div className="font-medium">
                  Qty: {lead.quantity} {lead.unit || "units"}
                </div>
              ) : null}
              {lead?.budget ? (
                <div className="font-medium">
                  Budget: ₹{lead.budget?.toLocaleString?.() || lead.budget}
                </div>
              ) : null}
            </div>
          </div>

          {/* MIDDLE: Buyer Column */}
          <div
            className={
              isBuyerUnlocked
                ? "rounded-md border bg-green-50 border-green-100 p-2"
                : "rounded-md border bg-gray-50 p-2"
            }
          >
            <div className="flex items-center justify-between gap-2">
              <div className={isBuyerUnlocked ? "text-xs font-semibold text-green-800" : "text-xs font-semibold text-gray-700"}>
                Buyer Details
              </div>
              {!isBuyerUnlocked ? (
                <div className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                  <Lock className="h-3 w-3" /> Locked
                </div>
              ) : null}
            </div>

            {isBuyerUnlocked ? (
              <div className="mt-2 grid gap-1.5 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-green-900 truncate">{buyerName || "Buyer"}</span>
                </div>
                <div className="flex items-center gap-2 text-green-800">
                  <Phone className="h-3.5 w-3.5" />
                  <span className="font-medium">{buyerPhone || "N/A"}</span>
                </div>
                <div className="flex items-center gap-2 text-green-800 min-w-0">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium truncate">{buyerEmail || "N/A"}</span>
                </div>
                {isPurchased && purchasedAtLabel ? (
                  <div className="pt-1 text-[11px] text-green-700 font-medium">
                    Purchased on {purchasedAtLabel}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  <span className="font-medium">Hidden</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5" />
                  <span className="font-medium">{maskPhone(buyerPhoneRaw) || "Hidden"}</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium truncate">Hidden</span>
                </div>
                <div className="pt-1 text-[11px] text-gray-500">
                  Purchase lead to unlock.
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Actions */}
          <div className="flex flex-col justify-center items-end gap-2">
            {!isPurchased && !isDirect ? (
              <div className="w-full">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Price</p>
                  <p className="text-xl font-bold text-gray-900">
                    {leadPrice > 0 ? `₹${leadPrice.toLocaleString("en-IN")}` : "Free"}
                  </p>
                </div>

                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onBuy?.(lead.id);
                  }}
                  disabled={isPurchasing}
                  className="w-full bg-[#00A699] hover:bg-[#00857A]"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  {isPurchasing ? "Buying..." : "Buy Now"}
                </Button>
              </div>
            ) : null}

            <Button
              variant="outline"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                onView?.(lead?.id);
              }}
            >
              View Details
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Leads;

