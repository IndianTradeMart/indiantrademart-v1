import React from 'react';
import { Newspaper, Calendar, User } from 'lucide-react';

const Press = () => {
  const pressReleases = [
    {
      id: 1,
      title: 'IndianTradeMart Launches New B2B Platform',
      date: 'January 15, 2025',
      author: 'Communications Team',
      excerpt: 'Revolutionary B2B marketplace connecting verified buyers and suppliers across India.',
      content: 'We are thrilled to announce the launch of our new B2B marketplace...'
    },
    {
      id: 2,
      title: 'Partnership with Leading Industry Bodies',
      date: 'January 10, 2025',
      author: 'Communications Team',
      excerpt: 'Strategic partnerships with major industry associations.',
      content: 'Our platform has partnered with leading industry bodies...'
    },
    {
      id: 3,
      title: 'Record Growth in Supplier Network',
      date: 'January 5, 2025',
      author: 'Communications Team',
      excerpt: '50,000+ suppliers now registered on our platform.',
      content: 'We are proud to announce that our supplier network has grown...'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <Newspaper className="w-8 h-8" />
            <h1 className="text-4xl font-bold">Press Section</h1>
          </div>
          <p className="text-xl text-blue-100">Latest news and updates about IndianTradeMart</p>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <div className="space-y-8">
              {pressReleases.map((release) => (
                <article key={release.id} className="bg-white rounded-lg shadow-sm p-8 hover:shadow-lg transition-shadow">
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">{release.title}</h2>
                  
                  <div className="flex flex-wrap gap-6 text-sm text-gray-500 mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {release.date}
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {release.author}
                    </div>
                  </div>
                  
                  <p className="text-gray-700 mb-4">{release.excerpt}</p>
                  <button className="text-blue-600 hover:text-blue-800 font-semibold">Read More →</button>
                </article>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-4">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Press Contacts</h3>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-semibold text-gray-900">Media Relations</p>
                  <p className="text-gray-600">press@indiantrademart.com</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Phone</p>
                  <p className="text-gray-600">+91 XXXX-XXXX-XXX</p>
                </div>
                <div className="border-t pt-4 mt-4">
                  <p className="text-gray-600 text-xs">For media inquiries, please contact our press office with relevant details about your story.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Press;
