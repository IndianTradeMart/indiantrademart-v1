import { submitContactForm } from '@/modules/directory/services/contactApi';
import { directoryApi } from '@/modules/directory/api/directoryApi';
import { Clock, Eye, Heart, Loader, Mail, MapPin, Phone, Search, ShoppingCart, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

// ==================== JOIN SALES PAGE ====================
export const JoinSales = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold mb-3">Join Our Sales Team</h1>
        <p className="text-xl text-blue-100">Become a partner and grow with us</p>
      </div>
    </div>
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-2xl bg-white rounded-lg shadow-sm p-8">
        <h2 className="text-2xl font-bold mb-4">Sales Partnership Opportunities</h2>
        <p className="text-gray-600 mb-6">We are looking for motivated professionals to join our sales team.</p>
        <button className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700">Apply Now</button>
      </div>
    </div>
  </div>
);

// ==================== SUCCESS STORIES PAGE ====================
export const SuccessStories = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold mb-3">Success Stories</h1>
        <p className="text-xl text-blue-100">Learn how businesses succeed with IndianTradeMart</p>
      </div>
    </div>
    <div className="container mx-auto px-4 py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white rounded-lg shadow-sm p-6 hover:shadow-lg transition">
            <h3 className="text-xl font-bold mb-2">Success Story {i}</h3>
            <p className="text-gray-600 mb-4">Learn how Company {i} achieved 300% growth using our platform...</p>
            <button className="text-blue-600 hover:text-blue-800 font-semibold">Read Full Story →</button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ==================== HELP PAGE ====================
export const Help = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold mb-3">Help Center</h1>
        <p className="text-xl text-blue-100">Find answers to your questions</p>
      </div>
    </div>
    <div className="container mx-auto px-4 py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {['Getting Started', 'Account Management', 'Buying', 'Selling', 'Payments', 'Shipping'].map((topic, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-bold mb-3">{topic}</h3>
            <ul className="space-y-2 text-gray-600">
              <li>• How to...</li>
              <li>• Best practices</li>
              <li>• FAQ</li>
            </ul>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ==================== CUSTOMER CARE PAGE ====================
export const CustomerCare = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold mb-3">Customer Care</h1>
        <p className="text-xl text-blue-100">Your satisfaction is our priority. Get in touch with our dedicated customer care team.</p>
      </div>
    </div>

    <main className="container mx-auto px-4 py-12">
      <section className="mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Contact Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-start gap-4">
              <Phone className="text-blue-600 mt-1 flex-shrink-0" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Call us</h3>
                <p className="text-gray-700">+91 7290010051</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-start gap-4">
              <Mail className="text-blue-600 mt-1 flex-shrink-0" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Email us</h3>
                <p className="text-gray-700">support@indiantrademart.com</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-start gap-4">
              <MapPin className="text-blue-600 mt-1 flex-shrink-0" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Visit us</h3>
                <p className="text-gray-700">672, White House, Behind- MCD School, MG Road, Ghitorni, New Delhi, Delhi 110030</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">FAQs</h2>
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="space-y-6">
            {['How do I create an account?', 'How do I place an order?', 'What is your return policy?', 'How long does delivery take?'].map((faq, i) => (
              <div key={i} className="border-b pb-4 last:border-0">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{faq}</h3>
                <p className="text-gray-600">Find detailed answers to this question in our knowledge base.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Support Options</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3">Submit a Ticket</h3>
            <p className="text-gray-600 mb-4">Get in touch with our support team for detailed assistance.</p>
            <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">Submit Ticket</button>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3">Live Chat</h3>
            <p className="text-gray-600 mb-4">Chat with our support representatives in real-time.</p>
            <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">Start Chat</button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Give Us Feedback</h2>
        <div className="bg-white rounded-lg shadow-sm p-8">
          <p className="text-gray-600 mb-6">We value your feedback. Let us know how we can improve our services.</p>
          <button className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700">Share Feedback</button>
        </div>
      </section>
    </main>
  </div>
);

// ==================== COMPLAINTS PAGE ====================
export const Complaints = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold mb-3">Complaints & Grievances</h1>
        <p className="text-xl text-blue-100">Your satisfaction is our priority</p>
      </div>
    </div>
    <div className="container mx-auto px-4 py-16">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold mb-4">File a Complaint</h2>
        <p className="text-gray-600 mb-6">We take complaints seriously. Let us know how we can improve.</p>
        <button className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700">File Complaint</button>
      </div>
    </div>
  </div>
);

// ==================== JOBS PAGE ====================
export const Jobs = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold mb-3">Jobs & Careers</h1>
        <p className="text-xl text-blue-100">Join our growing team</p>
      </div>
    </div>
    <div className="container mx-auto px-4 py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {['Software Engineer', 'Sales Manager', 'Business Analyst', 'Marketing Executive'].map((job, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-bold mb-2">{job}</h3>
            <p className="text-gray-600 mb-4">Location: India</p>
            <button className="text-blue-600 hover:text-blue-800 font-semibold">Apply Now →</button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ==================== CONTACT PAGE ====================
export const ContactPage = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (!formData.firstName || !formData.email || !formData.message) {
        throw new Error('Please fill in all required fields (First Name, Email, Message)');
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        throw new Error('Please enter a valid email address');
      }

      const fullName = `${formData.firstName} ${formData.lastName}`.trim();

      await submitContactForm({
        name: fullName,
        email: formData.email,
        phone: formData.phone,
        message: `Subject: ${formData.subject || 'No Subject'}\n\n${formData.message}`
      });

      setSuccessMessage('Thank you! Your message has been sent successfully. We will get back to you soon.');
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        subject: '',
        message: ''
      });

      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      setErrorMessage(error.message || 'Failed to send message. Please try again.');
      console.error('Contact form error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-bold mb-3">Contact Us</h1>
          <p className="text-xl text-blue-100">We'd love to hear from you. Get in touch with our team anytime.</p>
        </div>
      </div>

      <main className="container mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Get in Touch</h2>
          
          <div className="grid lg:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-6">Contact Information</h3>
              <p className="text-gray-700 mb-8">
                Have questions or need assistance? We're here to help! Reach out to us through any of the following channels:
              </p>
              
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <Mail className="text-blue-600 mt-1 flex-shrink-0" size={20} />
                  <div>
                    <h4 className="font-medium text-gray-900">Email Support</h4>
                    <p className="text-gray-700">support@indiantrademart.com</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <Phone className="text-blue-600 mt-1 flex-shrink-0" size={20} />
                  <div>
                    <h4 className="font-medium text-gray-900">Phone Support</h4>
                    <p className="text-gray-700">+91 7290010051</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <MapPin className="text-blue-600 mt-1 flex-shrink-0" size={20} />
                  <div>
                    <h4 className="font-medium text-gray-900">Office Address</h4>
                    <p className="text-gray-700">
                      Indian Trade Mart Pvt. Ltd.<br />
                      672, White House, Behind- MCD School, MG Road<br/>
                       Ghitorni, New Delhi, Delhi 110030
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <Clock className="text-blue-600 mt-1 flex-shrink-0" size={20} />
                  <div>
                    <h4 className="font-medium text-gray-900">Business Hours</h4>
                    <p className="text-gray-700">
                      Monday - Friday: 9:00 AM - 6:00 PM<br />
                      Saturday: 10:00 AM - 4:00 PM<br />
                      Sunday: Closed
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 bg-gray-50 p-6 rounded-lg">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Department Contacts</h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">General Information:</span>
                    <span className="text-gray-900">info@indiantrademart.com</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Customer Care:</span>
                    <span className="text-gray-900">customercare@indiantrademart.com</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Business Development:</span>
                    <span className="text-gray-900">bd@indiantrademart.com</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">HR Department:</span>
                    <span className="text-gray-900">hr@indiantrademart.com</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-6">Send us a Message</h3>
              
              {successMessage && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-800 font-medium">{successMessage}</p>
                </div>
              )}
              
              {errorMessage && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 font-medium">{errorMessage}</p>
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      First Name *
                    </label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      placeholder="Your first name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Last Name
                    </label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      placeholder="Your last name"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="your.email@example.com"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="+91 7290010051"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject
                  </label>
                  <input
                    type="text"
                    name="subject"
                    value={formData.subject}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="Subject of your message"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message *
                  </label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    rows={5}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="Please describe your inquiry in detail..."
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Message'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// ==================== BUY LEADS PAGE ====================
export const BuyLeads = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold mb-3">Latest Buy Leads</h1>
        <p className="text-xl text-blue-100">Hot opportunities from verified buyers</p>
      </div>
    </div>
    <div className="container mx-auto px-4 py-16">
      <div className="bg-white rounded-lg shadow-sm p-8">
        <p className="text-gray-600 mb-6">View real-time buy leads from verified buyers across India.</p>
        <button className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700">Browse Buy Leads</button>
      </div>
    </div>
  </div>
);

// ==================== LEARNING CENTRE PAGE ====================
export const LearningCentre = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold mb-3">Learning Centre</h1>
        <p className="text-xl text-blue-100">Master the skills to succeed</p>
      </div>
    </div>
    <div className="container mx-auto px-4 py-16">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {['Getting Started', 'Sales Strategies', 'Digital Marketing'].map((course, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-bold mb-2">{course}</h3>
            <p className="text-gray-600 mb-4">Learn from industry experts</p>
            <button className="text-blue-600 hover:text-blue-800 font-semibold">Enroll Now →</button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ==================== PRODUCTS YOU BUY PAGE ====================
export const ProductsPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedLocation, setSelectedLocation] = useState('All Locations');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const pickFirstImageUrl = (images) => {
    const imgs = images;
    if (Array.isArray(imgs) && imgs.length > 0) {
      const first = imgs[0];
      if (typeof first === 'string' && first.trim()) return first.trim();
      if (first && typeof first === 'object') {
        const url = first.url || first.image_url || first.src;
        if (typeof url === 'string' && url.trim()) return url.trim();
      }
    }
    return '';
  };

  const normalizeFeatures = (specs) => {
    let data = specs;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        data = null;
      }
    }
    if (!Array.isArray(data)) return [];

    const out = [];
    for (const item of data) {
      if (!item) continue;
      if (typeof item === 'string') out.push(item);
      if (item && typeof item === 'object') {
        const label = item.label || item.name || item.key;
        const value = item.value || item.val;
        if (label && value) out.push(`${label}: ${value}`);
        else if (label) out.push(label);
      }
      if (out.length >= 6) break;
    }
    return out;
  };

  const formatPrice = (price, unit) => {
    const num = Number(price);
    if (!Number.isFinite(num) || num <= 0) return 'Price on request';
    const formatted = new Intl.NumberFormat('en-IN').format(num);
    return `₹${formatted}${unit ? ` / ${unit}` : ''}`;
  };

  const formatMinOrder = (qty, unit) => {
    const num = Number(qty);
    if (!Number.isFinite(num) || num <= 0) return '—';
    return `${num}${unit ? ` ${unit}` : ''}`;
  };

  const pickCategory = (product) => {
    const direct = String(product?.category || product?.category_other || '').trim();
    if (direct) return direct;
    const path = String(product?.category_path || '').trim();
    if (!path) return 'General';
    const parts = path.split('>').map((p) => p.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : path;
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { data } = await directoryApi.searchProducts({ q: '', page: 1, limit: 200 });
        const list = (Array.isArray(data) ? data : []).map((p) => {
          const vendor = p?.vendors || {};
          const location = [vendor?.city || p?.city, vendor?.state || p?.state].filter(Boolean).join(', ');
          const rating = Number(vendor?.seller_rating);
          const views = Number(p?.views);

          return {
            id: p?.id,
            name: p?.name || 'Unnamed Product',
            category: pickCategory(p),
            description: p?.description || '',
            price: formatPrice(p?.price, p?.price_unit),
            minOrder: formatMinOrder(p?.min_order_qty ?? p?.moq, p?.qty_unit),
            supplier: vendor?.company_name || '',
            location: location || 'India',
            rating: Number.isFinite(rating) ? rating : 0,
            reviews: Number.isFinite(views) ? views : 0,
            verified: !!(
              vendor?.verification_badge ||
              vendor?.is_verified ||
              String(vendor?.kyc_status || '').toUpperCase() === 'APPROVED'
            ),
            features: normalizeFeatures(p?.specifications),
            inStock: typeof p?.stock === 'number' ? p.stock > 0 : true,
            image: pickFirstImageUrl(p?.images),
          };
        });

        if (!alive) return;
        setProducts(list);
      } catch (error) {
        console.error('Failed to load products:', error);
        if (!alive) return;
        setProducts([]);
        setLoadError('Failed to load products. Please try again.');
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set();
    (products || []).forEach((p) => {
      const value = String(p?.category || '').trim();
      if (value) set.add(value);
    });
    return ['All Categories', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const locations = useMemo(() => {
    const set = new Set();
    (products || []).forEach((p) => {
      const value = String(p?.location || '').trim();
      if (value) set.add(value);
    });
    return ['All Locations', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  useEffect(() => {
    if (selectedCategory !== 'All Categories' && !categories.includes(selectedCategory)) {
      setSelectedCategory('All Categories');
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (selectedLocation !== 'All Locations' && !locations.includes(selectedLocation)) {
      setSelectedLocation('All Locations');
    }
  }, [locations, selectedLocation]);

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return (products || []).filter((product) => {
      if (query) {
        const hay = [
          product.name,
          product.description,
          product.category,
          product.location,
          product.supplier,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (selectedCategory !== 'All Categories' && product.category !== selectedCategory) return false;
      if (selectedLocation !== 'All Locations' && product.location !== selectedLocation) return false;
      return true;
    });
  }, [products, searchTerm, selectedCategory, selectedLocation]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-bold mb-3">Products You Buy</h1>
          <p className="text-xl text-blue-100">Discover quality products from verified suppliers across India for your business needs</p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {loadError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search products, suppliers, categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <select 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select 
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {locations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-between items-center mb-6">
          <div className="text-sm text-gray-600">
            {loading ? 'Loading products...' : `Showing ${filteredProducts.length} of ${products.length} products`}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-600">
            <Loader className="w-5 h-5 animate-spin mr-2" />
            Loading products...
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredProducts.map((product) => (
                <div key={product.id} className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className="relative">
                    <div className="h-48 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden">
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="text-white text-center">
                          <ShoppingCart size={32} className="mx-auto mb-2" />
                          <div className="text-sm font-medium">{product.category}</div>
                        </div>
                      )}
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button className="p-1 bg-white rounded-full shadow-md hover:bg-gray-50">
                        <Heart size={16} className="text-gray-600" />
                      </button>
                      <button className="p-1 bg-white rounded-full shadow-md hover:bg-gray-50">
                        <Eye size={16} className="text-gray-600" />
                      </button>
                    </div>
                    {!product.inStock && (
                      <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded text-xs">
                        Out of Stock
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-600">{product.category}</span>
                      {product.verified && (
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                          Verified
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{product.name}</h3>
                    <p className="text-gray-600 text-sm mb-3">{product.description}</p>

                    {product.rating > 0 ? (
                      <div className="flex items-center mb-3">
                        <Star className="text-yellow-500 mr-1" size={14} />
                        <span className="text-sm font-medium">{product.rating.toFixed(1)}</span>
                        {product.reviews > 0 && (
                          <span className="text-gray-500 text-sm ml-1">({product.reviews})</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 mb-3">No ratings yet</div>
                    )}

                    <div className="flex items-center text-sm text-gray-600 mb-3">
                      <MapPin className="mr-1" size={14} />
                      <span>{product.location}</span>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Price:</span>
                        <span className="font-semibold text-green-600">{product.price}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Min Order:</span>
                        <span className="font-medium">{product.minOrder}</span>
                      </div>
                    </div>

                    {product.features.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {product.features.slice(0, 2).map((feature, index) => (
                          <span key={index} className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                            {feature}
                          </span>
                        ))}
                        {product.features.length > 2 && (
                          <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                            +{product.features.length - 2} more
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button 
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          product.inStock 
                            ? 'bg-blue-600 text-white hover:bg-blue-700' 
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                        disabled={!product.inStock}
                      >
                        {product.inStock ? 'Add to Cart' : 'Out of Stock'}
                      </button>
                      <button className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                        Quote
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredProducts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600 text-lg">No products found matching your criteria.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
