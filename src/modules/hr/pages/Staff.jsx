
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Modal from '@/shared/components/Modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, UserMinus, UserCog } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const HrStaff = () => {
  const [staff, setStaff] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .order('full_name');
        if (error) throw error;
        setStaff(data || []);
      } catch (error) {
        console.error('Failed to fetch staff:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStaff();
  }, []);

  const handleCreate = (e) => {
      e.preventDefault();
      setIsModalOpen(false);
      toast({ title: "Employee Created", description: "New employee has been onboarded successfully." });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-neutral-800">Employee Directory</h2>
        <Button onClick={() => setIsModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-2" /> Add Employee
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Join Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell className="font-medium">{employee.name}</TableCell>
                <TableCell>{employee.role}</TableCell>
                <TableCell>{employee.email}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    employee.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-800'
                  }`}>
                    {employee.status}
                  </span>
                </TableCell>
                <TableCell>{employee.joined}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" title="Manage Role">
                      <UserCog className="h-4 w-4 text-blue-500" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Deactivate">
                      <UserMinus className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Onboard New Employee"
      >
        <form className="space-y-4" onSubmit={handleCreate}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Full Name</Label>
              <Input className="mt-1" placeholder="Jane Doe" required />
            </div>
            <div>
              <Label>Email Address</Label>
              <Input type="email" className="mt-1" placeholder="jane@company.com" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
                <Label>Phone Number</Label>
                <Input className="mt-1" placeholder="+91 98765 43210" />
             </div>
             <div>
                <Label>Role</Label>
                <select className="flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 disabled:cursor-not-allowed disabled:opacity-50 mt-1">
                  <option>Data Entry Specialist</option>
                  <option>Support Agent</option>
                  <option>Sales Representative</option>
                </select>
             </div>
          </div>
          <div>
            <Label>Department</Label>
            <Input className="mt-1" placeholder="e.g. Operations" />
          </div>
          <div className="flex justify-end pt-4">
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Add Employee</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default HrStaff;
