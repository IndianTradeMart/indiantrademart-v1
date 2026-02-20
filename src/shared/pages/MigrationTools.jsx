import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { Loader2, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { migrateProductSlugsBatch } from '@/shared/utils/migrateProductSlugs';
import MigrationVendorIds from './MigrationVendorIds';

const MigrationTools = () => {
  const [activeTab, setActiveTab] = useState('slugs'); // 'slugs' or 'vendorIds'
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState(null);
  const [showResults, setShowResults] = useState(false);

  const handleMigrateProductSlugs = async () => {
    if (!window.confirm('This will add slugs to all products without them. Continue?')) return;
    
    setMigrating(true);
    setShowResults(false);
    
    try {
      const result = await migrateProductSlugsBatch(50);
      setResult(result);
      setShowResults(true);
      
      toast({
        title: '✅ Migration Complete!',
        description: `Updated: ${result.updated}, Failed: ${result.failed}`,
      });
    } catch (error) {
      console.error('Migration error:', error);
      toast({
        title: '❌ Migration Failed',
        description: error.message || 'Something went wrong',
        variant: 'destructive',
      });
      setResult({ success: false, updated: 0, failed: -1 });
      setShowResults(true);
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {activeTab === 'vendorIds' && <MigrationVendorIds />}
      
      {activeTab === 'slugs' && (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Migration Tools</h1>
        
        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('slugs')}
            className="px-4 py-2 font-semibold text-[#003D82] border-b-2 border-[#003D82]"
          >
            Product Slugs
          </button>
          <button
            onClick={() => setActiveTab('vendorIds')}
            className="px-4 py-2 font-semibold text-gray-600 hover:text-gray-900"
          >
            Vendor IDs
          </button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Product Slug Migration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              This tool will generate unique slugs for all products that don't have one yet. 
              Slugs are used for shareable product URLs.
            </p>
            
            <Button 
              onClick={handleMigrateProductSlugs}
              disabled={migrating}
              className="w-full bg-[#003D82] hover:bg-blue-800 h-10"
            >
              {migrating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Migrating...
                </>
              ) : (
                'Start Migration'
              )}
            </Button>

            {showResults && result && (
              <div className={`p-4 rounded-lg border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-start gap-3 mb-3">
                  {result.success ? (
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  )}
                  <div>
                    <h3 className={`font-bold ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                      {result.success ? 'Migration Successful' : 'Migration Failed'}
                    </h3>
                    <p className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                      {result.updated > 0 && `✅ ${result.updated} products updated`}
                      {result.failed > 0 && `${result.updated > 0 ? ' | ' : ''}❌ ${result.failed} failed`}
                    </p>
                  </div>
                </div>

                {result.success && (
                  <div className="text-sm text-green-700 bg-white p-2 rounded border border-green-200">
                    <p>✅ All product slugs are now active!</p>
                    <p>Check your product pages at /p/product-name-xxx</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-sm text-gray-500 bg-blue-50 border border-blue-200 p-4 rounded">
          <p className="font-semibold text-blue-900 mb-2">ℹ️ How to Access:</p>
          <p>Visit this page at: <code className="bg-white px-2 py-1 rounded">/migration-tools</code></p>
        </div>
      </div>
      )}
    </div>
  );
};

export default MigrationTools;
