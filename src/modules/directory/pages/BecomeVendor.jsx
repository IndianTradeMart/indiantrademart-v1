import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

const BecomeVendor = () => {
  return (
    <>
      <Helmet>
        <title>Become a Vendor - IndianTradeMart</title>
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* Hero */}
        <div className="bg-[#059669] text-white py-20 px-4 text-center">
           <h1 className="text-4xl md:text-5xl font-bold mb-6">Sell to Millions of Business Buyers</h1>
           <p className="text-xl text-green-100 max-w-2xl mx-auto mb-8">
             Create your digital storefront today and start receiving inquiries instantly.
           </p>
           <Link to="/vendor/register">
             <Button size="lg" className="bg-white text-[#059669] hover:bg-gray-100 text-lg font-bold px-10 h-14">
               Start Selling Now
             </Button>
           </Link>
           <p className="mt-4 text-sm text-green-200">No credit card required for basic plan</p>
        </div>

        {/* Benefits */}
        <div className="container mx-auto px-4 py-16">
           <div className="grid md:grid-cols-3 gap-8">
              {[
                { title: "Create Online Store", desc: "Showcase your products to buyers across India 24/7." },
                { title: "Get Verified Leads", desc: "Receive genuine inquiries from interested business buyers." },
                { title: "Grow Your Brand", desc: "Build trust with our verification badges and ratings." }
              ].map((item, i) => (
                <div key={i} className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center">
                   <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                   <p className="text-gray-600">{item.desc}</p>
                </div>
              ))}
           </div>
        </div>

        {/* Pricing Teaser */}
        <div className="bg-white py-16">
           <div className="container mx-auto px-4 text-center">
             <h2 className="text-3xl font-bold mb-12">Simple Pricing</h2>
             <div className="max-w-md mx-auto bg-white border-2 border-[#059669] rounded-2xl p-8 shadow-xl relative overflow-hidden">
                <div className="bg-[#059669] text-white text-sm font-bold py-1 px-8 absolute top-0 right-0 rounded-bl-xl">POPULAR</div>
                <h3 className="text-2xl font-bold mb-2">Gold Supplier</h3>
                <div className="text-4xl font-bold text-[#059669] mb-6">₹14,999<span className="text-lg text-gray-500 font-normal">/yr</span></div>
                <ul className="space-y-4 text-left mb-8">
                   {['Unlimited Products', 'Verified Badge', '50 Buy Leads / mo', 'Priority Support'].map(f => (
                     <li key={f} className="flex items-center gap-3">
                       <Check className="text-[#059669] w-5 h-5" /> {f}
                     </li>
                   ))}
                </ul>
                <Link to="/vendor/register">
                  <Button className="w-full bg-[#059669] hover:bg-[#047857]">Get Started</Button>
                </Link>
             </div>
             <div className="mt-8">
               <Link to="/pricing" className="text-[#059669] font-medium hover:underline">View all plans</Link>
             </div>
           </div>
        </div>
      </div>
    </>
  );
};

export default BecomeVendor;