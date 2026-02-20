
import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Award, Truck, Headphones } from 'lucide-react';

const iconMap = {
  Shield,
  Award,
  Truck,
  Headphones
};

const TrustBadges = () => {
  const trustBadges = [
    { icon: 'Shield', title: 'Verified Sellers', description: 'Trusted and verified suppliers with proven track records' },
    { icon: 'Award', title: 'Quality Assured', description: 'Products verified for quality and authenticity' },
    { icon: 'Truck', title: 'Reliable Shipping', description: 'Fast and secure delivery across India' },
    { icon: 'Headphones', title: '24/7 Support', description: 'Round-the-clock customer support' }
  ];

  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {trustBadges.map((badge, index) => {
            const Icon = iconMap[badge.icon];
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center"
              >
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-[#003D82] to-[#00A699] rounded-full flex items-center justify-center"
                >
                  <Icon className="h-8 w-8 text-white" />
                </motion.div>
                <h3 className="font-semibold text-lg text-[#003D82] mb-2">
                  {badge.title}
                </h3>
                <p className="text-neutral-600">
                  {badge.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default TrustBadges;
