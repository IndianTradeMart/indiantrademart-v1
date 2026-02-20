
import React, { useState, useEffect } from 'react';
import { dataService } from '@/shared/services/dataService';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/Card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { Trash2, Edit, Plus, Image as ImageIcon, MapPin } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const Cities = () => {
  const [cities, setCities] = useState([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    state: '',
    image: '',
    slug: '',
    isActive: true
  });

  useEffect(() => {
    refreshCities();
  }, []);

  const refreshCities = () => {
    setCities(dataService.getCities());
  };

  const handleOpenDialog = (city = null) => {
    if (city) {
      setEditingId(city.id);
      setFormData({ ...city });
    } else {
      setEditingId(null);
      setFormData({ name: '', state: '', image: '', slug: '', isActive: true });
    }
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.state || !formData.image) {
      toast({ title: "Validation Error", description: "Name, State and Image are required.", variant: "destructive" });
      return;
    }

    if (editingId) {
      dataService.updateCity(editingId, formData);
      toast({ title: "City Updated", description: "City details have been updated." });
    } else {
      dataService.addCity(formData);
      toast({ title: "City Added", description: "New city has been added to the directory." });
    }
    
    setIsDialogOpen(false);
    refreshCities();
  };

  const handleDelete = (id) => {
    if(window.confirm('Are you sure you want to delete this city?')) {
      dataService.deleteCity(id);
      refreshCities();
      toast({ title: "City Deleted", description: "City has been removed." });
    }
  };

  // Auto-slug generation
  useEffect(() => {
    if (!editingId && formData.name) {
      setFormData(prev => ({ ...prev, slug: prev.name.toLowerCase().replace(/\s+/g, '-') }));
    }
  }, [formData.name, editingId]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Cities Management</h2>
        <Button onClick={() => handleOpenDialog()} className="bg-[#059669] hover:bg-[#047857]">
          <Plus className="w-4 h-4 mr-2" /> Add New City
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {cities.map((city) => (
          <Card key={city.id} className="group overflow-hidden">
            <div className="relative h-40 bg-gray-100">
              <img src={city.image} alt={city.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute top-2 right-2 bg-white/90 rounded px-2 py-1 text-xs font-bold shadow-sm">
                {city.state}
              </div>
            </div>
            <div className="p-4">
               <div className="flex justify-between items-start mb-2">
                 <h3 className="font-bold text-lg text-gray-900">{city.name}</h3>
                 {city.isActive ? <span className="w-2 h-2 rounded-full bg-green-500 mt-2" /> : <span className="w-2 h-2 rounded-full bg-red-500 mt-2" />}
               </div>
               <p className="text-xs text-gray-500 mb-4 font-mono">/{city.slug}</p>
               
               <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleOpenDialog(city)}>
                    <Edit className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(city.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
               </div>
            </div>
          </Card>
        ))}
      </div>

      {/* CRUD Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit City' : 'Add New City'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                 <Label>City Name *</Label>
                 <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Pune" />
               </div>
               <div className="space-y-2">
                 <Label>State *</Label>
                 <Input value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} placeholder="e.g. Maharashtra" />
               </div>
             </div>

             <div className="space-y-2">
               <Label>Slug *</Label>
               <Input value={formData.slug} onChange={e => setFormData({...formData, slug: e.target.value})} placeholder="city-slug" />
             </div>

             <div className="space-y-2">
               <Label>City Image URL *</Label>
               <div className="flex gap-2">
                  <div className="flex-1">
                     <Input value={formData.image} onChange={e => setFormData({...formData, image: e.target.value})} placeholder="https://..." />
                  </div>
                  {formData.image && (
                     <div className="w-10 h-10 rounded overflow-hidden border">
                       <img src={formData.image} className="w-full h-full object-cover" />
                     </div>
                  )}
               </div>
               <p className="text-xs text-gray-500">Paste an Unsplash URL for demo.</p>
             </div>

             <div className="flex items-center space-x-2 pt-2">
                <Switch 
                  checked={formData.isActive} 
                  onCheckedChange={(checked) => setFormData({...formData, isActive: checked})} 
                  id="active-mode" 
                />
                <Label htmlFor="active-mode">City is Active & Visible</Label>
             </div>
          </div>
          <div className="flex justify-end gap-3">
             <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
             <Button onClick={handleSave} className="bg-[#059669]">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Cities;
