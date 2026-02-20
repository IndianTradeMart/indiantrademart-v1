import React, { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PublicLayout from '@/shared/layouts/PublicLayout';

import Home from '@/modules/directory/pages/Home';
const Directory = lazy(() => import('@/modules/directory/pages/Directory'));
const CitiesPage = lazy(() => import('@/modules/directory/pages/CitiesPage'));
const CityPage = lazy(() => import('@/modules/directory/pages/CityPage'));
const SubCategoryPage = lazy(() => import('@/modules/directory/pages/SubCategoryPage'));
const MicroCategoryPage = lazy(() => import('@/modules/directory/pages/MicroCategoryPage'));
const DynamicCategory = lazy(() => import('@/modules/directory/pages/DynamicCategory'));
const ProductListing = lazy(() => import('@/modules/directory/pages/ProductListing'));
const ProductDetail = lazy(() => import('@/modules/directory/pages/ProductDetail'));
const SearchResults = lazy(() => import('@/modules/directory/pages/SearchResults'));

const AboutUs = lazy(() => import('@/modules/directory/pages/AboutUs'));
const BecomeVendor = lazy(() => import('@/modules/directory/pages/BecomeVendor'));
const Pricing = lazy(() => import('@/modules/directory/pages/Pricing'));
const Login = lazy(() => import('@/modules/directory/pages/Login'));
const Logistics = lazy(() => import('@/modules/directory/pages/Logistics'));

const VendorListing = lazy(() => import('@/modules/directory/pages/VendorListing'));
const VendorProfilePublic = lazy(() => import('@/modules/directory/pages/VendorProfile'));

const Press = lazy(() => import('@/modules/directory/pages/Press'));
const Investor = lazy(() => import('@/modules/directory/pages/Investor'));
const ForgotPassword = lazy(() => import('@/shared/pages/ForgotPassword'));

const JoinSales = lazy(() => import('@/modules/directory/pages/FooterPages').then((m) => ({ default: m.JoinSales })));
const SuccessStories = lazy(() => import('@/modules/directory/pages/FooterPages').then((m) => ({ default: m.SuccessStories })));
const Help = lazy(() => import('@/modules/directory/pages/FooterPages').then((m) => ({ default: m.Help })));
const CustomerCare = lazy(() => import('@/modules/directory/pages/FooterPages').then((m) => ({ default: m.CustomerCare })));
const Complaints = lazy(() => import('@/modules/directory/pages/FooterPages').then((m) => ({ default: m.Complaints })));
const Jobs = lazy(() => import('@/modules/directory/pages/FooterPages').then((m) => ({ default: m.Jobs })));
const ContactPage = lazy(() => import('@/modules/directory/pages/FooterPages').then((m) => ({ default: m.ContactPage })));
const BuyLeads = lazy(() => import('@/modules/directory/pages/FooterPages').then((m) => ({ default: m.BuyLeads })));
const LearningCentre = lazy(() => import('@/modules/directory/pages/FooterPages').then((m) => ({ default: m.LearningCentre })));
const ProductsPage = lazy(() => import('@/modules/directory/pages/FooterPages').then((m) => ({ default: m.ProductsPage })));

export const DirectoryRoutes = () => {
  return (
    <Routes>
      <Route element={<PublicLayout />}>

        {/* Home */}
        <Route index element={<Home />} />

        {/* Directory Base */}
        <Route path="directory" element={<Directory />} />

        {/* Cities */}
        <Route path="directory/cities" element={<CitiesPage />} />
        <Route path="directory/city/:citySlug" element={<CityPage />} />
        {/* Alias: /city/:citySlug */}
        <Route path="city/:citySlug" element={<CityPage />} />

        {/* Vendor */}
        <Route path="directory/vendor" element={<VendorListing />} />
        <Route path="directory/vendor/:vendorId" element={<VendorProfilePublic />} />

        {/* Search (MOST specific first) */}
        <Route path="directory/search/:service/:state/:city" element={<SearchResults />} />
        <Route path="directory/search/:service/:state" element={<SearchResults />} />
        <Route path="directory/search/:service" element={<SearchResults />} />
        <Route path="directory/search" element={<Navigate to="/directory" replace />} />
        {/* Alias: /search-suppliers -> /directory/vendor */}
        <Route path="search-suppliers" element={<Navigate to="/directory/vendor" replace />} />

        {/* Category Hierarchy */}
        {/* ✅ Product listing supports optional state/city slugs for auto-filter */}
        <Route path="directory/:headSlug/:subSlug/:microSlug/:stateSlug/:citySlug" element={<ProductListing />} />
        <Route path="directory/:headSlug/:subSlug/:microSlug/:stateSlug" element={<ProductListing />} />
        <Route path="directory/:headSlug/:subSlug/:microSlug" element={<ProductListing />} />

        <Route path="directory/:headSlug/:subSlug" element={<MicroCategoryPage />} />
        <Route path="directory/:headSlug" element={<SubCategoryPage />} />

        {/* Dynamic catch-all (LAST) */}
        <Route path="directory/:fullSlug" element={<DynamicCategory />} />

        {/* Product Detail */}
        <Route path="p/:productSlug" element={<ProductDetail />} />

        {/* Auth */}
        <Route path="auth/login" element={<Login />} />
        <Route path="auth/forgot-password" element={<ForgotPassword />} />

        {/* Static Pages */}
        <Route path="about-us" element={<AboutUs />} />
        <Route path="become-a-vendor" element={<BecomeVendor />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="logistics" element={<Logistics />} />

        {/* Footer Info */}
        <Route path="press" element={<Press />} />
        <Route path="investor" element={<Investor />} />
        <Route path="join-sales" element={<JoinSales />} />
        <Route path="success-stories" element={<SuccessStories />} />

        {/* Support */}
        <Route path="help" element={<Help />} />
        <Route path="customer-care" element={<CustomerCare />} />
        <Route path="complaints" element={<Complaints />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="contact" element={<ContactPage />} />

        {/* Toolkits */}
        <Route path="buyleads" element={<BuyLeads />} />
        <Route path="learning-centre" element={<LearningCentre />} />
        <Route path="products" element={<ProductsPage />} />

        {/* Alias */}
        <Route path="search" element={<Navigate to="/directory" replace />} />

      </Route>
    </Routes>
  );
};
