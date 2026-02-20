import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, Crown, Sparkles, Star, Zap } from 'lucide-react';

const cx = (...arr) => arr.filter(Boolean).join(' ');

const formatINR = (v) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString('en-IN');
};

const Pricing = () => {
  const [billing, setBilling] = useState('yearly'); // 'monthly' | 'yearly'
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  // ✅ As per your sheet
  const plans = useMemo(
    () => [
      {
        name: 'Trial',
        tag: 'Trial',
        icon: Star,
        isPopular: false,
        dailyBonus: 1,
        weeklyLead: 10,
        states: 2,
        cities: 20,
        topLevel: null,
        ranking: 'Remaining all',
        offeredMonthly: 0,
        offeredYearly: 0,
        discountedMonthly: 0,
        discountedYearly: 0,
      },
      {
        name: 'Startup',
        tag: 'Startup',
        icon: Zap,
        isPopular: false,
        dailyBonus: 1,
        weeklyLead: 15,
        states: 3,
        cities: 30,
        topLevel: null,
        ranking: 'All Starter Plan Member',
        offeredMonthly: 2300,
        offeredYearly: 23000,
        discountedMonthly: 2000,
        discountedYearly: 20000,
      },
      {
        name: 'Certified',
        tag: 'Certified',
        icon: Sparkles,
        isPopular: false,
        dailyBonus: 2,
        weeklyLead: 20,
        states: 5,
        cities: 40,
        topLevel: null,
        ranking: 'All Verified Plan Member',
        offeredMonthly: 3450,
        offeredYearly: 34500,
        discountedMonthly: 3000,
        discountedYearly: 30000,
      },
      {
        name: 'Booster',
        tag: 'Booster',
        icon: Zap,
        isPopular: false,
        dailyBonus: 2,
        weeklyLead: 30,
        states: 7,
        cities: 50,
        topLevel: null,
        ranking: 'All Booster Plan Member',
        offeredMonthly: 4600,
        offeredYearly: 46000,
        discountedMonthly: 4000,
        discountedYearly: 40000,
      },
      {
        name: 'Silver',
        tag: 'Silver',
        icon: Star,
        isPopular: false,
        dailyBonus: 4,
        weeklyLead: 70,
        states: 10,
        cities: 70,
        topLevel: 10,
        ranking: '3–2 Nos',
        offeredMonthly: 8050,
        offeredYearly: 80500,
        discountedMonthly: 7000,
        discountedYearly: 70000,
      },
      {
        name: 'Gold',
        tag: 'Gold',
        icon: Crown,
        isPopular: true,
        dailyBonus: 5,
        weeklyLead: 105,
        states: 15,
        cities: 90,
        topLevel: 15,
        ranking: '1–1 Nos',
        offeredMonthly: 17250,
        offeredYearly: 172500,
        discountedMonthly: 15000,
        discountedYearly: 150000,
      },
      {
        name: 'Diamond',
        tag: 'Diamond',
        icon: Crown,
        isPopular: false,
        dailyBonus: 7,
        weeklyLead: 150,
        states: 20,
        cities: 100,
        topLevel: 20,
        ranking: '1–1 Nos',
        offeredMonthly: 28750,
        offeredYearly: 287500,
        discountedMonthly: 25000,
        discountedYearly: 250000,
      },
    ],
    []
  );

  const getPrice = (p) => {
    const discounted = billing === 'monthly' ? p.discountedMonthly : p.discountedYearly;
    const offered = billing === 'monthly' ? p.offeredMonthly : p.offeredYearly;
    return { discounted, offered };
  };

  const openPlan = (plan) => {
    setSelectedPlan(plan);
    setOpen(true);
  };

  return (
    <>
      <Helmet>
        <title>Pricing - IndianTradeMart</title>
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 py-14">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-white shadow-sm text-xs text-slate-700">
              <Crown className="w-4 h-4" />
              Vendor Subscription Plans
            </div>

            <h1 className="mt-4 text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
              Choose your growth plan
            </h1>
            <p className="mt-3 text-slate-600">
              Same plans as Vendor Portal. Higher plan = more visibility + more leads + better support.
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <Link to="/vendor/register">
                <Button className="h-10 px-5">Register as Vendor</Button>
              </Link>
              <Link to="/vendor/login">
                <Button variant="outline" className="h-10 px-5">
                  Vendor Login
                </Button>
              </Link>
            </div>

            {/* Billing toggle */}
            <div className="mt-8 inline-flex rounded-full border bg-white p-1 shadow-sm">
              <button
                onClick={() => setBilling('monthly')}
                className={cx(
                  'px-4 py-2 text-sm rounded-full transition',
                  billing === 'monthly' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling('yearly')}
                className={cx(
                  'px-4 py-2 text-sm rounded-full transition',
                  billing === 'yearly' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                Yearly
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-700">discounted price (15% OFF)</span> with original
              strike-through.
            </div>
          </div>

          {/* Cards */}
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {plans.map((p) => {
              const Icon = p.icon;
              const { discounted, offered } = getPrice(p);

              const isFree = Number(discounted || 0) === 0;

              return (
                <motion.button
                  key={p.name}
                  type="button"
                  onClick={() => openPlan(p)}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.99 }}
                  className="group text-left"
                >
                  {/* Gradient border wrapper */}
                  <div
                    className={cx(
                      'rounded-2xl p-[1px] transition',
                      p.isPopular
                        ? 'bg-gradient-to-br from-blue-500 via-emerald-500 to-indigo-500'
                        : 'bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200'
                    )}
                  >
                    <div
                      className={cx(
                        'rounded-2xl bg-white/90 backdrop-blur px-5 py-5 shadow-sm transition',
                        'hover:shadow-xl',
                        p.isPopular ? 'ring-1 ring-emerald-500/20' : 'ring-1 ring-slate-200/60'
                      )}
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={cx(
                              'h-10 w-10 rounded-xl grid place-items-center border',
                              p.isPopular ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                            )}
                          >
                            <Icon className={cx('w-5 h-5', p.isPopular ? 'text-emerald-600' : 'text-slate-700')} />
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-bold text-slate-900">{p.name}</h3>
                              <span className="text-xs px-2 py-0.5 rounded-full border bg-white text-slate-700">
                                {p.tag}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">Tap card to view full details</div>
                          </div>
                        </div>

                        {p.isPopular && (
                          <div className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            MOST POPULAR
                          </div>
                        )}
                      </div>

                      {/* Price */}
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div>
                          {isFree ? (
                            <div className="text-3xl font-extrabold text-slate-900">₹0</div>
                          ) : (
                            <div className="flex items-end gap-2">
                              <div className="text-3xl font-extrabold text-slate-900">
                                ₹{formatINR(discounted)}
                              </div>
                              <div className="text-sm text-slate-500">/{billing === 'monthly' ? 'month' : 'year'}</div>
                            </div>
                          )}

                          {!isFree && (
                            <div className="mt-1 text-xs text-slate-500">
                              <span className="line-through mr-2">₹{formatINR(offered)}</span>
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                <Sparkles className="w-3.5 h-3.5" /> 15% OFF
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-slate-500 text-right">
                          <div className="font-semibold text-slate-700">Ranking</div>
                          <div>{p.ranking || '—'}</div>
                        </div>
                      </div>

                      {/* Compact stats */}
                      <div className="mt-4 rounded-xl border bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700 mb-2">Lead Limits</div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-lg border bg-white p-2 text-center">
                            <div className="text-[11px] text-slate-500">Daily Bonus</div>
                            <div className="text-sm font-bold text-slate-900">{p.dailyBonus}</div>
                          </div>
                          <div className="rounded-lg border bg-white p-2 text-center">
                            <div className="text-[11px] text-slate-500">Weekly</div>
                            <div className="text-sm font-bold text-slate-900">{p.weeklyLead}</div>
                          </div>
                          <div className="rounded-lg border bg-white p-2 text-center">
                            <div className="text-[11px] text-slate-500">Yearly</div>
                            <div className="text-sm font-bold text-slate-900">{p.weeklyLead * 52}</div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom bullets */}
                      <div className="mt-4 space-y-2 text-sm text-slate-700">
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span>Up to {p.states} states</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span>Up to {p.cities} cities</span>
                        </div>
                        {p.topLevel ? (
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-600" />
                            <span>Top level listing: {p.topLevel}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Details Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          {selectedPlan ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3">
                  <span className="text-slate-900 font-extrabold">
                    {selectedPlan.name} Plan Details
                  </span>
                  {selectedPlan.isPopular ? (
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      MOST POPULAR
                    </span>
                  ) : null}
                </DialogTitle>
              </DialogHeader>

              <div className="grid md:grid-cols-2 gap-6 mt-2">
                {/* Left: Price + CTA */}
                <div className="rounded-2xl border bg-gradient-to-b from-slate-50 to-white p-5">
                  <div className="text-xs text-slate-500">Billing</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">
                    {billing === 'monthly' ? 'Monthly' : 'Yearly'} (Discounted 15%)
                  </div>

                  <div className="mt-4">
                    {(() => {
                      const { discounted, offered } = getPrice(selectedPlan);
                      const isFree = Number(discounted || 0) === 0;

                      if (isFree) {
                        return (
                          <div className="text-4xl font-extrabold text-slate-900">₹0</div>
                        );
                      }

                      return (
                        <>
                          <div className="flex items-end gap-2">
                            <div className="text-4xl font-extrabold text-slate-900">
                              ₹{formatINR(discounted)}
                            </div>
                            <div className="text-sm text-slate-500">
                              /{billing === 'monthly' ? 'month' : 'year'}
                            </div>
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            <span className="line-through mr-2">₹{formatINR(offered)}</span>
                            <span className="text-emerald-700 font-semibold">You save 15%</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Link to="/vendor/register">
                      <Button className="w-full">Register as Vendor</Button>
                    </Link>
                    <Link to="/vendor/login">
                      <Button variant="outline" className="w-full">Vendor Login</Button>
                    </Link>
                  </div>

                  <div className="mt-4 text-xs text-slate-500">
                    Note: Final activation depends on payment + verification (if applicable).
                  </div>
                </div>

                {/* Right: Full details */}
                <div className="rounded-2xl border bg-white p-5">
                  <div className="text-sm font-bold text-slate-900 mb-3">What you get</div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Daily Bonus</div>
                      <div className="text-lg font-extrabold text-slate-900">{selectedPlan.dailyBonus}</div>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Weekly Leads</div>
                      <div className="text-lg font-extrabold text-slate-900">{selectedPlan.weeklyLead}</div>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">States</div>
                      <div className="text-lg font-extrabold text-slate-900">{selectedPlan.states}</div>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Cities</div>
                      <div className="text-lg font-extrabold text-slate-900">{selectedPlan.cities}</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Ranking: {selectedPlan.ranking || '—'}</span>
                    </div>

                    {selectedPlan.topLevel ? (
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Top Level (City/Services): {selectedPlan.topLevel}</span>
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Yearly Leads (approx): {selectedPlan.weeklyLead * 52}</span>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      Premium look + better visibility
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Higher plans get better placement & stronger profile trust to improve conversions.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Pricing;
