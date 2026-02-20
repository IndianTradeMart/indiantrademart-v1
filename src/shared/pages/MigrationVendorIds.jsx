import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';

const MigrationVendorIds = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState({});
  const [stats, setStats] = useState({
    total: 0,
    migrated: 0,
    pending: 0,
    failed: 0
  });

  // Load all vendors
  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, email, owner_name, company_name, phone, vendor_id')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setVendors(data || []);
      
      // Calculate stats
      const migrated = (data || []).filter(v => v.vendor_id && v.vendor_id.includes('-V-')).length;
      const pending = (data || []).filter(v => !v.vendor_id || !v.vendor_id.includes('-V-')).length;

      setStats({
        total: data?.length || 0,
        migrated,
        pending,
        failed: 0
      });

      toast({
        title: 'Vendors Loaded',
        description: `Found ${data?.length || 0} vendors (${migrated} migrated, ${pending} pending)`
      });
    } catch (error) {
      console.error('Error loading vendors:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const generateVendorId = (ownerName = '', companyName = '', phone = '') => {
    const digits = '0123456789';
    
    // First 4 letters of owner name (uppercase), padded with X if needed
    let part1 = ownerName
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 4)
      .padEnd(4, 'X');

    // First 4 letters of company name (uppercase), padded with Z if needed
    let part2 = companyName
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 4)
      .padEnd(4, 'Z');

    // Last 2 digits of phone number, or 2 random digits if not available
    let part3 = phone 
      ? phone.replace(/\D/g, '').slice(-2).padStart(2, '0') 
      : Math.floor(Math.random() * 100).toString().padStart(2, '0');

    // 2 random digits
    const part4 = Math.floor(Math.random() * 100).toString().padStart(2, '0');

    return `${part1}-V-${part2}-${part3}${part4}`;
  };

  const migrateVendor = async (vendor) => {
    try {
      setMigrationStatus(prev => ({
        ...prev,
        [vendor.id]: { status: 'processing', message: 'Generating vendor ID...' }
      }));

      // Check if already has valid vendor_id
      if (vendor.vendor_id && vendor.vendor_id.includes('-V-')) {
        setMigrationStatus(prev => ({
          ...prev,
          [vendor.id]: { status: 'skipped', message: 'Already migrated' }
        }));
        return;
      }

      // Generate new vendor ID
      let vendorId = generateVendorId(vendor.owner_name, vendor.company_name, vendor.phone);
      let attempts = 0;
      let isUnique = false;

      // Ensure uniqueness
      while (!isUnique && attempts < 10) {
        const { data: existing } = await supabase
          .from('vendors')
          .select('id')
          .eq('vendor_id', vendorId)
          .maybeSingle();

        if (!existing) {
          isUnique = true;
        } else {
          // Regenerate if not unique
          vendorId = generateVendorId(vendor.owner_name, vendor.company_name, vendor.phone);
          attempts++;
        }
      }

      if (!isUnique) {
        throw new Error('Could not generate unique vendor ID after 10 attempts');
      }

      setMigrationStatus(prev => ({
        ...prev,
        [vendor.id]: { status: 'processing', message: `Generated: ${vendorId}` }
      }));

      // Update vendor in database
      const { error } = await supabase
        .from('vendors')
        .update({ vendor_id: vendorId })
        .eq('id', vendor.id);

      if (error) throw error;

      setMigrationStatus(prev => ({
        ...prev,
        [vendor.id]: { status: 'success', message: `ID: ${vendorId}` }
      }));

      // Update local vendors list
      setVendors(prev => 
        prev.map(v => v.id === vendor.id ? { ...v, vendor_id: vendorId } : v)
      );
    } catch (error) {
      console.error(`Error migrating vendor ${vendor.id}:`, error);
      setMigrationStatus(prev => ({
        ...prev,
        [vendor.id]: { status: 'error', message: error.message }
      }));
    }
  };

  const migrateAll = async () => {
    setMigrating(true);
    let successful = 0;
    let failed = 0;
    const results = {};

    try {
      const pendingVendors = vendors.filter(v => !v.vendor_id || !v.vendor_id.includes('-V-'));

      if (pendingVendors.length === 0) {
        toast({
          title: 'Info',
          description: 'All vendors are already migrated!'
        });
        setMigrating(false);
        return;
      }

      toast({
        title: 'Migration Started',
        description: `Migrating ${pendingVendors.length} vendors...`
      });

      for (const vendor of pendingVendors) {
        try {
          setMigrationStatus(prev => ({
            ...prev,
            [vendor.id]: { status: 'processing', message: 'Calling backend...' }
          }));

          // Call backend API to migrate vendor
            const response = await fetchWithCsrf(apiUrl('/api/migration/vendor-ids/migrate-single'), {
              method: 'POST',
              body: JSON.stringify({ vendorId: vendor.id })
            });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Migration failed');
          }

          const newVendorId = data.vendorId;

          setMigrationStatus(prev => ({
            ...prev,
            [vendor.id]: { status: 'success', message: `ID: ${newVendorId}` }
          }));

          // Update local vendors list
          setVendors(prev => 
            prev.map(v => v.id === vendor.id ? { ...v, vendor_id: newVendorId } : v)
          );

          results[vendor.id] = { success: true, vendorId: newVendorId };
          successful++;
        } catch (vendorError) {
          console.error(`Error migrating vendor ${vendor.id}:`, vendorError);
          setMigrationStatus(prev => ({
            ...prev,
            [vendor.id]: { status: 'error', message: vendorError.message }
          }));
          results[vendor.id] = { success: false, error: vendorError.message };
          failed++;
        }

        // Small delay between migrations
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Reload vendors to get fresh data
      await loadVendors();

      toast({
        title: 'Migration Complete',
        description: `Successfully migrated ${successful} vendors${failed > 0 ? `, ${failed} failed` : ''}`
      });
    } catch (error) {
      console.error('Migration error:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-3xl">Vendor ID Migration</CardTitle>
            <CardDescription>
              Generate and assign vendor IDs to all vendors using the vendorApi pattern
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="text-3xl font-bold text-blue-700">{stats.total}</div>
                <div className="text-sm text-blue-600">Total Vendors</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <div className="text-3xl font-bold text-green-700">{stats.migrated}</div>
                <div className="text-sm text-green-600">Migrated</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <div className="text-3xl font-bold text-yellow-700">{stats.pending}</div>
                <div className="text-sm text-yellow-600">Pending</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <div className="text-3xl font-bold text-red-700">{stats.failed}</div>
                <div className="text-sm text-red-600">Failed</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mb-8">
              <Button
                onClick={loadVendors}
                disabled={loading}
                variant="outline"
                className="flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Reload Vendors
              </Button>
              <Button
                onClick={migrateAll}
                disabled={migrating || stats.pending === 0}
                className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
              >
                {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Migrate All Pending ({stats.pending})
              </Button>
            </div>

            {/* Vendor List */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Owner Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Company</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Phone</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Current Vendor ID</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map(vendor => {
                      const status = migrationStatus[vendor.id];
                      const isMigrated = vendor.vendor_id && vendor.vendor_id.includes('-V-');

                      return (
                        <tr key={vendor.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{vendor.email}</td>
                          <td className="px-4 py-3 text-sm">{vendor.owner_name || '-'}</td>
                          <td className="px-4 py-3 text-sm">{vendor.company_name || '-'}</td>
                          <td className="px-4 py-3 text-sm">{vendor.phone || '-'}</td>
                          <td className="px-4 py-3 text-sm font-mono text-xs">
                            {vendor.vendor_id ? (
                              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                {vendor.vendor_id}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {status ? (
                              <div className="flex items-center gap-2">
                                {status.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                                {status.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                                {status.status === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
                                {status.status === 'skipped' && <CheckCircle2 className="w-4 h-4 text-gray-400" />}
                                <span className="text-xs">{status.message}</span>
                              </div>
                            ) : isMigrated ? (
                              <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle2 className="w-4 h-4" />
                                <span className="text-xs">Migrated</span>
                              </div>
                            ) : (
                              <span className="text-xs text-yellow-600">Pending</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {!isMigrated && !status && (
                              <Button
                                onClick={() => migrateVendor(vendor)}
                                disabled={migrating}
                                size="sm"
                                variant="outline"
                                className="text-xs"
                              >
                                Migrate
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {vendors.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-500">No vendors found</p>
                </div>
              )}
            </div>

            {/* Pattern Info */}
            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">Vendor ID Format</h3>
              <div className="bg-white rounded p-3 font-mono text-sm mb-3 text-gray-700">
                <div>XXXX-V-YYYY-ZZ##</div>
              </div>
              <ul className="text-sm text-blue-800 space-y-1">
                <li><strong>XXXX</strong> - First 4 letters of owner name (padded with X if needed)</li>
                <li><strong>V</strong> - Literal "V" for vendor</li>
                <li><strong>YYYY</strong> - First 4 letters of company name (padded with Z if needed)</li>
                <li><strong>ZZ</strong> - Last 2 digits of phone number (random if unavailable)</li>
                <li><strong>##</strong> - Random 2 digits for uniqueness</li>
              </ul>
            </div>

            {/* Example */}
            <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Example</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Owner: Rajesh Kumar | Company: ABC Industries | Phone: 9876543210</span>
                </div>
                <div className="bg-white rounded p-2 font-mono text-xs">
                  RAJX-V-ABCZ-1045
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MigrationVendorIds;
