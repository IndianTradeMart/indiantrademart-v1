import { supabase } from '@/lib/customSupabaseClient';

/**
 * Submit contact form to database
 * Maps to contact_submissions table:
 * - name -> name
 * - email -> email
 * - phone -> phone
 * - message -> message
 * - status (default: 'new')
 */
export const submitContactForm = async (formData) => {
  try {
    const { data, error } = await supabase
      .from('contact_submissions')
      .insert([
        {
          name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          message: formData.message,
          status: 'new'
        }
      ])
      .select();

    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('Error submitting contact form:', error);
    throw error;
  }
};
