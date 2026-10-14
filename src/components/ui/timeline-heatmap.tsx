import React from 'react';

export interface HeatmapData {
  dateString: string;
  count: number;
  hasPriority: boolean;
  label: string;
}

interface TimelineHeatmapProps {
  data: HeatmapData[];
  tone: 'gray' | 'purple' | 'indigo' | 'blue';
  selectedDateString: string | null;
  viewMode: 'weeks' | 'months';
  onViewModeChange: (mode: 'weeks' | 'months') => void;
  onCellClick: (dateString: string) => void;
}

function getCurrentWeekStartDateString() {
  const today = new Date();
  const dayOffset = (today.getDay() + 6) % 7;
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOffset);
  return weekStart.toISOString().split("T")[0]!;
}

function getCurrentMonthStartDateString() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]!;
}

export const TimelineHeatmap: React.FC<TimelineHeatmapProps> = ({ 
  data, 
  tone, 
  selectedDateString,
  viewMode,
  onViewModeChange,
  onCellClick 
}) => {
  // CLEANED UP: Focuses purely on load density without mixing priority colors
  const getColorClass = (count: number) => {
    if (count === 0) return 'bg-gray-100 dark:bg-gray-800/40 hover:bg-gray-200';

    const intensities: Record<'gray' | 'purple' | 'indigo' | 'blue', string[]> = {
      gray: ['bg-gray-300', 'bg-gray-500', 'bg-gray-700', 'bg-gray-900'],
      purple: ['bg-purple-200', 'bg-purple-400', 'bg-purple-600', 'bg-purple-800'],
      indigo: ['bg-indigo-200', 'bg-indigo-400', 'bg-indigo-600', 'bg-indigo-800'],
      blue: ['bg-blue-200', 'bg-blue-400', 'bg-blue-600', 'bg-blue-800'],
    };

    const toneShades = intensities[tone] || intensities.blue;
    if (count <= 2) return `${toneShades[0]} opacity-70`;
    if (count <= 5) return toneShades[1];
    if (count <= 8) return toneShades[2];
    return toneShades[3];
  };

  return (
    // Cancels the parent page's theme-invert-on-light filter: this component already
    // has real light/dark styles, so a second inversion restores the intended colors.
    <div className="theme-invert-on-light w-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 shadow-sm mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">Future Horizon</h3>
          
          {/* UPDATED LEGEND */}
          <div className="flex items-center gap-2 mt-1 select-none">
            <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">Load:</span>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-gray-100 dark:bg-gray-800/40 border border-gray-200/20" />
              <span className={`w-2 h-2 rounded ${tone === 'gray' ? 'bg-gray-300' : tone === 'purple' ? 'bg-purple-200' : tone === 'indigo' ? 'bg-indigo-200' : 'bg-blue-200'}`} />
              <span className={`w-2 h-2 rounded ${tone === 'gray' ? 'bg-gray-700' : tone === 'purple' ? 'bg-purple-600' : tone === 'indigo' ? 'bg-indigo-600' : 'bg-blue-600'}`} />
            </div>
            <span className="text-gray-300 dark:text-gray-700">|</span>
            <div className="flex items-center gap-1">
              {/* Updated dot legend style */}
              <span className="w-1 h-1 rounded-full bg-rose-500 ring-1 ring-rose-500/30" />
              <span className="text-[8px] text-rose-400 font-bold uppercase tracking-wider">Priority Tagged</span>
            </div>
          </div>
        </div>
        
        {/* View Switcher */}
        <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200/50 dark:border-gray-700/50 self-start sm:self-auto">
          <button
            onClick={() => onViewModeChange('weeks')}
            className={`text-[9px] font-black uppercase px-2 py-1 rounded-md transition-all cursor-pointer ${viewMode === 'weeks' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Weekly
          </button>
          <button
            onClick={() => onViewModeChange('months')}
            className={`text-[9px] font-black uppercase px-2 py-1 rounded-md transition-all cursor-pointer ${viewMode === 'months' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Monthly
          </button>
        </div>
      </div>
      
      {/* Grid Container */}
      <div className="flex gap-1 overflow-x-auto py-1.5 px-1 scrollbar-none snap-x">
        {data.map((item) => {
          const isSelected = selectedDateString === item.dateString;
          const isCurrentPeriod = item.dateString === (
            viewMode === 'weeks' ? getCurrentWeekStartDateString() : getCurrentMonthStartDateString()
          );
          return (
            <button
            key={item.dateString}
            onClick={() => onCellClick(item.dateString)}
            className={`flex-shrink-0 min-w-8 h-8 px-1 rounded-lg transition-all duration-200 flex flex-col items-center justify-center relative cursor-pointer snap-clamp select-none 
                ${getColorClass(item.count)}
                ${isSelected ? 'ring-2 ring-black dark:ring-white scale-[1.02] z-10 shadow-sm' : ''} 
            `}
            title={`${item.count} items due. Priority: ${item.hasPriority ? 'Yes' : 'No'}`}
            >
            {/* Week/Month String Label */}
            <span className={`text-[9px] font-black tracking-tight leading-none ${item.count > 0 ? 'text-white' : 'text-gray-400 dark:text-gray-500'} ${item.hasPriority ? '-mt-0.5' : ''}`}>
                {item.label}
            </span>

            {isCurrentPeriod && (
              <span className="absolute -top-1 rounded-full border border-indigo-300 bg-white px-1 py-px text-[7px] font-black uppercase leading-none text-indigo-700 shadow-sm dark:border-indigo-500/50 dark:bg-gray-900 dark:text-indigo-300">
                Now
              </span>
            )}

            {/* FIXED RED DOT: Stays red, but gains a white tracking ring on colored squares for perfect contrast */}
            {item.hasPriority && (
                <span 
                className={`absolute bottom-1 w-1 h-1 rounded-full bg-rose-500 animate-pulse
                    ${item.count > 0 ? 'ring-1 ring-white/90 shadow-sm' : 'ring-1 ring-rose-500/20'}
                `} 
                />
            )}
            </button>

          );
        })}
      </div>
    </div>
  );
};
