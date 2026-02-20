import { Facebook, Instagram, Linkedin, Mail, Twitter, Youtube } from 'lucide-react';
import { Suspense, useState, lazy } from 'react';
import { Link } from 'react-router-dom';
const PostRequirementModal = lazy(() => import('./modals/PostRequirementModal'));
const SupportModal = lazy(() => import('./modals/SupportModal'));

const Footer = () => {
  const [showPostRequirement, setShowPostRequirement] = useState(false);
  const [showSupport, setShowSupport] = useState(false);

  return (
    <>
      {showPostRequirement && (
        <Suspense fallback={null}>
          <PostRequirementModal
            isOpen={showPostRequirement}
            onClose={() => setShowPostRequirement(false)}
          />
        </Suspense>
      )}
      {showSupport && (
        <Suspense fallback={null}>
          <SupportModal
            isOpen={showSupport}
            onClose={() => setShowSupport(false)}
          />
        </Suspense>
      )}

      <footer className="bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 text-gray-100">
        <div className="container mx-auto px-4">
          {/* Main Footer Content */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 py-16 border-b border-gray-700">
            {/* Brand Column */}
            <div className="space-y-6">
              {/* ✅ Logo + Brand name side-by-side + ONE LINE heading */}
              <Link to="/" className="inline-flex items-center gap-3" aria-label="Indian Trade Mart">
                <img
                  src="/itm-logo.png"
                  alt="IndianTradeMART Logo"
                  className="h-16 w-17 sm:h-9 sm:w-9 object-contain flex-shrink-0"
                  loading="lazy"
                />

                {/* min-w-0 is important so text can shrink and not force wrap */}
                <div className="leading-tight min-w-0">
                  <h3
                    className="
                      text-white font-bold tracking-tight
                      whitespace-nowrap
                      text-[clamp(18px,2.2vw,28px)]
                    "
                  >
                    IndianTradeMart
                  </h3>
                  
                  <p className="text-xs text-gray-400 font-semibold tracking-wider mt-1">
                    B2B MARKETPLACE
                  </p>
                </div>
              </Link>

              <p className="text-sm text-gray-300 leading-relaxed">
                Connecting businesses with trusted technology providers across India.
              </p>

              <div className="flex gap-4 pt-2">
                <a
                  href="https://www.facebook.com/IndianTradeMart/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 hover:bg-blue-600 hover:text-white transition-all duration-300"
                >
                  <Facebook className="w-5 h-5" />
                </a>

                <a
                  href="https://x.com/IndianTradeMart/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Twitter / X"
                  className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 hover:bg-blue-500 hover:text-white transition-all duration-300"
                >
                  <Twitter className="w-5 h-5" />
                </a>

                <a
                  href="https://www.linkedin.com/company/indian-trade-mart-itm/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                  className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 hover:bg-blue-700 hover:text-white transition-all duration-300"
                >
                  <Linkedin className="w-5 h-5" />
                </a>

                <a
                  href="https://www.instagram.com/indiantrademart/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 hover:bg-pink-600 hover:text-white transition-all duration-300"
                >
                  <Instagram className="w-5 h-5" />
                </a>

                <a
                  href="https://www.youtube.com/@itm-Indian-Trade-Mart"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube"
                  className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 hover:bg-red-600 hover:text-white transition-all duration-300"
                >
                  <Youtube className="w-5 h-5" />
                </a>
              </div>
            </div>

            {/* Information */}
            <div>
              <h4 className="text-lg font-bold mb-6 text-white">Information</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link to="/about-us" className="text-gray-300 hover:text-blue-400 transition-colors">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link to="/press" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Press Section
                  </Link>
                </li>
                <li>
                  <Link to="/investor" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Investor Section
                  </Link>
                </li>
                <li>
                  <Link to="/join-sales" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Join Sales
                  </Link>
                </li>
                <li>
                  <Link to="/success-stories" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Success Stories
                  </Link>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="text-lg font-bold mb-6 text-white">Support</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link to="/help" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Help
                  </Link>
                </li>
                <li>
                  <Link to="/customer-care" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Customer Care
                  </Link>
                </li>
                <li>
                  <Link to="/complaints" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Complaints
                  </Link>
                </li>
                <li>
                  <Link to="/jobs" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Jobs & Careers
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Contact Us
                  </Link>
                </li>
              </ul>
            </div>

            {/* Suppliers Tool Kit */}
            <div>
              <h4 className="text-lg font-bold mb-6 text-white">Suppliers Tool Kit</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link to="/vendor/register" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Sell on Trade Mart
                  </Link>
                </li>
                <li>
                  <Link to="/buyleads" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Latest BuyLead
                  </Link>
                </li>
                <li>
                  <Link to="/learning-centre" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Learning Centre
                  </Link>
                </li>
                <li>
                  <Link to="/logistics" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Ship With Trade Mart
                  </Link>
                </li>
              </ul>
            </div>

            {/* Buyers Tool Kit */}
            <div>
              <h4 className="text-lg font-bold mb-6 text-white">Buyers Tool Kit</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <button
                    onClick={() => setShowPostRequirement(true)}
                    className="text-gray-300 hover:text-blue-400 transition-colors text-left"
                  >
                    Post Requirement
                  </button>
                </li>
                <li>
                  <Link to="/products" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Products You Buy
                  </Link>
                </li>
                <li>
                  <Link to="/directory" className="text-gray-300 hover:text-blue-400 transition-colors">
                    Search Suppliers
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Contact Information */}
          <div className="py-12 border-b border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400 font-semibold">Customer Care</p>
                  <a
                    href="mailto:customercare@indiantrademart.com"
                    className="text-gray-300 hover:text-blue-400 transition-colors text-sm"
                  >
                    customercare@indiantrademart.com
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400 font-semibold">Support</p>
                  <a
                    href="mailto:support@indiantrademart.com"
                    className="text-gray-300 hover:text-blue-400 transition-colors text-sm"
                  >
                    support@indiantrademart.com
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400 font-semibold">Business</p>
                  <a
                    href="mailto:business@indiantrademart.com"
                    className="text-gray-300 hover:text-blue-400 transition-colors text-sm"
                  >
                    business@indiantrademart.com
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Bar */}
          <div className="py-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-400">
            <p>&copy; {new Date().getFullYear()} Indian Trade Mart. All rights reserved.</p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <Link to="/terms" className="hover:text-gray-200 transition-colors">
                Terms of Use
              </Link>
              <Link to="/privacy" className="hover:text-gray-200 transition-colors">
                Privacy Policy
              </Link>
              <Link to="/" className="hover:text-gray-200 transition-colors">
                Link to Us
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
};

export default Footer;
