
import React from 'react';
import { ShieldAlert, RefreshCw, Clock, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const MaintenancePage = ({ message }) => {
  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans z-[9999]">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop')] opacity-10 bg-cover bg-center pointer-events-none"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 max-w-2xl w-full text-center"
      >
        <div className="mx-auto bg-red-500/10 h-24 w-24 rounded-full flex items-center justify-center mb-8 border border-red-500/20 backdrop-blur-sm animate-pulse">
           <ShieldAlert className="h-12 w-12 text-red-500" />
        </div>
        
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
          System Under Maintenance
        </h1>
        
        <div className="bg-neutral-900/50 border border-white/10 rounded-xl p-8 backdrop-blur-md shadow-2xl">
          <p className="text-xl text-neutral-300 mb-8 leading-relaxed">
            {message || "We are currently performing scheduled system upgrades to improve your experience. Access is temporarily restricted."}
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-neutral-400 mb-8">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-400" />
              <span>Estimated Return: ~2 Hours</span>
            </div>
            <div className="h-1 w-1 bg-neutral-600 rounded-full hidden sm:block"></div>
            <div className="flex items-center gap-2">
               <span className="animate-pulse h-2 w-2 bg-amber-500 rounded-full"></span>
               <span>Status: Maintenance In Progress</span>
            </div>
          </div>

          <div className="flex justify-center">
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline" 
              className="bg-white/5 border-white/10 hover:bg-white/10 text-white gap-2 h-12 px-8"
            >
               <RefreshCw className="h-4 w-4" /> Check Status
            </Button>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto">
          <div className="flex items-center justify-center gap-3 text-neutral-500 bg-black/40 p-3 rounded-lg border border-white/5">
            <Mail className="h-4 w-4" />
            <span className="text-sm">support@indiantrademart.com</span>
          </div>
          <div className="flex items-center justify-center gap-3 text-neutral-500 bg-black/40 p-3 rounded-lg border border-white/5">
            <Phone className="h-4 w-4" />
            <span className="text-sm">+91 1800-123-4567</span>
          </div>
        </div>
        
        <div className="mt-8 text-xs text-neutral-600 font-mono">
          ID: MAINT_MODE_GLOBAL • IndianTradeMart Systems
        </div>
      </motion.div>
    </div>
  );
};

export default MaintenancePage;
