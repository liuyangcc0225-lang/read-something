
import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';

interface MultiSelectDropdownProps {
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  placeholder?: string;
  inputClass: string;
  cardClass: string;
  isDarkMode: boolean;
  /** Optional label resolver — when options are IDs but should display as names. */
  getLabel?: (value: string) => string;
}

const DROPDOWN_PREFERRED_PX = 192; // mirrors original max-h-48
const BOTTOM_NAV_RESERVED_PX = 96; // floating nav (~70px) + bottom offset + margin
const VIEWPORT_MARGIN_PX = 8;
const MIN_DROPDOWN_HEIGHT_PX = 120;

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  options,
  selected,
  onChange,
  placeholder = "选择...",
  inputClass,
  cardClass,
  isDarkMode,
  getLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<'down' | 'up'>('down');
  const [maxHeight, setMaxHeight] = useState<number>(DROPDOWN_PREFERRED_PX);
  const containerRef = useRef<HTMLDivElement>(null);

  const resolveLabel = (val: string) => (getLabel ? getLabel(val) : val);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const updatePlacement = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportH = window.visualViewport?.height ?? window.innerHeight;

      const spaceBelow = Math.max(0, viewportH - rect.bottom - BOTTOM_NAV_RESERVED_PX - VIEWPORT_MARGIN_PX);
      const spaceAbove = Math.max(0, rect.top - VIEWPORT_MARGIN_PX);

      if (spaceBelow >= DROPDOWN_PREFERRED_PX) {
        setPlacement('down');
        setMaxHeight(DROPDOWN_PREFERRED_PX);
      } else if (spaceAbove > spaceBelow) {
        setPlacement('up');
        setMaxHeight(Math.max(MIN_DROPDOWN_HEIGHT_PX, Math.min(DROPDOWN_PREFERRED_PX, spaceAbove)));
      } else {
        setPlacement('down');
        setMaxHeight(Math.max(MIN_DROPDOWN_HEIGHT_PX, spaceBelow));
      }
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    window.visualViewport?.addEventListener('resize', updatePlacement);

    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
      window.visualViewport?.removeEventListener('resize', updatePlacement);
    };
  }, [isOpen]);

  const toggleSelection = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(s => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Area - Displays Selected Chips */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full p-2 min-h-[42px] rounded-xl flex items-center justify-between cursor-pointer ${inputClass}`}
      >
        <div className="flex flex-wrap gap-1.5 w-full pr-6">
          {selected.length === 0 && <span className="text-sm opacity-50 px-2">{placeholder}</span>}
          {selected.map(item => (
            <span key={item} className="bg-rose-400 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
              {resolveLabel(item)}
              <span
                onClick={(e) => { e.stopPropagation(); toggleSelection(item); }}
                className="hover:text-rose-100 cursor-pointer"
              >
                <X size={10} />
              </span>
            </span>
          ))}
        </div>
        <div className="absolute right-3 opacity-50">
           <ChevronDown size={16} />
        </div>
      </div>

      {/* Dropdown Options */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 ${placement === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'} p-2 rounded-xl z-[100] overflow-y-auto ${cardClass} border border-slate-400/10 shadow-2xl`}
          style={{ maxHeight: `${maxHeight}px` }}
        >
          {options.length > 0 ? options.map(opt => (
            <div
              key={opt}
              onClick={() => toggleSelection(opt)}
              className={`flex items-center gap-2 p-2 rounded-lg text-sm cursor-pointer transition-colors ${
                selected.includes(opt)
                  ? 'text-rose-400 font-bold bg-rose-400/10'
                  : isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
               <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected.includes(opt) ? 'bg-rose-400 border-rose-400' : 'border-slate-400'}`}>
                  {selected.includes(opt) && <Check size={10} className="text-white" />}
               </div>
               <span className="break-words min-w-0">{resolveLabel(opt)}</span>
            </div>
          )) : (
            <div className="p-2 text-xs text-slate-400 text-center">无可用选项</div>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiSelectDropdown;
