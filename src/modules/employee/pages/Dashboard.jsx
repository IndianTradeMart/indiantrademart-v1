
import React from 'react';
import StatsCard from '@/shared/components/StatsCard';
import { Database, UserCheck, PhoneCall, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const EmployeeDashboard = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Workstation</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link to="/employee/data-entry">
          <StatsCard label="Pending Data Entry" value="45" icon={Database} className="cursor-pointer hover:border-blue-300" />
        </Link>
        <Link to="/employee/kyc">
          <StatsCard label="KYC Approvals" value="12" icon={UserCheck} className="cursor-pointer hover:border-blue-300" />
        </Link>
        <StatsCard label="Support Tickets" value="8" icon={PhoneCall} />
        <StatsCard label="Tasks Completed" value="128" icon={CheckCircle} trend={{ value: "10%", positive: true }} />
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <h3 className="font-bold text-gray-900 mb-4">My Queue</h3>
        <p className="text-gray-500">Select a module from the sidebar to begin your tasks.</p>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
