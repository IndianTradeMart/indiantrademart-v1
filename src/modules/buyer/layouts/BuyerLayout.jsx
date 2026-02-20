import React, { useEffect, useMemo, useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useBuyerAuth } from "@/modules/buyer/context/AuthContext";
import { useSubdomain } from "@/contexts/SubdomainContext";
import {
  Home,
  LayoutDashboard,
  FileText,
  PlusCircle,
  User,
  LogOut,
  Menu,
  Search,
  MessageSquare,
  Ticket,
  Heart,
  Lightbulb,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import Logo from "@/shared/components/Logo";
import NotificationBell from "@/shared/components/NotificationBell";
import { supabase } from "@/lib/customSupabaseClient";
import { urlParser } from "@/shared/utils/urlParser";
import { useGlobalInputSanitizer } from "@/shared/hooks/useGlobalInputSanitizer";

const slugify = (value) => {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

// ✅ Resolve free-text location like "Delhi" / "New Delhi" to state/city slugs.
const resolveLocationSlugs = async (locText) => {
  const clean = (locText || "").trim();
  if (!clean) return { stateSlug: "", citySlug: "" };

  const locSlug = slugify(clean);

  // 1) Try CITY by slug
  try {
    const { data: cityBySlug } = await supabase
      .from("cities")
      .select("slug, state_id, name")
      .eq("slug", locSlug)
      .maybeSingle();

    if (cityBySlug?.slug && cityBySlug?.state_id) {
      const { data: st } = await supabase
        .from("states")
        .select("slug, name")
        .eq("id", cityBySlug.state_id)
        .maybeSingle();

      return { stateSlug: st?.slug || "", citySlug: cityBySlug.slug };
    }
  } catch {
    // ignore
  }

  // 2) Try STATE by slug
  try {
    const { data: stateBySlug } = await supabase
      .from("states")
      .select("slug, name")
      .eq("slug", locSlug)
      .maybeSingle();

    if (stateBySlug?.slug) {
      return { stateSlug: stateBySlug.slug, citySlug: "" };
    }
  } catch {
    // ignore
  }

  // 3) Fallback: name partial match (city first)
  try {
    const { data: cities } = await supabase
      .from("cities")
      .select("slug, state_id, name")
      .ilike("name", `%${clean}%`)
      .limit(1);

    const city = cities?.[0];
    if (city?.slug && city?.state_id) {
      const { data: st } = await supabase
        .from("states")
        .select("slug, name")
        .eq("id", city.state_id)
        .maybeSingle();

      return { stateSlug: st?.slug || "", citySlug: city.slug };
    }
  } catch {
    // ignore
  }

  try {
    const { data: states } = await supabase
      .from("states")
      .select("slug, name")
      .ilike("name", `%${clean}%`)
      .limit(1);

    const st = states?.[0];
    if (st?.slug) {
      return { stateSlug: st.slug, citySlug: "" };
    }
  } catch {
    // ignore
  }

  return { stateSlug: "", citySlug: "" };
};

const SidebarLink = ({ to, icon: Icon, children, onClick, end = false, isActiveMatch }) => {
  const location = useLocation();
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        {
          const active = typeof isActiveMatch === "function"
            ? isActiveMatch(location.pathname, isActive)
            : isActive;
          return `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors min-h-[48px] ${
            active
              ? "bg-[#003D82] text-white"
              : "text-neutral-600 hover:bg-neutral-100 hover:text-[#003D82]"
          }`;
        }
      }
    >
      <Icon className="h-5 w-5" />
      <span className="font-medium text-base md:text-sm">{children}</span>
    </NavLink>
  );
};

const SidebarButton = ({ icon: Icon, children, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors min-h-[48px] text-neutral-600 hover:bg-neutral-100 hover:text-[#003D82] w-full text-left"
    >
      <Icon className="h-5 w-5" />
      <span className="font-medium text-base md:text-sm">{children}</span>
    </button>
  );
};

const BuyerLayout = () => {
  useGlobalInputSanitizer();

  const {
    user,
    buyer,
    logout,
    isBuyerSuspended,
    buyerLoading,
  } = useBuyerAuth();

  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { resolvePath, appType } = useSubdomain();

  // ✅ Header quick search (no popup)
  const [searchText, setSearchText] = useState("");
  const [searchSubmitting, setSearchSubmitting] = useState(false);

  const [buyerProfile, setBuyerProfile] = useState({
    full_name: "",
    company_name: "",
    avatar_url: "",
  });

  useEffect(() => {
    setBuyerProfile({
      full_name:
        buyer?.full_name ||
        user?.user_metadata?.full_name ||
        user?.full_name ||
        "",
      company_name:
        buyer?.company_name ||
        user?.user_metadata?.company_name ||
        "",
      avatar_url:
        buyer?.avatar_url ||
        user?.user_metadata?.avatar_url ||
        user?.avatar_url ||
        "",
    });
  }, [
    buyer?.full_name,
    buyer?.company_name,
    buyer?.avatar_url,
    user?.user_metadata?.full_name,
    user?.user_metadata?.company_name,
    user?.user_metadata?.avatar_url,
    user?.full_name,
    user?.avatar_url,
  ]);

  const displayName = useMemo(() => {
    return (
      buyerProfile.full_name ||
      user?.user_metadata?.full_name ||
      user?.full_name ||
      user?.name ||
      "Buyer"
    );
  }, [buyerProfile.full_name, user]);

  const displayCompany = useMemo(() => {
    return (
      buyerProfile.company_name ||
      user?.user_metadata?.company_name ||
      user?.company ||
      ""
    );
  }, [buyerProfile.company_name, user]);

  const displayAvatar = useMemo(() => {
    return (
      buyerProfile.avatar_url ||
      user?.user_metadata?.avatar_url ||
      user?.avatar_url ||
      ""
    );
  }, [buyerProfile.avatar_url, user]);

  // ✅ FIXED logout (await + hard redirect)
  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      window.location.href = "/buyer/login";
    }
  };

  const goToMainHome = () => {
    if (appType === "main") {
      navigate("/");
      return;
    }

    const { protocol, hostname, port } = window.location;
    const knownSubdomains = ["buyer", "vendor", "admin", "man", "emp", "dir", "career"];
    const parts = hostname.split(".");
    const rootHost =
      parts.length >= 2 && knownSubdomains.includes(parts[0])
        ? parts.slice(1).join(".")
        : hostname;

    const hostWithPort = port ? `${rootHost}:${port}` : rootHost;
    window.location.href = `${protocol}//${hostWithPort}/`;
  };

  const openDirectorySearch = async (term) => {
    const raw = String(term || "").trim();
    if (!raw) {
      toast({ title: "Type something to search" });
      return false;
    }

    if (searchSubmitting) return false;
    setSearchSubmitting(true);

    try {
      let serviceText = raw;
      let freeLocText = "";
      const m = raw.match(/^(.*)\s+in\s+(.+)$/i);
      if (m && m[1] && m[2]) {
        serviceText = String(m[1]).trim();
        freeLocText = String(m[2]).trim();
      }

      const serviceSlug = slugify(serviceText);
      if (!serviceSlug) {
        toast({ title: "Type something to search" });
        return false;
      }

      let stateSlug = "";
      let citySlug = "";
      if (freeLocText) {
        const resolved = await resolveLocationSlugs(freeLocText);
        stateSlug = resolved?.stateSlug || "";
        citySlug = resolved?.citySlug || "";
      }

      const path = urlParser.createStructuredUrl(serviceSlug, stateSlug, citySlug);

      if (appType === "main") {
        navigate(path);
        return true;
      }

      const { protocol, hostname, port } = window.location;
      const knownSubdomains = ["buyer", "vendor", "admin", "man", "emp", "dir", "career"];
      const parts = hostname.split(".");
      const rootHost =
        parts.length >= 2 && knownSubdomains.includes(parts[0])
          ? parts.slice(1).join(".")
          : hostname;
      const hostWithPort = port ? `${rootHost}:${port}` : rootHost;
      window.location.href = `${protocol}//${hostWithPort}${path}`;
      return true;
    } finally {
      setSearchSubmitting(false);
    }
  };

  const getPageTitle = () => {
    const path = location.pathname.split("/").pop();
    if (path === "dashboard") return "Buyer Dashboard";
    if (path === "create") return "Create Proposal";
    return path.charAt(0).toUpperCase() + path.slice(1);
  };

  const SidebarContent = ({ mobile = false }) => {
    const closeMobile = () => setIsMobileMenuOpen(false);

    // ✅ Suspended buyer sidebar: ONLY 2 links
    const SuspendedNav = () => (
      <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
        <SidebarLink
          to={resolvePath("account-suspended", "buyer")}
          icon={Ban}
          onClick={closeMobile}
        >
          Account Suspended
        </SidebarLink>

        <SidebarLink
          to={resolvePath("tickets", "buyer")}
          icon={Ticket}
          onClick={closeMobile}
        >
          Support Tickets
        </SidebarLink>
      </nav>
    );

    // ✅ Active buyer sidebar: FULL links
    const ActiveNav = () => {
      const dashboardPath = resolvePath("dashboard", "buyer");
      const proposalsPath = resolvePath("proposals", "buyer");
      const newProposalPath = resolvePath("proposals/new", "buyer");
      const normalizePath = (value = "") => {
        const normalized = String(value).replace(/\/+$/, "");
        return normalized || "/";
      };
      const normalizedProposalsPath = normalizePath(proposalsPath);
      const normalizedNewProposalPath = normalizePath(newProposalPath);

      return (
      <nav className="px-3 py-3 space-y-1 flex-1 overflow-y-auto">
        <SidebarButton icon={Home} onClick={() => { closeMobile(); goToMainHome(); }}>
          Home
        </SidebarButton>

        <SidebarLink
          to={dashboardPath}
          end
          icon={LayoutDashboard}
          onClick={closeMobile}
        >
          Dashboard
        </SidebarLink>

        <SidebarLink
          to={proposalsPath}
          icon={FileText}
          onClick={closeMobile}
          isActiveMatch={(pathname) => {
            const currentPath = normalizePath(pathname);
            return (
              currentPath === normalizedProposalsPath ||
              (currentPath.startsWith(`${normalizedProposalsPath}/`) &&
                currentPath !== normalizedNewProposalPath)
            );
          }}
        >
          My Proposals
        </SidebarLink>

        <SidebarLink
          to={newProposalPath}
          end
          icon={PlusCircle}
          onClick={closeMobile}
          isActiveMatch={(pathname) =>
            normalizePath(pathname) === normalizedNewProposalPath
          }
        >
          New Proposal
        </SidebarLink>

        <SidebarLink
          to={resolvePath("messages", "buyer")}
          icon={MessageSquare}
          onClick={closeMobile}
        >
          Messages
        </SidebarLink>

        <SidebarLink
          to={resolvePath("tickets", "buyer")}
          icon={Ticket}
          onClick={closeMobile}
        >
          Support Tickets
        </SidebarLink>

        <SidebarLink
          to={resolvePath("favorites", "buyer")}
          icon={Heart}
          onClick={closeMobile}
        >
          Favorites
        </SidebarLink>

        <SidebarLink
          to={resolvePath("suggestions", "buyer")}
          icon={Lightbulb}
          onClick={closeMobile}
        >
          Suggestions
        </SidebarLink>

        <SidebarLink
          to={resolvePath("profile", "buyer")}
          icon={User}
          onClick={closeMobile}
        >
          Profile
        </SidebarLink>
      </nav>
      );
    };

    return (
      <div className="flex flex-col h-full">
        {!mobile && (
          <div className="h-16 flex items-center justify-center border-b border-neutral-100 px-4">
            <Logo className="h-8" showTagline={false} />
          </div>
        )}

        {/* ✅ Banner for suspended */}
        {!buyerLoading && isBuyerSuspended && (
          <div className="px-4 pt-4">
            <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs p-3">
              Your account is suspended. Only Support Tickets are available.
            </div>
          </div>
        )}

        {/* ✅ Render nav based on suspended */}
        {buyerLoading ? (
          <nav className="p-4 flex-1" />
        ) : isBuyerSuspended ? (
          <SuspendedNav />
        ) : (
          <ActiveNav />
        )}

        <div className="px-3 py-3 border-t border-neutral-100 bg-white mt-auto">
          {/* Profile block */}
          <button
            type="button"
            onClick={() => {
              closeMobile();
              navigate(resolvePath("profile", "buyer"));
            }}
            className="w-full flex items-center gap-3 mb-2 px-2 py-2 rounded-lg hover:bg-neutral-100 text-left"
            title="Open Profile"
          >
            <div className="w-10 h-10 rounded-full bg-[#00A699] flex items-center justify-center text-white font-bold text-base overflow-hidden shrink-0">
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt={displayName}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                (displayName?.[0] || "B").toUpperCase()
              )}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-neutral-900 truncate">
                {displayName}
              </p>
              <p className="text-xs text-neutral-500 truncate">{displayCompany}</p>
            </div>
          </button>

          <Button
            variant="ghost"
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 h-10 rounded-lg"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-neutral-200 fixed inset-y-0 z-50">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-[280px] sm:w-[320px]">
          <SheetHeader className="p-4 border-b border-neutral-100">
            <SheetTitle className="flex items-center gap-2">
              <Logo className="h-7" showTagline={false} />
            </SheetTitle>
          </SheetHeader>
          <SidebarContent mobile />
        </SheetContent>

        {/* Main Content */}
        <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
          <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-3 md:px-5 sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <h1 className="text-lg font-semibold text-neutral-900">
                {getPageTitle()}
              </h1>
            </div>

            {/* ✅ If suspended: hide header search + notifications */}
            {!buyerLoading && !isBuyerSuspended && (
              <div className="flex items-center gap-2">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const ok = await openDirectorySearch(searchText);
                    if (ok) setSearchText("");
                  }}
                  className="flex items-center gap-2"
                >
                  <div className="relative w-[160px] sm:w-[220px] md:w-[320px]">
                    <div className="absolute left-3 top-2.5 text-neutral-400">
                      <Search className="h-5 w-5" />
                    </div>
                    <Input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Search (e.g. land survey in delhi)"
                      className="pl-10 h-10"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="bg-[#003D82] hover:bg-[#00316a] h-10"
                    disabled={searchSubmitting}
                  >
                    {searchSubmitting ? "Searching..." : "Search"}
                  </Button>
                </form>

                <NotificationBell userId={user?.id || null} />
              </div>
            )}
          </header>

          <main className="flex-1 p-3 md:px-5 md:py-4 overflow-y-auto overflow-x-hidden">
            <div className="max-w-6xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </Sheet>
    </div>
  );
};

export default BuyerLayout;
