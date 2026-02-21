import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import { ChevronLeft, ChevronRight, Images, Trash2, X } from 'lucide-react';

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

const toImageUrlList = (value) => {
  const collected = [];
  const append = (entry) => {
    if (entry == null) return;

    if (typeof entry === 'string') {
      const clean = sanitizeImageUrl(entry);
      if (clean) collected.push(clean);
      return;
    }

    if (Array.isArray(entry)) {
      entry.forEach(append);
      return;
    }

    if (typeof entry === 'object') {
      const url = sanitizeImageUrl(entry.url || entry.image_url || entry.src || '');
      if (url) collected.push(url);
      return;
    }
  };

  if (typeof value === 'string') {
    const raw = value.trim();
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        append(parsed);
      } catch (_) {
        append(raw);
      }
    } else {
      append(raw);
    }
  } else {
    append(value);
  }

  const seen = new Set();
  return collected.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
};

const getMaxImagesForLevel = (level) => (level === 'micro' ? 2 : 1);

const getCategoryImageUrls = (category, maxImages) => {
  if (!category || typeof category !== 'object') return [];

  const merged = [
    ...toImageUrlList(category.image_urls),
    ...toImageUrlList(category.images),
    ...toImageUrlList(category.image_url),
    ...toImageUrlList(category.image),
  ];

  const seen = new Set();
  return merged
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, maxImages);
};

const createFileEntry = (file) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  file,
  previewUrl: URL.createObjectURL(file),
});

const AddEditCategoryDialog = ({ 
  isOpen, 
  onClose, 
  category = null,  // null for add, object for edit
  level,            // 'head', 'sub', or 'micro'
  parentId = null,  // required for sub/micro
  onSave 
}) => {
  const maxImages = useMemo(() => getMaxImagesForLevel(level), [level]);
  const isMicroLevel = level === 'micro';
  const limitMessage = maxImages === 1 ? 'You can only upload 1 image.' : 'You can only upload 2 images.';

  const existingImageUrls = useMemo(
    () => getCategoryImageUrls(category, maxImages),
    [category, maxImages]
  );

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    image_urls: [],
    is_active: true
  });

  // image upload
  const [imageFiles, setImageFiles] = useState([]);
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const fileInputRef = useRef(null);
  const imageFilesRef = useRef([]);
  
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const canRenderPortal = typeof window !== 'undefined' && !!window.document?.body;

  const revokeAllFilePreviews = (entries) => {
    entries.forEach((entry) => {
      try {
        URL.revokeObjectURL(entry.previewUrl);
      } catch (_) {}
    });
  };

  useEffect(() => {
    imageFilesRef.current = imageFiles;
  }, [imageFiles]);

  useEffect(() => {
    return () => revokeAllFilePreviews(imageFilesRef.current);
  }, []);

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearImageFiles = () => {
    setImageFiles((prev) => {
      revokeAllFilePreviews(prev);
      return [];
    });
    resetFileInput();
  };

  const removeFileById = (id) => {
    setImageFiles((prev) => {
      const next = [];
      prev.forEach((entry) => {
        if (entry.id === id) {
          try {
            URL.revokeObjectURL(entry.previewUrl);
          } catch (_) {}
        } else {
          next.push(entry);
        }
      });
      return next;
    });
  };

  useEffect(() => {
    clearImageFiles();
    setImageUrlDraft('');
    setErrors({});
    setPreviewOpen(false);
    setPreviewIndex(0);

    const initialImageUrls = category ? getCategoryImageUrls(category, maxImages) : [];

    if (category) {
      setFormData({
        name: sanitizeCategoryName(category.name || ''),
        slug: sanitizeSlugInput(category.slug || ''),
        description: sanitizeDescription(category.description || ''),
        image_urls: initialImageUrls,
        is_active: category.is_active !== false
      });
    } else {
      setFormData({
        name: '',
        slug: '',
        description: '',
        image_urls: [],
        is_active: true
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, isOpen, maxImages]);

  const showImageField = useMemo(() => {
    return level === 'head' || level === 'sub' || level === 'micro';
  }, [level]);

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

  const getCurrentImageCount = () => (formData.image_urls?.length || 0) + imageFiles.length;

  const showLimitToast = () => {
    toast({
      title: 'Upload limit reached',
      description: limitMessage,
      variant: 'destructive',
    });
  };

  const addImageFiles = (selectedFiles) => {
    const files = Array.from(selectedFiles || []);
    if (!files.length) return;

    const currentCount = getCurrentImageCount();
    const remainingSlots = maxImages - currentCount;

    if (remainingSlots <= 0) {
      setErrors((prev) => ({ ...prev, image_file: limitMessage }));
      showLimitToast();
      resetFileInput();
      return;
    }

    const validFiles = [];
    for (const file of files) {
      if (!String(file?.type || '').startsWith('image/')) {
        setErrors((prev) => ({ ...prev, image_file: 'Only image files are allowed' }));
        resetFileInput();
        return;
      }
      if (file.size < IMAGE_MIN_BYTES) {
        setErrors((prev) => ({ ...prev, image_file: `Image must be at least ${formatKb(IMAGE_MIN_BYTES)}` }));
        resetFileInput();
        return;
      }
      if (file.size > IMAGE_MAX_BYTES) {
        setErrors((prev) => ({ ...prev, image_file: `Image must be at most ${formatKb(IMAGE_MAX_BYTES)}` }));
        resetFileInput();
        return;
      }
      validFiles.push(file);
    }

    const acceptedFiles = validFiles.slice(0, remainingSlots);
    if (acceptedFiles.length < validFiles.length) {
      setErrors((prev) => ({ ...prev, image_file: limitMessage }));
      showLimitToast();
    } else {
      setErrors((prev) => ({ ...prev, image_file: undefined }));
    }

    if (!acceptedFiles.length) {
      resetFileInput();
      return;
    }

    const entries = acceptedFiles.map(createFileEntry);
    setImageFiles((prev) => [...prev, ...entries]);
    resetFileInput();
  };

  const removeSavedImage = (url) => {
    setFormData((prev) => ({
      ...prev,
      image_urls: (prev.image_urls || []).filter((item) => item !== url),
    }));
    setErrors((prev) => ({ ...prev, image_file: undefined, image_url: undefined }));
  };

  const addImageUrl = () => {
    const clean = sanitizeImageUrl(imageUrlDraft || '');
    if (!clean) return;

    if (!isValidHttpUrl(clean)) {
      setErrors((prev) => ({ ...prev, image_url: 'Please enter a valid image URL (http/https)' }));
      return;
    }

    if (getCurrentImageCount() >= maxImages) {
      setErrors((prev) => ({ ...prev, image_url: limitMessage }));
      showLimitToast();
      return;
    }

    setFormData((prev) => {
      const current = Array.isArray(prev.image_urls) ? prev.image_urls : [];
      if (current.includes(clean)) return prev;
      return { ...prev, image_urls: [...current, clean] };
    });
    setImageUrlDraft('');
    setErrors((prev) => ({ ...prev, image_url: undefined }));
  };
  
  const validate = () => {
    const newErrors = {};
    const cleanName = sanitizeCategoryName(formData.name || '').trim();
    const cleanSlug = sanitizeSlugInput(formData.slug || '').trim();
    const cleanDescription = sanitizeDescription(formData.description || '').trim();
    const cleanImageUrls = (formData.image_urls || [])
      .map((url) => sanitizeImageUrl(url))
      .filter(Boolean)
      .slice(0, maxImages);
    
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

    if (cleanImageUrls.length > maxImages) {
      newErrors.image_file = limitMessage;
    }

    const invalidUrl = cleanImageUrls.find((url) => !isValidHttpUrl(url));
    if (invalidUrl) newErrors.image_url = 'Please enter a valid image URL (http/https)';

    if (
      cleanName !== formData.name ||
      cleanSlug !== formData.slug ||
      cleanDescription !== (formData.description || '') ||
      JSON.stringify(cleanImageUrls) !== JSON.stringify(formData.image_urls || [])
    ) {
      setFormData((prev) => ({
        ...prev,
        name: cleanName,
        slug: cleanSlug,
        description: cleanDescription,
        image_urls: cleanImageUrls,
      }));
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async () => {
    if (!validate()) return;
    
    setLoading(true);
    try {
      const cleanImageUrls = (formData.image_urls || [])
        .map((url) => sanitizeImageUrl(url))
        .filter(Boolean)
        .slice(0, maxImages);
      const newFiles = imageFiles.map((entry) => entry.file);

      const basePayload = {
        ...formData,
        name: sanitizeCategoryName(formData.name || '').trim(),
        slug: sanitizeSlugInput(formData.slug || '').trim(),
        description: sanitizeDescription(formData.description || '').trim(),
        image_urls: cleanImageUrls,
        imageFiles: newFiles,
        parentId,
        id: category?.id,
      };

      if (isMicroLevel) {
        await onSave(basePayload);
      } else {
        const nextImageUrl = cleanImageUrls[0] || '';
        const removeImage = existingImageUrls.length > 0 && !nextImageUrl && newFiles.length === 0;

        await onSave({
          ...basePayload,
          image_url: nextImageUrl,
          imageFile: newFiles[0] || null,
          removeImage,
        });
      }
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
    if (previewOpen) {
      closePreview();
      return;
    }
    onClose();
  };

  const savedPreviewItems = (formData.image_urls || []).map((url) => ({
    key: `saved-${url}`,
    url,
    isSaved: true,
  }));

  const localPreviewItems = imageFiles.map((entry) => ({
    key: `new-${entry.id}`,
    url: entry.previewUrl,
    id: entry.id,
    isSaved: false,
  }));

  const previewItems = [...savedPreviewItems, ...localPreviewItems];

  const openPreviewAt = (index) => {
    if (!previewItems.length) return;
    const safeIndex = Math.max(0, Math.min(index, previewItems.length - 1));
    setPreviewIndex(safeIndex);
    setPreviewOpen(true);
  };

  const closePreview = () => setPreviewOpen(false);

  const goPrevPreview = () => {
    if (!previewItems.length) return;
    setPreviewIndex((prev) => (prev - 1 + previewItems.length) % previewItems.length);
  };

  const goNextPreview = () => {
    if (!previewItems.length) return;
    setPreviewIndex((prev) => (prev + 1) % previewItems.length);
  };

  useEffect(() => {
    if (!previewOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePreview();
        return;
      }
      if (event.key === 'ArrowLeft' && previewItems.length > 1) {
        event.preventDefault();
        goPrevPreview();
        return;
      }
      if (event.key === 'ArrowRight' && previewItems.length > 1) {
        event.preventDefault();
        goNextPreview();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewOpen, previewItems.length]);

  useEffect(() => {
    if (!previewItems.length && previewOpen) {
      setPreviewOpen(false);
      setPreviewIndex(0);
      return;
    }
    if (previewIndex > previewItems.length - 1) {
      setPreviewIndex(Math.max(previewItems.length - 1, 0));
    }
  }, [previewItems.length, previewIndex, previewOpen]);

  const currentPreviewUrl = previewItems[previewIndex]?.url || '';
  
  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="w-[92vw] max-w-lg max-h-[88vh] overflow-y-auto p-4 sm:p-5"
          onEscapeKeyDown={(event) => {
            if (!previewOpen) return;
            event.preventDefault();
            closePreview();
          }}
          onInteractOutside={(event) => {
            if (!previewOpen) return;
            event.preventDefault();
            closePreview();
          }}
        >
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

              <div className="space-y-3">
                {isMicroLevel && previewItems.length > 1 ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border p-1.5 text-slate-700 hover:bg-slate-50"
                      onClick={() => openPreviewAt(0)}
                      title="Scroll images"
                      aria-label="Scroll images"
                    >
                      <Images className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  {previewItems.map((item, index) => (
                    <div key={item.key} className="relative w-28 h-20 rounded-md border bg-slate-50 overflow-hidden">
                      <button
                        type="button"
                        className="block w-full h-full"
                        onClick={() => openPreviewAt(index)}
                        title="Preview image"
                      >
                        <img
                          src={item.url}
                          alt={formData.name || 'Category image'}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </button>
                      <button
                        type="button"
                        className="absolute -top-2 -right-2 z-10 p-1.5 rounded-full border border-white bg-red-600 text-white hover:bg-red-700 shadow-md"
                        onClick={() => {
                          if (item.isSaved) removeSavedImage(item.url);
                          else removeFileById(item.id);
                        }}
                        title="Remove image"
                        aria-label="Remove image"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {!savedPreviewItems.length && !localPreviewItems.length ? (
                    <div className="w-28 h-20 rounded-md border bg-slate-50 flex items-center justify-center text-xs text-slate-500 font-semibold">
                      {String(formData.name || '?').slice(0, 1).toUpperCase()}
                    </div>
                  ) : null}
                </div>

                <p className="text-[11px] text-slate-500">
                  Min {formatKb(IMAGE_MIN_BYTES)}, max {formatKb(IMAGE_MAX_BYTES)}.
                  {' '}
                  Maximum {maxImages} image{maxImages > 1 ? 's' : ''}.
                </p>

                <div>
                  <Label htmlFor="image_file" className="text-xs text-slate-600">
                    Upload image{maxImages > 1 ? 's' : ''}
                  </Label>
                  <Input
                    ref={fileInputRef}
                    id="image_file"
                    type="file"
                    accept="image/*"
                    multiple={maxImages > 1}
                    onChange={(e) => addImageFiles(e.target.files)}
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
                  <div className="flex gap-2">
                    <Input
                      id="image_url"
                      value={imageUrlDraft}
                      onChange={(e) => {
                        setImageUrlDraft(sanitizeImageUrl(e.target.value));
                        setErrors((prev) => ({ ...prev, image_url: undefined }));
                      }}
                      placeholder="https://..."
                    />
                    <Button type="button" variant="outline" onClick={addImageUrl}>
                      Add
                    </Button>
                  </div>
                  {errors.image_url && (
                    <p className="text-xs text-red-500 mt-1">{errors.image_url}</p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked === true }))}
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

      {canRenderPortal && previewOpen && currentPreviewUrl
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] bg-black/80 p-4 flex items-center justify-center"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                closePreview();
              }}
            >
              <div
                className="relative w-full max-w-3xl rounded-xl bg-white p-3 md:p-4"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="absolute right-2 top-2 rounded-full p-2 bg-slate-100 hover:bg-slate-200"
                  onClick={closePreview}
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="relative">
                  <img
                    key={`${previewIndex}-${currentPreviewUrl}`}
                    src={currentPreviewUrl}
                    alt={formData.name || 'Preview image'}
                    className="w-full max-h-[72vh] object-contain rounded-lg bg-slate-50"
                  />

                  {previewItems.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-2 bg-black/50 text-white hover:bg-black/70"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          goPrevPreview();
                        }}
                        aria-label="Previous image"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 bg-black/50 text-white hover:bg-black/70"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          goNextPreview();
                        }}
                        aria-label="Next image"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  ) : null}
                </div>

                {previewItems.length > 1 ? (
                  <p className="mt-2 text-center text-xs text-slate-600">
                    {previewIndex + 1} / {previewItems.length}
                  </p>
                ) : null}
              </div>
            </div>,
            window.document.body
          )
        : null}
    </>
  );
};

export default AddEditCategoryDialog;
