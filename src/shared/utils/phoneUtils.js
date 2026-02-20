// Utility functions for phone number masking

export const phoneUtils = {
  // Mask phone number: show first 2 and last 2 digits
  // Input: 4564545465 -> Output: 45xxxxxx65
  maskPhone: (phone) => {
    if (!phone) return '';
    const cleaned = phone.toString().replace(/\D/g, '');
    if (cleaned.length < 4) return phone; // Too short to mask
    
    const first2 = cleaned.substring(0, 2);
    const last2 = cleaned.substring(cleaned.length - 2);
    const masked = first2 + 'x'.repeat(cleaned.length - 4) + last2;
    
    return masked;
  },

  // Mask with country code
  // Input: +914564545465 -> Output: +9145xxxxxx65
  maskPhoneWithCode: (phone) => {
    if (!phone) return '';
    const cleanedPhone = phone.toString().trim();
    
    // Check if it starts with + (country code)
    if (cleanedPhone.startsWith('+')) {
      const countryCode = cleanedPhone.substring(0, cleanedPhone.length - 10); // Get country code part
      const numberPart = cleanedPhone.substring(countryCode.length);
      return countryCode + phoneUtils.maskPhone(numberPart);
    }
    
    return phoneUtils.maskPhone(cleanedPhone);
  },

  // Unmask on button click - in production would require OTP verification
  unmask: (phone) => {
    return phone;
  }
};
