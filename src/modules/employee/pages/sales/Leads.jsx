
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/Card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/shared/components/Badge';
import { Search, Send, DollarSign, Eye } from 'lucide-react';

const leadsData = [
  { id: 'L101', title: 'Need 500 T-Shirts', budget: '₹50,000', category: 'Apparel', status: 'Available', date: '2023-10-25' },
  { id: 'L102', title: 'Industrial Pump Required', budget: '₹1,20,000', category: 'Machinery', status: 'Sold', date: '2023-10-24' },
  { id: 'L103', title: 'Looking for Organic Spices', budget: '₹25,000', category: 'Food & Beverage', status: 'Available', date: '2023-10-23' },
];

const Leads = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-neutral-800">Sales CRM: Lead Management</h2>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-500" />
          <Input 
            placeholder="Search leads..." 
            className="pl-9" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead ID</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Posted Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leadsData.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.id}</TableCell>
                  <TableCell>{lead.title}</TableCell>
                  <TableCell>{lead.category}</TableCell>
                  <TableCell>{lead.budget}</TableCell>
                  <TableCell>
                    <Badge variant={lead.status === 'Available' ? 'success' : 'secondary'}>
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{lead.date}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                       <Button size="icon" variant="ghost" title="View Details">
                         <Eye className="h-4 w-4 text-blue-600" />
                       </Button>
                       <Button size="icon" variant="ghost" title="Send to Vendor">
                         <Send className="h-4 w-4 text-green-600" />
                       </Button>
                       <Button size="icon" variant="ghost" title="Change Price">
                         <DollarSign className="h-4 w-4 text-amber-600" />
                       </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Leads;
