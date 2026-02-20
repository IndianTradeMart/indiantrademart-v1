import React from 'react';
import { TrendingUp, FileText, BarChart3 } from 'lucide-react';

const Investor = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-8 h-8" />
            <h1 className="text-4xl font-bold">Investor Relations</h1>
          </div>
          <p className="text-xl text-blue-100">Information for our investors and stakeholders</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="w-6 h-6 text-blue-600" />
              <h2 className="text-2xl font-bold">Financial Reports</h2>
            </div>
            <p className="text-gray-600 mb-4">Access our latest financial statements and reports</p>
            <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">Download Reports</button>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-6 h-6 text-blue-600" />
              <h2 className="text-2xl font-bold">Governance</h2>
            </div>
            <p className="text-gray-600 mb-4">Corporate governance policies and documents</p>
            <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">Learn More</button>
          </div>
        </div>

        <div className="mt-12 bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-bold mb-6">Contact Investor Relations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="font-semibold text-gray-900">Email</p>
              <p className="text-gray-600">investors@indiantrademart.com</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Phone</p>
              <p className="text-gray-600">+91 XXXX-XXXX-XXX</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Investor;
