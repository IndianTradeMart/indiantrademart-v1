import React, { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Plus } from 'lucide-react';
import { salesApi } from '@/modules/employee/services/salesApi';

const getRuleStatus = (rule) => {
  if (rule?.status) return String(rule.status).toUpperCase();
  if (rule?.is_active === true) return 'ACTIVE';
  if (rule?.is_active === false) return 'INACTIVE';
  return 'DRAFT';
};

const getRuleName = (rule) =>
  rule?.rule_name ||
  rule?.name ||
  rule?.plan_name ||
  'Untitled Rule';

const getRuleType = (rule) =>
  rule?.type ||
  rule?.plan_type ||
  rule?.billing_cycle ||
  '-';

const getRuleValue = (rule) => {
  const numeric = Number(rule?.value ?? rule?.price ?? rule?.amount);
  if (Number.isFinite(numeric)) {
    return `Rs ${numeric.toLocaleString('en-IN')}`;
  }
  return rule?.value ?? rule?.price ?? '-';
};

const PricingRules = () => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const data = await salesApi.getPricingRules();
        setRules(data || []);
      } catch (error) {
        console.error('Failed to fetch pricing rules:', error);
        toast({
          title: 'Pricing rules load failed',
          description: error?.message || 'Unable to load pricing rules',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchRules();
  }, []);

  const handleSubmitForApproval = (id) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'PENDING_APPROVAL' } : r)));
    toast({ title: 'Submitted', description: 'Rule sent for manager approval.' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-neutral-800">Pricing Rules Engine</h2>
        <Button className="bg-[#003D82]"><Plus className="h-4 w-4 mr-2" /> New Rule</Button>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-neutral-500">
                  Loading pricing rules...
                </TableCell>
              </TableRow>
            ) : rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-neutral-500">
                  No pricing rules found.
                </TableCell>
              </TableRow>
            ) : (
              rules.map((r) => {
                const status = getRuleStatus(r);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{getRuleName(r)}</TableCell>
                    <TableCell>{getRuleType(r)}</TableCell>
                    <TableCell>{getRuleValue(r)}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs border ${
                        status === 'ACTIVE' ? 'bg-green-50 border-green-200 text-green-700' :
                        status === 'PENDING_APPROVAL' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                        'bg-gray-50 border-gray-200 text-gray-700'
                      }`}>
                        {status.replaceAll('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {status === 'DRAFT' && (
                        <Button size="sm" variant="outline" onClick={() => handleSubmitForApproval(r.id)}>
                          Submit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default PricingRules;
