
import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Search, ShieldCheck, Zap, HeartHandshake, ArrowRight } from 'lucide-react';
import BrowseByIndustry from '@/modules/directory/components/BrowseByIndustry';

const BuyerHome = () => {
  return (
    <>
      <Helmet>
        <title>Sourcing for Buyers - IndianTradeMart</title>
        <meta name="description" content="Source quality products from verified suppliers on IndianTradeMart. Post requirements, get quotes, and close deals securely." />
      </Helmet>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#00A699] to-[#00645B] text-white py-20 lg:py-32">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl lg:text-6xl font-bold mb-6 leading-tight"
            >
              Smart Sourcing for Your Business
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl text-white/90 mb-10"
            >
              Connect with 50,000+ verified suppliers. Post your requirements and get competitive quotes instantly.
            </motion.p>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link to="/buyer/proposals/new">
                <Button size="lg" className="w-full sm:w-auto bg-white text-[#00645B] hover:bg-neutral-100 font-bold h-14 px-8 text-lg">
                  Post a Requirement
                </Button>
              </Link>
              <Link to="/categories">
                <Button size="lg" variant="outline" className="w-full sm:w-auto border-white text-white hover:bg-white/10 h-14 px-8 text-lg">
                  Browse Suppliers
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 bg-neutral-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-neutral-800 mb-4">How Sourcing Works</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
             {/* Connector Line (Desktop) */}
            <div className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-neutral-200 z-0" />

            <div className="relative z-10 text-center">
              <div className="w-24 h-24 bg-white border-4 border-[#00A699] rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-[#00A699]">
                1
              </div>
              <h3 className="text-xl font-bold mb-3">Post Requirement</h3>
              <p className="text-neutral-600">Tell us what you need. Specify product details, quantity, and budget.</p>
            </div>
            <div className="relative z-10 text-center">
              <div className="w-24 h-24 bg-white border-4 border-[#00A699] rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-[#00A699]">
                2
              </div>
              <h3 className="text-xl font-bold mb-3">Get Quotes</h3>
              <p className="text-neutral-600">Verified suppliers will compete for your business and send competitive offers.</p>
            </div>
            <div className="relative z-10 text-center">
              <div className="w-24 h-24 bg-white border-4 border-[#00A699] rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-[#00A699]">
                3
              </div>
              <h3 className="text-xl font-bold mb-3">Connect & Buy</h3>
              <p className="text-neutral-600">Choose the best offer, discuss details, and close the deal securely.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
             <div>
               <img src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=1000" alt="Buyer Benefits" className="rounded-2xl shadow-xl" />
             </div>
             <div>
               <h2 className="text-3xl font-bold text-neutral-800 mb-8">Why Buyers Trust Us</h2>
               <div className="space-y-8">
                 <div className="flex gap-4">
                   <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                     <ShieldCheck className="h-6 w-6 text-blue-600" />
                   </div>
                   <div>
                     <h3 className="text-xl font-bold mb-2">Verified Suppliers</h3>
                     <p className="text-neutral-600">Every supplier undergoes a strict KYC process. Trade with confidence knowing you're dealing with legitimate businesses.</p>
                   </div>
                 </div>
                 <div className="flex gap-4">
                   <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                     <Zap className="h-6 w-6 text-yellow-600" />
                   </div>
                   <div>
                     <h3 className="text-xl font-bold mb-2">Fast & Efficient</h3>
                     <p className="text-neutral-600">Save time searching. Let suppliers come to you with their best prices tailored to your needs.</p>
                   </div>
                 </div>
                 <div className="flex gap-4">
                   <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                     <HeartHandshake className="h-6 w-6 text-purple-600" />
                   </div>
                   <div>
                     <h3 className="text-xl font-bold mb-2">Dedicated Support</h3>
                     <p className="text-neutral-600">Our sourcing experts are here to assist you at every step of your procurement journey.</p>
                   </div>
                 </div>
               </div>
             </div>
          </div>
        </div>
      </section>

      {/* Browse by Industry */}
      <BrowseByIndustry />

      {/* CTA */}
      <section className="py-20 bg-[#003D82]">
        <div className="container mx-auto px-4 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Start Sourcing Smarter</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">Join thousands of buyers who save time and money on IndianTradeMart.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/buyer/register">
              <Button size="lg" className="bg-white text-[#003D82] hover:bg-neutral-100 font-bold h-14 px-8">
                Sign Up Free <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
};

export default BuyerHome;
