import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Crown, Check, AlertCircle } from 'lucide-react';

const SubscriptionBadge = ({ subscription, loading }) => {
  if (loading) {
    return <Badge variant="outline" className="animate-pulse">Loading...</Badge>;
  }

  if (!subscription) {
    return (
      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 gap-2">
        <AlertCircle className="h-3 w-3" />
        No Active Plan
      </Badge>
    );
  }

  const planName = subscription.plan?.name || 'Plan';
  const endDate = subscription.end_date ? new Date(subscription.end_date) : null;
  const daysLeft = endDate ? Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)) : 0;

  // Color based on plan type
  const getPlanColor = () => {
    const name = planName.toLowerCase();
    if (name.includes('premium')) return 'bg-purple-100 text-purple-800 border-purple-300';
    if (name.includes('pro')) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (name.includes('basic')) return 'bg-green-100 text-green-800 border-green-300';
    return 'bg-amber-100 text-amber-800 border-amber-300';
  };

  return (
    <div className="flex items-center gap-2">
      <Badge className={`gap-2 border ${getPlanColor()}`}>
        <Crown className="h-3.5 w-3.5" />
        {planName}
      </Badge>
      {daysLeft > 0 && (
        <span className="text-xs text-gray-600 whitespace-nowrap">
          {daysLeft} days left
        </span>
      )}
      {daysLeft <= 7 && daysLeft > 0 && (
        <AlertCircle className="h-4 w-4 text-orange-500" />
      )}
    </div>
  );
};

export default SubscriptionBadge;
