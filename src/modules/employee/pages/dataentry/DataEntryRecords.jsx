
import React, { useEffect, useState } from 'react';
import { dataEntryApi } from '@/modules/employee/services/dataEntryApi';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/shared/components/Badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Loader2, FileText, CheckCircle, Clock } from 'lucide-react';

const DataEntryRecords = () => {
    const [stats, setStats] = useState(null);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const s = await dataEntryApi.getDashboardStats();
                setStats(s);
                const r = await dataEntryApi.getVendors({ createdByMe: true });
                setRecords(r);
            } catch(e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">My Data Entry Records</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-500">Total Vendors</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats?.totalVendors}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-500">Products Listed</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats?.totalProducts}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-500">KYC Pending</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-orange-600">{stats?.pendingKyc}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-500">KYC Approved</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-green-600">{stats?.approvedKyc}</div></CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader><CardTitle>Submission History</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Vendor</TableHead>
                                <TableHead>Products</TableHead>
                                <TableHead>KYC Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {records.map((r) => {
                                const normalizedStatus = String(r.kyc_status || 'PENDING').toUpperCase();
                                const isApproved = normalizedStatus === 'VERIFIED' || normalizedStatus === 'APPROVED';
                                return (
                                    <TableRow key={r.id}>
                                        <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                                        <TableCell className="font-medium">{r.company_name}</TableCell>
                                        <TableCell>{r.products?.[0]?.count || 0}</TableCell>
                                        <TableCell>
                                            <Badge variant={isApproved ? 'success' : 'warning'}>
                                                {normalizedStatus === 'VERIFIED' ? 'APPROVED' : normalizedStatus}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
};

export default DataEntryRecords;
