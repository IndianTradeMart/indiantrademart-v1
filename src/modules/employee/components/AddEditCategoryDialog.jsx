import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, X } from 'lucide-react';

const IMAGE_MIN_BYTES = 100 * 1024; // 100KB
const IMAGE_MAX_BYTES = 800 * 1024; // 800KB

const formatKb = (bytes) => `${Math.round(Number(bytes || 0) / 1024)}KB`;

const sanitizeCategoryName = (value = '') =>
  String(value)
    .replace(/[^A-Za-z0-9\s&(),.'\/+-]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '');

const sanitizeSlugInput = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const sanitizeDescription = (value = '') =>
  String(value)
    .replace(/[<>]/g, '')
    .replace(/\s{2,}/g, ' ');

const sanitizeImageUrl = (value = '') => String(value).trim().replace(/\s+/g, '');

const isValidHttpUrl = (value = '') => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
};

const AddEditCategoryDialog = ({ 
  isOpen, 
  onClose, 
  category = null,  // null for add, object for edit
  level,            // 'head', 'sub', or 'micro'
  parentId = null,  // required for sub/micro
  onSave 
}) => {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    image_url: '',
    is_active: true
  });

  // image upload (optional)
  const [imageFile, setImageFile] = useState(null);
  const fileInputRef = useRef(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageFilePreview, setImageFilePreview] = useState('');
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const existingImageUrl = useMemo(() => sanitizeImageUrl(category?.image_url || ''), [category?.image_url]);
  const canRenderPortal = typeof window !== 'undefined' && !!window.document?.body;
  
  // Initialize form with category data if editing
  useEffect(() => {
    if (category) {
      setFormData({
        name: sanitizeCategoryName(category.name || ''),
        slug: sanitizeSlugInput(category.slug || ''),
        description: sanitizeDescription(category.description || ''),
        image_url: sanitizeImageUrl(category.image_url || ''),
        is_active: category.is_active !== false
      });
    } else {
      setFormData({
        name: '',
        slug: '',
        description: '',
        image_url: '',
        is_active: true
      });
    }
    setImageFile(null);
    setRemoveImage(false);
    setImagePreviewOpen(false);
    setErrors({});
  }, [category, isOpen]);

  const showImageField = useMemo(() => {
    // user asked specifically for head + micro, but we support sub too (since schema already has image_url)
    return level === 'head' || level === 'sub' || level === 'micro';
  }, [level]);

  // Preview for local file (cleanup URL on change/unmount)
  useEffect(() => {
    if (!imageFile) {
      setImageFilePreview('');
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImageFilePreview(url);
    return () => {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    };
  }, [imageFile]);

  const previewUrl = useMemo(() => {
    if (imageFilePreview) return imageFilePreview;
    const url = (formData.image_url || '').trim();
    return url.length > 0 ? url : '';
  }, [imageFilePreview, formData.image_url]);

  const closeImagePreview = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setImagePreviewOpen(false);
  };

  // If preview is open and user presses ESC, close only preview first.
  useEffect(() => {
    if (!imagePreviewOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setImagePreviewOpen(false);
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [imagePreviewOpen]);
  
  // Auto-generate slug from name
  const generateSlug = (name) => {
    return sanitizeSlugInput(name);
  };
  
  const handleNameChange = (name) => {
    const cleaned = sanitizeCategoryName(name);
    setFormData(prev => ({
      ...prev,
      name: cleaned,
      slug: generateSlug(cleaned)
    }));
  };

  const clearImageSelection = ({ removeExisting = false } = {}) => {
    setImageFile(null);
    setImageFilePreview('');
    setFormData((prev) => ({ ...prev, image_url: removeExisting ? '' : existingImageUrl }));
    setRemoveImage(removeExisting && !!existingImageUrl);
    setErrors((prev) => ({ ...prev, image_url: undefined, image_file: undefined }));
    setImagePreviewOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const undoRemoveExistingImage = () => {
    if (!existingImageUrl) return;
    setRemoveImage(false);
    setFormData((prev) => ({ ...prev, image_url: existingImageUrl }));
  };

  const handlePreviewDelete = () => {
    const currentUrl = sanitizeImageUrl(formData.image_url || '');
    const isExistingImage =
      !imageFile &&
      !removeImage &&
      !!currentUrl &&
      !!existingImageUrl &&
      currentUrl === existingImageUrl;

    clearImageSelection({ removeExisting: isExistingImage });
  };
  
  const validate = () => {
    const newErrors = {};
    const cleanName = sanitizeCategoryName(formData.name || '').trim();
    const cleanSlug = sanitizeSlugInput(formData.slug || '').trim();
    const cleanDescription = sanitizeDescription(formData.description || '').trim();
    const cleanImageUrl = sanitizeImageUrl(formData.image_url || '');
    
    if (!cleanName) {
      newErrors.name = 'Name is required';
    }

    if (!cleanSlug) {
      newErrors.slug = 'Slug is required';
    }
    if (cleanSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
      newErrors.slug = 'Slug can only use lowercase letters, numbers and hyphen';
    }

    if (cleanDescription && cleanDescription.length > 500) {
      newErrors.description = 'Description cannot exceed 500 characters';
    }

    if (imageFile) {
      if (!String(imageFile.type || '').startsWith('image/')) {
        newErrors.image_file = 'Only image files are allowed';
      } else if (imageFile.size < IMAGE_MIN_BYTES) {
        newErrors.image_file = `Image must be at least ${formatKb(IMAGE_MIN_BYTES)}`;
      } else if (imageFile.size > IMAGE_MAX_BYTES) {
        newErrors.image_file = `Image must be at most ${formatKb(IMAGE_MAX_BYTES)}`;
      }
    }

    if (!imageFile && cleanImageUrl && !isValidHttpUrl(cleanImageUrl)) {
      newErrors.image_url = 'Please enter a valid image URL (http/https)';
    }

    if (cleanName !== formData.name || cleanSlug !== formData.slug || cleanDescription !== (formData.description || '') || cleanImageUrl !== (formData.image_url || '')) {
      setFormData((prev) => ({
        ...prev,
        name: cleanName,
        slug: cleanSlug,
        description: cleanDescription,
        image_url: cleanImageUrl
      }));
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async () => {
    if (!validate()) return;
    
    setLoading(true);
    try {
      await onSave({
        ...formData,
        name: sanitizeCategoryName(formData.name || '').trim(),
        slug: sanitizeSlugInput(formData.slug || '').trim(),
        description: sanitizeDescription(formData.description || '').trim(),
        image_url: sanitizeImageUrl(formData.image_url || ''),
        imageFile,
        removeImage,
        parentId,
        id: category?.id
      });
      onClose();
    } catch (error) {
      console.error('Error saving category:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const getLevelName = () => {
    switch (level) {
      case 'head': return 'Head Category';
      case 'sub': return 'Sub Category';
      case 'micro': return 'Micro Category';
      default: return 'Category';
    }
  };

  const handleDialogOpenChange = (open) => {
    if (open) return;
    if (imagePreviewOpen) {
      setImagePreviewOpen(false);
      return;
    }
    onClose();
  };
  
  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="w-[92vw] max-w-lg max-h-[88vh] overflow-y-auto p-4 sm:p-5">
        <DialogHeader className="pr-8">
          <DialogTitle>
            {category ? 'Edit' : 'Add New'} {getLevelName()}
          </DialogTitle>
          <DialogDescription>
            Use clear names and slug.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={`Enter ${getLevelName().toLowerCase()} name`}
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name}</p>
            )}
          </div>
          
          <div>
            <Label htmlFor="slug">
              Slug <span className="text-red-500">*</span>
            </Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) =>
                setFormData(prev => ({ ...prev, slug: sanitizeSlugInput(e.target.value) }))
              }
              placeholder="auto-generated-from-name"
              className={errors.slug ? 'border-red-500' : ''}
            />
            {errors.slug && (
              <p className="text-xs text-red-500 mt-1">{errors.slug}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">URL-friendly identifier (auto-generated, can be edited)</p>
          </div>
          
          {level !== 'micro' && (
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, description: sanitizeDescription(e.target.value) }))
                }
                placeholder={`Optional description for ${getLevelName().toLowerCase()}`}
                rows={3}
              />
              {errors.description && (
                <p className="text-xs text-red-500 mt-1">{errors.description}</p>
              )}
            </div>
          )}

          {showImageField && (
            <div className="space-y-2">
              <Label>Image (optional)</Label>

              {/* Preview */}
              <div className="flex items-start gap-4">
                <div className="w-28 shrink-0 space-y-1.5">
                  <div className="relative w-28 h-20">
                    <div className="w-full h-full rounded-md border bg-slate-50 overflow-hidden flex items-center justify-center">
                      {previewUrl && !removeImage ? (
                        <button
                          type="button"
                          className="w-full h-full cursor-zoom-in"
                          onClick={() => setImagePreviewOpen(true)}
                        >
                          <img
                            src={previewUrl}
                            alt={formData.name || 'Category image'}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </button>
                      ) : (
                        <div className="text-xs text-slate-500 font-semibold">
                          {String(formData.name || '?').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {previewUrl && !removeImage ? (
                      <button
                        type="button"
                        className="absolute -top-2 -right-2 z-10 p-1.5 rounded-full border border-white bg-red-600 text-white hover:bg-red-700 shadow-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreviewDelete();
                        }}
                        title="Remove image"
                        aria-label="Remove image"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Min {formatKb(IMAGE_MIN_BYTES)}, max {formatKb(IMAGE_MAX_BYTES)}.
                  </p>
                  {imageFile ? (
                    <p className="text-[11px] text-slate-500">
                      Selected: {formatKb(imageFile.size)}
                    </p>
                  ) : null}
                </div>

                <div className="flex-1 space-y-3">
                  <div>
                    <Label htmlFor="image_file" className="text-xs text-slate-600">
                      Upload image
                    </Label>
                    <Input
                      ref={fileInputRef}
                      id="image_file"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        if (!f) {
                          setImageFile(null);
                          setErrors((prev) => ({ ...prev, image_file: undefined }));
                          return;
                        }

                        if (!String(f.type || '').startsWith('image/')) {
                          setImageFile(null);
                          setErrors((prev) => ({ ...prev, image_file: 'Only image files are allowed' }));
                          if (fileInputRef.current) fileInputRef.current.value = '';
                          return;
                        }

                        if (f.size < IMAGE_MIN_BYTES) {
                          setImageFile(null);
                          setErrors((prev) => ({
                            ...prev,
                            image_file: `Image must be at least ${formatKb(IMAGE_MIN_BYTES)}`
                          }));
                          if (fileInputRef.current) fileInputRef.current.value = '';
                          return;
                        }

                        if (f.size > IMAGE_MAX_BYTES) {
                          setImageFile(null);
                          setErrors((prev) => ({
                            ...prev,
                            image_file: `Image must be at most ${formatKb(IMAGE_MAX_BYTES)}`
                          }));
                          if (fileInputRef.current) fileInputRef.current.value = '';
                          return;
                        }

                        setImageFile(f);
                        setRemoveImage(false);
                        setErrors((prev) => ({ ...prev, image_file: undefined }));
                        // user picked a file -> ignore any typed url
                      }}
                    />
                    {errors.image_file && (
                      <p className="text-xs text-red-500 mt-1">{errors.image_file}</p>
                    )}
                    <p className="text-[11px] text-slate-500 mt-1">
                      PNG/JPG/WebP recommended.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="image_url" className="text-xs text-slate-600">
                      Or paste image URL
                    </Label>
                    <Input
                      id="image_url"
                      value={formData.image_url || ''}
                      onChange={(e) => {
                        const cleanUrl = sanitizeImageUrl(e.target.value);
                        setFormData((prev) => ({ ...prev, image_url: cleanUrl }));
                        if (cleanUrl) {
                          setImageFile(null);
                          setRemoveImage(false);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                          }
                        }
                      }}
                      placeholder="https://..."
                    />
                    {errors.image_url && (
                      <p className="text-xs text-red-500 mt-1">{errors.image_url}</p>
                    )}
                  </div>

                  {removeImage && existingImageUrl ? (
                    <div className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs text-amber-700">Existing image will be removed on update.</p>
                      <Button type="button" variant="outline" size="sm" onClick={undoRemoveExistingImage}>
                        Undo
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              Active (visible to users)
            </Label>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : category ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>

      {canRenderPortal && imagePreviewOpen && previewUrl && !removeImage
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
              onClick={closeImagePreview}
            >
              <div
                className="relative w-full max-w-2xl rounded-xl bg-white p-4 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={closeImagePreview}
                  className="absolute right-3 top-3 rounded-full bg-slate-100 p-2 text-slate-700 hover:bg-slate-200"
                  aria-label="Close preview"
                >
                  <X className="h-5 w-5" />
                </button>

                <img
                  src={previewUrl}
                  alt={formData.name || 'Category image preview'}
                  className="w-full max-h-[70vh] rounded-lg object-contain bg-slate-50"
                  onClick={closeImagePreview}
                />

                <p className="mt-3 text-sm font-semibold text-slate-900 text-center">
                  {formData.name || getLevelName()}
                </p>
                <p className="mt-1 text-xs text-slate-500 text-center">
                  {imageFile ? `Image size: ${formatKb(imageFile.size)}` : 'Image size: Existing image'}
                </p>
              </div>
            </div>,
            window.document.body
          )
        : null}
    </>
  );
};

export default AddEditCategoryDialog;
