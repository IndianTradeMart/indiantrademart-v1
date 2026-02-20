import React, { useState } from 'react';
import { X, Send, MessageSquare, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const SupportModal = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    category: ''
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      console.log('Support ticket submitted:', formData);
      toast({
        title: 'Support request submitted',
        description: 'Our team will contact you within 24 hours.',
      });
      
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: '',
        message: '',
        category: ''
      });
      
      onClose();
    } catch (error) {
      toast({
        title: 'Submission failed',
        description: 'Error submitting support request. Please try again.',
        variant: 'destructive',
      });
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Get Support</h2>
            <p className="text-blue-100 text-sm mt-1">We're here to help you 24/7</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-blue-500 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Quick Contact Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
              <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 font-semibold">Email</p>
                <a href="mailto:support@indiantrademart.com" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                  support@indiantrademart.com
                </a>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
              <Phone className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 font-semibold">Phone</p>
                <a href="tel:+918800123456" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                  +91 8800-123-456
                </a>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
              <MessageSquare className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 font-semibold\">Response Time</p>
                <p className="text-sm text-gray-700 font-medium\">Within 2 hours</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Name & Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Your full name"
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="your@email.com"
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Phone & Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Phone *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+91 XXXXX XXXXX"
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Category *
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select issue type</option>
                  <option value="account">Account & Login</option>
                  <option value="payment">Payment Issues</option>
                  <option value="product">Product Related</option>
                  <option value="shipping">Shipping & Delivery</option>
                  <option value="return">Returns & Refunds</option>
                  <option value="technical">Technical Support</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Subject *
              </label>
              <input
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                placeholder="Brief subject of your issue"
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Message *
              </label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                placeholder="Please describe your issue in detail..."
                required
                rows="5"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {loading ? 'Submitting...' : 'Submit Support Request'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SupportModal;
