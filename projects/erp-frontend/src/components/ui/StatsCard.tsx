import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: number; // percentage
  trendLabel?: string;
  /** Secondary line under the value, e.g. a year-to-date comparison. */
  subtitle?: string;
  className?: string;
}

export default function StatsCard({ title, value, icon, trend, trendLabel, subtitle, className }: StatsCardProps) {
  const isPositive = trend && trend > 0;
  
  return (
    <div className={cn("glass-card p-6 relative overflow-hidden group", className)}>
      {/* Subtle background glow */}
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all duration-500"></div>
      
      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-4">
          <p className="text-sm font-medium text-textSecondary uppercase tracking-wider">{title}</p>
          <h4 className="text-3xl font-playfair font-semibold text-white">{value}</h4>

          {subtitle && (
            <p className="text-xs text-textSecondary">{subtitle}</p>
          )}
          
          {trend !== undefined && (
            <div className="flex items-center gap-2 mt-2">
              <span className={cn(
                "flex items-center text-xs font-medium px-2 py-1 rounded-md",
                isPositive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
              )}>
                {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {Math.abs(trend)}%
              </span>
              {trendLabel && <span className="text-xs text-textSecondary">{trendLabel}</span>}
            </div>
          )}
        </div>
        
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-[0_0_15px_rgba(212,168,67,0.15)] group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
      </div>
    </div>
  );
}
