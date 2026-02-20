import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

const LocationsFixed = () => {
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedState, setSelectedState] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Dialog states
  const [showAddCityDialog, setShowAddCityDialog] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [addingCity, setAddingCity] = useState(false);

  useEffect(() => {
    fetchStates();
  }, []);

  useEffect(() => {
    if (selectedState) {
      fetchCities(selectedState.id);
    }
  }, [selectedState]);

  // Fetch all states from database
  const fetchStates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('states')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setStates(data || []);
      
      // Auto-select first state
      if (data && data.length > 0 && !selectedState) {
        setSelectedState(data[0]);
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to load states: " + error.message, 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch cities for selected state
  const fetchCities = async (stateId) => {
    try {
      const { data, error } = await supabase
        .from('cities')
        .select('*')
        .eq('state_id', stateId)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setCities(data || []);
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to load cities: " + error.message, 
        variant: "destructive" 
      });
    }
  };

  // Add new city
  const handleAddCity = async () => {
    if (!newCityName.trim() || !selectedState) {
      toast({ 
        title: "Error", 
        description: "Please enter a city name", 
        variant: "destructive" 
      });
      return;
    }

    try {
      setAddingCity(true);
      let slug = newCityName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      // Check if slug already exists for this state
      const { data: existing, error: checkError } = await supabase
        .from('cities')
        .select('id, slug')
        .eq('state_id', selectedState.id)
        .eq('slug', slug)
        .maybeSingle();
      
      if (checkError && !checkError.message.includes('PGRST116')) {
        throw checkError;
      }
      
      // If slug exists, append random suffix
      if (existing) {
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        slug = `${slug}-${randomSuffix}`;
      }
      
      // Try direct insert
      const { data, error } = await supabase
        .from('cities')
        .insert([{
          state_id: selectedState.id,
          name: newCityName,
          slug: slug,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select();
      
      if (error) {
        // If RLS error, show helpful message
        if (error.message.includes('row-level security')) {
          throw new Error('RLS policy not configured. Please contact admin to enable city creation.');
        }
        if (error.message.includes('unique constraint')) {
          throw new Error('A city with this name already exists in this state.');
        }
        throw error;
      }
      
      toast({ 
        title: "Success", 
        description: `City "${newCityName}" added successfully` 
      });
      
      setNewCityName('');
      setShowAddCityDialog(false);
      fetchCities(selectedState.id);
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to add city: " + error.message, 
        variant: "destructive" 
      });
    } finally {
      setAddingCity(false);
    }
  };

  // Delete city
  const handleDeleteCity = async (cityId) => {
    if (!window.confirm('Are you sure you want to delete this city?')) return;

    try {
      const { error } = await supabase
        .from('cities')
        .update({ is_active: false })
        .eq('id', cityId);
      
      if (error) throw error;
      
      toast({ 
        title: "Success", 
        description: "City deleted successfully" 
      });
      
      if (selectedState) {
        fetchCities(selectedState.id);
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to delete city: " + error.message, 
        variant: "destructive" 
      });
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading locations...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Location Management</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* STATES PANEL */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h3 className="font-semibold mb-4 text-lg">States</h3>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {states.length > 0 ? (
              states.map(state => (
                <div 
                  key={state.id}
                  onClick={() => setSelectedState(state)}
                  className={`p-3 rounded cursor-pointer transition-all ${
                    selectedState?.id === state.id 
                      ? 'bg-blue-500 text-white shadow-md' 
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className="font-medium text-sm">{state.name}</div>
                  <div className="text-xs opacity-75">{state.slug}</div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-gray-500">
                <AlertCircle className="w-5 h-5 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No states available</p>
              </div>
            )}
          </div>
        </div>

        {/* CITIES PANEL */}
        <div className="col-span-1 lg:col-span-3 border rounded-lg p-4 bg-white shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg">
              Cities in {selectedState?.name || 'Select a State'}
            </h3>
            
            {selectedState && (
              <Dialog open={showAddCityDialog} onOpenChange={setShowAddCityDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1">
                    <Plus className="w-4 h-4" />
                    Add City
                  </Button>
                </DialogTrigger>
                
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add City to {selectedState.name}</DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="city-name">City Name</Label>
                      <Input 
                        id="city-name"
                        value={newCityName}
                        onChange={e => setNewCityName(e.target.value)}
                        placeholder="e.g., Pune, Mumbai, Delhi"
                        onKeyPress={e => {
                          if (e.key === 'Enter') handleAddCity();
                        }}
                      />
                    </div>
                    
                    <Button 
                      onClick={handleAddCity}
                      disabled={addingCity}
                      className="w-full"
                    >
                      {addingCity ? 'Adding...' : 'Add City'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {selectedState ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>City Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                    <TableHead className="text-right w-20">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cities.length > 0 ? (
                    cities.map(city => (
                      <TableRow key={city.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium">{city.name}</TableCell>
                        <TableCell className="text-gray-600">{city.slug}</TableCell>
                        <TableCell className="text-right">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            onClick={() => handleDeleteCity(city.id)}
                            className="text-red-600 hover:text-red-800 transition-colors"
                            title="Delete city"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                        <AlertCircle className="w-5 h-5 mx-auto mb-2 opacity-50" />
                        <p>No cities found in {selectedState.name}</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-500">
              <div className="text-center">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Please select a state from the left panel</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> Click on a state to view its cities. You can add new cities or delete existing ones. 
          All changes are saved immediately to the database.
        </p>
      </div>
    </div>
  );
};

export default LocationsFixed;
