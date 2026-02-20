import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet';
import HeroSection from '@/modules/directory/components/HeroSection';
const HomeDeferredSections = lazy(() => import('./HomeDeferredSections'));

const HOME_SEO = {
  title:
    'Indian Trade Mart- India’s leading online B2B marketplace and platform for Indian Manufacturers, Suppliers, Exporters, Service provider, Directory.',
  description:
    'indiantrademart.com is  single window & India’s leading online B2B marketplace and platform for Indian Manufacturers, Suppliers, Exporters & Service provider, serving as the pivotal link between buyers and suppliers, free online business directory & yellow page with listing Indian & International companies. We provide a platform to empowering generations of entrepreneurs, Small & Medium Enterprises, Large Enterprises as well as individual users. Find here quality products, trade leads, manufacturers, suppliers, exporters & international buyers.',
  keywords:
    'online B2B marketplace, online B2B platform, Business directory, business directory in India, business e-commerce, business listings, B2C online marketplaces in India, Digital commerce platform, business website, business marketplace, companies business listings, companies database india, companies directory, companies directory india, directory of companies, directory of indian companies, service provider, e-commerce in india, trade & commerce, exporter importer directory, exporters business directory, exporters in india, free business listings, free business listings in india, free business marketplace, free indian companies business listings, free manufacturers directory india, importers, india business directory, india export import, india importers, Indian Trade Mart, indian business, Indian companies directory, indian exporters, indian exporters directory, indian manufacturers directory, indian market, indian service providers, manufacturers directory, manufacturers in india, online business directory, suppliers directory, yellow pages, Properties, Builder & Real Estate, Survey & Soil Investigation, Engineering Services, Construction Materials & Machines, Construction Materials & Machines, Electrical Equipment, Electronics & Electrical, R & D and Testing Labs, Business & Audit Services, Product Rental & Leasing, Product Rental & Leasing, Hand & Machine Tools, Mechanical Parts & Spares, Industrial Supplies, Industrial Plants & Machinery, Food & Beverages, Apparel & Garments, Packaging Machines & Goods, Chemicals, Dyes & Solvents, Lab Instruments & Supplies, Furniture & Supplies, Automobile, Parts & Spares, Housewares & Supplies, Metals, Alloys & Minerals, Handicrafts & Decorative, Kitchen Utensils & Appliances, Textiles, Yarn & Fabrics, Books & Stationery, Cosmetics & Personal Care, Home Textile & Furnishing, Drugs & Pharmaceuticals, Gems, Jewelry & Astrology, Computer & IT Solutions, Fashion Accessories & Gear, Herbal & Ayurvedic Product, Security Systems & Services, Sports Goods, Toys & Games, Paper & Paper Products, Bags, Belts & Wallets, Media, PR & Publishing, Marble, Granite & Stones, Event Planner & Organizer, IT & Telecom Services, Transportation & Logistics, Financial & Legal Services, Education & Training, Travel, Tourism & Hotels, Call Center & BPO Services, Bicycle, Rickshaw & Spares, Hospital & Diagnostics, HR Planning & Recruitment, Rail, Shipping & Aviation, House Keeping Services, Leather Products, Misc Contractors & Freelancers, Electronics Components, Hospital, Clinic & Consultation, Construction & Infrastructural Consultant, Album, Movies, Commercial Ads',
};

const Home = () => {
  const [showDeferred, setShowDeferred] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const reveal = () => {
      if (!cancelled) setShowDeferred(true);
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(reveal, { timeout: 1500 });
      return () => {
        cancelled = true;
        if (window.cancelIdleCallback) window.cancelIdleCallback(id);
      };
    }

    const timeoutId = window.setTimeout(reveal, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50">
      <Helmet>
        <title>{HOME_SEO.title}</title>
        <meta name="description" content={HOME_SEO.description} />
        <meta name="keywords" content={HOME_SEO.keywords} />
      </Helmet>

      <HeroSection />
      {showDeferred ? (
        <Suspense
          fallback={(
            <div className="py-12 text-center text-slate-400">Loading sections...</div>
          )}
        >
          <HomeDeferredSections />
        </Suspense>
      ) : null}
    </div>
  );
};

export default Home;
