import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/shared/components/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/Card';

const isLocalHost = () => {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
};

const getAdminBase = () => {
  const override = import.meta.env.VITE_ADMIN_API_BASE;
  if (override && String(override).trim()) return String(override).trim();
  return isLocalHost() ? '/api/admin' : '/.netlify/functions/admin';
};

async function safeReadJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await res.json();
  const text = await res.text();
  throw new Error(`API returned non-JSON (${res.status}). Got: ${text.slice(0, 120)}...`);
}

const AuditLogs = () => {
  const ADMIN_API_BASE = getAdminBase();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        // Preferred: use backend so actor metadata is included and auth is enforced.
        const res = await fetchWithCsrf(`${ADMIN_API_BASE}/audit-logs`);
        const data = await safeReadJson(res);
        if (!data?.success) throw new Error(data?.error || 'Failed to fetch audit logs');
        setLogs(data.logs || []);
      } catch (error) {
        console.warn('[AuditLogs] Backend fetch failed, falling back to direct Supabase:', error);
        try {
          const { data, error: supaError } = await supabase
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
          if (supaError) throw supaError;
          setLogs(data || []);
        } catch (fallbackError) {
          console.error('Failed to fetch audit logs:', fallbackError);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchAuditLogs();
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-neutral-800">System Audit Logs</h2>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-neutral-500">{new Date(log.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-medium">
                    {log.actor?.email || log.actor?.id || log.user_id || 'System'}
                  </TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>{log.entity_type}</TableCell>
                  <TableCell>
                    <Badge variant="success">
                      Recorded
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && loading && (
                 <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">Loading logs...</TableCell>
                 </TableRow>
              )}
              {logs.length === 0 && !loading && (
                 <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">No logs found</TableCell>
                 </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditLogs;
