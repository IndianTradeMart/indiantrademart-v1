import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

const DeleteCategoryDialog = ({ 
  isOpen, 
  onClose, 
  category,
  level,           // 'head', 'sub', or 'micro'
  childCount = 0,  // number of child categories
  onConfirm 
}) => {
  const [loading, setLoading] = useState(false);
  
  const getLevelName = () => {
    switch (level) {
      case 'head': return 'Head Category';
      case 'sub': return 'Sub Category';
      case 'micro': return 'Micro Category';
      default: return 'Category';
    }
  };
  
  const handleDelete = async () => {
    setLoading(true);
    try {
      await onConfirm(category.id);
      onClose();
    } catch (error) {
      console.error('Error deleting category:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            Delete {getLevelName()}?
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm font-medium text-red-900">
              {category?.name}
            </p>
          </div>
          
          {childCount > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-900">
                <strong>⚠️ Warning:</strong> This {getLevelName().toLowerCase()} has {childCount} child categor{childCount === 1 ? 'y' : 'ies'}.
                {level === 'head' && ' Deleting will also remove all sub-categories and micro-categories.'}
                {level === 'sub' && ' Deleting will also remove all micro-categories.'}
              </p>
            </div>
          )}
          
          <p className="text-sm text-gray-600">
            This action cannot be undone. Are you sure you want to delete this {getLevelName().toLowerCase()}?
          </p>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDelete} 
            disabled={loading}
          >
            {loading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteCategoryDialog;
