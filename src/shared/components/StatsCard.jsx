
import React from 'react';
import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

const StatsCard = ({ title, value, icon: Icon, trend, trendUp, className, description }) => {
  return (
    <div className={cn("bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        {Icon && (
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
             <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {(trend || description) && (
           <div className="flex items-center text-xs">
             {trend && (
               <span className={cn(
                 "flex items-center font-medium mr-2", 
                 trendUp === true ? "text-green-600" : trendUp === false ? "text-red-600" : "text-gray-500"
               )}>
                 {trendUp === true && <ArrowUpRight className="w-3 h-3 mr-1" />}
                 {trendUp === false && <ArrowDownRight className="w-3 h-3 mr-1" />}
                 {trend}
               </span>
             )}
             {description && <span className="text-gray-400">{description}</span>}
           </div>
        )}
      </div>
    </div>
  );
};

export default StatsCard;
