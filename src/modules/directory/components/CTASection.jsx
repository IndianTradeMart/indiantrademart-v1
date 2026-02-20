
import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const CTASection = () => {
  const handleCTAClick = () => {
    toast({
      title: "Feature Coming Soon",
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
    });
  };

  return (
    <section className="py-20 bg-gradient-to-br from-[#003D82] to-[#00A699] text-white">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6"
          >
            Ready to Grow Your Business?
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-xl mb-12 text-white/90"
          >
            Join thousands of businesses connecting on IndianTradeMart. Start your journey today!
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Button
              size="lg"
              onClick={handleCTAClick}
              className="bg-white text-[#003D82] hover:bg-neutral-100 px-8 py-6 text-lg"
            >
              Register as Supplier
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleCTAClick}
              className="border-2 border-white text-white hover:bg-white/10 px-8 py-6 text-lg"
            >
              Find Suppliers
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
