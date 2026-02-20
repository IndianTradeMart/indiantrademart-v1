/**
 * Generate a URL-friendly slug from text
 */
export const generateSlug = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

/**
 * Generate unique slug with timestamp if needed
 */
export const generateUniqueSlug = (text) => {
  const base = generateSlug(text);
  const timestamp = Date.now().toString(36).substring(2, 8);
  return `${base}-${timestamp}`;
};
