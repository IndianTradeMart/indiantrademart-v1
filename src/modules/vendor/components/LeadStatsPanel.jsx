import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

const StatRow = ({ label, used, limit }) => {
  const showLimit = Number(limit) > 0;
  const safeUsed = showLimit ? Math.min(Number(used) || 0, Number(limit) || 0) : used;
  const display = showLimit ? `${safeUsed}/${limit}` : safeUsed;
  return (
    <div
      className="
        flex items-center justify-between
        rounded-md border bg-white
        px-2.5 py-1.5
        transition-all
        hover:bg-gray-50 hover:shadow-sm hover:border-gray-300
      "
      title={`${label}: ${display}`}
    >
      <span className="text-[11px] font-semibold text-gray-700">{label}</span>

      <span
        className="
          inline-flex items-center justify-center
          h-6 w-6 rounded-full
          border bg-gray-50
          text-[11px] font-bold text-gray-900
        "
      >
        {display}
      </span>
    </div>
  );
};

const LeadStatsPanel = ({ stats }) => {
  if (!stats) return null;

  return (
    <div className="space-y-3 w-full max-w-[260px]">
      <Card className="border shadow-sm w-full">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-[13px] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#003D82]" />
            Lead Statistics
          </CardTitle>
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Purchased by Period
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-0 space-y-2">
          <StatRow label="Today" used={stats.dailyUsed || 0} limit={stats.dailyLimit || 0} />
          <StatRow label="This Week" used={stats.weeklyUsed || 0} limit={stats.weeklyLimit || 0} />
          <StatRow label="This Year" used={stats.yearlyUsed || 0} limit={stats.yearlyLimit || 0} />
        </CardContent>
      </Card>
    </div>
  );
};

export default LeadStatsPanel;
