import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Users, Briefcase, Database, Headphones, TrendingUp, ChevronLeft, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ManagementPortal = () => {
  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-blue-600 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-purple-600 blur-[120px]"></div>
      </div>

      <div className="container mx-auto px-4 py-8 flex-1 flex flex-col">
        {/* Header */}
        <header className="flex justify-between items-center mb-12 relative z-10">
          <Link to="/">
            <Button variant="ghost" className="text-white hover:text-white/80 hover:bg-white/10 gap-2">
              <ChevronLeft className="h-5 w-5" />
              Back to Home
            </Button>
          </Link>
          <div className="text-white font-bold text-xl tracking-tight">
            IndianTradeMart <span className="text-neutral-400 font-normal">| Internal Portal</span>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 lg:gap-16 relative z-10">
          
          {/* Management Card */}
          <PortalCard
            title="Management"
            icon={ShieldCheck}
            color="from-blue-500 to-blue-700"
            description="Access for Administrators and HR Personnel"
          >
            <div className="grid gap-3 w-full">
              <Link to="/admin/login" className="w-full">
                <Button className="w-full h-12 bg-white text-blue-900 hover:bg-blue-50 font-semibold shadow-lg transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
                  <ShieldCheck className="h-5 w-5" /> Admin Portal
                </Button>
              </Link>
              <Link to="/hr/login" className="w-full">
                <Button className="w-full h-12 bg-transparent border-2 border-white/30 text-white hover:bg-white/10 font-semibold transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
                  <Users className="h-5 w-5" /> HR Portal
                </Button>
              </Link>
              <Link to="/admin/login?portal=finance" className="w-full">
                <Button className="w-full h-12 bg-transparent border-2 border-white/30 text-white hover:bg-white/10 font-semibold transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
                  <Wallet className="h-5 w-5" /> Finance Portal
                </Button>
              </Link>
            </div>
          </PortalCard>

          {/* Employee Card */}
          <PortalCard
            title="Employee"
            icon={Briefcase}
            color="from-purple-500 to-purple-700"
            description="Access for Staff, Support, and Sales Teams"
          >
            <div className="grid gap-3 w-full">
              <Link to="/employee/login" className="w-full group">
                <Button className="w-full h-12 bg-white text-purple-900 hover:bg-purple-50 font-semibold shadow-lg transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
                  <Database className="h-4 w-4" /> Data Entry
                </Button>
              </Link>
              <Link to="/employee/login" className="w-full">
                <Button className="w-full h-12 bg-transparent border-2 border-white/30 text-white hover:bg-white/10 font-semibold transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
                  <Headphones className="h-4 w-4" /> Support
                </Button>
              </Link>
              <Link to="/employee/login" className="w-full">
                <Button className="w-full h-12 bg-transparent border-2 border-white/30 text-white hover:bg-white/10 font-semibold transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Sales
                </Button>
              </Link>
            </div>
          </PortalCard>

        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-neutral-500 text-sm relative z-10">
          <p>© {new Date().getFullYear()} IndianTradeMart. Authorized personnel only.</p>
        </footer>
      </div>
    </div>
  );
};

// Reusable Card Component with Hover Animation
const PortalCard = ({ title, icon: Icon, color, description, children }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="group relative w-full max-w-sm"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${color} rounded-2xl blur-lg opacity-20 group-hover:opacity-40 transition-opacity duration-500`}></div>
      
      <div className="relative h-[420px] bg-neutral-800/50 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 group-hover:bg-neutral-800/80 group-hover:border-white/20 group-hover:translate-y-[-5px]">
        {/* Default State Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 transition-all duration-300 group-hover:opacity-0 group-hover:scale-95 group-hover:translate-y-[-20px]">
          <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${color} flex items-center justify-center mb-6 shadow-lg`}>
            <Icon className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">{title}</h2>
          <p className="text-neutral-400 text-center">{description}</p>
          <div className="mt-8 px-4 py-2 bg-white/5 rounded-full text-xs text-neutral-400 border border-white/10">
            Hover to access login options
          </div>
        </div>

        {/* Hover State Content (Options) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 opacity-0 translate-y-[20px] scale-105 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 bg-black/40">
          <h3 className="text-2xl font-bold text-white mb-6">Select Role</h3>
          {children}
        </div>
      </div>
    </motion.div>
  );
};

export default ManagementPortal;
