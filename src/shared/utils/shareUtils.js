/**
 * Share utility functions for social media and copy-to-clipboard
 */

export const shareUtils = {
  /**
   * Generate WhatsApp share URL
   */
  getWhatsAppUrl: (productName, productUrl) => {
    const text = `Check out this product: ${productName}\n${productUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  },

  /**
   * Generate Facebook share URL
   */
  getFacebookUrl: (productUrl) => {
    return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productUrl)}`;
  },

  /**
   * Generate LinkedIn share URL
   */
  getLinkedInUrl: (productUrl, productName) => {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(productUrl)}&title=${encodeURIComponent(productName)}`;
  },

  /**
   * Generate Twitter/X share URL
   */
  getTwitterUrl: (productName, productUrl) => {
    const text = `Check out: ${productName}`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(productUrl)}`;
  },

  /**
   * Copy text to clipboard
   */
  copyToClipboard: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  },

  /**
   * Get current page URL
   */
  getCurrentUrl: () => {
    if (typeof window !== 'undefined') {
      return window.location.href;
    }
    return '';
  },

  /**
   * Generate share text for messaging
   */
  getShareMessage: (productName, vendorCompany) => {
    return `${productName} from ${vendorCompany}`;
  },
};
