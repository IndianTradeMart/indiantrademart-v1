
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { Eye, Search, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const normalizeString = (value = '') =>
    String(value)
        .toLowerCase()
        .trim();

const normalizeLoose = (value = '') =>
    normalizeString(value).replace(/[^a-z0-9]/g, '');

const normalizeStatus = (value = 'PENDING') =>
    String(value || 'PENDING').trim().toUpperCase();

const isApprovedStatus = (status) => {
    const normalized = normalizeStatus(status);
    return normalized === 'VERIFIED' || normalized === 'APPROVED';
};

const getStatusLabel = (status) => {
    const normalized = normalizeStatus(status);
    return normalized === 'VERIFIED' ? 'APPROVED' : normalized;
};

const matchesSearch = (vendor, query) => {
    const strictQuery = normalizeString(query);
    const looseQuery = normalizeLoose(query);
    if (!strictQuery) return true;

    const values = [
        vendor?.vendor_id,
        vendor?.company_name,
        vendor?.owner_name,
        vendor?.email
    ];

    return values.some((raw) => {
        const strictValue = normalizeString(raw);
        const looseValue = normalizeLoose(raw);
        return strictValue.includes(strictQuery) || (looseQuery && looseValue.includes(looseQuery));
    });
};

const Vendors = () => {
    const navigate = useNavigate();
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredVendors, setFilteredVendors] = useState([]);
    const [vendorIdSearch, setVendorIdSearch] = useState('');

    useEffect(() => {
        loadVendors();
    }, []);

    const loadVendors = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('vendors')
                .select('*')
                .eq('is_active', true)
                .order('company_name');

            if (error) throw error;
            setVendors(data || []);
            setFilteredVendors(data || []);
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Failed to load vendors", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (query) => {
        setSearchQuery(query);
        if (!query.trim()) {
            setFilteredVendors(vendors);
            return;
        }

        const filtered = vendors.filter((v) => matchesSearch(v, query));
        setFilteredVendors(filtered);
    };

    const handleVendorIdSearch = async () => {
        if (!vendorIdSearch.trim()) {
            toast({ title: "Error", description: "Please enter vendor ID, company, owner, or email", variant: "destructive" });
            return;
        }

        const matches = vendors.filter((v) => matchesSearch(v, vendorIdSearch));
        if (matches.length === 1) {
            navigate(`/employee/dataentry/vendors/${matches[0].id}/products`);
        } else if (matches.length > 1) {
            setSearchQuery(vendorIdSearch);
            setFilteredVendors(matches);
            toast({
                title: "Filtered",
                description: `${matches.length} vendors matched. Refine search to open one vendor directly.`,
            });
        } else {
            toast({ title: "Not Found", description: `"${vendorIdSearch}" not found`, variant: "destructive" });
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold mb-2">Vendor Management</h1>
                <p className="text-gray-600">View and manage all vendors</p>
            </div>

            {/* Vendor ID Quick Search */}
            <Card className="bg-blue-50 border-blue-200">
                <CardHeader><CardTitle className="text-lg">Quick Vendor Lookup</CardTitle></CardHeader>
                <CardContent>
                    <div className="flex gap-2">
                        <Input 
                            placeholder="Enter Vendor ID, company, owner, or email"
                            value={vendorIdSearch}
                            onChange={e => setVendorIdSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleVendorIdSearch()}
                        />
                        <Button onClick={handleVendorIdSearch} className="gap-1">
                            <Search className="w-4 h-4" />
                            Search
                        </Button>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">Type vendor ID, company, owner, or email and press Enter/click Search to open vendor products</p>
                </CardContent>
            </Card>

            {/* Vendor List */}
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>All Vendors ({filteredVendors.length})</CardTitle>
                    </div>
                    <div className="mt-4">
                        <Input 
                            placeholder="Search by company name, owner, vendor ID, or email..."
                            value={searchQuery}
                            onChange={e => handleSearch(e.target.value)}
                            className="max-w-md"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="animate-spin text-gray-400" />
                        </div>
                    ) : filteredVendors.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <p>No vendors found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Vendor ID</TableHead>
                                        <TableHead>Company</TableHead>
                                        <TableHead>Owner</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>KYC Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredVendors.map((v) => {
                                        const normalizedStatus = normalizeStatus(v.kyc_status);
                                        const badgeVariant = isApprovedStatus(normalizedStatus)
                                            ? 'default'
                                            : normalizedStatus === 'REJECTED'
                                                ? 'destructive'
                                                : 'secondary';

                                        return (
                                            <TableRow key={v.id}>
                                                <TableCell className="font-mono font-semibold">{v.vendor_id}</TableCell>
                                                <TableCell className="font-medium">{v.company_name}</TableCell>
                                                <TableCell>{v.owner_name}</TableCell>
                                                <TableCell className="text-sm text-gray-600">{v.email}</TableCell>
                                                <TableCell>
                                                    <Badge variant={badgeVariant}>
                                                        {getStatusLabel(normalizedStatus)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Link to={`/employee/dataentry/vendors/${v.id}/products`}>
                                                        <Button size="sm" variant="outline" className="gap-1">
                                                            <Eye className="w-4 h-4" />
                                                            View Products
                                                        </Button>
                                                    </Link>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
export default Vendors;
