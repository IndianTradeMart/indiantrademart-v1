import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import {
  Truck,
  Plane,
  Ship,
  Warehouse,
  Snowflake,
  MapPin,
  ShieldCheck,
  Clock,
  PhoneCall,
  ArrowRight,
  Boxes,
  Route,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  animate: {
    transition: { staggerChildren: 0.08 },
  },
};

const Logistics = () => {
  return (
    <div
      className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-amber-50"
      style={{
        fontFamily: '"Space Grotesk", "Epilogue", sans-serif',
      }}
    >
      <Helmet>
        <title>Logistics & Supply Chain Services | IndianTradeMart</title>
        <meta
          name="description"
          content="End-to-end logistics for B2B shipments: road, air, sea, warehousing, cold chain, and last‑mile delivery."
        />
      </Helmet>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Epilogue:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');
      `}</style>

      <div className="absolute -top-40 -right-32 h-96 w-96 rounded-full bg-amber-200/30 blur-3xl" />
      <div className="absolute top-40 -left-24 h-96 w-96 rounded-full bg-blue-200/30 blur-3xl" />
      <div className="absolute bottom-0 right-10 h-80 w-80 rounded-full bg-emerald-200/30 blur-3xl" />

      <section className="relative z-10">
        <div className="container mx-auto px-4 pt-12 pb-8 md:pt-20 md:pb-12">
          <motion.div
            variants={stagger}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center"
          >
            <motion.div variants={fadeUp} className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                <Route className="h-4 w-4" />
                Logistics Network
              </span>
              <h1
                className="text-4xl font-bold leading-tight text-slate-900 md:text-5xl"
                style={{ fontFamily: '"Epilogue", sans-serif' }}
              >
                Smart Logistics for Fast‑Moving B2B Supply Chains
              </h1>
              <p className="text-base text-slate-600 md:text-lg">
                Plan, ship, track, and deliver with confidence. We connect verified transporters,
                warehousing partners, and last‑mile teams across India for reliable business
                logistics.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to="/contact">
                  <Button className="bg-slate-900 text-white hover:bg-slate-800">
                    Get Logistics Quotes
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/customer-care">
                  <Button variant="outline" className="border-slate-300 text-slate-700">
                    Talk to Expert
                    <PhoneCall className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <div className="flex flex-wrap gap-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> Verified partners
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" /> 24/7 shipment tracking
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-600" /> Pan‑India coverage
                </div>
              </div>
            </motion.div>

            <motion.div variants={fadeUp} className="relative">
              <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-xl backdrop-blur">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Live Operations Snapshot</h3>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    On‑time 96%
                  </span>
                </div>
                <div className="mt-6 space-y-4">
                  {[
                    { label: 'Daily Shipments', value: '2,400+', color: 'bg-blue-500' },
                    { label: 'Avg. Transit Time', value: '36 hrs', color: 'bg-amber-500' },
                    { label: 'Active Warehouses', value: '120+', color: 'bg-emerald-500' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-500">{item.label}</p>
                        <span className={`h-2 w-2 rounded-full ${item.color}`} />
                      </div>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                  Dedicated control tower, escalation handling, and milestone alerts for every shipment.
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="relative z-10">
        <div className="container mx-auto px-4 py-10">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: 'Cities Covered', value: '550+' },
              { label: 'Fleet Partners', value: '1,200+' },
              { label: 'Average Claims', value: '0.3%' },
              { label: 'Enterprise Clients', value: '900+' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-white/60 bg-white/70 p-4 text-center shadow-sm">
                <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
                <p className="mt-1 text-xs text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 md:text-3xl" style={{ fontFamily: '"Epilogue", sans-serif' }}>
                End‑to‑End Logistics Services
              </h2>
              <p className="mt-2 text-slate-600">
                Choose single service or build a full supply‑chain stack with warehousing and last‑mile.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              SLA backed operations
            </div>
          </div>

          <motion.div
            variants={stagger}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.2 }}
            className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          >
            {[
              {
                icon: Truck,
                title: 'Surface Transportation',
                text: 'FTL / PTL, express lanes, and optimized routes for heavy and bulky cargo.',
              },
              {
                icon: Plane,
                title: 'Air Cargo',
                text: 'Time‑critical shipments with priority handling and airport‑to‑door coverage.',
              },
              {
                icon: Ship,
                title: 'Sea Freight',
                text: 'FCL / LCL options with customs support and port documentation.',
              },
              {
                icon: Warehouse,
                title: 'Warehousing',
                text: 'Multi‑location storage, pick/pack, and inventory visibility.',
              },
              {
                icon: Snowflake,
                title: 'Cold Chain',
                text: 'Temperature‑controlled movement for pharma and perishables.',
              },
              {
                icon: Boxes,
                title: 'Last‑Mile Delivery',
                text: 'City distribution and doorstep delivery with proof of delivery.',
              },
            ].map((service) => (
              <motion.div
                key={service.title}
                variants={fadeUp}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <service.icon className="h-6 w-6 text-blue-700" />
                <h3 className="mt-3 text-lg font-semibold text-slate-900">{service.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{service.text}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="relative z-10">
        <div className="container mx-auto px-4 py-12">
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-lg">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 md:text-3xl" style={{ fontFamily: '"Epilogue", sans-serif' }}>
                  How It Works
                </h2>
                <p className="mt-2 text-slate-600">
                  A simple, predictable workflow that keeps your operations on schedule.
                </p>
              </div>
              <div className="space-y-4">
                {[
                  { step: '01', title: 'Share shipment details', text: 'Pickup, drop, cargo type, and timelines.' },
                  { step: '02', title: 'Compare best quotes', text: 'Transparent rates from verified partners.' },
                  { step: '03', title: 'Track milestones', text: 'Live tracking with exception alerts.' },
                  { step: '04', title: 'Deliver & reconcile', text: 'POD, invoices, and closure updates.' },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="h-10 w-10 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-semibold">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-slate-900">{item.title}</h4>
                      <p className="text-sm text-slate-600">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10">
        <div className="container mx-auto px-4 pb-16">
          <div className="rounded-3xl bg-slate-900 p-8 text-white md:p-12">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
              <div>
                <h2 className="text-2xl font-semibold md:text-3xl" style={{ fontFamily: '"Epilogue", sans-serif' }}>
                  Ready to ship smarter?
                </h2>
                <p className="mt-3 text-slate-200">
                  Talk to our logistics desk for custom routing, SLA planning, and enterprise pricing.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 md:justify-end">
                <Link to="/contact">
                  <Button className="bg-white text-slate-900 hover:bg-slate-100">
                    Request Call Back
                  </Button>
                </Link>
                <Link to="/directory">
                  <Button variant="outline" className="border-white/40 text-white hover:bg-white/10">
                    Explore Suppliers
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Logistics;
