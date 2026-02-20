import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";

// ✅ Hardcoded brands (same as your list)
const PREMIUM_BRANDS = [
  {
    id: "pdce",
    name: "PDCE",
    slug: "pdce",
    logo_url: "https://eimager.com/images/pdce-new.png",
  },
  {
    id: "bsh",
    name: "BSH",
    slug: "bsh",
    logo_url: "https://eimager.com/images/bsh.png",
  },
  {
    id: "bsh-realty",
    name: "BSH Realty",
    slug: "bsh-realty",
    logo_url: "https://eimager.com/images/bshrealty.png",
  },
  {
    id: "ultimate itech",
    name: "Ultimate Itech",
    slug: "ultimate-itech",
    logo_url: "https://eimager.com/images/ultimate-new.png",
  },
  {
    id: "startup",
    name: "Startup",
    slug: "startup",
    logo_url: "https://eimager.com/images/startup.png",
  },
  {
    id: "movie",
    name: "Movie",
    slug: "movie",
    logo_url: "https://eimager.com/images/movie-image.png",
  },
  {
    id: "sres-tech",
    name: "SRES Tech",
    slug: "sres-tech",
    logo_url: "https://eimager.com/images/sres-tech.png",
  },
  {
    id: "pss-lab",
    name: "PSS Lab",
    slug: "pss-lab",
    logo_url: "https://eimager.com/images/pss-lab-now.png",
  },
];

const PremiumBrandsSection = () => {
  const navigate = useNavigate();

  // ✅ for seamless marquee, we duplicate once (2 sets)
  const items = useMemo(() => {
    const arr = PREMIUM_BRANDS || [];
    return [...arr, ...arr];
  }, []);

  // ✅ Bigger logos
  const logoClass =
    "max-h-20 md:max-h-24 lg:max-h-28 w-auto object-contain";

  // ✅ Pass-pass (gap kam + card width kam)
  const tileClass =
    "flex-none w-44 md:w-48 lg:w-52 h-24 md:h-28 lg:h-32 " +
    "flex items-center justify-center cursor-pointer " +
    "hover:scale-105 transition-transform duration-300";

  return (
    <section className="py-16 bg-gray-50 border-t border-gray-100 overflow-x-hidden">
      <style>{`
        @keyframes brand-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .marquee-wrap {
          overflow: hidden;
          width: 100%;
          position: relative;
        }
        .marquee-track {
          display: flex;
          width: max-content;
          animation: brand-marquee 35s linear infinite; /* speed */
          will-change: transform;
        }
        .marquee-wrap:hover .marquee-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none; transform: translateX(0); }
        }
      `}</style>

      <div className="container mx-auto px-4 overflow-x-hidden">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-gray-900">
            Explore products from{" "}
            <span className="text-[#4F46E5]">Premium Brands</span>
          </h2>
        </div>

        <div className="marquee-wrap">
          {/* ✅ gap-2 (logos close) */}
          <div className="marquee-track gap-2 items-center py-1">
            {items.map((brand, idx) => (
              <div
                key={`${brand.id}-${idx}`}
                className={tileClass}
                title={brand.name}
                onClick={() => navigate(`/directory/brand/${brand.slug}`)}
              >
                <img
                  src={brand.logo_url}
                  alt={brand.name}
                  className={logoClass}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PremiumBrandsSection;
