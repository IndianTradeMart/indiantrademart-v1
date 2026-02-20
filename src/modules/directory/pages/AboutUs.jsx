
import React from 'react';
import { Helmet } from 'react-helmet';
import { CheckCircle } from 'lucide-react';

const AboutUs = () => {
  return (
    <>
      <Helmet>
        <title>About Us - IndianTradeMart</title>
      </Helmet>
      
      <div className="bg-white">
        <div className="bg-[#059669] py-20 text-center text-white">
          <h1 className="text-4xl font-bold mb-4">About IndianTradeMart</h1>
          <p className="text-xl text-green-100 max-w-2xl mx-auto">Empowering businesses to connect, trade, and grow without boundaries.</p>
        </div>

        <div className="container mx-auto px-4 py-16 max-w-4xl">
           <h2 className="text-3xl font-bold text-gray-900 mb-6">Our Mission</h2>
           <p className="text-gray-600 text-lg leading-relaxed mb-12">
             At IndianTradeMart, our mission is to simplify business-to-business (B2B) commerce in India. We believe that every business, regardless of its size or location, deserves access to a national market. By leveraging technology, we are bridging the gap between buyers and suppliers, fostering transparency, and driving economic growth.
           </p>

           <div className="grid md:grid-cols-2 gap-12 mb-16">
              <div className="bg-gray-50 p-8 rounded-xl">
                 <h3 className="text-xl font-bold text-[#059669] mb-4">For Suppliers</h3>
                 <ul className="space-y-3">
                    <li className="flex gap-3"><CheckCircle className="text-[#059669] w-5 h-5 flex-shrink-0" /> Increased visibility across India</li>
                    <li className="flex gap-3"><CheckCircle className="text-[#059669] w-5 h-5 flex-shrink-0" /> Access to verified buy leads</li>
                    <li className="flex gap-3"><CheckCircle className="text-[#059669] w-5 h-5 flex-shrink-0" /> Digital tools to manage business</li>
                 </ul>
              </div>
              <div className="bg-gray-50 p-8 rounded-xl">
                 <h3 className="text-xl font-bold text-[#059669] mb-4">For Buyers</h3>
                 <ul className="space-y-3">
                    <li className="flex gap-3"><CheckCircle className="text-[#059669] w-5 h-5 flex-shrink-0" /> Wide range of verified products</li>
                    <li className="flex gap-3"><CheckCircle className="text-[#059669] w-5 h-5 flex-shrink-0" /> Competitive pricing quotes</li>
                    <li className="flex gap-3"><CheckCircle className="text-[#059669] w-5 h-5 flex-shrink-0" /> Secure platform for sourcing</li>
                 </ul>
              </div>
           </div>

           <h2 className="text-3xl font-bold text-gray-900 mb-6">Our Story</h2>
           <p className="text-gray-600 mb-6">
             Founded in 2023, IndianTradeMart started with a simple idea: to digitalize the traditional Indian wholesale market. What began as a small directory has now grown into a comprehensive ecosystem supporting thousands of businesses.
           </p>
        </div>
      </div>
    </>
  );
};

export default AboutUs;
