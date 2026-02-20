import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin, BadgeCheck, PackageX, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/shared/components/Badge';

const SearchResultsList = ({ products, query, city, category }) => {
  const navigate = useNavigate();

  const displayProducts = Array.isArray(products) ? products : [];
  const isUsingMock = false;

  const getProductDetailPath = (product) => {
    const slugOrId = product?.slug || product?.productSlug || product?.id;
    return slugOrId ? `/p/${slugOrId}` : '/directory';
  };

  const safeFirstImage = (product) => {
    const raw = product?.images;

    const pick = (val) => {
      if (typeof val === 'string') return val;
      if (val && typeof val === 'object') return val.url || val.image_url || val.src || null;
      return null;
    };

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed[0]) {
          const picked = pick(parsed[0]);
          if (picked) return picked;
        }
      } catch (_) {}
    }

    if (Array.isArray(raw) && raw[0]) {
      const picked = pick(raw[0]);
      if (picked) return picked;
    }

    return product?.image || 'https://images.unsplash.com/photo-1635865165118-917ed9e20936';
  };

  const getUnit = (product) => {
    const u =
      (product?.price_unit ||
        product?.qty_unit ||
        product?.unit ||
        product?.priceUnit ||
        product?.qtyUnit ||
        '')
        ?.toString?.()
        ?.trim?.() || '';

    if (!u) return '';
    if (u.toLowerCase() === 'nan' || u.toLowerCase() === 'null' || u.toLowerCase() === 'undefined') return '';
    return u;
  };

  const getPriceNumber = (rawPrice) => {
    if (rawPrice === null || rawPrice === undefined) return null;
    if (typeof rawPrice === 'number') return Number.isFinite(rawPrice) ? rawPrice : null;

    const cleaned = String(rawPrice).replace(/[₹,\s]/g, '').trim();
    if (!cleaned) return null;

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const renderPrice = (product) => {
    const unit = getUnit(product);
    const priceNum = getPriceNumber(product?.price);

    if (priceNum === null) {
      return (
        <span className="text-[#00A699] font-bold">
          Price on Request
          {unit ? <span className="text-xs font-semibold text-gray-500"> / {unit}</span> : null}
        </span>
      );
    }

    return (
      <span className="text-[#00A699] font-bold">
        ₹{priceNum.toLocaleString()}
        {unit ? <span className="text-xs font-semibold text-gray-500"> / {unit}</span> : null}
      </span>
    );
  };

  const getVendorLabel = (product) => {
    const v = (product?.vendorName || product?.vendor || '')
      ?.toString?.()
      ?.trim?.();
    return v || '';
  };

  // ✅ Plan label
  const getPlanBadgeText = (product) => {
    const planRaw = (product?.vendorPlanName || '').toString().trim();
    if (!planRaw) return '';
    const p = planRaw.toLowerCase();

    if (p.includes('trial')) return '';

    if (p.includes('diamond') || p.includes('dimond')) return 'Diamond Supplier';
    if (p.includes('gold')) return 'Gold Supplier';
    if (p.includes('silver')) return 'Silver Supplier';
    if (p.includes('certified')) return 'Certified Supplier';
    if (p.includes('booster')) return 'Booster Supplier';
    if (p.includes('startup')) return 'Startup Supplier';

    const nice = planRaw.replace(/\s+plan\s*$/i, '').trim();
    return nice ? `${nice} Supplier` : '';
  };

  const getPlanBadgeClass = (planText) => {
    const p = String(planText || '').toLowerCase().trim();
    if (!p) return 'bg-[#7EA6E0]';

    if (p.includes('diamond')) return 'bg-[#1D4ED8]';
    if (p.includes('gold')) return 'bg-[#B45309]';
    if (p.includes('silver')) return 'bg-[#475569]';
    if (p.includes('certified')) return 'bg-[#047857]';
    if (p.includes('booster')) return 'bg-[#7C3AED]';
    if (p.includes('startup')) return 'bg-[#0F766E]';

    return 'bg-[#7EA6E0]';
  };

  // ✅ FIXED: uses year_of_establishment
  const getVendorYears = (product) => {
    const v = product?.vendors || {};

    const direct =
      product?.vendorYearsInBusiness ??
      product?.vendorYears ??
      v?.years_in_business ??
      v?.yearsInBusiness ??
      null;

    if (direct !== null && direct !== undefined && String(direct).trim() !== '') {
      const n = Number(direct);
      return Number.isFinite(n) && n > 0 ? n : null;
    }

    const est =
      product?.vendorYearOfEstablishment ??
      product?.vendorEstablishedYear ??
      v?.year_of_establishment ??
      v?.yearOfEstablishment ??
      v?.established_year ??
      null;

    if (est) {
      const y = Number(est);
      const nowY = new Date().getFullYear();
      if (Number.isFinite(y) && y > 1900 && y <= nowY) {
        const yrs = nowY - y;
        return yrs > 0 ? yrs : null;
      }
    }

    return null;
  };

  const getResponseRate = (product) => {
    const v = product?.vendors || {};
    const rr =
      product?.vendorResponseRate ??
      v?.response_rate ??
      v?.responseRate ??
      null;

    if (rr === null || rr === undefined || String(rr).trim() === '') return null;
    const n = Number(rr);
    if (!Number.isFinite(n)) return null;
    if (n < 0 || n > 100) return null;
    return Math.round(n);
  };

  // ✅ DB-confirmed badges only
  const buildMetaBadges = (product) => {
    const items = [];
    const v = product?.vendors || {};

    const gstOk =
      v?.gst_verified === true ||
      v?.gst_verified === 1 ||
      product?.vendorGstVerified === true ||
      product?.vendorGstVerified === 1 ||
      product?.gst_verified === true ||
      product?.gst_verified === 1;

    const trustOk =
      v?.verification_badge === true ||
      String(v?.kyc_status || '').toUpperCase() === 'VERIFIED' ||
      product?.vendorVerified === true;

    const years = getVendorYears(product);
    const rr = getResponseRate(product);

    if (gstOk) items.push({ type: 'ok', text: 'GST ✓' });
    if (trustOk) items.push({ type: 'ok', text: 'Certified Supplier ✓' });
    if (years !== null) items.push({ type: 'info', text: `${years} yrs` });
    if (rr !== null) items.push({ type: 'info', text: `${rr}% Response Rate` });

    return items;
  };

  if (!isUsingMock && displayProducts.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
        <PackageX className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900">No products found</h3>
        <p className="text-gray-500">Try adjusting your filters or search for a different category.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-neutral-600">
          Showing <span className="font-semibold">{displayProducts.length}</span> results
          {isUsingMock && <span className="text-xs ml-2 text-amber-600">(Demo Data)</span>}
        </p>
        <select className="px-4 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003D82]">
          <option>Relevance</option>
          <option>Price: Low to High</option>
          <option>Price: High to Low</option>
          <option>Rating</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {displayProducts.map((product, index) => {
          const planText = getPlanBadgeText(product);
          const metaBadges = buildMetaBadges(product);

          return (
            <motion.div
              key={product.id || index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              whileHover={{ y: -4 }}
              className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all border border-neutral-200 overflow-hidden cursor-pointer flex flex-col"
              onClick={() => navigate(getProductDetailPath(product))}
            >
              <div className="relative h-48 overflow-hidden bg-gray-100">
                <img
                  className="w-full h-full object-cover"
                  alt={product.name || 'Product'}
                  src={safeFirstImage(product)}
                  onError={(e) => {
                    e.target.src =
                      'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?auto=format&fit=crop&q=80&w=300';
                  }}
                />

                {planText ? (
                  <div className="absolute top-3 left-3">
                    <span
                      className={`${getPlanBadgeClass(planText)} text-white text-xs font-semibold px-2 py-1 rounded-sm shadow`}
                    >
                      {planText}
                    </span>
                  </div>
                ) : null}

                {product.featured && (
                  <div className="absolute top-3 right-3">
                    <Badge variant="warning" className="bg-yellow-500 text-white">
                      Featured
                    </Badge>
                  </div>
                )}
              </div>

              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-bold text-lg text-[#003D82] mb-2 line-clamp-2">{product.name}</h3>

                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xl">{renderPrice(product)}</span>

                  <Button
                    className="bg-[#00796B] hover:bg-[#00695C] text-white h-9 px-4"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(getProductDetailPath(product));
                    }}
                  >
                    Contact Supplier
                  </Button>
                </div>

                {(product.vendorCity || product.city) && (
                  <div className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
                    <MapPin className="h-3 w-3" />
                    <span>
                      {product.vendorCity || product.city}
                      {product.vendorState || product.state ? `, ${product.vendorState || product.state}` : ''}
                    </span>
                  </div>
                )}

                {getVendorLabel(product) ? (
                  <div className="flex items-center gap-2 text-sm text-neutral-600 mb-2">
                    <BadgeCheck className={`h-4 w-4 ${product.vendorVerified ? 'text-green-600' : 'text-gray-400'}`} />
                    <span className="font-medium truncate">{getVendorLabel(product)}</span>
                  </div>
                ) : null}

                {metaBadges.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {metaBadges.map((b, i) => (
                      <span
                        key={i}
                        className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${
                          b.type === 'ok'
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-slate-700 bg-slate-50 border-slate-200'
                        }`}
                      >
                        {b.text}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mb-3" />
                )}

                <div className="flex items-center justify-between mt-auto pt-3 border-t">
                  <button
                    className="text-[#0A7C65] text-sm font-semibold inline-flex items-center gap-2 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(getProductDetailPath(product));
                    }}
                  >
                    <Phone className="h-4 w-4" />
                    View Mobile Number
                  </button>

                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold text-sm">{product.rating || product.vendorRating || 4.5}</span>
                    <span className="text-sm text-neutral-500">({product.reviews || 0})</span>
                  </div>
                </div>

                <div className="pt-3">
                  <Button
                    className="w-full bg-[#003D82] hover:bg-[#00254E] text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(getProductDetailPath(product));
                    }}
                  >
                    View Details
                  </Button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default SearchResultsList;
